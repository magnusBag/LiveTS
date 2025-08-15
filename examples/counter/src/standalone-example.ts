import { LiveTSServer } from '@livets/core';
import { CounterComponent } from './counter-component';

// Create server using the traditional way (LiveTSServer manages the Hono app)
const server = new LiveTSServer({ port: 3000 });

// Register components
server.registerComponent('/', CounterComponent);

// Add custom API route to the internal Hono app
server.getApp().get('/api/status', c => {
  return c.json({ status: 'ok', framework: 'LiveTS', example: 'standalone' });
});

// Start server using LiveTSServer (backward compatibility)
server.start().then(() => {
  console.log('🚀 Standalone counter running on http://localhost:3000');
});
