/**
 * Type definitions for the LiveTS framework
 */

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
  cors?: boolean;
  static?: {
    root: string;
    prefix?: string;
  };
}

export interface RenderOptions {
  layout?: string;
  title?: string;
  meta?: Record<string, string>;
  scripts?: string[];
  styles?: string[];
}

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

export type EventHandler = (event: string, payload: EventPayload) => void | Promise<void>;
export type PubSubHandler = (data: any) => void | Promise<void>;

export interface LiveViewMetadata {
  componentId: string;
  connectionId?: string;
  mounted: boolean;
  subscriptions: Set<string>;
}
