/**
 * Component rendering utilities for LiveTS
 */

import { LiveView } from './live-view';
import type { ComponentProps, RenderOptions } from './types';

export class ComponentRenderer {
  /**
   * Renders a component to an HTML string
   */
  static async renderToString<T extends LiveView>(
    ComponentClass: new (props?: ComponentProps) => T,
    props?: ComponentProps
  ): Promise<string> {
    const component = new ComponentClass(props);

    try {
      await component._mount();
      return component._render();
    } finally {
      await component._unmount();
    }
  }

  /**
   * Renders a component with layout wrapper
   */
  static async renderWithLayout<T extends LiveView>(
    ComponentClass: new (props?: ComponentProps) => T,
    props?: ComponentProps,
    options?: RenderOptions
  ): Promise<string> {
    const componentHtml = await this.renderToString(ComponentClass, props);
    return this.wrapInLayout(componentHtml, options);
  }

  /**
   * Hydrates a component for client-side interactivity
   */
  static async hydrateComponent<T extends LiveView>(
    component: T,
    connection_id: string
  ): Promise<void> {
    if (!component.isMounted()) {
      await component._mount();
    }

    // Associate component with connection
    // TODO: Register with Rust core engine
    console.log(
      `Hydrating component ${component.getComponentId()} with connection ${connection_id}`
    );
  }

  /**
   * Wraps HTML content in a full page layout
   */
  private static wrapInLayout(html: string, options?: RenderOptions): string {
    const title = options?.title ?? 'LiveTS App';
    const meta = options?.meta ?? {};
    const scripts = options?.scripts ?? [];
    const styles = options?.styles ?? [];

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
}
