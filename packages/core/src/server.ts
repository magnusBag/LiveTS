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
try {
  const rustCore = require('@magnusbag/livets-rust-core');
  LiveTSEngine = rustCore.LiveTsEngine; // Note: lowercase 's' in generated binding
} catch (error) {
  console.warn('Rust core not available, using fallback JavaScript implementation');
  LiveTSEngine = null;
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

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port ?? 3000,
      host: options.host ?? 'localhost',
      cors: options.cors ?? true,
      static: options.static ?? { root: './public', prefix: '/' }
    };

    // Initialize Rust engine if available
    if (LiveTSEngine) {
      this.rustEngine = new LiveTSEngine();
      console.log('🦀 Rust core engine initialized');
    } else {
      console.log('📝 Using JavaScript fallback for DOM manipulation');
    }

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
        // TODO: Clean up component associations
      });

      ws.on('error', error => {
        console.error(`WebSocket error for ${connectionId}:`, error);
      });
    });

    console.log(`WebSocket server is running on the same port as the HTTP server.`);
  }

  private async handleWebSocketMessage(
    connectionId: string,
    message: any,
    ws: WebSocket
  ): Promise<void> {
    switch (message.type) {
      case 'event':
        await this.handleClientEvent(message, ws);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  private async handleClientEvent(message: any, ws: WebSocket): Promise<void> {
    const { componentId, eventName, payload } = message;

    const component = this.activeComponents.get(componentId);
    if (!component) {
      console.warn(`Component not found: ${componentId}`);
      return;
    }

    try {
      // Get the old HTML for diffing
      const oldHtml = this.componentHtmlCache.get(componentId) || '';

      // Handle the event
      await component.handleEvent(eventName, payload);

      // Re-render the component
      const newHtml = component._render();

      // Cache the new HTML
      this.componentHtmlCache.set(componentId, newHtml);

      // Generate diff patches using Rust core (if available)
      let patches;
      if (this.rustEngine && oldHtml) {
        try {
          console.debug('🦀 Using Rust core for HTML diffing');
          const patchBytes = await this.rustEngine.renderComponent(componentId, oldHtml, newHtml);
          patches = JSON.parse(Buffer.from(patchBytes).toString());
          console.debug('🎯 Generated', patches.length, 'patches using Rust');
        } catch (rustError) {
          console.warn('Rust diffing failed, falling back to JavaScript:', rustError);
          patches = this.fallbackDiff(componentId, oldHtml, newHtml);
        }
      } else {
        console.log('📝 Using JavaScript fallback for diffing');
        patches = this.fallbackDiff(componentId, oldHtml, newHtml);
      }

      // Send patches to client
      ws.send(
        JSON.stringify({
          type: 'patches',
          componentId,
          patches
        })
      );
    } catch (error) {
      console.error(`Error handling event ${eventName} for component ${componentId}:`, error);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Error processing event'
        })
      );
    }
  }

  private extractPropsFromContext(c: any): ComponentProps {
    // Extract props from query parameters and request body
    const query = c.req.query();
    return { ...query };
  }

  /**
   * Fallback JavaScript implementation for HTML diffing
   */
  private fallbackDiff(componentId: string, oldHtml: string, newHtml: string): any[] {
    // Simple fallback: if content is different, replace the entire innerHTML
    if (oldHtml.trim() !== newHtml.trim()) {
      return [
        {
          type: 'ReplaceInnerHtml',
          selector: `[data-livets-id="${componentId}"]`,
          html: newHtml
        }
      ];
    }
    return []; // No changes
  }

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

    <script src="/livets/connector.js"></script>
    ${scriptTags}
</body>
</html>`;
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

  private getFallbackConnectorScript(): string {
    const wsPort = this.options.port + 1;
    const wsHost = this.options.host;

    return `
console.log('Using fallback connector - please install @magnusbag/livets-client for full functionality');

// Minimal fallback connector
class FallbackConnector {
  constructor() {
    this.ws = new WebSocket('ws://${wsHost}:${wsPort}');
    this.setupEventListeners();
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
