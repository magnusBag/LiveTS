# LiveTS VSCode Extension Features

## 🎨 Enhanced Syntax Highlighting

### Before vs After

**Before Enhancement:**

```typescript
ts-on:click="reset"  // Basic string highlighting
```

**After Enhancement:**

```typescript
ts-on:click="reset"  // 'ts-on:click' highlighted as event attribute, 'reset' highlighted as function
```

### Improved Function Name Highlighting

The extension now provides enhanced highlighting for quoted function names in `ts-on:*` attributes:

- **Event Attribute**: `ts-on:click` gets special highlighting as a LiveTS event binding
- **Function Name**: `"reset"` gets highlighted as a function reference
- **Quotes**: Proper punctuation highlighting for string delimiters

## 🧠 IntelliSense Features

### 1. Event Type Autocomplete

When you type `ts-on:` in an HTML template, you'll get autocomplete suggestions for event types:

```typescript
return html`
  <button ts-on:  // <- Type here and get suggestions
    click        // ✓ Mouse event
    input        // ✓ Form event  
    focus        // ✓ Focus event
    keydown      // ✓ Keyboard event
    touchstart   // ✓ Touch event
    // ... and more
  >
`;
```

**Supported Event Categories:**

- **Mouse Events**: `click`, `dblclick`, `mousedown`, `mouseup`, `mouseover`, `mouseout`, `mousemove`
- **Keyboard Events**: `keydown`, `keyup`, `keypress`
- **Form Events**: `focus`, `blur`, `change`, `input`, `submit`, `reset`
- **Page Events**: `load`, `resize`, `scroll`
- **Touch Events**: `touchstart`, `touchmove`, `touchend`

### 2. Handler Function Autocomplete

When you type quotes after an event attribute, you get suggestions for methods in your class:

```typescript
export class MyComponent extends LiveView {
  render() {
    return html`
      <button
        ts-on:click="  // <- Type here and get your method suggestions
        increment            // ✓ Available method
        decrement           // ✓ Available method
        reset               // ✓ Available method
        handleClick         // ✓ Available method
        // constructor       // ✗ Excluded (lifecycle method)
        // render            // ✗ Excluded (lifecycle method)
      "
      ></button>
    `;
  }

  increment(): void {
    /* ... */
  } // ← Will appear in suggestions
  decrement(): void {
    /* ... */
  } // ← Will appear in suggestions
  reset(): void {
    /* ... */
  } // ← Will appear in suggestions
  handleClick(): void {
    /* ... */
  } // ← Will appear in suggestions
}
```

**Smart Filtering:**

- ✅ Includes all custom methods
- ❌ Excludes lifecycle methods (`constructor`, `render`, `mount`, `unmount`, `updated`)
- ✅ Works with both sync and async methods
- ✅ Detects method names using regex pattern matching

### 3. Hover Documentation

Hover over any `ts-on:*` attribute to see documentation:

```typescript
ts-on:click  // <- Hover here
```

**Shows:**

- **LiveTS Event Binding** header
- Event type description
- Usage example
- Behavior explanation

## 🎯 Context-Aware Features

### Template Detection

All IntelliSense features are **context-aware** and only activate when you're inside an `html\`...\`` template literal:

```typescript
// ✅ IntelliSense works here
return html` <button ts-on:click="reset">// <- Autocomplete active</button> `;

// ❌ IntelliSense doesn't interfere here
const regularString = `
  <button ts-on:click="reset">  // <- No autocomplete (not an html template)
`;
```

### Intelligent Positioning

The extension detects exactly where you are in the template:

- **After `ts-on:`** → Shows event type suggestions
- **Inside quotes after event** → Shows function name suggestions
- **Outside templates** → No interference with regular TypeScript

## 🎨 Visual Improvements

### Color Coding

Different elements get distinct highlighting:

```typescript
return html`
  <button 
    ts-on:click="handleClick"     // 'ts-on:click' = event attribute color
                                  // 'handleClick' = function color
    class="${buttonClass}"        // Template interpolation color
    data-ts-sel="my-button"       // LiveTS data attribute color
  >
    Click me: ${count}            // Template expression color
  </button>
`;
```

### Syntax Boundaries

Clear visual boundaries between:

- HTML content
- Template interpolations `${...}`
- Event attributes `ts-on:*`
- Data attributes `data-ts-*`
- Regular HTML attributes

## 🚀 Performance

### Efficient Processing

- **Grammar Injection**: Uses VSCode's native TextMate grammar system
- **Lazy Activation**: Only processes files when needed
- **Smart Caching**: Reuses parsed method lists
- **Minimal Overhead**: Lightweight completion providers

### File Type Detection

Automatically activates for:

- `.ts` files containing LiveView components
- `.tsx` files with LiveTS usage
- Files importing from `@livets/core`

## 📝 Usage Examples

### Basic Event Handling

```typescript
export class CounterComponent extends LiveView {
  render() {
    return html`
      <button ts-on:click="increment">+1</button>
      <!--     ^^^^^^^     ^^^^^^^^^
               Event       Function (both highlighted)
               type        name
      -->
    `;
  }

  increment(): void {
    // ← Shows in autocomplete
    // Implementation
  }
}
```

### Multiple Events

```typescript
return html`
  <input 
    ts-on:input="handleInput"      // ← Input event
    ts-on:focus="handleFocus"      // ← Focus event  
    ts-on:blur="handleBlur"        // ← Blur event
    ts-on:keydown="handleKeyDown"  // ← Keyboard event
  />
`;
```

### Advanced Event Handling

```typescript
return html`
  <button
    ts-on:click="handleClick"           // ← Primary action
    ts-on:dblclick="handleDoubleClick"  // ← Double-click action
    ts-on:contextmenu="showMenu"        // ← Right-click menu
    ts-on:mouseenter="highlightButton"  // ← Hover effects
    ts-on:mouseleave="unhighlight"      // ← Unhover effects
  >
    Advanced Button
  </button>
`;
```

This enhanced extension provides a significantly improved developer experience for working with LiveTS components, making HTML templates feel like first-class citizens in TypeScript files with full IDE support!
