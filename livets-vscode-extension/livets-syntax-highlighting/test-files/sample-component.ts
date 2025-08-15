import { LiveView, html, classNames } from '@livets/core';

interface CounterState {
  count: number;
  step: number;
  isPositive: boolean;
}

export class TestComponent extends LiveView {
  protected state: CounterState = {
    count: 0,
    step: 1,
    isPositive: true
  };

  render(): string {
    const { count, step } = this.state;
    const isPositive = count > 0;

    const counterClasses = classNames({
      'text-green-600': isPositive,
      'text-red-600': !isPositive,
      'font-bold': true
    });

    return html`
      <div class="max-w-md mx-auto p-8 bg-white rounded-lg shadow-lg">
        <h1 class="text-2xl font-bold text-center mb-6">LiveTS Test Component</h1>

        <div class="text-center mb-6">
          <div class="${counterClasses}">${count}</div>
          <p class="text-gray-600 mt-2">Current count</p>
        </div>

        <div class="flex gap-3 justify-center mb-6">
          <button
            ts-on:click="decrement"
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            data-ts-sel="btn-decrement"
          >
            -${step}
          </button>

          <button
            ts-on:click="increment"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            data-ts-sel="btn-increment"
          >
            +${step}
          </button>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2"> Step size: ${step} </label>
          <input
            type="range"
            min="1"
            max="10"
            value="${step}"
            ts-on:input="setStep"
            data-ts-custom="range-input"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div class="flex gap-3 justify-center">
          <button
            ts-on:click="reset"
            ts-on:mouseover="handleHover"
            class="${classNames({ 'bg-gray-500': true, 'text-white': true })}"
          >
            Reset
          </button>
        </div>

        <div class="mt-6 text-center text-sm text-gray-500">
          Count is ${isPositive ? 'positive' : 'negative or zero'}
        </div>
      </div>
    `;
  }

  increment(): void {
    this.setState({
      count: this.state.count + this.state.step
    });
  }

  decrement(): void {
    this.setState({
      count: this.state.count - this.state.step
    });
  }

  reset(): void {
    this.setState({ count: 0 });
  }

  setStep(payload: any): void {
    const step = parseInt(payload.target.value, 10);
    if (!isNaN(step) && step > 0) {
      this.setState({ step });
    }
  }

  handleHover(): void {
    console.log('Button hovered');
  }
}
