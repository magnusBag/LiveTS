//! LiveTS Core - High-performance Rust engine for real-time web applications
//!
//! This module provides the core functionality for LiveTS, including:
//! - WebSocket connection management
//! - HTML diffing and patching
//! - Event routing and handling
//! - Pub/Sub messaging system

#![deny(clippy::all)]

use napi_derive::napi;

mod connection;
mod differ;
mod events;
mod pubsub;
mod types;

pub use connection::ConnectionManager;
pub use differ::HtmlDiffer;
pub use events::EventRouter;
pub use pubsub::PubSubSystem;
pub use types::*;

use dashmap::DashMap;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::runtime::Runtime;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};
use tokio::task::JoinHandle;
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use uuid::Uuid;
use napi::{Env, JsFunction, Result as NapiResult, threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode}};
use serde::{Serialize, Deserialize};

/// The main LiveTS engine that coordinates all core functionality
#[napi]
pub struct LiveTSEngine {
    html_differ: HtmlDiffer,
}

#[napi]
impl LiveTSEngine {
    /// Creates a new LiveTS engine instance
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            html_differ: HtmlDiffer::new(),
        }
    }

    /// Renders a component and returns the diff patches
    #[napi]
    pub fn render_component(
        &self,
        _component_id: String,
        old_html: String,
        new_html: String,
    ) -> napi::Result<Vec<u8>> {
        let patches = self
            .html_differ
            .diff(&old_html, &new_html)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let serialized = serde_json::to_vec(&patches)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(serialized)
    }
}

impl Default for LiveTSEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Tokio-based WebSocket broker running inside the Rust core
#[napi]
pub struct LiveTSWebSocketBroker {
    rt: Arc<Runtime>,
    listener_task: Option<JoinHandle<()>>,
    connections: Arc<connection::ConnectionManager>,
    // channel for shutdown signal
    shutdown: Arc<DashMap<&'static str, bool>>, // simple flag map
    // JS event handler
    #[allow(dead_code)]
    event_handler: Arc<DashMap<&'static str, ThreadsafeFunction<String>>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BrokerEvent {
    Connected { connectionId: String },
    Message { connectionId: String, data: String },
    Closed { connectionId: String },
}

#[napi]
impl LiveTSWebSocketBroker {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        // Initialize tracing for debugging
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .try_init();
            
        println!("🦀 Initializing LiveTS WebSocket Broker");
        let rt = Runtime::new().map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(Self {
            rt: Arc::new(rt),
            listener_task: None,
            connections: Arc::new(connection::ConnectionManager::new()),
            shutdown: Arc::new(DashMap::new()),
            event_handler: Arc::new(DashMap::new()),
        })
    }

    /// Register a JS callback that receives broker events as JSON strings
    #[napi]
    pub fn set_event_handler(&self, _env: Env, callback: JsFunction) -> NapiResult<()> {
        println!("🎯 Setting up event handler (working version)...");
        
        let tsfn: ThreadsafeFunction<String> = callback.create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            println!("🔄 JS callback called with value: {:?}", ctx.value);
            
            // The bug seems to be that the return value mechanism is broken
            // Let's return an empty vector to see if that fixes it
            match ctx.env.create_string(&ctx.value) {
                Ok(js_string) => {
                    println!("✅ Successfully created JS string, returning it");
                    Ok(vec![js_string])
                }
                Err(e) => {
                    println!("❌ Failed to create JS string: {:?}", e);
                    Err(e)
                }
            }
        })?;
        
        self.event_handler.insert("handler", tsfn);
        println!("✅ Event handler registered successfully");
        Ok(())
    }

    /// Start listening on a TCP port for WebSocket upgrades (ws://host:port/livets-ws)
    #[napi]
    pub fn listen(&mut self, host: String, port: u16) -> napi::Result<()> {
        let addr = format!("{}:{}", host, port);
        let rt = self.rt.clone();
        let connections = self.connections.clone();
        let shutdown = self.shutdown.clone();
        let handler_map = self.event_handler.clone();

        let handle = rt.spawn(async move {
            let listener = TcpListener::bind(&addr).await.expect("bind tcp");
            tracing::info!("LiveTS WS broker listening on {}", addr);

            loop {
                if shutdown.get("stop").map(|e| *e.value()).unwrap_or(false) {
                    tracing::info!("Shutting down WS broker listener");
                    break;
                }

                let (stream, _addr) = match listener.accept().await {
                    Ok(v) => v,
                    Err(e) => {
                        tracing::error!("accept error: {}", e);
                        continue;
                    }
                };

                let handler_clone = handler_map.get("handler").map(|e| e.value().clone());
                tokio::spawn(handle_connection(stream, connections.clone(), handler_clone));
            }
        });

        self.listener_task = Some(handle);
        Ok(())
    }

    /// Stop the listener and close all connections
    #[napi]
    pub fn stop(&mut self) -> napi::Result<()> {
        self.shutdown.insert("stop", true);
        if let Some(handle) = self.listener_task.take() {
            self.rt.block_on(async move {
                let _ = handle.await;
            });
        }
        Ok(())
    }

    /// Send a JSON-stringified message to a specific connection
    #[napi]
    pub fn send_to_connection(&self, connection_id: String, message: String) -> napi::Result<()> {
        self.rt.block_on(async {
            self.connections
                .send_to_connection(&connection_id, &message)
                .await
                .map_err(|e| napi::Error::from_reason(e.to_string()))
        })
    }

    /// Register a component to a connection (for targeted broadcasts)
    #[napi]
    pub fn register_component(&self, component_id: String, connection_id: String) -> napi::Result<()> {
        self.connections
            .register_component(component_id, connection_id)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Unregister a component from a connection
    #[napi]
    pub fn unregister_component(&self, component_id: String, connection_id: String) -> napi::Result<()> {
        self.connections
            .unregister_component(&component_id, &connection_id)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    connections: Arc<connection::ConnectionManager>,
    handler: Option<ThreadsafeFunction<String>>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            tracing::error!("websocket accept error: {}", e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();

    // channel to receive outbound messages destined for this client
    let (tx, mut rx): (tokio::sync::mpsc::UnboundedSender<String>, UnboundedReceiver<String>) = unbounded_channel();

    // assign a session id
    let connection_id = Uuid::new_v4().to_string();
    let mut should_remove = false;

    // register in connection manager and attach sender
    if let Err(e) = connections.add_connection(connection_id.clone()) {
        tracing::error!("Failed to add connection: {}", e);
        return;
    }
    let _ = connections.attach_sender(&connection_id, tx);

    tracing::info!("WS connected: {}", connection_id);

    if let Some(tsfn) = &handler {
        let evt = BrokerEvent::Connected { connectionId: connection_id.clone() };
        match serde_json::to_string(&evt) {
            Ok(json) => {
                println!("🚀 Sending Connected event: {}", json);
                let status = tsfn.call(Ok(json), ThreadsafeFunctionCallMode::Blocking);
                if status != napi::Status::Ok {
                    println!("❌ Failed to call JS handler for Connected: {:?}", status);
                } else {
                    println!("✅ Successfully called JS handler for Connected");
                }
            }
            Err(e) => {
                println!("❌ Failed to serialize Connected event: {:?}", e);
            }
        }
    }

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(25));

    loop {
        tokio::select! {
            // Outgoing from application to client
            maybe_msg = rx.recv() => {
                match maybe_msg {
                    Some(msg) => {
                        if let Err(e) = write.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await {
                            tracing::warn!("write error ({}): {}", connection_id, e);
                            should_remove = true;
                            break;
                        }
                    },
                    None => {
                        tracing::debug!("sender closed for {}", connection_id);
                        should_remove = true;
                        break;
                    }
                }
            }
            // Incoming from client
            incoming = read.next() => {
                match incoming {
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                        let _ = connections.update_ping(&connection_id);
                        if let Some(tsfn) = &handler {
                            let evt = BrokerEvent::Message { connectionId: connection_id.clone(), data: text };
                            match serde_json::to_string(&evt) {
                                Ok(json) => {
                                    println!("📨 Sending Message event: {}", json);
                                    let status = tsfn.call(Ok(json), ThreadsafeFunctionCallMode::Blocking);
                                    if status != napi::Status::Ok {
                                        println!("❌ Failed to call JS handler for Message: {:?}", status);
                                    } else {
                                        println!("✅ Successfully called JS handler for Message");
                                    }
                                }
                                Err(e) => {
                                    println!("❌ Failed to serialize Message event: {:?}", e);
                                }
                            }
                        }
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Binary(_bin))) => {
                        // ignore binary for now
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Ping(payload))) => {
                        if let Err(e) = write.send(tokio_tungstenite::tungstenite::Message::Pong(payload)).await {
                            tracing::warn!("pong send error: {}", e);
                        }
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Pong(_))) => {
                        // no-op
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Frame(_))) => {
                        // no-op
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) => {
                        tracing::info!("client requested close: {}", connection_id);
                        should_remove = true;
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::warn!("read error ({}): {}", connection_id, e);
                        should_remove = true;
                        break;
                    }
                    None => {
                        tracing::info!("client disconnected: {}", connection_id);
                        should_remove = true;
                        break;
                    }
                }
            }
            // Heartbeat
            _ = interval.tick() => {
                // reserved for heartbeat handling
            }
        }
    }

    if should_remove {
        let _ = connections.remove_connection(&connection_id);
        if let Some(tsfn) = &handler {
            let evt = BrokerEvent::Closed { connectionId: connection_id.clone() };
            match serde_json::to_string(&evt) {
                Ok(json) => {
                    tracing::info!("🔌 Sending Closed event: {}", json);
                    let status = tsfn.call(Ok(json), ThreadsafeFunctionCallMode::Blocking);
                    if status != napi::Status::Ok {
                        tracing::error!("❌ Failed to call JS handler for Closed: {:?}", status);
                    }
                }
                Err(e) => {
                    tracing::error!("❌ Failed to serialize Closed event: {:?}", e);
                }
            }
        }
        tracing::info!("WS removed: {}", connection_id);
    }
}