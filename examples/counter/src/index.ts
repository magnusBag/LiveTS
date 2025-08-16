import { Context, Hono } from 'hono';
import { LiveTSServer } from '@magnusbag/livets-core';
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

// Simple route
server.registerComponent('/', CounterComponent, {
  styles: ['https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css']
});

// Parameterized route - example of the new routing functionality
// Note: This demonstrates the routing API, but requires proper type builds to work without linting errors
server.registerComponent(
  '/:userId/:tab',
  (context: Context) => {
    const userId = context.req.param('userId');
    const tab = context.req.param('tab');

    // Create component with URL parameters as props
    return new CounterComponent({
      userId,
      tab,
      // You can extract other context info too
      title: `Counter for ${userId} (${tab})`
    });
  },
  {
    styles: ['https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css']
  }
);

// Start the Hono server
serve({
  fetch: app.fetch,
  port: 3000,
  hostname: 'localhost'
});

console.log('🚀 LiveTS counter example with routing:');
console.log('  - Simple route: http://localhost:3000/');
console.log('  - Parameterized route: http://localhost:3000/john/settings');
console.log('  - Parameterized route: http://localhost:3000/jane/dashboard');
