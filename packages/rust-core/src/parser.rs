//! High-performance event parsing for LiveTS
//!
//! This module provides optimized parsing for both compact and JSON event formats,
//! eliminating the need for Node.js parsing and reducing FFI overhead.

use crate::types::*;
use serde_json;

/// High-performance event parser that handles multiple formats
pub struct EventParser;

impl EventParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse incoming WebSocket message into a structured event
    /// Returns ParsedEvent ready for processing or an error
    pub fn parse_message(&self, raw_message: &str) -> Result<ParsedEvent> {
        // Handle ping messages
        if raw_message == "\"p\"" {
            return Err(LiveTSError::InvalidInput("Ping message".to_string()));
        }

        // Determine message format and parse accordingly
        let parse_result = if raw_message.starts_with("\"e|") {
            self.parse_compact_event(raw_message)
        } else if raw_message.starts_with("{\"type\":\"event\"") {
            self.parse_json_event(raw_message)
        } else {
            EventParseResult::Invalid(format!("Unknown message format: {}", raw_message))
        };

        // Convert parse result to unified ParsedEvent
        match parse_result {
            EventParseResult::Compact(compact_event) => {
                let event_name = compact_event.event_name.clone();
                Ok(ParsedEvent {
                    component_id: compact_event.component_id,
                    event_name: event_name.clone(),
                    event_data: EventData {
                        event_type: event_name,
                        target: EventTarget {
                            tag_name: compact_event.tag_name,
                            attributes: std::collections::HashMap::new(),
                            value: if compact_event.value.is_empty() {
                                None
                            } else {
                                Some(compact_event.value)
                            },
                            checked: Some(compact_event.checked),
                        },
                    },
                })
            }
            EventParseResult::Json(client_event) => Ok(ParsedEvent {
                component_id: client_event.component_id,
                event_name: client_event.event_name,
                event_data: EventData {
                    event_type: client_event.event_type,
                    target: client_event.target.unwrap_or_default(),
                },
            }),
            EventParseResult::Invalid(error) => Err(LiveTSError::InvalidInput(error)),
        }
    }

    /// Parse ultra-compact event format: "e|shortId|eventName|value|checked|tagName"
    /// Example: "e|abc123|increment||false|button"
    fn parse_compact_event(&self, raw_message: &str) -> EventParseResult {
        // Remove quotes and split by delimiter
        let content = if raw_message.starts_with('"') && raw_message.ends_with('"') {
            &raw_message[1..raw_message.len() - 1]
        } else {
            raw_message
        };

        let parts: Vec<&str> = content.split('|').collect();

        if parts.len() != 6 || parts[0] != "e" {
            return EventParseResult::Invalid(format!(
                "Invalid compact event format. Expected 6 parts, got {}: {:?}",
                parts.len(),
                parts
            ));
        }

        let component_id = parts[1].to_string();
        let event_name = parts[2].to_string();
        let value = parts[3].to_string();
        let checked = parts[4] == "1" || parts[4].to_lowercase() == "true";
        let tag_name = parts[5].to_string();

        EventParseResult::Compact(CompactEvent {
            component_id,
            event_name,
            value,
            checked,
            tag_name,
        })
    }

    /// Parse JSON event format with optimized regex parsing
    /// Falls back to full JSON.parse if regex fails
    fn parse_json_event(&self, raw_message: &str) -> EventParseResult {
        // Try fast regex parsing first
        if let Some(event) = self.fast_json_parse(raw_message) {
            return EventParseResult::Json(event);
        }

        // Fallback to full JSON parsing
        match serde_json::from_str::<ClientEvent>(raw_message) {
            Ok(event) => EventParseResult::Json(event),
            Err(e) => EventParseResult::Invalid(format!("JSON parse error: {}", e)),
        }
    }

    /// Fast regex-based JSON parsing for common event patterns
    /// Much faster than full JSON parsing for simple event structures
    fn fast_json_parse(&self, raw_message: &str) -> Option<ClientEvent> {
        use regex::Regex;

        // Pre-compiled regexes for performance (in real implementation, these would be static)
        let component_id_regex = Regex::new(r#""componentId":"([^"]+)""#).ok()?;
        let event_name_regex = Regex::new(r#""eventName":"([^"]+)""#).ok()?;
        let event_type_regex = Regex::new(r#""type":"([^"]+)""#).ok()?;

        let component_id = component_id_regex
            .captures(raw_message)?
            .get(1)?
            .as_str()
            .to_string();

        let event_name = event_name_regex
            .captures(raw_message)?
            .get(1)?
            .as_str()
            .to_string();

        let event_type = event_type_regex
            .captures(raw_message)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "event".to_string());

        Some(ClientEvent {
            event_type,
            event_name,
            component_id,
            payload: serde_json::Value::Null,
            target: None,
        })
    }

    /// Validate that a parsed event is complete and valid
    pub fn validate_event(&self, event: &ParsedEvent) -> Result<()> {
        if event.component_id.is_empty() {
            return Err(LiveTSError::InvalidInput(
                "Component ID cannot be empty".to_string(),
            ));
        }

        if event.event_name.is_empty() {
            return Err(LiveTSError::InvalidInput(
                "Event name cannot be empty".to_string(),
            ));
        }

        // Validate component ID format (should be UUID-like)
        if event.component_id.len() < 8 {
            return Err(LiveTSError::InvalidInput(
                "Component ID too short".to_string(),
            ));
        }

        Ok(())
    }
}

impl Default for EventParser {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for EventTarget {
    fn default() -> Self {
        Self {
            tag_name: String::new(),
            attributes: std::collections::HashMap::new(),
            value: None,
            checked: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_compact_event() {
        let parser = EventParser::new();
        let message = r#""e|abc12345|increment||0|button""#;

        let result = parser.parse_message(message).unwrap();
        assert_eq!(result.component_id, "abc12345");
        assert_eq!(result.event_name, "increment");
        assert_eq!(result.event_data.target.tag_name, "button");
        assert_eq!(result.event_data.target.checked, Some(false));
    }

    #[test]
    fn test_parse_compact_event_with_value() {
        let parser = EventParser::new();
        let message = r#""e|xyz98765|input|hello world|1|input""#;

        let result = parser.parse_message(message).unwrap();
        assert_eq!(result.component_id, "xyz98765");
        assert_eq!(result.event_name, "input");
        assert_eq!(
            result.event_data.target.value,
            Some("hello world".to_string())
        );
        assert_eq!(result.event_data.target.checked, Some(true));
        assert_eq!(result.event_data.target.tag_name, "input");
    }

    #[test]
    fn test_parse_json_event() {
        let parser = EventParser::new();
        let message =
            r#"{"type":"event","componentId":"test123","eventName":"click","payload":{}}"#;

        let result = parser.parse_message(message).unwrap();
        assert_eq!(result.component_id, "test123");
        assert_eq!(result.event_name, "click");
        assert_eq!(result.event_data.event_type, "event");
    }

    #[test]
    fn test_invalid_format() {
        let parser = EventParser::new();
        let message = "invalid message format";

        let result = parser.parse_message(message);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_event() {
        let parser = EventParser::new();

        let valid_event = ParsedEvent {
            component_id: "valid-uuid-123".to_string(),
            event_name: "click".to_string(),
            event_data: EventData {
                event_type: "click".to_string(),
                target: EventTarget::default(),
            },
        };

        assert!(parser.validate_event(&valid_event).is_ok());

        let invalid_event = ParsedEvent {
            component_id: "".to_string(),
            event_name: "click".to_string(),
            event_data: EventData {
                event_type: "click".to_string(),
                target: EventTarget::default(),
            },
        };

        assert!(parser.validate_event(&invalid_event).is_err());
    }

    #[test]
    fn test_ping_message() {
        let parser = EventParser::new();
        let result = parser.parse_message("\"p\"");
        assert!(result.is_err());
    }
}
