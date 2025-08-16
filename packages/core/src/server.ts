/**
 * LiveTS Server - HTTP and WebSocket server for LiveTS applications
 */

import { Context, Hono } from 'hono';
import { readFileSync } from 'fs';
import { LiveView } from './live-view';
import type { ServerOptions, ComponentProps, RenderOptions, ComponentFactory } from './types';

// Import the Rust core engine types
import type { LiveTsEngine, LiveTsWebSocketBroker } from '@magnusbag/livets-rust-core';

// Import the Rust core engine
let LiveTSEngine: typeof LiveTsEngine | null;
let LiveTSWebSocketBroker: typeof LiveTsWebSocketBroker | null;
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
  private components: Map<string, new (props?: ComponentProps) => LiveView> = new Map();
  private activeComponents: Map<string, LiveView> = new Map();
  private componentHtmlCache: Map<string, string> = new Map(); // Cache for HTML diffing
  private rustEngine?: LiveTsEngine;
  // Rust WS broker and mapping of connection->components
  private rustBroker?: LiveTsWebSocketBroker;
  private brokerConnComponents: Map<string, Set<string>> = new Map();
  private port: number;
  private host: string;
  private app: Hono;

  constructor(options: ServerOptions) {
    this.port = options.port ?? 3000;
    this.host = options.host ?? 'localhost';
    this.app = options.app;

    // Initialize Rust engine/broker if available
    if (LiveTSEngine) {
      this.rustEngine = new LiveTSEngine();

      // Set up optimized event processor callback for Phase 2 optimization
      if (typeof this.rustEngine.setEventProcessor === 'function') {
        try {
          this.rustEngine.setEventProcessor((requestJson: string) => {
            return this.handleEventProcessingRequest(requestJson);
          });
        } catch (e) {
          console.warn('Failed to set up optimized event processor:', e);
        }
      }
    } else {
      console.log('📝 Using JavaScript fallback for DOM manipulation');
    }

    // Initialize Rust broker if available
    if (LiveTSWebSocketBroker) {
      try {
        this.rustBroker = new LiveTSWebSocketBroker();
        this.rustBroker.setEventHandler((...args: any[]) => {
          // Handle broker events from Rust
          const evtJson = args[1];
          this.handleBrokerEvent(evtJson);
        });
        this.setupWebSocketServer();
      } catch (error) {
        console.error('Failed to initialize Rust broker:', error);
        this.rustBroker = undefined;
      }
    } else {
      console.log('📝 Rust broker not available, will use Node.js WebSocket fallback');
    }

    this.setupMiddleware();
  }

  /**
   * Registers a LiveView component with a simple class constructor
   */
  registerComponent<T extends LiveView>(
    path: string,
    ComponentClass: new (props?: ComponentProps) => T,
    options?: RenderOptions
  ): void;

  /**
   * Registers a LiveView component with a factory function that receives route context
   */
  registerComponent<T extends LiveView>(
    path: string,
    componentFactory: ComponentFactory<T>,
    options?: RenderOptions
  ): void;

  registerComponent<T extends LiveView>(
    path: string,
    componentFactory: ComponentFactory<T> | (new (props?: ComponentProps) => T),
    options?: RenderOptions
  ): void {
    // Check if it's a factory function or a class constructor
    if (typeof componentFactory === 'function' && componentFactory.length > 0) {
      // It's a factory function that takes a context parameter
      this.registerParameterizedComponent(path, componentFactory as ComponentFactory<T>, options);
    } else {
      // It's a class constructor
      this.registerSimpleComponent(
        path,
        componentFactory as new (props?: ComponentProps) => T,
        options
      );
    }
  }

  private registerSimpleComponent<T extends LiveView>(
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

        // Cache component HTML in Rust for Phase 2 optimization
        if (this.rustEngine && typeof this.rustEngine.cacheComponentHtml === 'function') {
          try {
            this.rustEngine.cacheComponentHtml(component.getComponentId(), html);
          } catch (e) {
            console.warn(`Failed to cache HTML for component ${component.getComponentId()}:`, e);
          }
        }

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

  private registerParameterizedComponent<T extends LiveView>(
    path: string,
    componentFactory: ComponentFactory<T>,
    options?: RenderOptions
  ): void {
    this.app.get(path, async c => {
      try {
        // Create enhanced context with parameter extraction

        // Call the factory function with the context
        const component = componentFactory(c);

        // Mount the component
        await component._mount();

        // Store active component
        this.activeComponents.set(component.getComponentId(), component);

        // Render the component
        const html = component._render();

        // Cache component HTML in Rust for Phase 2 optimization
        if (this.rustEngine && typeof this.rustEngine.cacheComponentHtml === 'function') {
          try {
            this.rustEngine.cacheComponentHtml(component.getComponentId(), html);
          } catch (e) {
            console.warn(`Failed to cache HTML for component ${component.getComponentId()}:`, e);
          }
        }

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

  async close(): Promise<void> {
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
      wsConnections: 0 // TODO: Add connection count method to Rust broker
    };
  }

  // ===== Private Methods =====

  private findComponentIdByShortId(shortId: string): string | null {
    // Find component by matching first 8 characters of ID
    for (const [fullId] of this.activeComponents) {
      if (fullId.substring(0, 8) === shortId) {
        return fullId;
      }
    }
    return null;
  }

  private setupMiddleware(): void {
    // CORS middleware
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

    // LiveTS connector script - serve the built client
    this.app.get('/livets/connector.js', c => {
      const connectorScript = this.generateConnectorScript();
      c.header('Content-Type', 'application/javascript');
      return c.text(connectorScript);
    });
  }

  private setupWebSocketServer(): void {
    // If Rust broker is available, start it on a dedicated WebSocket port
    if (!this.rustBroker) {
      throw new Error('Rust broker is not available');
    }
    // Use dedicated WebSocket port for optimal performance
    const wsPort = this.port + 1;
    this.rustBroker.listen(this.host, wsPort);
    console.log(`🦀 Rust WebSocket broker listening on ws://${this.host}:${wsPort}/livets-ws`);
  }

  private async handleBrokerEvent(evtJson: string): Promise<void> {
    try {
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

      switch (evt.type) {
        case 'Connected':
          // Optionally handle new connections
          break;
        case 'Message': {
          const { connection_id, data } = evt;

          // Phase 2 Optimization: Two-step processing (1 FFI crossing for business logic!)
          if (this.rustEngine && typeof this.rustEngine.parseEventAndGetCache === 'function') {
            // Fast ping check in Rust
            if (this.rustEngine.isPingMessage(data)) {
              return; // Skip ping processing
            }

            try {
              // Step 1: Parse event and get cached HTML in Rust (no FFI)
              const eventDataJson = this.rustEngine.parseEventAndGetCache(data);
              const eventData = JSON.parse(eventDataJson);

              // Step 2: Process business logic in TypeScript (1 FFI crossing)
              const responseJson = await this.handleEventProcessingRequest(eventDataJson);
              const response = JSON.parse(responseJson);

              if (
                response.success &&
                typeof this.rustEngine.processResponseAndGenerateMessage === 'function'
              ) {
                // Step 3: Generate diff and message in Rust (no FFI)
                const responseMessage = this.rustEngine.processResponseAndGenerateMessage(
                  eventData.component_id,
                  eventData.old_html,
                  response.new_html
                );

                // Send the response directly via broker
                try {
                  this.rustBroker?.sendToConnection(connection_id, responseMessage);
                } catch (e) {
                  console.error('Failed sending optimized response via broker:', e);
                }
                return;
              }
            } catch (e) {
              console.warn('Rust optimized processing failed, falling back:', e);
            }
          }

          // Fallback to original parsing logic for compatibility
          if (data === '"p"') {
            return;
          } else if (data.startsWith('"e|')) {
            await this.handleCompactEvent(connection_id, data);
          } else if (data.startsWith('{"type":"event"')) {
            await this.handleEventMessageDirect(connection_id, data);
          } else {
            const message = JSON.parse(data);
            await this.handleBrokerMessage(connection_id, message);
          }
          break;
        }
        case 'Closed': {
          // Cleanup component registrations for this connection
          const connection_id = evt.connection_id as string;
          const set = this.brokerConnComponents.get(connection_id);
          if (set && this.rustBroker) {
            for (const componentId of set) {
              try {
                this.rustBroker.unregisterComponent(componentId, connection_id);
              } catch {}
            }
          }
          this.brokerConnComponents.delete(connection_id);
          break;
        }
      }
    } catch (e) {
      console.error('Error in broker event handler:', e);
    }
  }

  private async handleCompactEvent(connection_id: string, data: string): Promise<void> {
    try {
      // Parse compact format: "e|shortId|eventName|value|checked|tagName"
      // Remove quotes and split by pipes
      const content = data.slice(1, -1); // Remove surrounding quotes
      const parts = content.split('|');

      if (parts.length < 3 || parts[0] !== 'e') {
        console.warn('Invalid compact event format:', data);
        return;
      }

      const shortId = parts[1] || '';
      const eventName = parts[2] || '';
      const value = parts[3] || '';
      const checked = parts[4] === '1';
      const tagName = parts[5] || '';

      // Find full component ID from short ID
      const componentId = this.findComponentIdByShortId(shortId);
      if (!componentId) {
        console.warn(`Component not found for short ID: ${shortId}`);
        return;
      }

      // Reconstruct payload in expected format
      const payload = {
        type: 'input', // Default event type
        target: {
          tagName: tagName.toLowerCase(),
          value: value || '',
          checked: checked,
          dataset: {}
        }
      };

      // Track registration
      let set = this.brokerConnComponents.get(connection_id);
      if (!set) {
        set = new Set();
        this.brokerConnComponents.set(connection_id, set);
      }
      if (!set.has(componentId)) {
        try {
          this.rustBroker?.registerComponent(componentId, connection_id);
        } catch {}
        set.add(componentId);
      }

      const compactMsg = await this.processEventAndGenerateMessage(componentId, eventName, payload);
      if (!compactMsg) return;

      try {
        this.rustBroker?.sendToConnection(connection_id, compactMsg);
      } catch (e) {
        console.error('Failed sending patches via broker:', e);
      }
    } catch (e) {
      console.error('Failed parsing compact event:', e, 'data:', data);
    }
  }

  private async handleEventMessageDirect(connection_id: string, data: string): Promise<void> {
    try {
      // Fast parsing for: {"type":"event","componentId":"xxx","eventName":"yyy","payload":{...}}
      const componentIdMatch = data.match(/"componentId":"([^"]+)"/);
      const eventNameMatch = data.match(/"eventName":"([^"]+)"/);
      const payloadMatch = data.match(/"payload":({.*})}/);

      if (!componentIdMatch || !eventNameMatch) {
        // Fall back to JSON parsing if fast parsing fails
        const message = JSON.parse(data);
        await this.handleClientEventFromBroker(connection_id, message);
        return;
      }

      const componentId = componentIdMatch[1]!;
      const eventName = eventNameMatch[1]!;
      const payload = payloadMatch ? JSON.parse(payloadMatch[1]!) : {};

      // Track registration to avoid duplicates
      let set = this.brokerConnComponents.get(connection_id);
      if (!set) {
        set = new Set();
        this.brokerConnComponents.set(connection_id, set);
      }
      if (!set.has(componentId)) {
        try {
          this.rustBroker?.registerComponent(componentId, connection_id);
        } catch {}
        set.add(componentId);
      }

      const compactMsg = await this.processEventAndGenerateMessage(componentId, eventName, payload);
      if (!compactMsg) return;

      try {
        this.rustBroker?.sendToConnection(connection_id, compactMsg);
      } catch (e) {
        console.error('Failed sending patches via broker:', e);
      }
    } catch (e) {
      console.error('Failed direct event parsing, falling back to JSON:', e);
      // Fallback to full JSON parsing
      const message = JSON.parse(data);
      await this.handleClientEventFromBroker(connection_id, message);
    }
  }

  private async handleBrokerMessage(connection_id: string, message: any): Promise<void> {
    switch (message.type) {
      case 'event':
        await this.handleClientEventFromBroker(connection_id, message);
        break;
      case 'ping':
        // The broker responds to ping internally; no-op here
        break;
      default:
        console.warn(`Unknown broker message type: ${message.type}`);
    }
  }

  private async handleRustParsedEvent(connection_id: string, parsedEvent: any): Promise<void> {
    const { component_id, event_name, event_data } = parsedEvent;

    // Convert Rust-parsed event to our internal format
    const payload = {
      type: event_data.event_type,
      target: {
        tagName: event_data.target.tag_name,
        value: event_data.target.value,
        checked: event_data.target.checked,
        dataset: event_data.target.attributes || {}
      }
    };

    // Track registration to avoid duplicates
    let set = this.brokerConnComponents.get(connection_id);
    if (!set) {
      set = new Set();
      this.brokerConnComponents.set(connection_id, set);
    }
    if (!set.has(component_id)) {
      try {
        this.rustBroker?.registerComponent(component_id, connection_id);
      } catch {}
      set.add(component_id);
    }

    const compactMsg = await this.processEventAndGenerateMessage(component_id, event_name, payload);
    if (!compactMsg) return;

    try {
      this.rustBroker?.sendToConnection(connection_id, compactMsg);
    } catch (e) {
      console.error('Failed sending patches via broker:', e);
    }
  }

  private async handleEventProcessingRequest(requestJson: string): Promise<string> {
    try {
      const request = JSON.parse(requestJson);
      const { component_id, event_name, event_data } = request;

      // Convert to our internal payload format
      const payload = {
        type: event_data.event_type,
        target: {
          tagName: event_data.target.tag_name,
          value: event_data.target.value,
          checked: event_data.target.checked,
          dataset: event_data.target.attributes || {}
        }
      };

      // Find the component and process the event
      const component = this.activeComponents.get(component_id);
      if (!component) {
        return JSON.stringify({
          success: false,
          new_html: '',
          error: `Component not found: ${component_id}`
        });
      }

      try {
        // Process the event
        await Promise.resolve(component.handleEvent(event_name, payload));

        // Generate new HTML
        const newHtml = component._render();

        return JSON.stringify({
          success: true,
          new_html: newHtml,
          error: null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          new_html: '',
          error: `Event processing failed: ${e instanceof Error ? e.message : String(e)}`
        });
      }
    } catch (e) {
      return JSON.stringify({
        success: false,
        new_html: '',
        error: `Request parsing failed: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }

  private async handleClientEventFromBroker(connection_id: string, message: any): Promise<void> {
    const { componentId, eventName, payload } = message;

    // track registration to avoid duplicates
    let set = this.brokerConnComponents.get(connection_id);
    if (!set) {
      set = new Set();
      this.brokerConnComponents.set(connection_id, set);
    }
    if (!set.has(componentId)) {
      try {
        this.rustBroker?.registerComponent(componentId, connection_id);
      } catch {}
      set.add(componentId);
    }

    const compactMsg = await this.processEventAndGenerateMessage(componentId, eventName, payload);

    if (!compactMsg) return;

    try {
      this.rustBroker?.sendToConnection(connection_id, compactMsg);
    } catch (e) {
      console.error('Failed sending patches via broker:', e);
    }
  }

  private async processEventAndGenerateMessage(
    componentId: string,
    eventName: string,
    payload: any
  ): Promise<string | null> {
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

    // Generate complete message using Rust (zero JSON operations)
    try {
      if (this.rustEngine && typeof this.rustEngine.renderComponentMessage === 'function') {
        return this.rustEngine.renderComponentMessage(componentId, oldHtml, newHtml);
      }
    } catch (e) {
      console.warn('Rust engine message generation failed, falling back:', e);
    }

    // Fallback: manual string building for full replace
    const shortId = componentId.substring(0, 8);
    return `{"t":"p","c":"${shortId}","d":["h|[data-livets-id=\\"${componentId}\\"]|${newHtml.replace(/"/g, '\\"')}"]}`;
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
      if (this.rustEngine && typeof this.rustEngine.renderComponentCompact === 'function') {
        const result = this.rustEngine.renderComponentCompact(componentId, oldHtml, newHtml);

        // The Rust engine now returns a JSON string
        if (typeof result === 'string') {
          try {
            return JSON.parse(result);
          } catch (parseError) {
            console.warn('Failed to parse Rust engine result as JSON:', parseError);
          }
        }

        // Already an object/array (for backwards compatibility)
        if (Array.isArray(result)) return result;
      }
    } catch (e) {
      console.warn('Rust engine diff failed, falling back to full replace:', e);
    }

    // Fallback: replace the entire component inner HTML
    console.log('Falling back to full replace for component:', componentId);
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
    const wsPort = this.port + 1;
    // We default to ws:// for dev server; users can front with TLS if needed
    const protocol = 'ws://';
    const host = this.host;
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
      // Use compact event format for fallback connector too
      const componentId = componentElement.dataset.livetsId;
      const shortId = componentId.substring(0, 8);
      const value = element.value || '';
      const checked = element.checked ? '1' : '0';
      const tagName = element.tagName.toLowerCase();
      
      this.ws.send('"e|' + shortId + '|' + handler + '|' + value + '|' + checked + '|' + tagName + '"');
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
  // Extract props from Hono context (query params only for now)
  private extractPropsFromContext(c: any): ComponentProps {
    try {
      const query = c?.req?.query?.() ?? {};
      return { ...query };
    } catch {
      return {};
    }
  }
}
