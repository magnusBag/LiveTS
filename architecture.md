# LiveTS Architecture Plan

## Overview

LiveTS is a hybrid TypeScript/Rust framework for building real-time, server-rendered web applications. The architecture follows a three-tier model with clear separation of concerns:

1. **Rust Core Engine** - High-performance native module
2. **TypeScript API Layer** - Developer-friendly interface
3. **Client Connector** - Minimal browser runtime

## Core Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Client                       │
├─────────────────────────────────────────────────────────┤
│  DOM                    │  connector.js (minimal)       │
│  ├─ ts-on:click        │  ├─ WebSocket client           │
│  ├─ ts-model           │  ├─ Event capture & delegation │
│  └─ ts-if              │  └─ DOM patching               │
└─────────────────┬───────────────────────────────────────┘
                  │ WebSocket + HTTP
                  │
┌─────────────────┴───────────────────────────────────────┐
│                 Node.js Server                         │
├─────────────────────────────────────────────────────────┤
│  TypeScript API Layer (livets)                         │
│  ├─ LiveView base class                                 │
│  ├─ Component lifecycle hooks                           │
│  ├─ Event handling                                      │
│  └─ State management                                    │
├─────────────────────────────────────────────────────────┤
│  Rust Core Engine (native addon via NAPI-RS)           │
│  ├─ WebSocket connection pool                           │
│  ├─ Component instance registry                         │
│  ├─ HTML diffing algorithm                              │
│  ├─ Event routing system                                │
│  └─ Pub/Sub messaging                                   │
├─────────────────────────────────────────────────────────┤
│  HTTP Server (Hono)                                     │
│  ├─ Static file serving                                 │
│  ├─ Initial page rendering                              │
│  └─ WebSocket upgrade handling                          │
└─────────────────────────────────────────────────────────┘
```

## Detailed Component Architecture

### 1. Rust Core Engine (`livets-core`)

The heart of the system, implemented as a native Node.js addon using NAPI-RS.

#### Key Modules:

**Connection Manager**

```rust
pub struct ConnectionManager {
    connections: HashMap<ConnectionId, WebSocketConnection>,
    component_registry: ComponentRegistry,
}

impl ConnectionManager {
    pub fn handle_websocket_message(&mut self, conn_id: ConnectionId, message: Message) -> Result<()>
    pub fn broadcast_to_component(&self, component_id: ComponentId, patch: HtmlPatch) -> Result<()>
    pub fn register_component(&mut self, component_id: ComponentId, conn_id: ConnectionId) -> Result<()>
}
```

**HTML Diffing Engine**

```rust
pub struct HtmlDiffer;

impl HtmlDiffer {
    pub fn diff(old_html: &str, new_html: &str) -> Result<Vec<DomPatch>>
    pub fn create_patch_instructions(patches: Vec<DomPatch>) -> Vec<u8>
}

#[derive(Serialize)]
pub enum DomPatch {
    ReplaceText { selector: String, content: String },
    SetAttribute { selector: String, attr: String, value: String },
    RemoveAttribute { selector: String, attr: String },
    ReplaceElement { selector: String, html: String },
    InsertElement { parent: String, position: InsertPosition, html: String },
    RemoveElement { selector: String },
}
```

**Event Router**

```rust
pub struct EventRouter {
    handlers: HashMap<ComponentId, Box<dyn EventHandler>>,
}

impl EventRouter {
    pub fn route_event(&self, component_id: ComponentId, event: ClientEvent) -> Result<()>
    pub fn register_handler(&mut self, component_id: ComponentId, handler: Box<dyn EventHandler>) -> Result<()>
}
```

#### Native Addon Interface (NAPI-RS)

```rust
#[napi]
pub struct LiveTSEngine {
    connection_manager: ConnectionManager,
    html_differ: HtmlDiffer,
    event_router: EventRouter,
}

#[napi]
impl LiveTSEngine {
    #[napi(constructor)]
    pub fn new() -> Self

    #[napi]
    pub fn handle_websocket_connection(&mut self, conn_id: String) -> Result<()>

    #[napi]
    pub fn render_component(&self, component_id: String, old_html: String, new_html: String) -> Result<Vec<u8>>

    #[napi]
    pub fn route_client_event(&mut self, component_id: String, event_data: String) -> Result<()>

    #[napi]
    pub fn broadcast_message(&self, channel: String, message: String) -> Result<()>
}
```

### 2. TypeScript API Layer (`livets`)

The developer-facing API that wraps the Rust core.

#### Core Classes:

**LiveView Base Class**

```typescript
export abstract class LiveView {
  protected state: Record<string, any> = {};
  private componentId: string;
  private engine: LiveTSEngine;

  // Lifecycle methods
  abstract mount(): void | Promise<void>;
  abstract render(): string;

  updated?(): void | Promise<void>;
  unmount?(): void | Promise<void>;

  // State management
  protected setState(updates: Partial<typeof this.state>): void;

  // Event handling
  handleEvent(event: string, payload: any): void | Promise<void>;

  // Pub/Sub
  protected subscribe(channel: string, handler: (data: any) => void): void;
  protected broadcast(channel: string, data: any): void;
}
```

**Server Setup**

```typescript
import { Hono } from "hono";
import { LiveTSEngine } from "./native/livets-core.node";

export class LiveTSServer {
  private app: Hono;
  private engine: LiveTSEngine;

  constructor() {
    this.app = new Hono();
    this.engine = new LiveTSEngine();
    this.setupRoutes();
  }

  registerComponent<T extends LiveView>(
    path: string,
    ComponentClass: new () => T
  ): void;

  listen(port: number): void;
}
```

**Component Registration & Rendering**

```typescript
export class ComponentRenderer {
  static async renderToString<T extends LiveView>(
    ComponentClass: new () => T,
    props?: Record<string, any>
  ): Promise<string>;

  static async hydrateComponent<T extends LiveView>(
    component: T,
    connectionId: string
  ): Promise<void>;
}
```

### 3. Client Connector (`connector.js`)

Minimal JavaScript runtime for the browser.

```javascript
class LiveTSConnector {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.setupEventListeners();
    this.setupDomObserver();
  }

  setupEventListeners() {
    // Handle incoming patches from server
    this.ws.onmessage = (event) => {
      const patches = JSON.parse(event.data);
      this.applyPatches(patches);
    };

    // Delegate DOM events to server
    document.addEventListener("click", this.handleDomEvent.bind(this));
    document.addEventListener("input", this.handleDomEvent.bind(this));
    document.addEventListener("submit", this.handleDomEvent.bind(this));
  }

  handleDomEvent(event) {
    const element = event.target.closest("[ts-on\\:" + event.type + "]");
    if (!element) return;

    const handler = element.getAttribute(`ts-on:${event.type}`);
    const componentId = element.closest("[data-livets-id]")?.dataset.livetsId;

    if (handler && componentId) {
      event.preventDefault();
      this.sendEvent(componentId, handler, this.extractEventData(event));
    }
  }

  applyPatches(patches) {
    patches.forEach((patch) => {
      switch (patch.type) {
        case "ReplaceText":
          document.querySelector(patch.selector).textContent = patch.content;
          break;
        case "SetAttribute":
          document
            .querySelector(patch.selector)
            .setAttribute(patch.attr, patch.value);
          break;
        // ... other patch types
      }
    });
  }

  sendEvent(componentId, eventName, eventData) {
    this.ws.send(
      JSON.stringify({
        type: "event",
        componentId,
        eventName,
        eventData,
      })
    );
  }
}
```

## Data Flow Architecture

### 1. Initial Page Load

```
1. Browser requests page
2. Hono serves static HTML with component rendered server-side
3. Client loads connector.js
4. WebSocket connection established with Rust core
5. Component instance registered in Rust registry
```

### 2. User Interaction Flow

```
1. User clicks element with ts-on:click="increment"
2. connector.js captures event, sends to server via WebSocket
3. Rust core routes event to correct component instance
4. TypeScript component.handleEvent() executes, updates state
5. component.render() called, produces new HTML
6. Rust core diffs old vs new HTML
7. Patch instructions sent to client via WebSocket
8. connector.js applies patches to DOM
```

### 3. Real-time Updates (Pub/Sub)

```
1. Component A broadcasts message via this.broadcast()
2. Message routed through Rust core pub/sub system
3. All subscribed components receive message
4. Components update state and re-render
5. DOM patches sent to all connected clients
```

## Project Structure

```
livets/
├── packages/
│   ├── core/                    # Main TypeScript package
│   │   ├── src/
│   │   │   ├── index.ts         # Main exports
│   │   │   ├── live-view.ts     # LiveView base class
│   │   │   ├── server.ts        # LiveTSServer class
│   │   │   ├── renderer.ts      # Component rendering
│   │   │   └── types.ts         # TypeScript definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rust-core/               # Rust native addon
│   │   ├── src/
│   │   │   ├── lib.rs           # Main entry point
│   │   │   ├── connection.rs    # WebSocket management
│   │   │   ├── differ.rs        # HTML diffing algorithm
│   │   │   ├── events.rs        # Event routing
│   │   │   └── pubsub.rs        # Pub/Sub system
│   │   ├── Cargo.toml
│   │   └── build.rs
│   │
│   └── client/                  # Client-side connector
│       ├── src/
│       │   └── connector.js     # Browser runtime
│       ├── dist/
│       └── package.json
│
├── examples/                    # Example applications
│   ├── counter/                 # Simple counter app
│   ├── todo-app/               # Todo list with real-time sync
│   └── chat/                   # Real-time chat application
│
├── tools/
│   ├── cli/                    # create-livets-app CLI
│   └── build-scripts/          # Build automation
│
├── docs/                       # Documentation
├── tests/                      # Integration tests
└── scripts/                    # Development scripts
```

## Performance Optimizations

### 1. Rust Core Advantages

- **Zero-copy WebSocket handling** using `tungstenite`
- **Efficient memory management** with Rust's ownership system
- **SIMD-optimized HTML parsing** for diffing algorithm
- **Lock-free data structures** for connection registry
- **Custom binary protocol** for patch instructions

### 2. TypeScript Layer Optimizations

- **Component instance pooling** to reduce GC pressure
- **Lazy component loading** for large applications
- **Memoized render results** to skip unnecessary diffs
- **Batched state updates** to minimize re-renders

### 3. Client-Side Optimizations

- **Minimal JavaScript bundle** (~5KB gzipped)
- **Event delegation** to reduce memory usage
- **Binary patch format** for faster transmission
- **DOM patching optimizations** using document fragments

## Security Considerations

### 1. WebSocket Security

- **Origin validation** for WebSocket connections
- **Rate limiting** on event handling
- **Input sanitization** for all client events
- **Connection authentication** via JWT tokens

### 2. HTML Injection Prevention

- **Automatic HTML escaping** in render methods
- **Allowlist-based attribute filtering** for ts-\* directives
- **CSP integration** for additional protection
- **XSS prevention** in patch application

## Development Phases Implementation Strategy

### Phase 1: Foundation (Weeks 1-3)

- Set up Rust workspace with NAPI-RS
- Implement basic WebSocket connection management
- Create TypeScript LiveView base class
- Build minimal client connector
- Basic render-diff-patch cycle

### Phase 2: Core Features (Weeks 4-6)

- Implement HTML diffing algorithm in Rust
- Add event routing and handling
- Complete DOM patching system
- State management and lifecycle hooks

### Phase 3: Interactivity (Weeks 7-9)

- Alpine.js-inspired directive system
- Form handling and validation
- Component communication patterns
- Error handling and recovery

### Phase 4: Production Ready (Weeks 10-12)

- Pub/Sub system implementation
- Performance optimizations
- CLI tooling and scaffolding
- Documentation and examples

This architecture provides a solid foundation for building LiveTS as a high-performance, developer-friendly framework that leverages the best of both Rust and TypeScript ecosystems.
