/**
 * LiveTS Server - HTTP and WebSocket server for LiveTS applications
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { LiveView } from './live-view';
import type { ServerOptions, ComponentProps, RenderOptions } from './types';

// Import the Rust core engine
let LiveTSEngine: any;
let LiveTSWebSocketBroker: any;
try {
  const rustCore = require('@magnusbag/livets-rust-core');
  LiveTSEngine = rustCore.LiveTsEngine; // Note: lowercase 's' in generated binding
  LiveTSWebSocketBroker = rustCore.LiveTsWebSocketBroker;
} catch (error) {
  console.warn('Rust core not available, using fallback JavaScript implementation');
  LiveTSEngine = null;
  LiveTSWebSocketBroker = null;
}

export class LiveTSServer {
  private app: Hono;
  private server?: any;
  private wss?: WebSocket.Server;
  private components: Map<string, new (props?: ComponentProps) => LiveView> = new Map();
  private activeComponents: Map<string, LiveView> = new Map();
  private componentHtmlCache: Map<string, string> = new Map(); // Cache for HTML diffing
  private options: Required<ServerOptions>;
  private rustEngine?: any;
  // Rust WS broker and mapping of connection->components
  private rustBroker?: any;
  private brokerConnComponents: Map<string, Set<string>> = new Map();

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port ?? 3000,
      host: options.host ?? 'localhost',
      cors: options.cors ?? true,
      static: options.static ?? { root: './public', prefix: '/' }
    };

    // Initialize Rust engine/broker if available
    if (LiveTSEngine) {
      this.rustEngine = new LiveTSEngine();
      console.log('🦀 Rust core engine initialized');
    } else {
      console.log('📝 Using JavaScript fallback for DOM manipulation');
    }

    // Temporarily disable Rust broker due to NAPI threadsafe function bug
    // and fall back to Node.js WebSocket server
    console.log('⚠️  Temporarily using Node.js WebSocket server instead of Rust broker');
    this.rustBroker = undefined;

    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Registers a LiveView component with a route
   */
  registerComponent<T extends LiveView>(
    path: string,
    ComponentClass: new (props?: ComponentProps) => T,
    options?: RenderOptions
  ): void {
    this.components.set(path, ComponentClass);

    this.app.get(path, async c => {
      try {
        const props = this.extractPropsFromContext(c);
        const component = new ComponentClass(props);

        // Mount the component
        await component._mount();

        // Store active component
        this.activeComponents.set(component.getComponentId(), component);

        // Render the component
        const html = component._render();

        // Cache the initial HTML for diffing
        this.componentHtmlCache.set(component.getComponentId(), html);

        const fullHtml = this.wrapInLayout(html, options);

        return c.html(fullHtml);
      } catch (error) {
        console.error(`Error rendering component for ${path}:`, error);
        return c.text('Internal Server Error', 500 as any);
      }
    });
  }

  /**
   * Starts the server
   */
  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = serve({
          fetch: this.app.fetch,
          port: this.options.port,
          hostname: this.options.host
        });

        this.server = server;
        this.setupWebSocketServer(server);

        console.log(`LiveTS server listening on http://${this.options.host}:${this.options.port}`);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stops the server
   */
  async close(): Promise<void> {
    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      this.server.close();
    }

    if (this.rustBroker) {
      try {
        this.rustBroker.stop();
      } catch {}
    }

    // Clean up active components
    for (const component of this.activeComponents.values()) {
      await component._unmount();
    }
    this.activeComponents.clear();
    this.componentHtmlCache.clear();
  }

  /**
   * Gets server statistics
   */
  getStats() {
    return {
      activeComponents: this.activeComponents.size,
      registeredRoutes: this.components.size,
      wsConnections: this.wss?.clients.size ?? 0
    };
  }

  // ===== Private Methods =====

  private setupMiddleware(): void {
    // CORS middleware
    if (this.options.cors) {
      this.app.use('*', async (c, next) => {
        c.header('Access-Control-Allow-Origin', '*');
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (c.req.method === 'OPTIONS') {
          return c.text('', 204 as any);
        }

        await next();
        return;
      });
    }

    // Static file serving - simplified for now
    if (this.options.static) {
      // TODO: Implement static file serving
      console.log('Static files configured for:', this.options.static.root);
    }
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', c => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: this.getStats()
      });
    });

    // LiveTS connector script - serve the built client
    this.app.get('/livets/connector.js', c => {
      const connectorScript = this.generateConnectorScript();
      c.header('Content-Type', 'application/javascript');
      return c.text(connectorScript);
    });
  }

  private setupWebSocketServer(server: any): void {
    // If Rust broker is available, do not start Node ws server
    if (this.rustBroker) {
      console.log('Using Rust WS broker; skipping Node ws server.');
      return;
    }

    this.wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request: any, socket: any, head: any) => {
      if (request.url === '/livets-ws') {
        this.wss!.handleUpgrade(request, socket, head, ws => {
          this.wss!.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId();

      console.log(`WebSocket connection established: ${connectionId}`);

      ws.on('message', async data => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(connectionId, message, ws);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket connection closed: ${connectionId}`);
      });

      ws.on('error', error => {
        console.error(`WebSocket error for ${connectionId}:`, error);
      });
    });

    console.log(`WebSocket server is running on the same port as the HTTP server.`);
  }

  private async handleBrokerEvent(evtJson: string): Promise<void> {
    try {
      console.log('📨 Received broker event:', evtJson);

      // Handle empty or null JSON strings
      if (!evtJson || evtJson.trim() === '' || evtJson === 'null') {
        console.warn('⚠️  Received empty or null event JSON:', evtJson);
        return;
      }

      const evt = JSON.parse(evtJson);

      // Additional null check after parsing
      if (!evt || typeof evt !== 'object') {
        console.warn('⚠️  Parsed event is null or not an object:', evt);
        return;
      }

      if (!evt.type) {
        console.warn('⚠️  Event missing type property:', evt);
        return;
      }

      console.log('✅ Processing broker event type:', evt.type);
      switch (evt.type) {
        case 'Connected':
          // Optionally handle new connections
          break;
        case 'Message': {
          const { connectionId, data } = evt;
          const message = JSON.parse(data);
          await this.handleBrokerMessage(connectionId, message);
          break;
        }
        case 'Closed': {
          // Cleanup component registrations for this connection
          const connectionId = evt.connectionId as string;
          const set = this.brokerConnComponents.get(connectionId);
          if (set && this.rustBroker) {
            for (const componentId of set) {
              try {
                this.rustBroker.unregisterComponent(componentId, connectionId);
              } catch {}
            }
          }
          this.brokerConnComponents.delete(connectionId);
          break;
        }
      }
    } catch (e) {
      console.error('Error in broker event handler:', e);
    }
  }

  private async handleBrokerMessage(connectionId: string, message: any): Promise<void> {
    switch (message.type) {
      case 'event':
        await this.handleClientEventFromBroker(connectionId, message);
        break;
      case 'ping':
        // The broker responds to ping internally; no-op here
        break;
      default:
        console.warn(`Unknown broker message type: ${message.type}`);
    }
  }

  private async handleClientEventFromBroker(connectionId: string, message: any): Promise<void> {
    const { componentId, eventName, payload } = message;

    // track registration to avoid duplicates
    let set = this.brokerConnComponents.get(connectionId);
    if (!set) {
      set = new Set();
      this.brokerConnComponents.set(connectionId, set);
    }
    if (!set.has(componentId)) {
      try {
        this.rustBroker.registerComponent(componentId, connectionId);
      } catch {}
      set.add(componentId);
    }

    const patches = await this.processEventAndDiff(componentId, eventName, payload);

    if (!patches) return;

    const msg = JSON.stringify({ type: 'patches', componentId, patches });
    try {
      this.rustBroker.sendToConnection(connectionId, msg);
    } catch (e) {
      console.error('Failed sending patches via broker:', e);
    }
  }

  private async handleWebSocketMessage(
    connectionId: string,
    message: any,
    ws: WebSocket
  ): Promise<void> {
    switch (message.type) {
      case 'event': {
        const patches = await this.processEventAndDiff(
          message.componentId,
          message.eventName,
          message.payload
        );
        if (!patches) return;
        ws.send(
          JSON.stringify({
            type: 'patches',
            componentId: message.componentId,
            patches
          })
        );
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  private async processEventAndDiff(
    componentId: string,
    eventName: string,
    payload: any
  ): Promise<any[] | null> {
    const component = this.activeComponents.get(componentId);
    if (!component) {
      console.warn(`Component not found for id: ${componentId}`);
      return null;
    }

    const oldHtml = this.componentHtmlCache.get(componentId) ?? component._render();

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

    // Update cache with latest HTML
    this.componentHtmlCache.set(componentId, newHtml);

    // Compute patches
    try {
      if (this.rustEngine && typeof this.rustEngine.renderComponent === 'function') {
        const result = this.rustEngine.renderComponent(componentId, oldHtml, newHtml);
        if (typeof result === 'string') {
          try {
            return JSON.parse(result);
          } catch {}
        }
        // Buffer or Uint8Array
        if (
          typeof Buffer !== 'undefined' &&
          (Buffer.isBuffer(result) || result?.constructor?.name === 'Uint8Array')
        ) {
          try {
            const buf: Buffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
            return JSON.parse(buf.toString('utf-8'));
          } catch {}
        }
        // Already an object/array
        if (Array.isArray(result)) return result;
      }
    } catch (e) {
      console.warn('Rust engine diff failed, falling back to full replace:', e);
    }

    // Fallback: replace the entire component inner HTML
    return [
      {
        type: 'ReplaceInnerHtml',
        selector: `[data-livets-id="${componentId}"]`,
        html: newHtml
      }
    ];
  }

  private generateConnectorScript(): string {
    try {
      // Try to load the built client connector
      const clientPath = require.resolve('@magnusbag/livets-client/dist/connector.js');
      return readFileSync(clientPath, 'utf-8');
    } catch (error) {
      console.warn('Could not load built client connector, falling back to inline version');
      // Fallback to a minimal inline connector if package is not available
      return this.getFallbackConnectorScript();
    }
  }

  // Injects page layout with optional WS URL override when using Rust broker
  private wrapInLayout(html: string, options?: RenderOptions): string {
    const title = options?.title ?? 'LiveTS App';
    const meta = options?.meta ?? {};
    const scripts = options?.scripts ?? [];
    const styles = options?.styles ?? [];

    const metaTags = Object.entries(meta)
      .map(([key, value]) => `<meta name="${key}" content="${value}">`)
      .join('\n    ');

    const styleTags = styles.map(href => `<link rel="stylesheet" href="${href}">`).join('\n    ');

    const scriptTags = scripts.map(src => `<script src="${src}"></script>`).join('\n    ');

    // If broker is active, inject a global override for the client to use
    const wsOverrideScript = this.rustBroker
      ? `<script>window.LIVETS_WS_URL = "${this.getBrokerWsUrl()}";</script>`
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

  private getBrokerWsUrl(): string {
    const wsPort = this.options.port + 1;
    // We default to ws:// for dev server; users can front with TLS if needed
    const protocol = 'ws://';
    const host = this.options.host;
    return `${protocol}${host}:${wsPort}`;
  }

  private getFallbackConnectorScript(): string {
    // Construct a small connector that resolves WS URL at runtime
    return `
console.log('Using fallback connector - please install @magnusbag/livets-client for full functionality');

// Minimal fallback connector
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
    this.ws.onclose = () => console.log('LiveTS WebSocket disconnected');
    this.ws.onerror = (error) => console.error('LiveTS WebSocket error:', error);

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

  private generateConnectionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // Extract props from Hono context (query params only for now)
  private extractPropsFromContext(c: any): ComponentProps {
    try {
      const query = c?.req?.query?.() ?? {};
      return { ...query };
    } catch {
      return {};
    }
  }

  /**
   * Get the underlying Hono app instance for adding custom routes
   */
  getApp(): Hono {
    return this.app;
  }

  /**
   * Start the server (alias for listen)
   */
  async start(): Promise<void> {
    return this.listen();
  }
}
