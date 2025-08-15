/**
 * LiveTS Syntax Highlighting Extension
 *
 * Provides syntax highlighting for HTML within LiveTS/LiveView components
 * including template literals with html`` tags and LiveTS-specific attributes.
 */
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('LiveTS Syntax Highlighting extension is now active!');

  // Register completion provider for LiveTS event attributes
  const liveEventCompletionProvider = vscode.languages.registerCompletionItemProvider(
    ['typescript', 'typescriptreact'],
    new LiveTSEventCompletionProvider(),
    ':'
  );

  // Register completion provider for event handler functions
  const handlerCompletionProvider = vscode.languages.registerCompletionItemProvider(
    ['typescript', 'typescriptreact'],
    new LiveTSHandlerCompletionProvider(),
    '"',
    "'"
  );

  // Register hover provider for LiveTS attributes
  const hoverProvider = vscode.languages.registerHoverProvider(
    ['typescript', 'typescriptreact'],
    new LiveTSHoverProvider()
  );

  context.subscriptions.push(liveEventCompletionProvider, handlerCompletionProvider, hoverProvider);
}

/**
 * Provides autocomplete for ts-on: event types
 */
class LiveTSEventCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const lineText = document.lineAt(position).text;
    const beforeCursor = lineText.substring(0, position.character);

    // Check if we're in an HTML template and after ts-on:
    if (!this.isInHtmlTemplate(document, position) || !beforeCursor.includes('ts-on:')) {
      return undefined;
    }

    // Check if we're right after ts-on:
    const tsOnMatch = beforeCursor.match(/ts-on:$/);
    if (!tsOnMatch) {
      return undefined;
    }

    return this.getEventCompletions();
  }

  private isInHtmlTemplate(document: vscode.TextDocument, position: vscode.Position): boolean {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find the nearest html` before our position
    const beforeText = text.substring(0, offset);
    const lastHtmlStart = beforeText.lastIndexOf('html`');

    if (lastHtmlStart === -1) {
      return false;
    }

    // Check if there's a closing ` after our position that belongs to this template
    const afterText = text.substring(offset);
    const nextBacktick = afterText.indexOf('`');

    return nextBacktick !== -1;
  }

  private getEventCompletions(): vscode.CompletionItem[] {
    const events = [
      'click',
      'dblclick',
      'mousedown',
      'mouseup',
      'mouseover',
      'mouseout',
      'mousemove',
      'keydown',
      'keyup',
      'keypress',
      'focus',
      'blur',
      'change',
      'input',
      'submit',
      'reset',
      'load',
      'resize',
      'scroll',
      'touchstart',
      'touchmove',
      'touchend'
    ];

    return events.map(event => {
      const item = new vscode.CompletionItem(event, vscode.CompletionItemKind.Event);
      item.detail = `LiveTS Event: ts-on:${event}`;
      item.documentation = new vscode.MarkdownString(`Bind to the \`${event}\` event`);
      item.insertText = `${event}="`;
      return item;
    });
  }
}

/**
 * Provides autocomplete for event handler function names
 */
class LiveTSHandlerCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const lineText = document.lineAt(position).text;
    const beforeCursor = lineText.substring(0, position.character);

    // Check if we're inside a ts-on attribute value
    const tsOnMatch = beforeCursor.match(/ts-on:\w+=(["'])[^"']*$/);
    if (!tsOnMatch || !this.isInHtmlTemplate(document, position)) {
      return undefined;
    }

    // Get all methods from the current class that could be event handlers
    return this.getHandlerCompletions(document);
  }

  private isInHtmlTemplate(document: vscode.TextDocument, position: vscode.Position): boolean {
    const text = document.getText();
    const offset = document.offsetAt(position);

    const beforeText = text.substring(0, offset);
    const lastHtmlStart = beforeText.lastIndexOf('html`');

    if (lastHtmlStart === -1) {
      return false;
    }

    const afterText = text.substring(offset);
    const nextBacktick = afterText.indexOf('`');

    return nextBacktick !== -1;
  }

  private getHandlerCompletions(document: vscode.TextDocument): vscode.CompletionItem[] {
    const text = document.getText();
    const methodRegex = /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm;
    const methods: vscode.CompletionItem[] = [];

    let match;
    while ((match = methodRegex.exec(text)) !== null) {
      const methodName = match[2];

      // Skip constructor and lifecycle methods
      if (
        methodName === 'constructor' ||
        methodName === 'render' ||
        methodName === 'mount' ||
        methodName === 'unmount' ||
        methodName === 'updated'
      ) {
        continue;
      }

      const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Method);
      item.detail = 'Event Handler Method';
      item.documentation = new vscode.MarkdownString(
        `Call the \`${methodName}\` method when the event occurs`
      );
      item.insertText = methodName;
      methods.push(item);
    }

    return methods;
  }
}

/**
 * Provides hover information for LiveTS attributes
 */
class LiveTSHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const range = document.getWordRangeAtPosition(position, /ts-on:\w+/);
    if (!range) {
      return undefined;
    }

    const word = document.getText(range);
    const eventType = word.split(':')[1];

    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**LiveTS Event Binding**\n\n`);
    markdown.appendMarkdown(`Binds to the \`${eventType}\` event.\n\n`);
    markdown.appendMarkdown(`**Usage:** \`ts-on:${eventType}="handlerMethod"\`\n\n`);
    markdown.appendMarkdown(
      `The handler method will be called when the ${eventType} event occurs.`
    );

    return new vscode.Hover(markdown, range);
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
