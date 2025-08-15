//! WebSocket connection management for LiveTS

use crate::types::*;
use dashmap::DashMap;
use tokio::sync::mpsc::UnboundedSender;

/// Information about a WebSocket connection
#[derive(Debug, Clone)]
pub struct Connection {
    pub component_ids: Vec<ComponentId>,
    pub last_ping: std::time::Instant,
    // Outbound sender to write messages to this connection's websocket task
    pub sender: Option<UnboundedSender<String>>,
}

impl Connection {
    pub fn new() -> Self {
        Self {
            component_ids: Vec::new(),
            last_ping: std::time::Instant::now(),
            sender: None,
        }
    }

    pub fn add_component(&mut self, component_id: ComponentId) {
        if !self.component_ids.contains(&component_id) {
            self.component_ids.push(component_id);
        }
    }

    pub fn remove_component(&mut self, component_id: &ComponentId) {
        self.component_ids.retain(|id| id != component_id);
    }

    pub fn attach_sender(&mut self, sender: UnboundedSender<String>) {
        self.sender = Some(sender);
    }
}

/// Manages WebSocket connections and component associations
pub struct ConnectionManager {
    connections: DashMap<ConnectionId, Connection>,
    component_to_connections: DashMap<ComponentId, Vec<ConnectionId>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: DashMap::new(),
            component_to_connections: DashMap::new(),
        }
    }

    /// Adds a new WebSocket connection
    pub fn add_connection(&self, conn_id: ConnectionId) -> Result<()> {
        let connection = Connection::new();
        self.connections.insert(conn_id, connection);
        Ok(())
    }

    /// Attaches an outbound sender to an existing connection
    pub fn attach_sender(&self, conn_id: &ConnectionId, sender: UnboundedSender<String>) -> Result<()> {
        if let Some(mut conn) = self.connections.get_mut(conn_id) {
            conn.attach_sender(sender);
            Ok(())
        } else {
            Err(LiveTSError::ConnectionNotFound(conn_id.clone()))
        }
    }

    /// Removes a WebSocket connection and cleans up component associations
    pub fn remove_connection(&self, conn_id: &ConnectionId) -> Result<()> {
        if let Some((_, connection)) = self.connections.remove(conn_id) {
            // Clean up component associations
            for component_id in &connection.component_ids {
                if let Some(mut connections) = self.component_to_connections.get_mut(component_id) {
                    connections.retain(|id| id != conn_id);
                    if connections.is_empty() {
                        drop(connections);
                        self.component_to_connections.remove(component_id);
                    }
                }
            }
        }
        Ok(())
    }

    /// Associates a component with a connection
    pub fn register_component(
        &self,
        component_id: ComponentId,
        conn_id: ConnectionId,
    ) -> Result<()> {
        // Add component to connection
        if let Some(mut connection) = self.connections.get_mut(&conn_id) {
            connection.add_component(component_id.clone());
        } else {
            return Err(LiveTSError::ConnectionNotFound(conn_id));
        }

        // Add connection to component mapping
        self.component_to_connections
            .entry(component_id)
            .or_insert_with(Vec::new)
            .push(conn_id);

        Ok(())
    }

    /// Removes a component association from a connection
    pub fn unregister_component(
        &self,
        component_id: &ComponentId,
        conn_id: &ConnectionId,
    ) -> Result<()> {
        // Remove component from connection
        if let Some(mut connection) = self.connections.get_mut(conn_id) {
            connection.remove_component(component_id);
        }

        // Remove connection from component mapping
        if let Some(mut connections) = self.component_to_connections.get_mut(component_id) {
            connections.retain(|id| id != conn_id);
            if connections.is_empty() {
                drop(connections);
                self.component_to_connections.remove(component_id);
            }
        }

        Ok(())
    }

    /// Broadcasts data to all connections associated with a component
    pub async fn broadcast_to_component(
        &self,
        component_id: &ComponentId,
        data: &str,
    ) -> Result<()> {
        if let Some(connections) = self.component_to_connections.get(component_id) {
            for conn_id in connections.iter() {
                if let Err(e) = self.send_to_connection(conn_id, data).await {
                    tracing::warn!("Failed to send to connection {}: {}", conn_id, e);
                }
            }
        }
        Ok(())
    }

    /// Sends data to a specific connection
    pub async fn send_to_connection(
        &self,
        conn_id: &ConnectionId,
        data: &str,
    ) -> Result<()> {
        if let Some(conn) = self.connections.get(conn_id) {
            if let Some(sender) = &conn.sender {
                sender
                    .send(data.to_string())
                    .map_err(|e| LiveTSError::WebSocketError(format!("Send failed: {}", e)))?;
                Ok(())
            } else {
                Err(LiveTSError::WebSocketError("No sender attached to connection".into()))
            }
        } else {
            Err(LiveTSError::ConnectionNotFound(conn_id.clone()))
        }
    }

    /// Gets all connections for a component
    pub fn get_component_connections(&self, component_id: &ComponentId) -> Vec<ConnectionId> {
        self.component_to_connections
            .get(component_id)
            .map(|connections| connections.clone())
            .unwrap_or_default()
    }

    /// Gets the number of active connections
    pub fn connection_count(&self) -> usize {
        self.connections.len()
    }

    /// Gets the number of registered components
    pub fn component_count(&self) -> usize {
        self.component_to_connections.len()
    }

    /// Updates the last ping time for a connection
    pub fn update_ping(&self, conn_id: &ConnectionId) -> Result<()> {
        if let Some(mut connection) = self.connections.get_mut(conn_id) {
            connection.last_ping = std::time::Instant::now();
            Ok(())
        } else {
            Err(LiveTSError::ConnectionNotFound(conn_id.clone()))
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}
