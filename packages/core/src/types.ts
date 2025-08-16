/**
 * Type definitions for the LiveTS framework
 */

import type { Context, Hono } from 'hono';

// Forward declaration to avoid circular dependency
export interface LiveView {
  getComponentId(): string;
  _mount(): Promise<void>;
  _render(): string;
  handleEvent(eventName: string, payload: any): void | Promise<void>;
  _unmount(): Promise<void>;
}

export interface LiveViewState {
  [key: string]: any;
}

export interface EventPayload {
  [key: string]: any;
}

export interface ComponentProps {
  [key: string]: any;
}

export type ComponentId = string;
export type ConnectionId = string;
export type EventName = string;

export interface ClientEvent {
  eventType: string;
  eventName: string;
  componentId: string;
  payload: EventPayload;
  target?: EventTarget;
}

export interface EventTarget {
  tagName: string;
  attributes: Record<string, string>;
  value?: string;
}

export interface LiveViewOptions {
  id?: string;
  props?: ComponentProps;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  app: Hono;
}

export interface RenderOptions {
  layout?: string;
  title?: string;
  meta?: Record<string, string>;
  scripts?: string[];
  styles?: string[];
}

export interface ComponentRouteConfig<T = any> {
  ComponentClass: new (props?: ComponentProps) => T;
  renderOptions?: RenderOptions;
}

export type ComponentFactory<T extends LiveView = LiveView> = (context: Context) => T;

export interface PubSubMessage {
  channel: string;
  data: any;
  timestamp: number;
}

export interface DomPatch {
  type:
    | 'ReplaceText'
    | 'UpdateText'
    | 'SetAttribute'
    | 'RemoveAttribute'
    | 'ReplaceInnerHtml'
    | 'ReplaceElement';
  selector: string;
  content?: string; // For ReplaceText
  text?: string; // For UpdateText
  attr?: string; // For SetAttribute/RemoveAttribute
  value?: string; // For SetAttribute
  html?: string; // For ReplaceInnerHtml
  element?: string; // For ReplaceElement
}

// Compact patch types removed - now generated directly by Rust core

export type EventHandler = (event: string, payload: EventPayload) => void | Promise<void>;
export type PubSubHandler = (data: any) => void | Promise<void>;

export interface LiveViewMetadata {
  componentId: string;
  connectionId?: string;
  mounted: boolean;
  subscriptions: Set<string>;
}
