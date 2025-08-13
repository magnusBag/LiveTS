/**
 * Counter Example - Demonstrates LiveTS functionality
 */

import { LiveTSServer } from '@livets/core';
import { CounterComponent } from './counter-component';

async function main(): Promise<void> {
  console.log('Starting LiveTS Counter Example...');

  // Create the LiveTS server
  const server = new LiveTSServer({
    port: 3000,
    host: 'localhost',
    cors: true,
    static: {
      root: './public',
      prefix: '/static'
    }
  });

  // Register the counter component
  server.registerComponent('/', CounterComponent, {
    title: 'LiveTS Counter Example',
    meta: {
      description: 'A simple counter built with LiveTS framework',
      viewport: 'width=device-width, initial-scale=1.0'
    },
    scripts: ['https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4']
  });

  // Start the server
  try {
    await server.listen();
    console.log('✨ Server is ready!');
    console.log('🌐 Open http://localhost:3000 to see the counter');
    console.log('🔧 WebSocket server running on ws://localhost:3001');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Shutting down server...');
    await server.close();
    console.log('✅ Server closed');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\\n🛑 Shutting down server...');
    await server.close();
    console.log('✅ Server closed');
    process.exit(0);
  });
}

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
