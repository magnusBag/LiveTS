/**
 * LiveTS Client Connector - Minimal browser runtime for LiveTS applications
 */

interface DomPatch {
  type: string;
  selector?: string;
  content?: string;
  text?: string; // For UpdateText
  attr?: string;
  value?: string;
  html?: string;
  parent?: string;
  position?: string;
}

interface WebSocketMessage {
  type: string;
  patches?: DomPatch[];
  componentId?: string;
  message?: string;
}

interface EventData {
  type: string;
  target: {
    tagName: string;
    value?: string;
    checked?: boolean;
  };
  formData?: Record<string, any>;
}

class LiveTSConnector {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(wsUrl?: string) {
    const url = wsUrl || this.getWebSocketUrl();
    this.ws = new WebSocket(url);
    this.setupEventListeners();
    this.setupDomObserver();
  }

  private setupEventListeners(): void {
    this.ws.onopen = () => {
      console.log('LiveTS WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = event => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('LiveTS WebSocket disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = error => {
      console.error('LiveTS WebSocket error:', error);
    };

    // Delegate DOM events to server
    document.addEventListener('click', this.handleDomEvent.bind(this));
    document.addEventListener('input', this.handleDomEvent.bind(this));
    document.addEventListener('submit', this.handleDomEvent.bind(this));
    document.addEventListener('change', this.handleDomEvent.bind(this));
  }

  private setupDomObserver(): void {
    // Set up MutationObserver to watch for dynamically added elements
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Re-attach event listeners to new elements if needed
              // This is handled by event delegation, so no action needed
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'patches':
        if (message.patches) {
          this.applyPatches(message.patches);
        }
        break;

      case 'pong':
        // Handle ping/pong for connection health
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleDomEvent(event: Event): void {
    const target = event.target as Element;
    const element = target.closest(`[ts-on\\:${event.type}]`);

    if (!element) return;

    const handler = element.getAttribute(`ts-on:${event.type}`);
    const componentElement = element.closest('[data-livets-id]') as HTMLElement;

    if (!handler || !componentElement) return;

    const componentId = componentElement.dataset.livetsId;

    if (!componentId) return;

    event.preventDefault();

    const payload = this.extractEventData(event, element);
    this.sendEvent(componentId, handler, payload);
  }

  private extractEventData(event: Event, element: Element): EventData {
    const target = element as HTMLInputElement;

    const data: EventData = {
      type: event.type,
      target: {
        tagName: element.tagName.toLowerCase(),
        value: target.value || undefined,
        checked: target.checked || undefined
      }
    };

    // Extract form data for form events
    if (event.type === 'submit' && element.tagName === 'FORM') {
      const formData = new FormData(element as HTMLFormElement);
      const formObj: Record<string, any> = {};
      formData.forEach((value, key) => {
        formObj[key] = value;
      });
      data.formData = formObj;
    }

    return data;
  }

  private sendEvent(componentId: string, eventName: string, payload: EventData): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'event',
          componentId,
          eventName,
          payload
        })
      );
    } else {
      console.warn('WebSocket not ready, cannot send event');
    }
  }

  private applyPatches(patches: DomPatch[]): void {
    patches.forEach(patch => {
      try {
        switch (patch.type) {
          case 'ReplaceText':
            if (patch.selector && patch.content !== undefined) {
              const element = document.querySelector(patch.selector);
              if (element) {
                element.textContent = patch.content;
              }
            }
            break;

          case 'UpdateText':
            if (patch.selector && patch.text !== undefined) {
              const element = document.querySelector(patch.selector);
              if (element) {
                element.textContent = patch.text;
              }
            }
            break;

          case 'SetAttribute':
            if (patch.selector && patch.attr && patch.value !== undefined) {
              const element = document.querySelector(patch.selector);
              if (element) {
                element.setAttribute(patch.attr, patch.value);
              }
            }
            break;

          case 'RemoveAttribute':
            if (patch.selector && patch.attr) {
              const element = document.querySelector(patch.selector);
              if (element) {
                element.removeAttribute(patch.attr);
              }
            }
            break;

          case 'ReplaceInnerHtml':
            if (patch.selector && patch.html !== undefined) {
              const element = document.querySelector(patch.selector);
              if (element) {
                element.innerHTML = patch.html;
              }
            }
            break;

          case 'ReplaceElement':
            if (patch.selector && patch.html !== undefined) {
              const element = document.querySelector(patch.selector);
              if (element && element.parentElement) {
                const temp = document.createElement('div');
                temp.innerHTML = patch.html;
                const newElement = temp.firstElementChild;
                if (newElement) {
                  element.parentElement.replaceChild(newElement, element);
                }
              }
            }
            break;

          case 'InsertElement':
            if (patch.parent && patch.html !== undefined) {
              const parent = document.querySelector(patch.parent);
              if (parent) {
                const temp = document.createElement('div');
                temp.innerHTML = patch.html;
                const newElement = temp.firstElementChild;
                if (newElement) {
                  switch (patch.position) {
                    case 'beforeBegin':
                      parent.parentElement?.insertBefore(newElement, parent);
                      break;
                    case 'afterBegin':
                      parent.insertBefore(newElement, parent.firstChild);
                      break;
                    case 'beforeEnd':
                      parent.appendChild(newElement);
                      break;
                    case 'afterEnd':
                      parent.parentElement?.insertBefore(newElement, parent.nextSibling);
                      break;
                  }
                }
              }
            }
            break;

          case 'RemoveElement':
            if (patch.selector) {
              const element = document.querySelector(patch.selector);
              if (element) {
                element.remove();
              }
            }
            break;
        }
      } catch (error) {
        console.error('Error applying patch:', patch, error);
      }
    });
  }

  private getWebSocketUrl(): string {
    // Allow server to inject a custom WS URL (e.g., Rust broker on different port)
    const override = (window as any).LIVETS_WS_URL as string | undefined;
    if (override && typeof override === 'string') {
      return override;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/livets-ws`;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      console.log(
        `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      setTimeout(() => {
        try {
          this.ws = new WebSocket(this.getWebSocketUrl());
          this.setupEventListeners();
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached. Please refresh the page.');
    }
  }

  // Public API for manual operations
  public disconnect(): void {
    this.ws.close();
  }

  public getConnectionState(): number {
    return this.ws.readyState;
  }
}

// Auto-initialize when DOM is ready
function initializeLiveTS(): void {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Check if already initialized
    if ((window as any).liveTSConnector) {
      return;
    }

    // Initialize connector
    const connector = new LiveTSConnector();
    (window as any).liveTSConnector = connector;
  }
}

// Initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLiveTS);
} else {
  initializeLiveTS();
}

// Export for module usage
export { LiveTSConnector, initializeLiveTS };
