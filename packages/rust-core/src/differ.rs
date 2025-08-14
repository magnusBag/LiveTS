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
                
                // Extract id attribute
                let id_regex = regex::Regex::new(r#"id="([^"]*)""#).unwrap();
                let id = id_regex.captures(attributes)
                    .map(|m| m.get(1).unwrap().as_str().to_string())
                    .unwrap_or_default();
                
                elements.push(HtmlElement {
                    tag_name: open_tag,
                    classes,
                    text_content,
                    id,
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
        // Strategy 1: Use ID if available (most stable and specific)
        if !element.id.is_empty() {
            return format!("#{}", element.id);
        }
        
        // Strategy 2: Use distinguishing classes for elements without IDs
        if !element.classes.is_empty() {
            let classes: Vec<&str> = element.classes.split_whitespace().collect();
            
            // Look for a unique distinguishing class (like bg-red-500, bg-blue-500)
            for class in &classes {
                if class.starts_with("bg-") || class.starts_with("text-") || class.contains("primary") || class.contains("secondary") {
                    return format!("{} .{}", base_selector, class);
                }
            }
            
            // Use multiple classes to create a more specific selector
            if classes.len() >= 2 {
                return format!("{} .{}.{}", base_selector, classes[0], classes[1]);
            }
            
            // Single class fallback
            if let Some(first_class) = classes.first() {
                return format!("{} .{}", base_selector, first_class);
            }
        }
        
        // Strategy 3: Use text content as additional specificity for short text
        if !element.text_content.is_empty() && element.text_content.len() <= 10 {
            return format!("{}:contains('{}')", 
                format!("{} {}", base_selector, element.tag_name),
                element.text_content.replace("'", "\\'")
            );
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
    id: String,
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

    #[test]
    fn test_multiple_buttons_with_similar_classes() {
        let differ = HtmlDiffer::new();
        
        // Test with multiple buttons that share CSS classes (like counter buttons)
        let old_html = r#"
            <button class="px-4 py-2 bg-red-500 text-white">-1</button>
            <button class="px-4 py-2 bg-blue-500 text-white">+1</button>
        "#;
        let new_html = r#"
            <button class="px-4 py-2 bg-red-500 text-white">-4</button>
            <button class="px-4 py-2 bg-blue-500 text-white">+4</button>
        "#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        
        // Should generate 2 patches: one for each button's text change
        assert_eq!(patches.len(), 2);
        
        // Find the patches for each button
        let mut decrement_patch = None;
        let mut increment_patch = None;
        
        for patch in &patches {
            if let DomPatch::UpdateText { text, selector } = patch {
                if text == "-4" {
                    decrement_patch = Some((selector, text));
                } else if text == "+4" {
                    increment_patch = Some((selector, text));
                }
            }
        }
        
        assert!(decrement_patch.is_some(), "Should find decrement button patch");
        assert!(increment_patch.is_some(), "Should find increment button patch");
        
        // Selectors should be different to target different buttons
        let (dec_selector, _) = decrement_patch.unwrap();
        let (inc_selector, _) = increment_patch.unwrap();
        assert_ne!(dec_selector, inc_selector, "Selectors should be different for different buttons");
    }

    #[test]
    fn test_counter_with_number_change_and_class_change() {
        let differ = HtmlDiffer::new();
        
        // Test simulating the counter scenario: number changes, class changes, buttons change
        let old_html = r#"
            <div class="text-center mb-6">
                <div class="text-green-600 font-bold text-4xl">5</div>
                <p class="text-gray-600 mt-2">Current count</p>
            </div>
            <div class="flex gap-3 justify-center mb-6">
                <button class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">-1</button>
                <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">+1</button>
            </div>
        "#;
        
        let new_html = r#"
            <div class="text-center mb-6">
                <div class="text-red-600 font-bold text-4xl">-42</div>
                <p class="text-gray-600 mt-2">Current count</p>
            </div>
            <div class="flex gap-3 justify-center mb-6">
                <button class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">-1</button>
                <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">+1</button>
            </div>
        "#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        
        // Should generate patches for both the counter display (class + text) changes
        // Buttons should remain unchanged in this scenario
        assert!(patches.len() >= 2, "Should generate at least 2 patches for counter display changes");
        
        // Check that we have class and text patches for the counter display
        let mut has_class_patch = false;
        let mut has_text_patch = false;
        
        for patch in &patches {
            match patch {
                DomPatch::SetAttribute { attr, value, .. } if attr == "class" => {
                    if value.contains("text-red-600") {
                        has_class_patch = true;
                    }
                }
                DomPatch::UpdateText { text, .. } => {
                    if text == "-42" {
                        has_text_patch = true;
                    }
                }
                _ => {}
            }
        }
        
        assert!(has_class_patch, "Should have class change patch for color change");
        assert!(has_text_patch, "Should have text change patch for number change");
    }

    #[test]
    fn test_random_button_edge_cases() {
        let differ = HtmlDiffer::new();
        
        // Case 1: Same count, different sign (should generate class change only)
        let old_html = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html = r#"<div class="text-red-600 font-bold text-4xl">-5</div>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        assert_eq!(patches.len(), 2, "Should generate both class and text patches for 5 -> -5");
        
        // Case 2: Same absolute value, no sign change (should generate text change only)
        let old_html2 = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html2 = r#"<div class="text-green-600 font-bold text-4xl">7</div>"#;
        
        let patches2 = differ.diff(old_html2, new_html2).unwrap();
        assert_eq!(patches2.len(), 1, "Should generate only text patch for 5 -> 7 (same sign)");
        
        // Case 3: Exact same value (should generate no patches)
        let old_html3 = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html3 = r#"<div class="text-green-600 font-bold text-4xl">5</div>"#;
        
        let patches3 = differ.diff(old_html3, new_html3).unwrap();
        assert_eq!(patches3.len(), 0, "Should generate no patches for identical content");
    }

    #[test]
    fn test_id_based_selectors() {
        let differ = HtmlDiffer::new();
        
        // Test with elements that have IDs - should use stable ID selectors
        let old_html = r#"<div id="counter-display" class="text-green-600 font-bold text-4xl">5</div>"#;
        let new_html = r#"<div id="counter-display" class="text-red-600 font-bold text-4xl">-42</div>"#;
        
        let patches = differ.diff(old_html, new_html).unwrap();
        
        // Should generate 2 patches: class change and text change
        assert_eq!(patches.len(), 2);
        
        // Both patches should use the stable ID selector
        for patch in &patches {
            match patch {
                DomPatch::SetAttribute { selector, .. } => {
                    assert_eq!(selector, "#counter-display", "Should use ID selector for class change");
                }
                DomPatch::UpdateText { selector, .. } => {
                    assert_eq!(selector, "#counter-display", "Should use ID selector for text change");
                }
                _ => panic!("Unexpected patch type"),
            }
        }
    }
}