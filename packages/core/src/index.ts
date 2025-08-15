/**
 * LiveTS Core - TypeScript API layer for the LiveTS framework
 *
 * This module provides the main exports for the LiveTS framework,
 * including the LiveView base class, server setup, and utilities.
 */

export { LiveView } from './live-view';
export { LiveTSServer } from './server';
export { ComponentRenderer } from './renderer';
export * from './types';
export * from './decorators';
export * from './utils';

// Export the Hono plugin with addLiveTS method
export { addLiveTS, component, createLiveTSApp } from './hono-plugin';
export type { LiveTSOptions, LiveTSState } from './hono-plugin';

// Make sure Hono module declarations are available
import './hono-plugin';
