import { LiveTSServer } from '@livets/core';
import type { Context, Next } from 'hono';
import { CounterComponent } from './counter-component';

// Create server
const server = new LiveTSServer({ port: 3000 });

// Example 1: Simple registration (backward compatible)
server.registerComponent('/', CounterComponent);

// Example 2: Advanced registration with middleware
server.registerAdvancedComponent((app, componentHandler) => {
  // Add authentication middleware
  const authMiddleware = async (c: Context, next: Next) => {
    const token = c.req.header('authorization');
    if (!token) {
      return c.text('Unauthorized', 401);
    }
    console.log('Auth check passed for:', c.req.path);
    return await next();
  };

  // Add logging middleware
  const loggingMiddleware = async (c: Context, next: Next) => {
    const start = Date.now();
    const result = await next();
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} - ${duration}ms`);
    return result;
  };

  // Register the route with middleware
  app.get(
    '/protected',
    authMiddleware,
    loggingMiddleware,
    componentHandler({
      ComponentClass: CounterComponent,
      renderOptions: {
        title: 'Protected Counter',
        meta: { description: 'A protected counter with authentication' }
      }
    })
  );
});

// Example 3: Multiple HTTP methods with different middleware
server.registerAdvancedComponent((app, componentHandler) => {
  // CORS middleware for this specific route
  const corsMiddleware = async (c: Context, next: Next) => {
    c.header('Access-Control-Allow-Origin', 'https://trusted-domain.com');
    return await next();
  };

  // Rate limiting middleware
  const rateLimitMiddleware = async (c: Context, next: Next) => {
    // Simple in-memory rate limiting (use Redis in production)
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    console.log(`Rate limit check for IP: ${ip}`);
    return await next();
  };

  // Handle both GET and POST for the same component
  app.get(
    '/api-counter',
    corsMiddleware,
    rateLimitMiddleware,
    componentHandler({
      ComponentClass: CounterComponent,
      renderOptions: {
        title: 'API Counter',
        scripts: ['/js/api-helpers.js']
      }
    })
  );

  app.post(
    '/api-counter',
    corsMiddleware,
    rateLimitMiddleware,
    componentHandler({
      ComponentClass: CounterComponent,
      renderOptions: {
        title: 'API Counter (POST)',
        styles: ['/css/post-styles.css']
      }
    })
  );
});

// Example 4: Route with parameters and custom validation
server.registerAdvancedComponent((app, componentHandler) => {
  const validateUserParam = async (c: Context, next: Next) => {
    const userId = c.req.param('userId');
    if (!userId || !/^\d+$/.test(userId)) {
      return c.text('Invalid user ID', 400);
    }
    return await next();
  };

  app.get(
    '/user/:userId/counter',
    validateUserParam,
    componentHandler({
      ComponentClass: CounterComponent,
      renderOptions: {
        title: 'User Counter',
        meta: {
          description: 'User-specific counter',
          'user-id': '{{userId}}'
        }
      }
    })
  );
});

// Example 5: Route groups with shared middleware
server.registerAdvancedComponent((app, componentHandler) => {
  // Create a route group with shared admin middleware
  const adminAuth = async (c: Context, next: Next) => {
    const role = c.req.header('x-user-role');
    if (role !== 'admin') {
      return c.text('Admin access required', 403);
    }
    return await next();
  };

  const auditLogging = async (c: Context, next: Next) => {
    console.log(`Admin action: ${c.req.method} ${c.req.path} at ${new Date().toISOString()}`);
    return await next();
  };

  // All admin routes will have both middleware
  app.get(
    '/admin/counter',
    adminAuth,
    auditLogging,
    componentHandler({
      ComponentClass: CounterComponent,
      renderOptions: {
        title: 'Admin Counter',
        styles: ['/css/admin.css'],
        scripts: ['/js/admin-tools.js']
      }
    })
  );

  app.get(
    '/admin/stats',
    adminAuth,
    auditLogging,
    componentHandler({
      ComponentClass: CounterComponent,
      renderOptions: {
        title: 'Admin Stats',
        meta: { section: 'admin-dashboard' }
      }
    })
  );
});

// Start server
server.start().then(() => {
  console.log('🚀 Advanced counter examples running on http://localhost:3000');
  console.log('📚 Available routes:');
  console.log('  GET  /                    - Simple counter');
  console.log('  GET  /protected           - Protected counter (needs auth header)');
  console.log('  GET  /api-counter         - API counter with CORS and rate limiting');
  console.log('  POST /api-counter         - POST version of API counter');
  console.log('  GET  /user/:userId/counter - User-specific counter');
  console.log('  GET  /admin/counter       - Admin counter (needs admin role)');
  console.log('  GET  /admin/stats         - Admin stats (needs admin role)');
});
