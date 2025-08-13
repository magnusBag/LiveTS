//! HTML diffing algorithm for efficient DOM updates

use crate::types::*;

/// High-performance HTML diffing engine
pub struct HtmlDiffer;

impl HtmlDiffer {
    pub fn new() -> Self {
        Self
    }

    /// Compares two HTML strings and generates minimal patch operations
    pub fn diff(&self, old_html: &str, new_html: &str) -> Result<Vec<DomPatch>> {
        let mut patches = Vec::new();

        // Strategy 1: Intelligent element-by-element comparison
        if let Some(smart_patches) = self.smart_element_diff(old_html, new_html) {
            patches.extend(smart_patches);
            return Ok(patches);
        }

        // Strategy 2: Fallback to full replacement if no intelligent diff found
        if old_html.trim() != new_html.trim() {
            patches.push(DomPatch::ReplaceInnerHtml {
                selector: "[data-livets-root]".to_string(),
                html: new_html.to_string(),
            });
        }

        Ok(patches)
    }

    /// Smart diffing that handles any HTML elements and CSS classes generically
    fn smart_element_diff(&self, old_html: &str, new_html: &str) -> Option<Vec<DomPatch>> {
        let mut patches = Vec::new();

        // Parse both HTML strings to extract elements
        let old_elements = self.parse_elements(old_html)?;
        let new_elements = self.parse_elements(new_html)?;

        // Find the component ID for targeted selectors
        let component_id = self.extract_component_id(new_html);
        let base_selector = if let Some(id) = component_id {
            format!("[data-livets-id=\"{}\"]", id)
        } else {
            "[data-livets-root]".to_string()
        };

        // Compare elements pairwise
        for (old_elem, new_elem) in old_elements.iter().zip(new_elements.iter()) {
            if old_elem.tag_name != new_elem.tag_name {
                continue; // Different element types, skip
            }

            // Case 1: Same element, same classes, different text content
            if old_elem.classes == new_elem.classes && old_elem.text_content != new_elem.text_content {
                let selector = self.build_element_selector(&base_selector, &old_elem);
                patches.push(DomPatch::UpdateText {
                    selector,
                    text: new_elem.text_content.clone(),
                });
            }
            // Case 2: Same element, same text, different classes
            else if old_elem.text_content == new_elem.text_content && old_elem.classes != new_elem.classes {
                let selector = self.build_element_selector(&base_selector, &old_elem);
                patches.push(DomPatch::SetAttribute {
                    selector,
                    attr: "class".to_string(),
                    value: new_elem.classes.clone(),
                });
            }
            // Case 3: Same element, both text and classes changed
            else if old_elem.text_content != new_elem.text_content && old_elem.classes != new_elem.classes {
                let selector = self.build_element_selector(&base_selector, &old_elem);
                patches.push(DomPatch::ReplaceInnerHtml {
                    selector,
                    html: format!("<{} class=\"{}\">{}</{}>", 
                        new_elem.tag_name, 
                        new_elem.classes, 
                        new_elem.text_content, 
                        new_elem.tag_name),
                });
            }
        }

        if patches.is_empty() { None } else { Some(patches) }
    }

    /// Parse HTML to extract all meaningful elements
    fn parse_elements(&self, html: &str) -> Option<Vec<HtmlElement>> {
        let mut elements = Vec::new();
        
        // Regex to match any element with content: <tag attributes>content</tag>
        let element_regex = regex::Regex::new(r#"<(\w+)([^>]*)>([^<]*)</\1>"#).ok()?;
        
        for capture in element_regex.captures_iter(html) {
            let tag_name = capture.get(1)?.as_str().to_string();
            let attributes = capture.get(2)?.as_str();
            let text_content = capture.get(3)?.as_str().trim().to_string();
            
            // Extract class attribute
            let class_regex = regex::Regex::new(r#"class="([^"]*)""#).ok()?;
            let classes = class_regex.captures(attributes)
                .map(|m| m.get(1).unwrap().as_str().to_string())
                .unwrap_or_default();
            
            elements.push(HtmlElement {
                tag_name,
                classes,
                text_content,
            });
        }
        
        if elements.is_empty() { None } else { Some(elements) }
    }

    /// Extract component ID from HTML
    fn extract_component_id(&self, html: &str) -> Option<String> {
        let id_regex = regex::Regex::new(r#"data-livets-id="([^"]+)""#).ok()?;
        let capture = id_regex.captures(html)?;
        Some(capture.get(1)?.as_str().to_string())
    }

    /// Build a specific CSS selector for an element
    fn build_element_selector(&self, base_selector: &str, element: &HtmlElement) -> String {
        if !element.classes.is_empty() {
            // Use the most specific class for targeting
            let classes: Vec<&str> = element.classes.split_whitespace().collect();
            if let Some(first_class) = classes.first() {
                return format!("{} .{}", base_selector, first_class);
            }
        }
        // Fallback to tag name
        format!("{} {}", base_selector, element.tag_name)
    }
}

/// Represents a parsed HTML element
#[derive(Debug, Clone)]
struct HtmlElement {
    tag_name: String,
    classes: String,
    text_content: String,
}

impl Default for HtmlDiffer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_content_change() {
        let differ = HtmlDiffer::new();
        let old_html = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html = r#"<div class="text-green-600 font-bold text-4xl">6</div>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        assert_eq!(patches.len(), 1);
        
        if let DomPatch::UpdateText { selector: _, text } = &patches[0] {
            assert_eq!(text, "6");
        } else {
            panic!("Expected UpdateText patch");
        }
    }

    #[test]
    fn test_class_change() {
        let differ = HtmlDiffer::new();
        let old_html = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html = r#"<div class="text-red-600 font-bold text-4xl">5</div>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        assert_eq!(patches.len(), 1);
        
        if let DomPatch::SetAttribute { attr, value, .. } = &patches[0] {
            assert_eq!(attr, "class");
            assert_eq!(value, "text-red-600 font-bold text-4xl");
        } else {
            panic!("Expected SetAttribute patch");
        }
    }

    #[test]
    fn test_both_text_and_class_change() {
        let differ = HtmlDiffer::new();
        let old_html = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html = r#"<div class="text-red-600 font-bold text-4xl">-3</div>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        assert_eq!(patches.len(), 1);
        
        if let DomPatch::ReplaceInnerHtml { html, .. } = &patches[0] {
            assert!(html.contains("-3"));
            assert!(html.contains("text-red-600"));
        } else {
            panic!("Expected ReplaceInnerHtml patch");
        }
    }
}