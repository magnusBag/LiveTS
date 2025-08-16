//! Component state and HTML caching system
//!
//! This module provides high-performance caching for component HTML and state,
//! eliminating the need to transfer HTML back and forth across FFI boundaries.

use crate::types::*;
use dashmap::DashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// High-performance component cache with built-in eviction
pub struct ComponentCache {
    /// Cache for component HTML (component_id -> html)
    html_cache: DashMap<ComponentId, CachedComponent>,
    /// Maximum cache size before eviction
    max_size: usize,
}

impl ComponentCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            html_cache: DashMap::new(),
            max_size,
        }
    }

    /// Store component HTML in cache
    pub fn set_html(&self, component_id: &str, html: String) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let cached_component = CachedComponent {
            component_id: component_id.to_string(),
            current_html: html,
            last_updated: timestamp,
        };

        self.html_cache
            .insert(component_id.to_string(), cached_component);

        // Evict oldest entries if cache is too large
        if self.html_cache.len() > self.max_size {
            self.evict_oldest();
        }
    }

    /// Get component HTML from cache
    pub fn get_html(&self, component_id: &str) -> Option<String> {
        self.html_cache
            .get(component_id)
            .map(|entry| entry.current_html.clone())
    }

    /// Check if component exists in cache
    pub fn has_component(&self, component_id: &str) -> bool {
        self.html_cache.contains_key(component_id)
    }

    /// Remove component from cache
    pub fn remove_component(&self, component_id: &str) -> Option<CachedComponent> {
        self.html_cache.remove(component_id).map(|(_, v)| v)
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            size: self.html_cache.len(),
            max_size: self.max_size,
            hit_ratio: 0.0, // TODO: Implement hit tracking
        }
    }

    /// Clear all cached components
    pub fn clear(&self) {
        self.html_cache.clear();
    }

    /// Evict oldest cache entries to maintain size limit
    fn evict_oldest(&self) {
        let mut oldest_key = None;
        let mut oldest_time = u64::MAX;

        // Find the oldest entry
        for entry in self.html_cache.iter() {
            if entry.last_updated < oldest_time {
                oldest_time = entry.last_updated;
                oldest_key = Some(entry.component_id.clone());
            }
        }

        // Remove the oldest entry
        if let Some(key) = oldest_key {
            self.html_cache.remove(&key);
        }
    }

    /// Update component's last access time
    pub fn touch_component(&self, component_id: &str) {
        if let Some(mut entry) = self.html_cache.get_mut(component_id) {
            entry.last_updated = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
        }
    }

    /// Get components that haven't been accessed for a given time (in milliseconds)
    pub fn get_stale_components(&self, max_age_ms: u64) -> Vec<String> {
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        self.html_cache
            .iter()
            .filter_map(|entry| {
                if current_time - entry.last_updated > max_age_ms {
                    Some(entry.component_id.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    /// Clean up stale components
    pub fn cleanup_stale(&self, max_age_ms: u64) -> usize {
        let stale_components = self.get_stale_components(max_age_ms);
        let count = stale_components.len();

        for component_id in stale_components {
            self.html_cache.remove(&component_id);
        }

        count
    }
}

/// Cache performance statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    pub size: usize,
    pub max_size: usize,
    pub hit_ratio: f64,
}

impl Default for ComponentCache {
    fn default() -> Self {
        Self::new(1000) // Default to 1000 cached components
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_cache_operations() {
        let cache = ComponentCache::new(10);

        // Test set and get
        cache.set_html("comp1", "<div>Hello</div>".to_string());
        assert_eq!(
            cache.get_html("comp1"),
            Some("<div>Hello</div>".to_string())
        );

        // Test has_component
        assert!(cache.has_component("comp1"));
        assert!(!cache.has_component("comp2"));

        // Test remove
        let removed = cache.remove_component("comp1");
        assert!(removed.is_some());
        assert!(!cache.has_component("comp1"));
    }

    #[test]
    fn test_cache_eviction() {
        let cache = ComponentCache::new(2);

        // Fill cache
        cache.set_html("comp1", "<div>1</div>".to_string());
        cache.set_html("comp2", "<div>2</div>".to_string());

        // Adding third component should evict oldest
        std::thread::sleep(std::time::Duration::from_millis(1));
        cache.set_html("comp3", "<div>3</div>".to_string());

        // comp1 should be evicted (oldest)
        assert_eq!(cache.html_cache.len(), 2);
    }

    #[test]
    fn test_cache_stats() {
        let cache = ComponentCache::new(10);
        cache.set_html("comp1", "<div>1</div>".to_string());
        cache.set_html("comp2", "<div>2</div>".to_string());

        let stats = cache.stats();
        assert_eq!(stats.size, 2);
        assert_eq!(stats.max_size, 10);
    }

    #[test]
    fn test_stale_cleanup() {
        let cache = ComponentCache::new(10);
        cache.set_html("comp1", "<div>1</div>".to_string());

        // Manually set old timestamp to simulate stale component
        if let Some(mut entry) = cache.html_cache.get_mut("comp1") {
            entry.last_updated = 0; // Very old timestamp
        }

        let cleaned = cache.cleanup_stale(1000); // Components older than 1 second
        assert_eq!(cleaned, 1);
        assert!(!cache.has_component("comp1"));
    }
}
