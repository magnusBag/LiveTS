/**
 * Utility functions for LiveTS
 */

import type { ComponentId } from './types';

/**
 * Escapes HTML to prevent XSS attacks
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates a CSS class string from an object
 */
export function classNames(classes: Record<string, boolean>): string {
  return Object.entries(classes)
    .filter(([_, condition]) => condition)
    .map(([className]) => className)
    .join(' ');
}

/**
 * Creates a reactive template function for rendering
 */
export function html(strings: TemplateStringsArray, ...values: any[]): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      const value = values[i];

      // Escape HTML by default unless it's marked as safe
      if (typeof value === 'string') {
        result += escapeHtml(value);
      } else if (value !== null && value !== undefined && typeof value.toString === 'function') {
        result += escapeHtml(value.toString());
      } else if (value === 0) {
        result += '0';
      } else {
        result += '';
      }
    }
  }

  return result;
}

/**
 * Marks HTML as safe (bypasses escaping)
 */
export function raw(html: string): SafeHtml {
  return new SafeHtml(html);
}

class SafeHtml {
  constructor(private html: string) {}

  toString(): string {
    return this.html;
  }
}

/**
 * Debounces a function call
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttles a function call
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Deep merges two objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * Validates that a string is a valid CSS selector
 */
export function isValidSelector(selector: string): boolean {
  if (typeof document === 'undefined') {
    // Server-side: basic validation
    return selector.length > 0 && !selector.includes('<');
  }

  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts data attributes from an element
 */
export function extractDataAttributes(attributes: Record<string, string>): Record<string, any> {
  const data: Record<string, any> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5); // Remove 'data-' prefix

      // Try to parse as JSON, fallback to string
      try {
        data[dataKey] = JSON.parse(value);
      } catch {
        data[dataKey] = value;
      }
    }
  }

  return data;
}

/**
 * Generates a unique ID
 */
export function generateId(prefix = 'livets'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Checks if code is running in the browser
 */
export function isBrowser(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).window !== 'undefined' &&
    typeof (globalThis as any).document !== 'undefined'
  );
}

/**
 * Checks if code is running on the server
 */
export function isServer(): boolean {
  return !isBrowser();
}

/**
 * Injects data-ts-selector attributes into reactive HTML elements
 * Identifies elements with ts-on: attributes and common reactive patterns
 */
export function injectReactiveSelectors(html: string, componentId: ComponentId): string {
  let selectorCounter = 0;

  // Add selectors to elements with ts-on: attributes (these are clearly reactive)
  let processedHtml = html.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)\s+([^>]*?ts-on:[^>]*?)>/g,
    (match, tagName, attributes) => {
      // Check if already has data-ts-selector
      if (attributes.includes('data-ts-sel=')) {
        return match;
      }

      const selector = `${componentId}-sel-${selectorCounter++}`;
      return `<${tagName} data-ts-sel="${selector}" ${attributes}>`;
    }
  );

  return processedHtml;
}

/**
 * Enhanced version that also marks elements likely to contain reactive content
 * This should be called with component instance context for better detection
 */
export function injectReactiveSelectorsSmart(
  html: string,
  componentId: ComponentId,
  stateKeys: string[] = []
): string {
  let selectorCounter = 0;

  // Create a short component hash (8 chars instead of 36 char UUID)
  const componentHash = createShortHash(componentId);

  // Process all elements that need selectors in one pass
  // This avoids the issue of elements with both ts-on and class attributes
  let processedHtml = html.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)>/g,
    (match, tagName, attributes) => {
      // Skip if already has data-ts-selector
      if (attributes.includes('data-ts-sel=')) {
        return match;
      }

      // Add selector if element has ts-on: attributes OR class attributes
      const hasInteraction = attributes.includes('ts-on:');
      const hasClass = attributes.includes('class=');

      if (hasInteraction || hasClass) {
        // Ultra-short selector: 8-char hash + base36 counter
        const selector = `${componentHash}.${selectorCounter.toString(36)}`;
        selectorCounter++; // Increment counter for next element
        return `<${tagName} data-ts-sel="${selector}"${attributes}>`;
      }

      return match;
    }
  );

  return processedHtml;
}

/**
 * Creates a short hash from a longer string (like UUID)
 * Uses base36 encoding for maximum compactness while staying readable
 */
function createShortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to base36 and take first 8 characters, ensure positive
  return Math.abs(hash).toString(36).substring(0, 8).padStart(8, '0');
}

/**
 * Calculates size savings from using compact format
 */
export function calculateSavings(
  verbose: any[],
  compact: string[]
): {
  verboseSize: number;
  compactSize: number;
  savings: number;
  percentage: number;
} {
  const verboseSize = JSON.stringify(verbose).length;
  const compactSize = compact.length;
  const savings = verboseSize - compactSize;
  const percentage = Math.round((savings / verboseSize) * 100);

  return { verboseSize, compactSize, savings, percentage };
}
