/**
 * Utility functions for LiveTS
 */

import type { ComponentProps } from './types';

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
