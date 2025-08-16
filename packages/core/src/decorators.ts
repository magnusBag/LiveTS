/**
 * Decorators for LiveTS components
 */

/**
 * Decorator for marking methods as event handlers
 */
export function Event(eventName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // Store event handler metadata
    if (!target._eventHandlers) {
      target._eventHandlers = new Map();
    }
    target._eventHandlers.set(eventName, descriptor.value);
  };
}

/**
 * Decorator for marking methods as lifecycle hooks
 */
export function Lifecycle(hook: 'mount' | 'updated' | 'unmount') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // Validate that the method name matches the hook
    if (propertyKey !== hook) {
      throw new Error(`Lifecycle decorator '${hook}' can only be used on method '${hook}'`);
    }
  };
}

/**
 * Decorator for component state properties
 */
export function State() {
  return function (target: any, propertyKey: string) {
    // Store state property metadata
    if (!target._stateProperties) {
      target._stateProperties = new Set();
    }
    target._stateProperties.add(propertyKey);
  };
}

/**
 * Decorator for computed properties
 */
export function Computed() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // Mark as computed property
    if (!target._computedProperties) {
      target._computedProperties = new Set();
    }
    target._computedProperties.add(propertyKey);
  };
}
