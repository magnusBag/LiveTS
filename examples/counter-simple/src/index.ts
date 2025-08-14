import { LiveTSServer } from '@livets/core';
import { CounterComponent } from './counter-component';

// Create server - much simpler setup
const server = new LiveTSServer({ port: 3000 });

// Register components
server.registerComponent('/', CounterComponent);

// Add custom API route to the Hono app
server.getApp().get('/api/status', c => {
  return c.json({ status: 'ok', framework: 'LiveTS', example: 'simple' });
});

// Start server (single line!)
server.start().then(() => {
  console.log('🚀 Simple counter running on http://localhost:3000');
});
