//! Type definitions for the LiveTS core engine

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Unique identifier for a WebSocket connection
pub type ConnectionId = String;

/// Unique identifier for a component instance
pub type ComponentId = String;

/// Unique identifier for a pub/sub channel
pub type ChannelId = String;

/// Client event sent from the browser
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientEvent {
    pub event_type: String,
    pub event_name: String,
    pub component_id: String,
    pub payload: serde_json::Value,
    pub target: Option<EventTarget>,
}

/// Optimized compact event format for high-performance parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactEvent {
    pub component_id: String,
    pub event_name: String,
    pub value: String,
    pub checked: bool,
    pub tag_name: String,
}

/// Parsed event ready for processing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedEvent {
    pub component_id: String,
    pub event_name: String,
    pub event_data: EventData,
}

/// Event data extracted from client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub event_type: String,
    pub target: EventTarget,
}

/// Event parsing result
#[derive(Debug, Clone)]
pub enum EventParseResult {
    Compact(CompactEvent),
    Json(ClientEvent),
    Invalid(String),
}

/// Component HTML cache entry
#[derive(Debug, Clone)]
pub struct CachedComponent {
    pub component_id: String,
    pub current_html: String,
    pub last_updated: u64,
}

/// Event processing request for TypeScript callback
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventProcessingRequest {
    pub component_id: String,
    pub event_name: String,
    pub event_data: EventData,
}

/// Event processing response from TypeScript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventProcessingResponse {
    pub success: bool,
    pub new_html: String,
    pub error: Option<String>,
}

/// Information about the DOM element that triggered the event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventTarget {
    pub tag_name: String,
    pub attributes: HashMap<String, String>,
    pub value: Option<String>,
    pub checked: Option<bool>,
}

/// DOM patch operation for updating the client-side DOM
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DomPatch {
    ReplaceText {
        selector: String,
        content: String,
    },
    UpdateText {
        selector: String,
        text: String,
    },
    SetAttribute {
        selector: String,
        attr: String,
        value: String,
    },
    RemoveAttribute {
        selector: String,
        attr: String,
    },
    ReplaceElement {
        selector: String,
        html: String,
    },
    InsertElement {
        parent: String,
        position: InsertPosition,
        html: String,
    },
    RemoveElement {
        selector: String,
    },
    ReplaceInnerHtml {
        selector: String,
        html: String,
    },
}

/// Position for inserting new elements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InsertPosition {
    BeforeBegin,
    AfterBegin,
    BeforeEnd,
    AfterEnd,
}

/// WebSocket message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketMessage {
    Patches {
        patches: Vec<DomPatch>,
    },
    Event {
        event: ClientEvent,
    },
    PubSub {
        channel: String,
        data: serde_json::Value,
    },
    Ping,
    Pong,
}

/// Error types for the LiveTS engine
#[derive(thiserror::Error, Debug)]
pub enum LiveTSError {
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Component not found: {0}")]
    ComponentNotFound(String),

    #[error("WebSocket error: {0}")]
    WebSocketError(String),

    #[error("HTML parsing error: {0}")]
    HtmlParsingError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Event routing error: {0}")]
    EventRoutingError(String),

    #[error("PubSub error: {0}")]
    PubSubError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

pub type Result<T> = std::result::Result<T, LiveTSError>;
