/**
 * LiveTS Hono Plugin - Extends Hono with LiveView component support
 */

import { Hono } from 'hono';
import type { Context, Next, Handler } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync } from 'fs';
import { LiveView } from './live-view';
import type { ComponentProps, RenderOptions } from './types';

// Import the Rust core engine types
import type { LiveTsEngine, LiveTsWebSocketBroker } from '@magnusbag/livets-rust-core';

// Import the Rust core engine
let LiveTSEngine: typeof LiveTsEngine | null;
let LiveTSWebSocketBroker: typeof LiveTsWebSocketBroker | null;
try {
  const rustCore = require('@magnusbag/livets-rust-core');
  LiveTSEngine = rustCore.LiveTsEngine;
  LiveTSWebSocketBroker = rustCore.LiveTsWebSocketBroker;
} catch (error) {
  console.warn('Rust core not available, using fallback JavaScript implementation');
  LiveTSEngine = null;
  LiveTSWebSocketBroker = null;
}

export interface LiveTSOptions {
  port?: number;
  host?: string;
  cors?: boolean;
  static?: {
    root: string;
    prefix?: string;
  };
  renderOptions?: RenderOptions;
}

export interface LiveTSState {
  activeComponents: Map<string, LiveView>;
  componentHtmlCache: Map<string, string>;
  rustEngine?: LiveTsEngine;
  rustBroker?: LiveTsWebSocketBroker;
  brokerConnComponents: Map<string, Set<string>>;
  options: Required<LiveTSOptions>;
}

// Component handler type
export type ComponentReturn<T extends LiveView = LiveView> =
  | (new (props?: ComponentProps) => T)
  | { component: new (props?: ComponentProps) => T; options?: RenderOptions };

declare module 'hono' {
  interface Hono {
    addLiveTS(options?: LiveTSOptions): this;
    start(port?: number): Promise<void>;
    livets?: LiveTSState;
    liveComponent<T extends LiveView>(
      path: string,
      ...handlers: Array<Handler | ((c: Context) => ComponentReturn<T>)>
    ): this;
  }
}/**
 * Creates a LiveTS-enabled Hono app
 */
export function createLiveTSApp(options: LiveTSOptions = {}): Hono {
  const app = new Hono();
  app.addLiveTS(options);
  return app;
}

/**
 * Helper to create a component handler
 */
export function component<T extends LiveView>(
  ComponentClass: new (props?: ComponentProps) => T,
  options?: RenderOptions
) {
  return (c: Context) => ({ component: ComponentClass, options });
}

/**
 * Extends Hono with LiveTS capabilities
 */
export function addLiveTS(this: Hono, options: LiveTSOptions = {}): Hono {
  const livetsOptions: Required<LiveTSOptions> = {
    port: options.port ?? 3000,
    host: options.host ?? 'localhost',
    cors: options.cors ?? true,
    static: options.static ?? { root: './public', prefix: '/' },
    renderOptions: options.renderOptions ?? {}
  };

  // Initialize Rust engine/broker if available
  let rustEngine: LiveTsEngine | undefined;
  let rustBroker: LiveTsWebSocketBroker | undefined;

  if (LiveTSEngine) {
    rustEngine = new LiveTSEngine();
  } else {
    console.log('📝 Using JavaScript fallback for DOM manipulation');
  }

  if (LiveTSWebSocketBroker) {
    try {
      rustBroker = new LiveTSWebSocketBroker();
      rustBroker.setEventHandler((...args: any[]) => {
        const evtJson = args[1];
        handleBrokerEvent.call(this, evtJson);
      });
    } catch (error) {
      console.error('Failed to initialize Rust broker:', error);
      rustBroker = undefined;
    }
  }

  // Store LiveTS state on the Hono instance
  this.livets = {
    activeComponents: new Map<string, LiveView>(),
    componentHtmlCache: new Map<string, string>(),
    rustEngine,
    rustBroker,
    brokerConnComponents: new Map<string, Set<string>>(),
    options: livetsOptions
  };

  // Setup middleware for LiveTS
  this.use('*', livetsMiddleware);

  // Add LiveTS routes
  this.get('/livets/connector.js', livetsConnectorRoute);
  this.get('/health', livetsHealthRoute);

  // Add component route helper
  this.liveComponent = function <T extends LiveView>(
    path: string,
    ...handlers: Array<Handler | ((c: Context) => ComponentReturn<T>)>
  ): Hono {
    const wrappedHandlers = handlers.map(handler => {
      return async (c: Context, next: Next) => {
        const result = await handler(c, next);

        // Check if result is a component class or component config
        if (
          typeof result === 'function' &&
          result.prototype &&
          result.prototype instanceof LiveView
        ) {
          return await renderComponent(c, result);
        } else if (result && typeof result === 'object' && result.component) {
          return await renderComponent(c, result.component, result.options);
        }

        return result;
      };
    });

    this.get(path, ...wrappedHandlers);
    return this;
  };

  // Add start method
  this.start = async function (port?: number) {
    const finalPort = port ?? livetsOptions.port;

    return new Promise((resolve, reject) => {
      try {
        const server = serve({
          fetch: this.fetch,
          port: finalPort,
          hostname: livetsOptions.host
        });

        // Setup WebSocket server if Rust broker is available
        if (rustBroker) {
          const wsPort = finalPort + 1;
          rustBroker.listen(livetsOptions.host, wsPort);
          console.log(
            `🦀 Rust WebSocket broker listening on ws://${livetsOptions.host}:${wsPort}/livets-ws`
          );
        }

        console.log(`🚀 LiveTS server running on http://${livetsOptions.host}:${finalPort}`);
        resolve(undefined);
      } catch (error) {
        reject(error);
      }
    });
  };

  // Broker event handlers
  async function handleBrokerEvent(this: Hono, evtJson: string): Promise<void> {
    if (!rustBroker || !evtJson || evtJson.trim() === '' || evtJson === 'null') {
      return;
    }

    try {
      const evt = JSON.parse(evtJson);
      if (!evt || typeof evt !== 'object' || !evt.type) return;

      const livets = this.livets;
      if (!livets) return;

      switch (evt.type) {
        case 'Message': {
          const { connection_id, data } = evt;
          const message = JSON.parse(data);
          if (message.type === 'event') {
            await handleClientEventFromBroker(connection_id, message, livets, rustBroker);
          }
          break;
        }
        case 'Closed': {
          const connection_id = evt.connection_id as string;
          const set = livets.brokerConnComponents.get(connection_id);
          if (set && rustBroker) {
            for (const componentId of set) {
              try {
                rustBroker.unregisterComponent(componentId, connection_id);
              } catch {}
            }
          }
          livets.brokerConnComponents.delete(connection_id);
          break;
        }
      }
    } catch (e) {
      console.error('Error in broker event handler:', e);
    }
  }

  return this;
}

// LiveTS middleware
async function livetsMiddleware(c: Context, next: Next): Promise<void | Response> {
  // Get LiveTS state
  const app = c.env.app || (c as any).app;
  const livets = app?.livets;

  // Add CORS if enabled
  if (livets?.options.cors) {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (c.req.method === 'OPTIONS') {
      return c.text('', 204 as any);
    }
  }

  return await next();
}

// Component rendering helper
async function renderComponent<T extends LiveView>(
  c: Context,
  ComponentClass: new (props?: ComponentProps) => T,
  renderOptions?: RenderOptions
): Promise<Response> {
  try {
    const props = extractPropsFromContext(c);
    const component = new ComponentClass(props);

    // Get LiveTS state from context
    const app = c.env.app || (c as any).app;
    const livets = app?.livets;

    if (!livets) {
      throw new Error('LiveTS not initialized. Call app.addLiveTS() first.');
    }

    // Mount the component
    await component._mount();

    // Store active component
    livets.activeComponents.set(component.getComponentId(), component);

    // Render the component
    const html = component._render();

    // Cache the initial HTML for diffing
    livets.componentHtmlCache.set(component.getComponentId(), html);

    const finalOptions = { ...livets.options.renderOptions, ...renderOptions };
    const fullHtml = wrapInLayout(html, finalOptions, livets.options);

    return c.html(fullHtml);
  } catch (error) {
    console.error(`Error rendering component for ${c.req.path}:`, error);
    return c.text('Internal Server Error', 500 as any);
  }
}

// Routes
function livetsConnectorRoute(c: Context) {
  const connectorScript = generateConnectorScript();
  c.header('Content-Type', 'application/javascript');
  return c.text(connectorScript);
}

function livetsHealthRoute(c: Context) {
  const app = c.env.app || (c as any).app;
  const livets = app?.livets;

  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats: {
      activeComponents: livets?.activeComponents.size || 0,
      wsConnections: 0 // TODO: Add connection count
    }
  });
}

// Helper functions (same as before)
function extractPropsFromContext(c: Context): ComponentProps {
  try {
    const query = c.req.query() || {};
    return { ...query };
  } catch {
    return {};
  }
}

function wrapInLayout(
  html: string,
  options: RenderOptions,
  serverOptions: Required<LiveTSOptions>
): string {
  const title = options.title ?? 'LiveTS App';
  const meta = options.meta ?? {};
  const scripts = options.scripts ?? [];
  const styles = options.styles ?? [];

  const metaTags = Object.entries(meta)
    .map(([key, value]) => `<meta name="${key}" content="${value}">`)
    .join('\n    ');

  const styleTags = styles.map(href => `<link rel="stylesheet" href="${href}">`).join('\n    ');
  const scriptTags = scripts.map(src => `<script src="${src}"></script>`).join('\n    ');

  const wsOverrideScript = serverOptions.port
    ? `<script>window.LIVETS_WS_URL = "ws://${serverOptions.host}:${serverOptions.port + 1}";</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${metaTags}
    ${styleTags}
</head>
<body>
    <div data-livets-root>
        ${html}
    </div>

    ${wsOverrideScript}
    <script src="/livets/connector.js"></script>
    ${scriptTags}
</body>
</html>`;
}

function generateConnectorScript(): string {
  try {
    const clientPath = require.resolve('@magnusbag/livets-client/dist/connector.js');
    return readFileSync(clientPath, 'utf-8');
  } catch (error) {
    console.warn('Could not load built client connector, falling back to inline version');
    return getFallbackConnectorScript();
  }
}

function getFallbackConnectorScript(): string {
  return `
console.log('Using fallback connector');

class FallbackConnector {
  constructor() {
    this.ws = new WebSocket(this.getWsUrl());
    this.setupEventListeners();
  }

  getWsUrl() {
    if (window.LIVETS_WS_URL) return window.LIVETS_WS_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return protocol + '//' + host + '/livets-ws';
  }

  setupEventListeners() {
    this.ws.onopen = () => console.log('LiveTS WebSocket connected');
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'patches') this.applyPatches(message.patches);
    };

    document.addEventListener('click', this.handleDomEvent.bind(this));
    document.addEventListener('input', this.handleDomEvent.bind(this));
    document.addEventListener('submit', this.handleDomEvent.bind(this));
    document.addEventListener('change', this.handleDomEvent.bind(this));
  }

  handleDomEvent(event) {
    const element = event.target.closest('[ts-on\\\\:' + event.type + ']');
    if (!element) return;

    const handler = element.getAttribute('ts-on:' + event.type);
    const componentElement = element.closest('[data-livets-id]');

    if (!handler || !componentElement) return;

    event.preventDefault();

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'event',
        componentId: componentElement.dataset.livetsId,
        eventName: handler,
        payload: {
          type: event.type,
          target: {
            tagName: element.tagName.toLowerCase(),
            value: element.value,
            checked: element.checked
          }
        }
      }));
    }
  }

  applyPatches(patches) {
    patches.forEach(patch => {
      try {
        switch (patch.type) {
          case 'ReplaceText':
          case 'UpdateText':
            const textEl = document.querySelector(patch.selector);
            if (textEl) textEl.textContent = patch.content || patch.text;
            break;
          case 'SetAttribute':
            const attrEl = document.querySelector(patch.selector);
            if (attrEl) attrEl.setAttribute(patch.attr, patch.value);
            break;
          case 'RemoveAttribute':
            const removeAttrEl = document.querySelector(patch.selector);
            if (removeAttrEl) removeAttrEl.removeAttribute(patch.attr);
            break;
          case 'ReplaceInnerHtml':
            const replaceEl = document.querySelector(patch.selector);
            if (replaceEl) replaceEl.innerHTML = patch.html;
            break;
        }
      } catch (error) {
        console.error('Error applying patch:', patch, error);
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new FallbackConnector());
} else {
  new FallbackConnector();
}
`;
}

// Broker event handling (same as before)
async function handleClientEventFromBroker(
  connection_id: string,
  message: any,
  livets: LiveTSState,
  rustBroker: LiveTsWebSocketBroker
): Promise<void> {
  const { componentId, eventName, payload } = message;

  let set = livets.brokerConnComponents.get(connection_id);
  if (!set) {
    set = new Set();
    livets.brokerConnComponents.set(connection_id, set);
  }
  if (!set.has(componentId)) {
    try {
      rustBroker.registerComponent(componentId, connection_id);
    } catch {}
    set.add(componentId);
  }

  const patches = await processEventAndDiff(componentId, eventName, payload, livets);
  if (!patches) return;

  const msg = JSON.stringify({ type: 'patches', componentId, patches });
  try {
    rustBroker.sendToConnection(connection_id, msg);
  } catch (e) {
    console.error('Failed sending patches via broker:', e);
  }
}

async function processEventAndDiff(
  componentId: string,
  eventName: string,
  payload: any,
  livets: LiveTSState
): Promise<any[] | null> {
  const component = livets.activeComponents.get(componentId);
  if (!component) {
    console.warn(`Component not found for id: ${componentId}`);
    return null;
  }

  const oldHtml = livets.componentHtmlCache.get(componentId) ?? component._render();

  try {
    await Promise.resolve(component.handleEvent(eventName, payload));
  } catch (e) {
    console.error(`Error handling event '${eventName}' for component ${componentId}:`, e);
    return null;
  }

  let newHtml: string;
  try {
    newHtml = component._render();
  } catch (e) {
    console.error(`Error rendering component after event for ${componentId}:`, e);
    return null;
  }

  livets.componentHtmlCache.set(componentId, newHtml);

  try {
    if (livets.rustEngine && typeof livets.rustEngine.renderComponent === 'function') {
      const result = livets.rustEngine.renderComponent(componentId, oldHtml, newHtml);

      if (typeof result === 'string') {
        try {
          return JSON.parse(result);
        } catch (parseError) {
          console.warn('Failed to parse Rust engine result as JSON:', parseError);
        }
      }

      if (Array.isArray(result)) return result;
    }
  } catch (e) {
    console.warn('Rust engine diff failed, falling back to full replace:', e);
  }

  return [
    {
      type: 'ReplaceInnerHtml',
      selector: `[data-livets-id="${componentId}"]`,
      html: newHtml
    }
  ];
}

// Extend Hono prototype
Hono.prototype.addLiveTS = addLiveTS;
