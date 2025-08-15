# LiveTS Syntax Highlighting

A Visual Studio Code extension that provides syntax highlighting for HTML within LiveTS/LiveView components. This extension enhances the development experience by properly highlighting HTML content in TypeScript template literals tagged with `html`.

## Features

✨ **HTML Syntax Highlighting** - Full HTML syntax highlighting within `html\`...\``template literals  
🎯 **LiveTS Event Attributes** - Special highlighting for`ts-on:_`event binding attributes  
🔧 **Template Interpolation** - Proper TypeScript expression highlighting within`${...}` 
📊 **Data Attributes** - Recognition of LiveTS-specific`data-ts-_` attributes  
🎨 **CSS Class Support** - Enhanced highlighting for dynamic class expressions

### Syntax Patterns Supported

- `html\`<div>...</div>\`` - HTML template literals
- `ts-on:click="handlerName"` - LiveTS event bindings
- `${variable}` - Template interpolation expressions
- `data-ts-sel`, `data-ts-*` - LiveTS data attributes
- `class="${dynamicClasses}"` - Dynamic class expressions

## Installation

1. Open Visual Studio Code
2. Press `Ctrl+P` / `Cmd+P` to open Quick Open
3. Type `ext install livets.livets-syntax-highlighting`
4. Press Enter

Or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=livets.livets-syntax-highlighting).

## Usage

The extension automatically activates when you open TypeScript files (`.ts` or `.tsx`) and will highlight HTML content within LiveTS components:

```typescript
import { LiveView, html, classNames } from '@livets/core';

export class MyComponent extends LiveView {
  render(): string {
    return html`
      <div class="container">
        <button ts-on:click="handleClick" class="${buttonClasses}" data-ts-sel="my-button">
          Click me: ${this.state.count}
        </button>
      </div>
    `;
  }
}
```

## Requirements

- Visual Studio Code 1.103.0 or higher
- TypeScript files using LiveTS framework

## No Configuration Required

This extension works out of the box with no additional configuration needed. It uses TextMate grammar injection to automatically detect and highlight LiveTS patterns in your TypeScript files.

## Supported File Types

- `.ts` - TypeScript files
- `.tsx` - TypeScript React files

## Known Limitations

- Currently focused on syntax highlighting; IntelliSense and autocomplete features are planned for future releases
- Nested template literals within expressions may have limited highlighting
- Complex template expressions might not be fully highlighted

## Roadmap

🚀 **Planned Features:**

- IntelliSense support for `ts-on:*` attributes
- Autocomplete for LiveTS event names
- Validation for event handler methods
- Snippets for common LiveTS patterns
- Go-to-definition for event handlers

## Contributing

Contributions are welcome! Please see the [LiveTS repository](https://github.com/magnusbag/livets) for contribution guidelines.

## Release Notes

### 0.0.1

- Initial release
- HTML syntax highlighting in `html\`...\`` template literals
- LiveTS event attribute highlighting (`ts-on:*`)
- Template interpolation highlighting (`${...}`)
- LiveTS data attribute recognition (`data-ts-*`)

## License

This extension is part of the LiveTS project and is licensed under the MIT License.

## Support

For issues and feature requests, please visit the [LiveTS GitHub repository](https://github.com/magnusbag/livets/issues).

**Happy coding with LiveTS! 🚀**
