/**
 * LiveView base class - The foundation for all LiveTS components
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  LiveViewState,
  EventPayload,
  ComponentProps,
  EventHandler,
  PubSubHandler,
  LiveViewMetadata,
  PubSubMessage,
  ComponentId
} from './types';

export abstract class LiveView {
  protected state: LiveViewState = {};
  protected readonly componentId: ComponentId;
  protected props: ComponentProps;
  protected metadata: LiveViewMetadata;
  protected eventHandlers: Map<string, EventHandler> = new Map();
  protected subscriptions: Map<string, PubSubHandler> = new Map();

  constructor(props: ComponentProps = {}) {
    this.componentId = props.id || uuidv4();
    this.props = props;
    this.metadata = {
      componentId: this.componentId,
      mounted: false,
      subscriptions: new Set()
    };
  }

  // ===== Abstract Methods (must be implemented by subclasses) =====

  /**
   * Called when the component is first mounted
   * Use this to initialize state and set up subscriptions
   */
  abstract mount(): void | Promise<void>;

  /**
   * Renders the component to an HTML string
   * This method is called whenever the component needs to re-render
   */
  abstract render(): string;

  // ===== Optional Lifecycle Methods =====

  /**
   * Called after the component state has been updated
   * Use this for side effects after state changes
   */
  updated?(): void | Promise<void>;

  /**
   * Called when the component is being unmounted
   * Use this to clean up subscriptions and resources
   */
  unmount?(): void | Promise<void>;

  // ===== State Management =====

  /**
   * Updates the component state and triggers a re-render
   */
  protected setState(updates: Partial<LiveViewState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Trigger re-render if mounted
    if (this.metadata.mounted) {
      this.scheduleRerender();
    }

    // Call updated lifecycle hook if it exists
    if (this.updated) {
      Promise.resolve(this.updated()).catch(error => {
        console.error(`Error in updated lifecycle for component ${this.componentId}:`, error);
      });
    }
  }

  /**
   * Gets the current state (read-only)
   */
  protected getState(): Readonly<LiveViewState> {
    return Object.freeze({ ...this.state });
  }

  // ===== Event Handling =====

  /**
   * Handles events from the client
   * Override this method to handle custom events
   */
  handleEvent(event: string, payload: EventPayload): void | Promise<void> {
    const handler = this.eventHandlers.get(event);
    if (handler) {
      return handler(event, payload);
    }

    // Default behavior: try to call a method with the event name
    const methodName = event;
    const method = (this as any)[methodName];

    if (typeof method === 'function') {
      return method.call(this, payload);
    }

    console.warn(`No handler found for event '${event}' on component ${this.componentId}`);
  }

  /**
   * Registers an event handler
   */
  protected on(event: string, handler: EventHandler): void {
    this.eventHandlers.set(event, handler);
  }

  /**
   * Removes an event handler
   */
  protected off(event: string): void {
    this.eventHandlers.delete(event);
  }

  // ===== Pub/Sub Messaging =====

  /**
   * Subscribes to a pub/sub channel
   */
  protected subscribe(channel: string, handler: PubSubHandler): void {
    this.subscriptions.set(channel, handler);
    this.metadata.subscriptions.add(channel);

    // TODO: Register with the Rust core engine
    console.log(`Component ${this.componentId} subscribed to channel: ${channel}`);
  }

  /**
   * Unsubscribes from a pub/sub channel
   */
  protected unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this.metadata.subscriptions.delete(channel);

    // TODO: Unregister with the Rust core engine
    console.log(`Component ${this.componentId} unsubscribed from channel: ${channel}`);
  }

  /**
   * Broadcasts a message to a pub/sub channel
   */
  protected broadcast(channel: string, data: any): void {
    const message: PubSubMessage = {
      channel,
      data,
      timestamp: Date.now()
    };

    // TODO: Send through the Rust core engine
    console.log(`Component ${this.componentId} broadcasting to channel ${channel}:`, data);
  }

  /**
   * Handles incoming pub/sub messages
   */
  handlePubSubMessage(message: PubSubMessage): void {
    const handler = this.subscriptions.get(message.channel);
    if (handler) {
      Promise.resolve(handler(message.data)).catch(error => {
        console.error(
          `Error handling pub/sub message for channel ${message.channel} on component ${this.componentId}:`,
          error
        );
      });
    }
  }

  // ===== Component Lifecycle Management =====

  /**
   * Mounts the component (internal use)
   */
  async _mount(): Promise<void> {
    if (this.metadata.mounted) {
      return;
    }

    try {
      await Promise.resolve(this.mount());
      this.metadata.mounted = true;
    } catch (error) {
      console.error(`Error mounting component ${this.componentId}:`, error);
      throw error;
    }
  }

  /**
   * Unmounts the component (internal use)
   */
  async _unmount(): Promise<void> {
    if (!this.metadata.mounted) {
      return;
    }

    try {
      // Clean up subscriptions
      for (const channel of this.metadata.subscriptions) {
        this.unsubscribe(channel);
      }

      // Call unmount lifecycle hook if it exists
      if (this.unmount) {
        await Promise.resolve(this.unmount());
      }

      this.metadata.mounted = false;
    } catch (error) {
      console.error(`Error unmounting component ${this.componentId}:`, error);
      throw error;
    }
  }

  /**
   * Renders the component (internal use)
   */
  _render(): string {
    if (!this.metadata.mounted) {
      throw new Error(`Cannot render unmounted component ${this.componentId}`);
    }

    try {
      const html = this.render();
      return this.wrapWithComponentId(html);
    } catch (error) {
      console.error(`Error rendering component ${this.componentId}:`, error);
      throw error;
    }
  }

  // ===== Utility Methods =====

  /**
   * Gets the component ID
   */
  getComponentId(): ComponentId {
    return this.componentId;
  }

  /**
   * Gets the component props
   */
  getProps(): Readonly<ComponentProps> {
    return Object.freeze({ ...this.props });
  }

  /**
   * Checks if the component is mounted
   */
  isMounted(): boolean {
    return this.metadata.mounted;
  }

  /**
   * Schedules a re-render (internal use)
   */
  private scheduleRerender(): void {
    // TODO: Communicate with the Rust core to trigger a re-render
    console.log(`Scheduling re-render for component ${this.componentId}`);
  }

  /**
   * Wraps the rendered HTML with component identification
   */
  private wrapWithComponentId(html: string): string {
    // Add data attribute to identify this component
    // Handle leading whitespace by finding the first tag
    const wrappedHtml = html.replace(
      /^(\s*)<(\w+)([^>]*)>/,
      `$1<$2$3 data-livets-id="${this.componentId}">`
    );

    return wrappedHtml || `<div data-livets-id="${this.componentId}">${html}</div>`;
  }
}
