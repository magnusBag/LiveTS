//! Event routing and handling system

use crate::types::*;
use dashmap::DashMap;
use std::sync::Arc;

/// Handler function type for processing client events
pub type EventHandler = dyn Fn(ClientEvent) -> Result<()> + Send + Sync;

/// Routes client events to appropriate handlers
pub struct EventRouter {
    handlers: DashMap<ComponentId, Arc<Box<EventHandler>>>,
}

impl EventRouter {
    pub fn new() -> Self {
        Self {
            handlers: DashMap::new(),
        }
    }

    /// Registers an event handler for a component
    pub fn register_handler(
        &self,
        component_id: ComponentId,
        handler: Box<EventHandler>,
    ) -> Result<()> {
        self.handlers.insert(component_id, Arc::new(handler));
        Ok(())
    }

    /// Removes an event handler for a component
    pub fn unregister_handler(&self, component_id: &ComponentId) -> Result<()> {
        self.handlers.remove(component_id);
        Ok(())
    }

    /// Routes a client event to the appropriate handler
    pub async fn route_event(&self, component_id: &ComponentId, event: ClientEvent) -> Result<()> {
        if let Some(_handler) = self.handlers.get(component_id) {
            // In a real implementation, this would be called via FFI to the TypeScript layer
            // For now, we'll just log the event
            tracing::info!(
                "Routing event '{}' for component '{}': {:?}",
                event.event_name,
                component_id,
                event.payload
            );
            
            // TODO: Implement actual event handler invocation
            // This will require calling back into the Node.js/TypeScript layer
            
            Ok(())
        } else {
            Err(LiveTSError::ComponentNotFound(component_id.clone()))
        }
    }

    /// Gets the number of registered handlers
    pub fn handler_count(&self) -> usize {
        self.handlers.len()
    }

    /// Checks if a component has a registered handler
    pub fn has_handler(&self, component_id: &ComponentId) -> bool {
        self.handlers.contains_key(component_id)
    }

    /// Validates an incoming client event
    pub fn validate_event(&self, event: &ClientEvent) -> Result<()> {
        // Basic validation
        if event.component_id.is_empty() {
            return Err(LiveTSError::EventRoutingError(
                "Component ID cannot be empty".to_string()
            ));
        }

        if event.event_name.is_empty() {
            return Err(LiveTSError::EventRoutingError(
                "Event name cannot be empty".to_string()
            ));
        }

        // Validate event name format (should not contain special characters)
        if !event.event_name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
            return Err(LiveTSError::EventRoutingError(
                "Event name contains invalid characters".to_string()
            ));
        }

        Ok(())
    }

    /// Processes a batch of events
    pub async fn process_event_batch(&self, events: Vec<ClientEvent>) -> Result<Vec<Result<()>>> {
        let mut results = Vec::new();
        
        for event in events {
            let component_id = event.component_id.clone();
            let result = self.route_event(&component_id, event).await;
            results.push(result);
        }
        
        Ok(results)
    }

    /// Gets statistics about event processing
    pub fn get_stats(&self) -> EventRouterStats {
        EventRouterStats {
            registered_handlers: self.handler_count(),
        }
    }
}

/// Statistics about the event router
#[derive(Debug, Clone)]
pub struct EventRouterStats {
    pub registered_handlers: usize,
}

impl Default for EventRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_event_validation() {
        let router = EventRouter::new();
        
        let valid_event = ClientEvent {
            event_type: "click".to_string(),
            event_name: "increment".to_string(),
            component_id: "counter-1".to_string(),
            payload: json!({}),
            target: None,
        };
        
        assert!(router.validate_event(&valid_event).is_ok());
        
        let invalid_event = ClientEvent {
            event_type: "click".to_string(),
            event_name: "".to_string(),
            component_id: "counter-1".to_string(),
            payload: json!({}),
            target: None,
        };
        
        assert!(router.validate_event(&invalid_event).is_err());
    }

    #[tokio::test]
    async fn test_route_event_without_handler() {
        let router = EventRouter::new();
        
        let event = ClientEvent {
            event_type: "click".to_string(),
            event_name: "increment".to_string(),
            component_id: "nonexistent".to_string(),
            payload: json!({}),
            target: None,
        };
        
        let result = router.route_event(&"nonexistent".to_string(), event).await;
        assert!(result.is_err());
    }
}