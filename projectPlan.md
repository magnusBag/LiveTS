# Project Plan: LiveTS

Our goal is to create a modern, performant, and developer-friendly library for building real-time, server-rendered web applications with TypeScript, inspired by Phoenix LiveView and Blazor Server.

### Guiding Principles

1.  **TypeScript First API:** Developers interact with a clean, fully-typed TypeScript API. All components, state, and event logic are written in TS.
2.  **High-Performance Rust Core:** The underlying engine is built in Rust for elite speed, memory safety, and concurrency, exposed to the Node.js runtime as a native addon.
3.  **Minimal Client-Side JS:** The client is a thin, generic host. All application logic lives on the server.
4.  **Declarative, HTML-centric Syntax:** Component logic and event handling are declared directly in the HTML, inspired by Alpine.js.
5.  **Tailwind CSS as a First-Class Citizen:** The framework is designed to work seamlessly with Tailwind CSS.
6.  **Cross-Runtime Compatibility:** Aims to run on Node.js, Deno, and Bun by abstracting the core engine.

---

### Core Architecture: The Hybrid Model

LiveTS will be built as a hybrid package. This gives us the best of both worlds: maximum performance and a fantastic developer experience.

- **The Engine (Rust):** A native module, compiled from Rust, handles all heavy lifting: WebSocket connection management, state storage, the event loop, and the high-speed HTML diffing/patching algorithm. We will use a tool like **NAPI-RS** to create a native Node.js addon.
- **The Public API (TypeScript):** A developer-friendly TypeScript wrapper that exposes the Rust engine's power. Developers will only ever need to write TypeScript; the Rust core is an implementation detail that makes the library incredibly fast.

---

### Phase 1: The Core Connection & State Management

This phase is about establishing the "heartbeat" of the framework, powered by the Rust core.

- **1.1: Server Setup & Initial Render**
  - Choose a lightweight server framework. **Hono** is a great choice for its speed, simplicity, and ability to run anywhere.
  - The server will perform the _first_ render of a component into static HTML and inject it into the page body.
- **1.2: WebSocket Handshake & Management (Rust Core)**
  - The Rust engine will handle the WebSocket lifecycle using a high-performance library like **`tungstenite`**. It will manage all connections and associate each with a specific LiveView instance in memory.
  - The client-side script will connect to this Rust-managed WebSocket endpoint.
- **1.3: Server-Side Component Model (TypeScript API)**
  - Define a `LiveView` base class in TypeScript.
  - It needs a `mount()` method to initialize state (`this.state = { count: 0 }`).
  - It needs a `render()` method that returns an HTML string.
  - These user-defined TS classes will be managed by the Rust core.
- **1.4: Client-Side Connector**
  - Write a small, generic JavaScript file (`connector.js`).
  - Its only jobs are:
    1.  Connect to the WebSocket.
    2.  Listen for messages (HTML patches) from the server.
    3.  Apply those patches to the current DOM.

**_Outcome of Phase 1: A browser loads a page, a WebSocket connects to the Rust engine, and a server-side component's state is held in memory, all orchestrated via a TypeScript API._**

---

### Phase 2: Rendering & DOM Patching

This is the "magic," now made hyper-efficient by Rust.

- **2.1: Implement the Diffing Algorithm (Rust Core)**
  - Instead of using a JavaScript library, we will implement a highly efficient HTML diffing algorithm directly in Rust. This will be a key performance advantage.
  - This Rust function will take two HTML strings ("old" and "new") and produce a compact set of patching instructions.
- **2.2: Implement the Diff & Patch Flow**
  - When a component's state changes, the TypeScript `render()` method is called.
  - The resulting HTML string is passed to the Rust engine's diffing function.
  - The Rust engine sends the compact patch set to the client over the WebSocket.
  - The client-side `connector.js` receives the patch instructions and applies them to the DOM. We can still use a minimal library like **`morphdom`** on the client if it simplifies applying patches, or handle it with vanilla JS.

**_Outcome of Phase 2: When a component's state changes, the UI updates almost instantly, thanks to a server-side diffing process written in Rust._**

---

### Phase 3: Interactivity & Events (Alpine.js Syntax)

This phase closes the loop, with the Rust core acting as the central event router.

- **3.1: Define Event Bindings**
  - Create special `ts-` prefixed attributes to declare interactivity directly in the HTML.
  - **Events:** `ts-on:click="increment"`, `ts-on:submit.prevent="save_form"`
  - **Data Binding:** `ts-model="form.username"`
  - **Content/Attribute Binding:** `ts-text="user.name"`, `ts-class="{ 'bg-red-500': has_error }"`
  - **Conditionals:** `ts-if="is_logged_in"`
- **3.2: Client-Side Event Delegation**
  - The `connector.js` captures user interactions and sends a standardized event message to the server (e.g., `{ type: 'click', event: 'increment' }`).
- **3.3: Server-Side Event Handling (Rust Core -> TypeScript API)**
  - The Rust engine receives the event message from the WebSocket.
  - It looks up the correct `LiveView` instance and calls the `handleEvent()` method on the user's TypeScript component, passing the event details.
  - After the user's TypeScript logic runs and updates the state, the Rust engine automatically triggers the re-render and diffing flow from Phase 2.

**_Outcome of Phase 3: A seamless interactive loop where user events are efficiently routed through the Rust core to the developer's TypeScript logic and back to the UI._**

---

### Phase 4: Polish & Advanced Features

This phase turns our library into a robust framework that's a pleasure to use.

- **4.1: Component Lifecycle**
  - Add more lifecycle hooks to the `LiveView` class: `updated()`, `unmount()`.
- **4.2: Forms & Validation**
  - Integrate a library like **`zod`** for defining validation schemas in the TypeScript layer.
- **4.3: Pub/Sub for Real-Time Sync (Rust Core)**
  - Implement a high-performance Pub/Sub system directly in the Rust core. This will be far more efficient than a JavaScript-based solution.
- **4.4: Developer Experience & Tooling**
  - Create a simple CLI tool (`create-livets-app`) to scaffold a new project.
  - **The scaffolder will automatically set up Tailwind CSS** and handle the installation of the correct native addon (`.node` file) for the user's platform.
