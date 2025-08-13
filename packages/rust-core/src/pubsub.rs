//! High-performance pub/sub messaging system

use crate::types::*;
use dashmap::DashMap;
use std::collections::HashSet;
use tokio::sync::broadcast;

/// Pub/Sub system for real-time messaging between components
pub struct PubSubSystem {
    // Channel subscribers: channel_id -> set of component_ids
    subscribers: DashMap<ChannelId, HashSet<ComponentId>>,
    // Component subscriptions: component_id -> set of channel_ids (for cleanup)
    component_channels: DashMap<ComponentId, HashSet<ChannelId>>,
    // Broadcast channels for real-time messaging
    channels: DashMap<ChannelId, broadcast::Sender<String>>,
}

impl PubSubSystem {
    pub fn new() -> Self {
        Self {
            subscribers: DashMap::new(),
            component_channels: DashMap::new(),
            channels: DashMap::new(),
        }
    }

    /// Subscribes a component to a channel
    pub async fn subscribe(&mut self, channel: &ChannelId, component_id: &ComponentId) -> Result<()> {
        // Add component to channel subscribers
        self.subscribers
            .entry(channel.clone())
            .or_insert_with(HashSet::new)
            .insert(component_id.clone());

        // Add channel to component's subscriptions
        self.component_channels
            .entry(component_id.clone())
            .or_insert_with(HashSet::new)
            .insert(channel.clone());

        // Create broadcast channel if it doesn't exist
        if !self.channels.contains_key(channel) {
            let (tx, _) = broadcast::channel(1000); // Buffer size of 1000 messages
            self.channels.insert(channel.clone(), tx);
        }

        tracing::debug!("Component {} subscribed to channel {}", component_id, channel);
        Ok(())
    }

    /// Unsubscribes a component from a channel
    pub async fn unsubscribe(&mut self, channel: &ChannelId, component_id: &ComponentId) -> Result<()> {
        // Remove component from channel subscribers
        if let Some(mut subscribers) = self.subscribers.get_mut(channel) {
            subscribers.remove(component_id);
            
            // If no more subscribers, clean up the channel
            if subscribers.is_empty() {
                drop(subscribers);
                self.subscribers.remove(channel);
                self.channels.remove(channel);
            }
        }

        // Remove channel from component's subscriptions
        if let Some(mut channels) = self.component_channels.get_mut(component_id) {
            channels.remove(channel);
            
            // If component has no more subscriptions, clean up
            if channels.is_empty() {
                drop(channels);
                self.component_channels.remove(component_id);
            }
        }

        tracing::debug!("Component {} unsubscribed from channel {}", component_id, channel);
        Ok(())
    }

    /// Unsubscribes a component from all channels (cleanup)
    pub async fn unsubscribe_all(&mut self, component_id: &ComponentId) -> Result<()> {
        if let Some((_, channels)) = self.component_channels.remove(component_id) {
            for channel in channels {
                if let Some(mut subscribers) = self.subscribers.get_mut(&channel) {
                    subscribers.remove(component_id);
                    
                    // Clean up empty channels
                    if subscribers.is_empty() {
                        drop(subscribers);
                        self.subscribers.remove(&channel);
                        self.channels.remove(&channel);
                    }
                }
            }
        }

        tracing::debug!("Component {} unsubscribed from all channels", component_id);
        Ok(())
    }

    /// Broadcasts a message to all subscribers of a channel
    pub async fn broadcast(&self, channel: &ChannelId, message: String) -> Result<()> {
        if let Some(sender) = self.channels.get(channel) {
            match sender.send(message.clone()) {
                Ok(subscriber_count) => {
                    tracing::debug!(
                        "Broadcasted message to {} subscribers on channel {}",
                        subscriber_count,
                        channel
                    );
                }
                Err(_) => {
                    // No active receivers
                    tracing::debug!("No active receivers for channel {}", channel);
                }
            }
        } else {
            tracing::warn!("Attempted to broadcast to non-existent channel: {}", channel);
        }

        Ok(())
    }

    /// Gets all subscribers for a channel
    pub fn get_subscribers(&self, channel: &ChannelId) -> Vec<ComponentId> {
        self.subscribers
            .get(channel)
            .map(|subscribers| subscribers.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Gets all channels a component is subscribed to
    pub fn get_component_channels(&self, component_id: &ComponentId) -> Vec<ChannelId> {
        self.component_channels
            .get(component_id)
            .map(|channels| channels.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Gets statistics about the pub/sub system
    pub fn get_stats(&self) -> PubSubStats {
        PubSubStats {
            total_channels: self.channels.len(),
            total_subscriptions: self.component_channels.iter().map(|entry| entry.value().len()).sum(),
            active_components: self.component_channels.len(),
        }
    }

    /// Checks if a channel exists
    pub fn channel_exists(&self, channel: &ChannelId) -> bool {
        self.channels.contains_key(channel)
    }

    /// Checks if a component is subscribed to a channel
    pub fn is_subscribed(&self, channel: &ChannelId, component_id: &ComponentId) -> bool {
        self.subscribers
            .get(channel)
            .map(|subscribers| subscribers.contains(component_id))
            .unwrap_or(false)
    }

    /// Creates a new receiver for a channel (for listening to messages)
    pub fn create_receiver(&self, channel: &ChannelId) -> Option<broadcast::Receiver<String>> {
        self.channels.get(channel).map(|sender| sender.subscribe())
    }
}

/// Statistics about the pub/sub system
#[derive(Debug, Clone)]
pub struct PubSubStats {
    pub total_channels: usize,
    pub total_subscriptions: usize,
    pub active_components: usize,
}

impl Default for PubSubSystem {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_subscribe_and_broadcast() {
        let mut pubsub = PubSubSystem::new();
        let channel = "test-channel".to_string();
        let component = "test-component".to_string();

        // Subscribe
        pubsub.subscribe(&channel, &component).await.unwrap();
        assert!(pubsub.is_subscribed(&channel, &component));

        // Broadcast
        pubsub.broadcast(&channel, "test message".to_string()).await.unwrap();

        // Check stats
        let stats = pubsub.get_stats();
        assert_eq!(stats.total_channels, 1);
        assert_eq!(stats.total_subscriptions, 1);
        assert_eq!(stats.active_components, 1);
    }

    #[tokio::test]
    async fn test_unsubscribe() {
        let mut pubsub = PubSubSystem::new();
        let channel = "test-channel".to_string();
        let component = "test-component".to_string();

        // Subscribe then unsubscribe
        pubsub.subscribe(&channel, &component).await.unwrap();
        pubsub.unsubscribe(&channel, &component).await.unwrap();
        
        assert!(!pubsub.is_subscribed(&channel, &component));
        assert!(!pubsub.channel_exists(&channel));
    }

    #[tokio::test]
    async fn test_unsubscribe_all() {
        let mut pubsub = PubSubSystem::new();
        let component = "test-component".to_string();

        // Subscribe to multiple channels
        pubsub.subscribe(&"channel1".to_string(), &component).await.unwrap();
        pubsub.subscribe(&"channel2".to_string(), &component).await.unwrap();

        // Unsubscribe from all
        pubsub.unsubscribe_all(&component).await.unwrap();

        assert_eq!(pubsub.get_component_channels(&component).len(), 0);
        assert_eq!(pubsub.get_stats().active_components, 0);
    }
}