# LiveTS AI Coding Instructions

This document provides guidance for AI coding agents working on the LiveTS codebase.

## Project Overview & Architecture

LiveTS is a monorepo for building real-time, server-rendered web applications using TypeScript and Rust. The architecture is composed of three main packages:

- `@livets/core`: The main server-side framework package. It handles the server, component lifecycle, and rendering. Key files are `server.ts` and `live-view.ts`.
- `@livets/client`: The client-side package that establishes a WebSocket connection with the server and applies DOM patches. The main logic is in `connector.ts`.
- `@livets/rust-core`: A high-performance Rust-based N-API module for CPU-intensive tasks like DOM diffing. The core logic is in `src/lib.rs` and `src/differ.rs`.

The general data flow is:

1.  The client connects to the server via WebSockets.
2.  User events are sent from the client to the server.
3.  The server-side LiveView component handles the event and updates its state.
4.  The new state is rendered into an HTML string.
5.  The Rust core (`@livets/rust-core`) diffs the new HTML with the previous version and creates a set of patches.
6.  The patches are sent to the client, which then efficiently updates the DOM.

## Developer Workflows

### Build

To build the entire project, run the following command from the root directory:

```bash
npm run build
```

This command builds the packages in the correct order: `rust-core`, `core`, and then `client`.

### Testing

The project has Rust unit tests. To run them, use:

```bash
npm run test:rust
```

This command executes `cargo test` within the `packages/rust-core` directory.

### Development

To run the simple counter example for development:

```bash
npm run dev
```

This will build the project and start the development server for the `counter-simple` example.

## Code Conventions

### LiveView Components

LiveView components are the core building block of a LiveTS application. They are classes that extend `LiveView` from `@livets/core`.

- **State Management**: Component state is managed through class properties.
- **Event Handling**: Methods decorated with `@on` handle events from the client. For example, in `examples/counter-simple/src/counter-component.ts`:

  ```typescript
  @on("inc")
  inc() {
      this.count++;
  }
  ```

- **Rendering**: The `render` method is responsible for generating the HTML for the component.

### Rust and N-API

The Rust code in `@livets/rust-core` is integrated with Node.js using `napi-rs`. When working with the Rust code, be mindful of the types shared between Rust and Node.js, defined in `packages/rust-core/src/types.rs`. Any changes to the Rust code require a rebuild of the `rust-core` package.
