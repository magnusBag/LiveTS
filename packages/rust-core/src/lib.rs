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