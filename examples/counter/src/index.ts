import { Hono } from 'hono';
import { LiveTSServer } from '@livets/core';
import { CounterComponent } from './counter-component';
import { serve } from '@hono/node-server';

// Create your own Hono app
const app = new Hono();
// Create LiveTSServer with your Hono app
const server = new LiveTSServer({ app });

// Add your custom routes
app.get('/api/status', c => {
  return c.json({ status: 'ok', framework: 'LiveTS', example: 'simple' });
});

// Register LiveTS components
server.registerComponent('/', CounterComponent, {
  styles: ['https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css']
});

// Start the Hono server
serve({
  fetch: app.fetch,
  port: 3000,
  hostname: 'localhost'
});

console.log('🚀 Simple counter running on http://localhost:3000');
