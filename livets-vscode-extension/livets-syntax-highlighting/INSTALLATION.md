# Installation Guide

## Quick Installation

The extension package `livets-syntax-highlighting-0.0.1.vsix` has been created and is ready for testing!

### Install from VSIX file

1. Open Visual Studio Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) to open the Command Palette
3. Type "Extensions: Install from VSIX..."
4. Select the command and choose the `livets-syntax-highlighting-0.0.1.vsix` file
5. Restart VS Code when prompted

### Test the Extension

1. Open or create a TypeScript file (`.ts` or `.tsx`)
2. Add some LiveTS component code like:

```typescript
import { LiveView, html } from '@livets/core';

export class TestComponent extends LiveView {
  render(): string {
    return html\`
      <div class="container">
        <button ts-on:click="handleClick" class="\${buttonClass}">
          Click me: \${this.state.count}
        </button>
      </div>
    \`;
  }
}
```

3. You should see:
   - HTML syntax highlighting within the \`html\`...\`\` template
   - Special highlighting for \`ts-on:click\` attributes
   - TypeScript expression highlighting within \`\${...}\`

### Troubleshooting

If syntax highlighting doesn't appear:

1. Ensure the file has a `.ts` or `.tsx` extension
2. Check that the template literal is tagged with `html`
3. Try reloading the VS Code window (`Cmd+R` / `Ctrl+R`)

### Future Publishing

To publish this extension to the VS Code Marketplace:

1. Create a Visual Studio Marketplace publisher account
2. Get a Personal Access Token from Azure DevOps
3. Login with vsce: `npx @vscode/vsce login <publisher-name>`
4. Publish: `npx @vscode/vsce publish`

For more details, see the [VS Code Extension Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
