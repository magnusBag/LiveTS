// Import from the core package
import { LiveView } from '@livets/core';
import type { ComponentProps, RenderOptions } from '@livets/core';

// Import Hono
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { serve } from '@hono/node-server';

import { CounterComponent } from './counter-component';

// Simple helper to create a component handler
function component<T extends LiveView>(
  ComponentClass: new (props?: ComponentProps) => T,
  options?: RenderOptions
) {
  return async (c: Context): Promise<Response> => {
    try {
      const props = extractPropsFromContext(c);
      const comp = new ComponentClass(props);

      await comp._mount();

      const html = comp._render();
      const fullHtml = wrapInLayout(html, options || {});

      return c.html(fullHtml);
    } catch (error) {
      console.error(`Error rendering component for ${c.req.path}:`, error);
      return c.text('Internal Server Error', 500 as any);
    }
  };
}

// Helper functions
function extractPropsFromContext(c: Context): ComponentProps {
  try {
    const query = c.req.query() || {};
    return { ...query };
  } catch {
    return {};
  }
}

function wrapInLayout(html: string, options: RenderOptions): string {
  const title = options.title ?? 'LiveTS App';
  const meta = options.meta ?? {};
  const scripts = options.scripts ?? [];
  const styles = options.styles ?? [];

  const metaTags = Object.entries(meta)
    .map(([key, value]) => `<meta name="${key}" content="${value}">`)
    .join('\n    ');

  const styleTags = styles.map(href => `<link rel="stylesheet" href="${href}">`).join('\n    ');
  const scriptTags = scripts.map(src => `<script src="${src}"></script>`).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${metaTags}
    ${styleTags}
</head>
<body>
    <div data-livets-root>
        ${html}
    </div>
    <script src="/livets/connector.js"></script>
    ${scriptTags}
</body>
</html>`;
}

// Create server - this is the clean API you wanted!
const server = new Hono();

// Add a simple start method
(server as any).start = async function (port: number = 3000) {
  return new Promise(resolve => {
    const serverInstance = serve({
      fetch: server.fetch,
      port,
      hostname: 'localhost'
    });

    console.log(`🚀 LiveTS server running on http://localhost:${port}`);
    resolve(undefined);
  });
};

// Middleware functions
const authMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header('authorization');
  if (!token) {
    return c.text('Unauthorized', 401);
  }
  console.log('Auth check passed for:', c.req.path);
  return await next();
};

const loggingMiddleware = async (c: Context, next: Next) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} - ${duration}ms`);
  return result;
};

// Apply global middleware
server.use('/admin/*', authMiddleware);
server.use('*', loggingMiddleware);

// Define routes - clean and simple!
server.get('/', component(CounterComponent));

server.get(
  '/protected',
  authMiddleware,
  component(CounterComponent, {
    title: 'Protected Counter',
    meta: { description: 'A protected counter with authentication' }
  })
);

// Multiple middleware on routes
server.get(
  '/api-counter',
  async (c: Context, next: Next) => {
    c.header('Access-Control-Allow-Origin', 'https://trusted-domain.com');
    return await next();
  },
  component(CounterComponent, {
    title: 'API Counter',
    scripts: ['/js/api-helpers.js']
  })
);

// Route with validation
server.get(
  '/user/:userId/counter',
  async (c: Context, next: Next) => {
    const userId = c.req.param('userId');
    if (!userId || !/^\d+$/.test(userId)) {
      return c.text('Invalid user ID', 400);
    }
    return await next();
  },
  component(CounterComponent, {
    title: 'User Counter'
  })
);

// Admin routes
server.get(
  '/admin/counter',
  component(CounterComponent, {
    title: 'Admin Counter',
    styles: ['/css/admin.css']
  })
);

// Regular Hono API routes work too
server.get('/api/status', (c: Context) => {
  return c.json({
    status: 'ok',
    framework: 'LiveTS + Hono'
  });
});

// Start server - exactly like your desired API!
(server as any).start().then(() => {
  console.log('🚀 LiveTS server running on http://localhost:3000');
  console.log('📚 Routes:');
  console.log('  GET  /                    - Simple counter');
  console.log('  GET  /protected           - Protected counter');
  console.log('  GET  /api-counter         - API counter with CORS');
  console.log('  GET  /user/:userId/counter - User-specific counter');
  console.log('  GET  /admin/counter       - Admin counter');
  console.log('  GET  /api/status          - JSON API');
});

export default server;
