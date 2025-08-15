import { LiveView, html, classNames } from '@livets/core';

interface EnhancedState {
  count: number;
  step: number;
  message: string;
  theme: 'light' | 'dark';
}

/**
 * Enhanced LiveTS component showcasing improved syntax highlighting
 * and IntelliSense features for event handlers
 */
export class EnhancedComponent extends LiveView {
  protected state: EnhancedState = {
    count: 0,
    step: 1,
    message: 'Welcome to Enhanced LiveTS!',
    theme: 'light'
  };

  render(): string {
    const { count, step, message, theme } = this.state;
    const isPositive = count > 0;

    const counterClasses = classNames({
      'text-green-600': isPositive,
      'text-red-600': !isPositive,
      'font-bold': true,
      'text-3xl': true
    });

    const containerClasses = classNames({
      'max-w-md': true,
      'mx-auto': true,
      'p-8': true,
      'rounded-lg': true,
      'shadow-lg': true,
      'bg-white': theme === 'light',
      'bg-gray-800': theme === 'dark',
      'text-gray-900': theme === 'light',
      'text-white': theme === 'dark'
    });

    return html`
      <div class="${containerClasses}" data-ts-theme="${theme}">
        <h1 class="text-2xl font-bold text-center mb-6">Enhanced LiveTS Component</h1>

        <div class="mb-4 text-center">
          <p class="text-gray-600">${message}</p>
        </div>

        <!-- Counter Display with enhanced highlighting -->
        <div class="text-center mb-6">
          <div class="${counterClasses}" data-ts-sel="counter-display" data-ts-value="${count}">
            ${count}
          </div>
          <p class="text-sm mt-2 opacity-75">Current count</p>
        </div>

        <!-- Button controls with various event types -->
        <div class="flex gap-3 justify-center mb-6">
          <button
            ts-on:click="decrement"
            ts-on:mouseenter="highlightButton"
            ts-on:mouseleave="unhighlightButton"
            ts-on:focus="handleButtonFocus"
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            data-ts-sel="btn-decrement"
            data-ts-action="decrement"
          >
            -${step}
          </button>

          <button
            ts-on:click="increment"
            ts-on:dblclick="doubleIncrement"
            ts-on:contextmenu="showContextMenu"
            ts-on:keydown="handleButtonKeyDown"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            data-ts-sel="btn-increment"
            data-ts-action="increment"
          >
            +${step}
          </button>
        </div>

        <!-- Step size control -->
        <div class="mb-6">
          <label class="block text-sm font-medium mb-2"> Step size: ${step} </label>
          <input
            type="range"
            min="1"
            max="10"
            value="${step}"
            ts-on:input="setStep"
            ts-on:change="updateStepMessage"
            ts-on:focus="handleInputFocus"
            ts-on:blur="handleInputBlur"
            data-ts-control="step-slider"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <!-- Message input -->
        <div class="mb-6">
          <label class="block text-sm font-medium mb-2">Message:</label>
          <input
            type="text"
            value="${message}"
            ts-on:input="updateMessage"
            ts-on:keyup="handleMessageKeyUp"
            ts-on:keypress="handleMessageKeyPress"
            placeholder="Enter a message..."
            data-ts-input="message"
            class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <!-- Action buttons with various events -->
        <div class="flex gap-3 justify-center mb-4 flex-wrap">
          <button
            ts-on:click="reset"
            ts-on:mouseover="handleHover"
            ts-on:mouseout="handleMouseOut"
            class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            data-ts-sel="btn-reset"
          >
            Reset
          </button>

          <button
            ts-on:click="randomize"
            ts-on:touchstart="handleTouchStart"
            ts-on:touchend="handleTouchEnd"
            class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
            data-ts-sel="btn-random"
          >
            Random
          </button>

          <button
            ts-on:click="toggleTheme"
            ts-on:transitionend="handleTransitionEnd"
            class="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
            data-ts-theme="toggle"
          >
            Toggle Theme
          </button>
        </div>

        <!-- Form with submit handling -->
        <div class="text-center mb-4">
          <form
            ts-on:submit="handleFormSubmit"
            ts-on:reset="handleFormReset"
            class="inline-flex gap-2 items-center"
          >
            <input
              type="number"
              placeholder="Jump to..."
              ts-on:keydown="handleNumberKeyDown"
              ts-on:wheel="handleNumberWheel"
              data-ts-input="jump-number"
              class="px-2 py-1 border rounded w-24"
            />
            <button
              type="submit"
              ts-on:click="jumpToNumber"
              class="px-3 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600"
            >
              Jump
            </button>
            <button
              type="reset"
              ts-on:click="clearForm"
              class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Clear
            </button>
          </form>
        </div>

        <!-- Status display -->
        <div
          class="mt-6 text-center text-sm opacity-75"
          data-ts-status="info"
          ts-on:click="showStatus"
        >
          Count is ${isPositive ? 'positive' : 'negative or zero'}
        </div>

        <!-- Advanced controls -->
        <div class="mt-4 border-t pt-4">
          <h3 class="text-lg font-semibold mb-3">Advanced Controls</h3>

          <div class="grid grid-cols-2 gap-2">
            <button
              ts-on:click="multiply"
              ts-on:auxclick="handleAuxClick"
              class="px-2 py-1 bg-orange-500 text-white rounded text-sm"
              data-ts-operation="multiply"
            >
              ×2
            </button>

            <button
              ts-on:click="divide"
              ts-on:drop="handleDrop"
              ts-on:dragover="handleDragOver"
              class="px-2 py-1 bg-teal-500 text-white rounded text-sm"
              data-ts-operation="divide"
            >
              ÷2
            </button>

            <button
              ts-on:click="square"
              ts-on:animationend="handleAnimationEnd"
              class="px-2 py-1 bg-pink-500 text-white rounded text-sm"
              data-ts-operation="square"
            >
              x²
            </button>

            <button
              ts-on:click="sqrt"
              ts-on:load="handleLoad"
              class="px-2 py-1 bg-cyan-500 text-white rounded text-sm"
              data-ts-operation="sqrt"
            >
              √x
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Basic operations - these should show up in IntelliSense
  increment(): void {
    this.setState({ count: this.state.count + this.state.step });
  }

  decrement(): void {
    this.setState({ count: this.state.count - this.state.step });
  }

  doubleIncrement(): void {
    this.setState({ count: this.state.count + this.state.step * 2 });
  }

  reset(): void {
    this.setState({
      count: 0,
      message: 'Reset complete!'
    });
  }

  randomize(): void {
    const newCount = Math.floor(Math.random() * 201) - 100;
    this.setState({
      count: newCount,
      message: `Random: ${newCount}`
    });
  }

  // Input handlers
  setStep(payload: any): void {
    const step = parseInt(payload.target.value, 10);
    if (!isNaN(step) && step > 0) {
      this.setState({ step });
    }
  }

  updateMessage(payload: any): void {
    this.setState({ message: payload.target.value });
  }

  updateStepMessage(): void {
    this.setState({ message: `Step: ${this.state.step}` });
  }

  // Mouse event handlers
  handleHover(): void {
    console.log('Button hovered');
  }

  handleMouseOut(): void {
    console.log('Mouse left button');
  }

  highlightButton(): void {
    console.log('Button highlighted');
  }

  unhighlightButton(): void {
    console.log('Button unhighlighted');
  }

  showContextMenu(payload: any): void {
    payload.preventDefault();
    console.log('Context menu requested');
  }

  handleAuxClick(payload: any): void {
    console.log('Auxiliary button clicked:', payload.button);
  }

  // Focus event handlers
  handleInputFocus(): void {
    console.log('Input focused');
  }

  handleInputBlur(): void {
    console.log('Input blurred');
  }

  handleButtonFocus(): void {
    console.log('Button focused');
  }

  // Keyboard event handlers
  handleButtonKeyDown(payload: any): void {
    if (payload.key === 'Enter' || payload.key === ' ') {
      this.increment();
    }
  }

  handleMessageKeyUp(payload: any): void {
    console.log('Key released in message input:', payload.key);
  }

  handleMessageKeyPress(payload: any): void {
    console.log('Key pressed in message input:', payload.key);
  }

  handleNumberKeyDown(payload: any): void {
    if (payload.key === 'Enter') {
      this.jumpToNumber(payload);
    }
  }

  // Touch event handlers
  handleTouchStart(): void {
    console.log('Touch started');
  }

  handleTouchEnd(): void {
    console.log('Touch ended');
  }

  // Form event handlers
  handleFormSubmit(payload: any): void {
    payload.preventDefault();
    console.log('Form submitted');
  }

  handleFormReset(): void {
    console.log('Form reset');
  }

  jumpToNumber(payload: any): void {
    const form = payload.target.closest('form');
    const input = form.querySelector('input[type="number"]');
    const value = parseInt(input.value, 10);
    if (!isNaN(value)) {
      this.setState({
        count: value,
        message: `Jumped to ${value}`
      });
    }
  }

  clearForm(): void {
    this.setState({ message: 'Form cleared' });
  }

  // Advanced operations
  multiply(): void {
    this.setState({
      count: this.state.count * 2,
      message: 'Multiplied by 2'
    });
  }

  divide(): void {
    this.setState({
      count: Math.floor(this.state.count / 2),
      message: 'Divided by 2'
    });
  }

  square(): void {
    this.setState({
      count: this.state.count * this.state.count,
      message: 'Squared!'
    });
  }

  sqrt(): void {
    this.setState({
      count: Math.floor(Math.sqrt(Math.abs(this.state.count))),
      message: 'Square root calculated'
    });
  }

  // Theme and UI handlers
  toggleTheme(): void {
    this.setState({
      theme: this.state.theme === 'light' ? 'dark' : 'light',
      message: `Switched to ${this.state.theme === 'light' ? 'dark' : 'light'} theme`
    });
  }

  showStatus(): void {
    const { count } = this.state;
    this.setState({
      message: `Status clicked! Count: ${count}`
    });
  }

  // Drag and drop handlers
  handleDrop(payload: any): void {
    payload.preventDefault();
    console.log('Item dropped');
  }

  handleDragOver(payload: any): void {
    payload.preventDefault();
    console.log('Drag over');
  }

  // Animation and transition handlers
  handleAnimationEnd(): void {
    console.log('Animation completed');
  }

  handleTransitionEnd(): void {
    console.log('Transition completed');
  }

  // Misc handlers
  handleLoad(): void {
    console.log('Load event triggered');
  }

  handleNumberWheel(payload: any): void {
    payload.preventDefault();
    console.log('Mouse wheel on number input');
  }
}
