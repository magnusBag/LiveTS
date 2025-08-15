# Change Log

All notable changes to the "LiveTS Syntax Highlighting" extension will be documented in this file.

## [0.0.1] - 2024-08-16

### Added

- Initial release of LiveTS Syntax Highlighting extension
- HTML syntax highlighting within `html\`...\`` template literals
- Enhanced LiveTS event attribute highlighting for `ts-on:*` attributes
- Improved highlighting for quoted function names in event handlers
- Template interpolation highlighting for `${...}` expressions
- Recognition of LiveTS-specific `data-ts-*` attributes
- Enhanced highlighting for dynamic class expressions
- Grammar injection for TypeScript and TypeScript React files

### IntelliSense Features

- **Event Type Autocomplete**: Type `ts-on:` and get suggestions for event types (click, input, focus, etc.)
- **Handler Function Autocomplete**: Type quotes after `ts-on:eventName="` and get function suggestions from your class
- **Hover Information**: Hover over `ts-on:*` attributes to see event binding documentation
- **Method Detection**: Automatically detects event handler methods in LiveView classes
- **Context-Aware**: Only activates within `html\`...\`` template literals

### Enhanced Highlighting

- **Function Names**: Better highlighting for quoted function names (e.g., `"reset"`, `"handleClick"`)
- **Event Attributes**: Improved color coding for `ts-on:*` event bindings
- **Data Attributes**: Enhanced recognition of `data-ts-*` attributes
- **Template Literals**: Better syntax boundaries and nesting support

### Features

- TextMate grammar-based syntax highlighting
- IntelliSense completion providers
- Hover documentation
- Zero configuration required
- Automatic activation on TypeScript files
- Support for complex nested HTML structures within template literals

### Supported Patterns

- `html\`<div>...</div>\`` - HTML template literals
- `ts-on:click="handlerName"` - LiveTS event bindings with function highlighting
- `${variable}` - Template interpolation expressions
- `data-ts-sel`, `data-ts-*` - LiveTS data attributes
- `class="${dynamicClasses}"` - Dynamic class expressions

### Supported Events

- Mouse events: `click`, `dblclick`, `mousedown`, `mouseup`, `mouseover`, `mouseout`, `mousemove`
- Keyboard events: `keydown`, `keyup`, `keypress`
- Form events: `focus`, `blur`, `change`, `input`, `submit`, `reset`
- Page events: `load`, `resize`, `scroll`
- Touch events: `touchstart`, `touchmove`, `touchend`
