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

        // Process all elements generically
        for old_elem in &old_elements {
            // Find the best matching element in new_elements
            if let Some(new_elem) = self.find_matching_element(old_elem, &new_elements) {
                let text_changed = old_elem.text_content != new_elem.text_content;
                let classes_changed = old_elem.classes != new_elem.classes;
                
                if text_changed && classes_changed {
                    // Both changed: generate both patches
                    let selector = self.build_element_selector(&base_selector, &old_elem);
                    
                    // Update classes first
                    patches.push(DomPatch::SetAttribute {
                        selector: selector.clone(),
                        attr: "class".to_string(),
                        value: new_elem.classes.clone(),
                    });
                    
                    // Then update text
                    patches.push(DomPatch::UpdateText {
                        selector,
                        text: new_elem.text_content.clone(),
                    });
                }
                else if classes_changed {
                    // Only class changed
                    let selector = self.build_element_selector(&base_selector, &old_elem);
                    patches.push(DomPatch::SetAttribute {
                        selector,
                        attr: "class".to_string(),
                        value: new_elem.classes.clone(),
                    });
                }
                else if text_changed {
                    // Only text changed
                    let selector = self.build_element_selector(&base_selector, &old_elem);
                    patches.push(DomPatch::UpdateText {
                        selector,
                        text: new_elem.text_content.clone(),
                    });
                }
            }
        }

        if patches.is_empty() { None } else { Some(patches) }
    }

    /// Find the best matching element based on tag name and context
    fn find_matching_element<'a>(&self, target: &HtmlElement, candidates: &'a [HtmlElement]) -> Option<&'a HtmlElement> {
        let mut best_match = None;
        let mut best_score = 0;
        
        for candidate in candidates {
            if candidate.tag_name == target.tag_name {
                let mut score = 1; // Base score for same tag
                
                // Boost score for similar class patterns (e.g., both have "text-4xl")
                let target_classes: Vec<&str> = target.classes.split_whitespace().collect();
                let candidate_classes: Vec<&str> = candidate.classes.split_whitespace().collect();
                
                for target_class in &target_classes {
                    if candidate_classes.contains(target_class) {
                        score += 1;
                    }
                }
                
                // Boost for common class patterns (any shared significant class)
                for target_class in &target_classes {
                    if target_class.len() > 3 && candidate_classes.contains(target_class) {
                        score += 2;
                    }
                }
                
                // Boost for similar text content patterns
                if !target.text_content.is_empty() && !candidate.text_content.is_empty() {
                    // Both have numeric content
                    if target.text_content.parse::<i32>().is_ok() && candidate.text_content.parse::<i32>().is_ok() {
                        score += 3;
                    }
                    // Both have similar length text
                    else if target.text_content.len() == candidate.text_content.len() {
                        score += 1;
                    }
                }
                
                if score > best_score {
                    best_score = score;
                    best_match = Some(candidate);
                }
            }
        }
        
        best_match
    }

    /// Parse HTML to extract all meaningful elements
    fn parse_elements(&self, html: &str) -> Option<Vec<HtmlElement>> {
        let mut elements = Vec::new();
        

        
        // Regex to match any element with content: <tag attributes>content</tag>
        // Note: We can't use backreferences, so we'll use a simpler approach
        let element_regex = regex::Regex::new(r#"<(\w+)([^>]*)>([^<]*)</(\w+)>"#).unwrap();
        

        
        for capture in element_regex.captures_iter(html) {
            let open_tag = capture.get(1)?.as_str().to_string();
            let attributes = capture.get(2)?.as_str();
            let text_content = capture.get(3)?.as_str().trim().to_string();
            let close_tag = capture.get(4)?.as_str();
            
            // Only process if opening and closing tags match
            if open_tag == close_tag {
                // Extract class attribute
                let class_regex = regex::Regex::new(r#"class="([^"]*)""#).unwrap();
                let classes = class_regex.captures(attributes)
                    .map(|m| m.get(1).unwrap().as_str().to_string())
                    .unwrap_or_default();
                
                elements.push(HtmlElement {
                    tag_name: open_tag,
                    classes,
                    text_content,
                });
            }
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
            panic!("Expected SetAttribute patch, got {:?}", patches[0]);
        }
    }

    #[test]
    fn test_both_text_and_class_change() {
        let differ = HtmlDiffer::new();
        let old_html = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html = r#"<div class="text-red-600 font-bold text-4xl">-3</div>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        
        // Should generate 2 patches: one for class change, one for text change
        assert_eq!(patches.len(), 2);
        
        // First patch should be class change
        if let DomPatch::SetAttribute { attr, value, .. } = &patches[0] {
            assert_eq!(attr, "class");
            assert_eq!(value, "text-red-600 font-bold text-4xl");
        } else {
            panic!("Expected SetAttribute patch for classes, got {:?}", patches[0]);
        }
        
        // Second patch should be text change
        if let DomPatch::UpdateText { text, .. } = &patches[1] {
            assert_eq!(text, "-3");
        } else {
            panic!("Expected UpdateText patch for text, got {:?}", patches[1]);
        }
    }

    #[test]
    fn test_generic_elements_without_text_4xl() {
        let differ = HtmlDiffer::new();
        
        // Test with completely different classes (no text-4xl)
        let old_html = r#"<span class="status error-state">Failed</span>"#;
        let new_html = r#"<span class="status success-state">Success</span>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        
        // Should generate 2 patches for both text and class changes
        assert_eq!(patches.len(), 2);
        
        // First should be class change
        if let DomPatch::SetAttribute { attr, value, .. } = &patches[0] {
            assert_eq!(attr, "class");
            assert_eq!(value, "status success-state");
        } else {
            panic!("Expected SetAttribute patch, got {:?}", patches[0]);
        }
        
        // Second should be text change
        if let DomPatch::UpdateText { text, .. } = &patches[1] {
            assert_eq!(text, "Success");
        } else {
            panic!("Expected UpdateText patch, got {:?}", patches[1]);
        }
    }

    #[test]
    fn test_button_class_change() {
        let differ = HtmlDiffer::new();
        
        // Test with button elements
        let old_html = r#"<button class="btn btn-primary disabled">Submit</button>"#;
        let new_html = r#"<button class="btn btn-primary enabled">Submit</button>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        
        // Should generate 1 patch for class change only (text unchanged)
        assert_eq!(patches.len(), 1);
        
        if let DomPatch::SetAttribute { attr, value, .. } = &patches[0] {
            assert_eq!(attr, "class");
            assert_eq!(value, "btn btn-primary enabled");
        } else {
            panic!("Expected SetAttribute patch, got {:?}", patches[0]);
        }
    }
}