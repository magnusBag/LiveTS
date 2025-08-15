/**
 * LiveTS Client Connector - Ultra-minimal browser runtime for LiveTS applications
 * Optimized for compact WebSocket messages only
 */

class LiveTSConnector {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.connect();
    this.setupEventDelegation();
  }

  private connect(): void {
    const wsUrl = this.getWebSocketUrl();

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = event => this.onMessage(event);
      this.ws.onclose = () => this.onClose();
      this.ws.onerror = error => this.onError(error);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private onOpen(): void {
    console.log('🔗 LiveTS connected');
    this.reconnectAttempts = 0;
    this.startPing();
  }

  private onMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data);
      if (msg.t === 'p') {
        // Ultra-compact format: {t: 'p', c: 'shortId', d: ['op|sel|data', ...]}
        this.applyCompactPatches(msg.d || []);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private onClose(): void {
    console.log('🔌 LiveTS disconnected');
    this.stopPing();
    this.scheduleReconnect();
  }

  private onError(error: Event): void {
    console.error('WebSocket error:', error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Ultra-compact ping: just "p" (3 bytes vs 19 bytes - 84% reduction)
        this.ws.send('"p"');
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private setupEventDelegation(): void {
    // Single event listener for all ts-on: events
    document.addEventListener('click', e => this.handleEvent(e, 'click'));
    document.addEventListener('input', e => this.handleEvent(e, 'input'));
    document.addEventListener('change', e => this.handleEvent(e, 'change'));
    document.addEventListener('submit', e => this.handleEvent(e, 'submit'));
  }

  private handleEvent(event: Event, type: string): void {
    const target = event.target as Element;
    const element = target.closest(`[ts-on\\:${type}]`);
    if (!element) return;

    const handler = element.getAttribute(`ts-on:${type}`);
    const componentElement = element.closest('[data-livets-id]') as HTMLElement;
    if (!handler || !componentElement) return;

    const componentId = componentElement.dataset.livetsId;
    if (!componentId) return;

    event.preventDefault();
    this.sendEvent(componentId, handler, this.extractEventData(event, element));
  }

  private extractEventData(event: Event, element: Element): any {
    const target = element as HTMLInputElement;
    return {
      type: event.type,
      target: {
        tagName: element.tagName.toLowerCase(),
        value: target.value || undefined,
        checked: target.checked || undefined,
        dataset: target.dataset || {}
      }
    };
  }

  private sendEvent(componentId: string, eventName: string, payload: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Ultra-compact event format: "e|shortId|eventName|value|checked|tagName"
      // Example: "e|abc123|increment||false|button" (~30 bytes vs ~200 bytes - 85% reduction)
      const shortId = componentId.substring(0, 8);
      const value = payload?.target?.value || '';
      const checked = payload?.target?.checked ? '1' : '0';
      const tagName = payload?.target?.tagName || '';

      const compactEvent = `"e|${shortId}|${eventName}|${value}|${checked}|${tagName}"`;
      this.ws.send(compactEvent);
    }
  }

  private applyCompactPatches(compactPatches: string[]): void {
    compactPatches.forEach(compact => {
      try {
        const parts = compact.split('|');
        const op = parts[0];
        const selector = `[data-ts-sel="${parts[1]}"]`;
        const element = document.querySelector(selector);

        if (!element) return;

        switch (op) {
          case 't': // UpdateText
            element.textContent = parts[2] || '';
            break;
          case 'a': // SetAttribute
            element.setAttribute(parts[2], parts[3] || '');
            break;
          case 'r': // RemoveAttribute
            element.removeAttribute(parts[2]);
            break;
          case 'h': // ReplaceInnerHtml
            element.innerHTML = parts[2] || '';
            break;
          case 'e': // ReplaceElement
            element.outerHTML = parts[2] || '';
            break;
        }
      } catch (error) {
        console.error('Failed to apply patch:', compact, error);
      }
    });
  }

  private getWebSocketUrl(): string {
    // Allow server to inject custom WS URL
    const override = (window as any).LIVETS_WS_URL as string | undefined;
    if (override) return override;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new LiveTSConnector());
} else {
  new LiveTSConnector();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiveTSConnector;
}
if (typeof window !== 'undefined') {
  (window as any).LiveTSConnector = LiveTSConnector;
}
