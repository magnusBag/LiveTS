# LiveTS

A modern, performant, and developer-friendly library for building real-time, server-rendered web applications with TypeScript, inspired by Phoenix LiveView and Blazor Server.

## 🚀 Features

- **TypeScript First API** - Fully-typed developer experience
- **High-Performance Rust Core** - Native addon for elite speed and memory safety
- **Minimal Client-Side JS** - Thin, generic browser runtime (~5KB)
- **Declarative HTML Syntax** - Alpine.js-inspired `ts-*` directives
- **Real-time Updates** - WebSocket-based state synchronization
- **Pub/Sub Messaging** - Built-in real-time communication system

## 🏗️ Architecture

LiveTS uses a hybrid architecture combining the best of both worlds:

- **Rust Core Engine** - Handles WebSocket connections, HTML diffing, and event routing
- **TypeScript API Layer** - Clean, functional developer interface
- **Client Connector** - Minimal JavaScript for DOM patching and event delegation

## 📦 Packages

- `@livets/core` - Main TypeScript API and server framework
- `@livets/rust-core` - High-performance Rust engine (native addon)
- `@livets/client` - Browser-side connector library

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+ 
- Rust 1.70+
- uv (Python package manager - for any Python tooling)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/livets.git
cd livets

# Install dependencies
npm install

# Build all packages
npm run setup
```

### Development

```bash
# Start development environment
npm run dev

# Or use the script directly
./scripts/dev.sh
```

This will:
- Start TypeScript compilation in watch mode
- Start client build in watch mode  
- Run the counter example at http://localhost:3000
- WebSocket server runs on ws://localhost:3001

### Building

```bash
# Build all packages
npm run build

# Or use the script directly
./scripts/build.sh
```

## 📖 Quick Start

### 1. Create a LiveView Component

```typescript
import { LiveView, html, classNames } from '@livets/core';

interface CounterState {
  count: number;
}

export class CounterComponent extends LiveView {
  protected state: CounterState = { count: 0 };

  async mount(): Promise<void> {
    this.setState({ count: 0 });
  }

  render(): string {
    const { count } = this.state;
    
    return html\`
      <div class="counter">
        <h1>Count: \${count}</h1>
        <button ts-on:click="increment">+</button>
        <button ts-on:click="decrement">-</button>
      </div>
    \`;
  }

  increment(): void {
    this.setState({ count: this.state.count + 1 });
  }

  decrement(): void {
    this.setState({ count: this.state.count - 1 });
  }
}
```

### 2. Set up the Server

```typescript
import { LiveTSServer } from '@livets/core';
import { CounterComponent } from './counter-component';

const server = new LiveTSServer({
  port: 3000,
  static: { root: './public' }
});

server.registerComponent('/', CounterComponent, {
  title: 'My Counter App',
  styles: ['https://cdn.tailwindcss.com']
});

await server.listen();
```

### 3. Add Interactivity with Directives

```html
<!-- Event handling -->
<button ts-on:click="save">Save</button>
<form ts-on:submit.prevent="handleSubmit">...</form>

<!-- Data binding -->
<input ts-model="form.username" />

<!-- Conditional rendering -->
<div ts-if="isLoggedIn">Welcome!</div>

<!-- Dynamic classes -->
<div ts-class="{ 'bg-red-500': hasError }">...</div>
```

## 🧪 Examples

### Counter App
Simple interactive counter demonstrating basic LiveView concepts.

```bash
cd examples/counter
npm run dev
```

Visit http://localhost:3000 to see it in action.

### Planned Examples
- **Todo App** - Real-time collaborative todo list
- **Chat App** - Multi-user chat with pub/sub
- **Dashboard** - Live updating metrics dashboard

## 🎯 Development Phases

### ✅ Phase 1: Foundation (Current)
- Basic WebSocket connection management
- Component lifecycle and rendering
- Simple event handling
- Client-side connector

### 🚧 Phase 2: Core Features (Next)
- Advanced HTML diffing algorithm
- Optimized DOM patching
- Enhanced event system
- Error handling and recovery

### 📋 Phase 3: Interactivity (Planned)
- Complete directive system (`ts-*`)
- Form handling and validation
- Component communication
- Advanced state management

### 🎨 Phase 4: Production Ready (Future)
- Pub/sub messaging system
- Performance optimizations
- CLI tooling and scaffolding
- Comprehensive documentation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Code Style

- Pure functional functions preferred
- Avoid deep nesting, use early returns
- Follow TypeScript strict mode
- Use descriptive variable names

### Project Structure

```
livets/
├── packages/
│   ├── core/           # TypeScript API
│   ├── rust-core/      # Rust native addon  
│   └── client/         # Browser connector
├── examples/           # Example applications
├── tools/              # CLI and build tools
├── docs/               # Documentation
└── scripts/            # Development scripts
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- [Architecture Documentation](./architecture.md)
- [Project Plan](./projectPlan.md)
- [API Reference](./docs/api.md) (coming soon)
- [Examples](./examples/)

---

**LiveTS** - Real-time web applications with TypeScript and Rust 🚀