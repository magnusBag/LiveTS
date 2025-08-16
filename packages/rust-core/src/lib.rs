//! LiveTS Core - High-performance Rust engine for real-time web applications
//!
//! This module provides the core functionality for LiveTS, including:
//! - WebSocket connection management
//! - HTML diffing and patching
//! - Event routing and handling
//! - Pub/Sub messaging system

#![deny(clippy::all)]

use napi_derive::napi;

mod cache;
mod connection;
mod differ;
mod events;
mod parser;
mod pubsub;
mod types;

pub use cache::ComponentCache;
pub use connection::ConnectionManager;
pub use differ::HtmlDiffer;
pub use events::EventRouter;
pub use parser::EventParser;
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
    event_parser: EventParser,
    component_cache: ComponentCache,
    event_processor_callback: Option<ThreadsafeFunction<String>>,
}

#[napi]
impl LiveTSEngine {
    /// Creates a new LiveTS engine instance
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            html_differ: HtmlDiffer::new(),
            event_parser: EventParser::new(),
            component_cache: ComponentCache::new(1000),
            event_processor_callback: None,
        }
    }

    /// Renders a component and returns the diff patches
    #[napi]
    pub fn render_component(
        &self,
        _component_id: String,
        old_html: String,
        new_html: String,
    ) -> napi::Result<String> {
        let patches = self
            .html_differ
            .diff(&old_html, &new_html)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let serialized = serde_json::to_string(&patches)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(serialized)
    }

    /// Renders a component and returns compact string patches for ultra-efficient WebSocket transmission
    #[napi]
    pub fn render_component_compact(
        &self,
        _component_id: String,
        old_html: String,
        new_html: String,
    ) -> napi::Result<String> {
        let patches = self
            .html_differ
            .diff(&old_html, &new_html)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        // Convert patches to compact string format
        let compact_patches = self
            .html_differ
            .patches_to_compact(patches);

        let serialized = serde_json::to_string(&compact_patches)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(serialized)
    }

    /// Renders a component and returns complete ultra-compact WebSocket message
    /// This eliminates ALL JSON operations in TypeScript layer
    #[napi]
    pub fn render_component_message(
        &self,
        component_id: String,
        old_html: String,
        new_html: String,
    ) -> napi::Result<String> {
        let patches = self
            .html_differ
            .diff(&old_html, &new_html)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        // Convert patches to compact string format
        let compact_patches = self
            .html_differ
            .patches_to_compact(patches);

        // Build complete WebSocket message using direct string formatting
        let short_id = &component_id[..8.min(component_id.len())];
        let patches_str = compact_patches
            .iter()
            .map(|p| format!("\"{}\"", p))
            .collect::<Vec<_>>()
            .join(",");
        
        let message = format!(r#"{{"t":"p","c":"{}","d":[{}]}}"#, short_id, patches_str);
        
        Ok(message)
    }

    /// Parse WebSocket event message directly in Rust (Phase 1 optimization)
    /// This eliminates Node.js parsing overhead and reduces FFI crossings
    #[napi]
    pub fn parse_event_message(&self, raw_message: String) -> napi::Result<String> {
        match self.event_parser.parse_message(&raw_message) {
            Ok(parsed_event) => {
                // Validate the parsed event
                if let Err(e) = self.event_parser.validate_event(&parsed_event) {
                    return Err(napi::Error::from_reason(format!("Event validation failed: {}", e)));
                }

                // Serialize the parsed event for Node.js callback
                match serde_json::to_string(&parsed_event) {
                    Ok(json) => Ok(json),
                    Err(e) => Err(napi::Error::from_reason(format!("Serialization failed: {}", e))),
                }
            }
            Err(e) => Err(napi::Error::from_reason(format!("Event parsing failed: {}", e))),
        }
    }

    /// Fast check if message is a ping (avoids parsing overhead)
    #[napi]
    pub fn is_ping_message(&self, raw_message: String) -> bool {
        raw_message == "\"p\""
    }

    /// Set the TypeScript event processor callback
    #[napi]
    pub fn set_event_processor(&mut self, _env: Env, callback: JsFunction) -> NapiResult<()> {
        let tsfn: ThreadsafeFunction<String> = callback.create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            match ctx.env.create_string(&ctx.value) {
                Ok(js_string) => Ok(vec![js_string]),
                Err(e) => Err(e),
            }
        })?;
        
        self.event_processor_callback = Some(tsfn);
        Ok(())
    }

    /// Parse event and prepare for processing (Phase 2 step 1)
    /// Returns parsed event data with cached HTML for TypeScript processing
    #[napi]
    pub fn parse_event_and_get_cache(&self, raw_message: String) -> napi::Result<String> {
        // 1. Parse event in Rust (no FFI)
        let parsed_event = match self.event_parser.parse_message(&raw_message) {
            Ok(event) => event,
            Err(e) => return Err(napi::Error::from_reason(format!("Parse failed: {}", e))),
        };

        // 2. Get cached HTML (no FFI)
        let old_html = self.component_cache
            .get_html(&parsed_event.component_id)
            .unwrap_or_else(|| String::new());

        // 3. Return structured data for TypeScript processing
        let request_with_cache = serde_json::json!({
            "component_id": parsed_event.component_id,
            "event_name": parsed_event.event_name,
            "event_data": parsed_event.event_data,
            "old_html": old_html
        });

        Ok(request_with_cache.to_string())
    }

    /// Process response and generate message (Phase 2 step 2)
    /// Takes new HTML from TypeScript and generates optimized diff response
    #[napi]
    pub fn process_response_and_generate_message(&self, component_id: String, old_html: String, new_html: String) -> napi::Result<String> {
        // 1. Update cache with new HTML (no FFI)
        self.component_cache.set_html(&component_id, new_html.clone());

        // 2. Generate diff and compact message (no FFI)
        let message = self
            .render_component_message(component_id, old_html, new_html)
            .map_err(|e| napi::Error::from_reason(format!("Diff generation failed: {}", e)))?;

        Ok(message)
    }

    /// Cache component HTML (useful for initial renders)
    #[napi]
    pub fn cache_component_html(&self, component_id: String, html: String) {
        self.component_cache.set_html(&component_id, html);
    }

    /// Get cached component HTML
    #[napi]
    pub fn get_cached_html(&self, component_id: String) -> Option<String> {
        self.component_cache.get_html(&component_id)
    }

    /// Remove component from cache
    #[napi]
    pub fn remove_component_cache(&self, component_id: String) -> bool {
        self.component_cache.remove_component(&component_id).is_some()
    }

    /// Get cache statistics
    #[napi]
    pub fn get_cache_stats(&self) -> napi::Result<String> {
        let stats = self.component_cache.stats();
        serde_json::to_string(&stats)
            .map_err(|e| napi::Error::from_reason(format!("Stats serialization failed: {}", e)))
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
    Connected { connection_id: String },
    Message { connection_id: String, data: String },
    Closed { connection_id: String },
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
        let tsfn: ThreadsafeFunction<String> = callback.create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            // Create the JS string and return it as an argument to the callback
            match ctx.env.create_string(&ctx.value) {
                Ok(js_string) => {
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
    let should_remove;

    // register in connection manager and attach sender
    if let Err(e) = connections.add_connection(connection_id.clone()) {
        tracing::error!("Failed to add connection: {}", e);
        return;
    }
    let _ = connections.attach_sender(&connection_id, tx);

    tracing::info!("WS connected: {}", connection_id);

    if let Some(tsfn) = &handler {
        let evt = BrokerEvent::Connected { connection_id: connection_id.clone() };
        match serde_json::to_string(&evt) {
            Ok(json) => {
                let status = tsfn.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
                if status != napi::Status::Ok {
                    println!("❌ Failed to call JS handler for Connected: {:?}", status);
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
                            let evt = BrokerEvent::Message { connection_id: connection_id.clone(), data: text };
                            match serde_json::to_string(&evt) {
                                Ok(json) => {
                                    let status = tsfn.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
                                    if status != napi::Status::Ok {
                                        println!("❌ Failed to call JS handler for Message: {:?}", status);
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
            let evt = BrokerEvent::Closed { connection_id: connection_id.clone() };
            match serde_json::to_string(&evt) {
                Ok(json) => {
                    tracing::info!("🔌 Sending Closed event: {}", json);
                    let status = tsfn.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
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
