/**
 * Counter Component - A simple LiveView example
 */

import { LiveView, html, classNames } from '@livets/core';

interface CounterState {
  count: number;
  step: number;
  isPositive: boolean;
}

export class CounterComponent extends LiveView {
  protected state: CounterState = {
    count: 0,
    step: 1,
    isPositive: true
  };

  async mount(): Promise<void> {
    // Initialize component state
    this.setState({
      count: 0,
      step: 1,
      isPositive: true
    });

    // Subscribe to pub/sub events (example)
    this.subscribe('counter-updates', data => {
      console.log('Received counter update:', data);
    });

    console.log('Counter component mounted');
  }

  render(): string {
    const { count, step, isPositive } = this.state;

    const counterClasses = classNames({
      'text-green-600': isPositive,
      'text-red-600': !isPositive,
      'font-bold': true
    });

    return html`
      <div class="max-w-md mx-auto p-8 bg-white rounded-lg shadow-lg">
        <h1 class="text-2xl font-bold text-center mb-6">LiveTS Counter</h1>

        <div class="text-center mb-6">
          <div id="counter-display" class="${counterClasses}">${count}</div>
          <p class="text-gray-600 mt-2">Current count</p>
        </div>

        <div class="flex gap-3 justify-center mb-6">
          <button
            id="decrement-btn"
            ts-on:click="decrement"
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            -${step}
          </button>

          <button
            id="increment-btn"
            ts-on:click="increment"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            +${step}
          </button>
        </div>

        <div class="mb-6">
          <label id="step-label" class="block text-sm font-medium text-gray-700 mb-2">
            Step size: ${step}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value="${step}"
            ts-on:input="setStep"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div class="flex gap-3 justify-center">
          <button
            ts-on:click="reset"
            class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>

          <button
            ts-on:click="random"
            class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            Random
          </button>
        </div>

        <div id="status-message" class="mt-6 text-center text-sm text-gray-500">
          Count is ${isPositive ? 'positive' : 'negative or zero'}
        </div>
      </div>
    `;
  }

  // Event handlers
  increment(): void {
    const newCount = this.state.count + this.state.step;
    this.setState({
      count: newCount,
      isPositive: newCount > 0
    });
  }

  decrement(): void {
    const newCount = this.state.count - this.state.step;
    this.setState({
      count: newCount,
      isPositive: newCount > 0
    });
  }

  reset(): void {
    this.setState({
      count: 0,
      isPositive: true
    });
  }

  random(): void {
    const newCount = Math.floor(Math.random() * 201) - 100; // Random between -100 and 100
    this.setState({
      count: newCount,
      isPositive: newCount > 0
    });
  }

  setStep(payload: any): void {
    const step = parseInt(payload.target.value, 10);
    if (!isNaN(step) && step > 0) {
      this.setState({ step });
    }
  }

  updated(): void {
    console.log('Counter updated. New state:', this.getState());
  }

  unmount(): void {
    console.log('Counter component unmounted');
  }
}
