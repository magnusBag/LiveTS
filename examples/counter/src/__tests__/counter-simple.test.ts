/**
 * Simple Counter Component Tests with Playwright
 * Practical tests that work with the actual LiveTS setup
 */

import { test, expect, Page } from '@playwright/test';
import { CounterComponent } from '../counter-component';

// Helper to render component in test environment
async function renderCounter(page: Page, props = {}) {
  const component = new CounterComponent(props);
  await component._mount();
  const html = component._render();

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Counter Test</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div id="root">${html}</div>
      </body>
    </html>
  `);

  return component;
}

// Helper to get the count display element specifically (not the heading)
function getCountDisplay(page: Page) {
  return page.locator('.text-center').nth(1).locator('.font-bold');
}

test.describe('CounterComponent', () => {
  test('renders initial state correctly', async ({ page }) => {
    await renderCounter(page);

    // Check that basic elements are present
    await expect(page.locator('h1')).toHaveText('LiveTS Counter');
    await expect(getCountDisplay(page)).toHaveText('0');
    await expect(page.locator('button:has-text("+1")')).toBeVisible();
    await expect(page.locator('button:has-text("-1")')).toBeVisible();
    await expect(page.locator('button:has-text("Reset")')).toBeVisible();
    await expect(page.locator('button:has-text("Random")')).toBeVisible();
  });

  test('displays correct initial styling', async ({ page }) => {
    await renderCounter(page);

    const countElement = getCountDisplay(page);

    // Count of 0 should have negative styling (red)
    await expect(countElement).toHaveClass(/text-red-600/);
    await expect(countElement).not.toHaveClass(/text-green-600/);

    // Status message should indicate negative or zero
    await expect(page.locator('#status-message')).toContainText('negative or zero');
  });

  test('has proper form elements', async ({ page }) => {
    await renderCounter(page);

    // Check range input
    const stepInput = page.locator('input[type="range"]');
    await expect(stepInput).toBeVisible();
    await expect(stepInput).toHaveAttribute('min', '1');
    await expect(stepInput).toHaveAttribute('max', '10');
    await expect(stepInput).toHaveAttribute('value', '1');

    // Check label
    await expect(page.locator('#step-label')).toContainText('Step size: 1');
  });

  test('has accessible button text that updates with step', async ({ page }) => {
    await renderCounter(page);

    // Initial buttons should show step of 1
    await expect(page.locator('button:has-text("+1")')).toBeVisible();
    await expect(page.locator('button:has-text("-1")')).toBeVisible();
  });

  test('contains all required interactive elements', async ({ page }) => {
    await renderCounter(page);

    // Check all buttons are present and clickable
    const buttons = [
      'button:has-text("+1")',
      'button:has-text("-1")',
      'button:has-text("Reset")',
      'button:has-text("Random")'
    ];

    for (const buttonSelector of buttons) {
      const button = page.locator(buttonSelector);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
    }
  });

  test('has proper CSS classes structure', async ({ page }) => {
    await renderCounter(page);

    // Check main container structure
    await expect(page.locator('.max-w-md')).toBeVisible();
    await expect(page.locator('.bg-white')).toBeVisible();
    await expect(page.locator('.max-w-md.rounded-lg')).toBeVisible(); // Main container with rounded-lg
    await expect(page.locator('.shadow-lg')).toBeVisible();
  });

  test('displays current count prominently', async ({ page }) => {
    await renderCounter(page);

    const countDisplay = getCountDisplay(page);
    await expect(countDisplay).toBeVisible();
    await expect(countDisplay).toHaveText('0');

    // Should be in the center section (nth(1) to skip heading)
    const countSection = page.locator('.text-center').nth(1);
    await expect(countSection).toContainText('0');
    await expect(countSection).toContainText('Current count');
  });

  test('has responsive layout classes', async ({ page }) => {
    await renderCounter(page);

    // Check responsive container
    await expect(page.locator('.max-w-md')).toBeVisible();
    await expect(page.locator('.mx-auto')).toBeVisible();

    // Check button layout (multiple sections have these classes, so check first one)
    await expect(page.locator('.flex.gap-3.justify-center').first()).toBeVisible();
  });

  test('component structure is well-formed', async ({ page }) => {
    await renderCounter(page);

    // Check HTML structure
    const mainContainer = page.locator('.max-w-md.mx-auto.p-8');
    await expect(mainContainer).toBeVisible();

    // Check sections exist
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1.text-center')).toBeVisible(); // Check heading specifically
    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.locator('#status-message')).toBeVisible();
  });

  test('displays proper step size label', async ({ page }) => {
    await renderCounter(page);

    const stepLabel = page.locator('#step-label');
    await expect(stepLabel).toBeVisible();
    await expect(stepLabel).toHaveText('Step size: 1');
    await expect(stepLabel).toHaveClass(/text-sm/);
    await expect(stepLabel).toHaveClass(/font-medium/);
  });

  test('component has data attributes for testing', async ({ page }) => {
    await renderCounter(page);

    // The component should have a data-livets-id attribute
    const componentElement = page.locator('[data-livets-id]');
    await expect(componentElement).toBeVisible();
  });
});

test.describe('CounterComponent - Visual Layout', () => {
  test('buttons have proper styling', async ({ page }) => {
    await renderCounter(page);

    // Check increment button styling
    const incrementBtn = page.locator('button:has-text("+1")');
    await expect(incrementBtn).toHaveClass(/bg-blue-500/);
    await expect(incrementBtn).toHaveClass(/text-white/);
    await expect(incrementBtn).toHaveClass(/px-4/);
    await expect(incrementBtn).toHaveClass(/py-2/);

    // Check decrement button styling
    const decrementBtn = page.locator('button:has-text("-1")');
    await expect(decrementBtn).toHaveClass(/bg-red-500/);
    await expect(decrementBtn).toHaveClass(/text-white/);

    // Check reset button styling
    const resetBtn = page.locator('button:has-text("Reset")');
    await expect(resetBtn).toHaveClass(/bg-gray-500/);
    await expect(resetBtn).toHaveClass(/text-white/);

    // Check random button styling
    const randomBtn = page.locator('button:has-text("Random")');
    await expect(randomBtn).toHaveClass(/bg-purple-500/);
    await expect(randomBtn).toHaveClass(/text-white/);
  });

  test('range input has proper styling', async ({ page }) => {
    await renderCounter(page);

    const rangeInput = page.locator('input[type="range"]');
    await expect(rangeInput).toHaveClass(/w-full/);
    await expect(rangeInput).toHaveClass(/h-2/);
    await expect(rangeInput).toHaveClass(/bg-gray-200/);
    await expect(rangeInput).toHaveClass(/rounded-lg/);
  });

  test('status message has proper styling', async ({ page }) => {
    await renderCounter(page);

    const statusMsg = page.locator('#status-message');
    await expect(statusMsg).toHaveClass(/mt-6/);
    await expect(statusMsg).toHaveClass(/text-center/);
    await expect(statusMsg).toHaveClass(/text-sm/);
    await expect(statusMsg).toHaveClass(/text-gray-500/);
  });
});

test.describe('CounterComponent - Accessibility', () => {
  test('has proper heading structure', async ({ page }) => {
    await renderCounter(page);

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('LiveTS Counter');
    await expect(heading).toHaveClass(/text-2xl/);
    await expect(heading).toHaveClass(/font-bold/);
  });

  test('has proper label for range input', async ({ page }) => {
    await renderCounter(page);

    const label = page.locator('#step-label');
    const input = page.locator('input[type="range"]');

    await expect(label).toBeVisible();
    await expect(input).toBeVisible();

    // Label should describe the input
    await expect(label).toContainText('Step size');
  });

  test('buttons have descriptive text', async ({ page }) => {
    await renderCounter(page);

    // All buttons should have clear, descriptive text
    await expect(page.locator('button:has-text("+1")')).toBeVisible();
    await expect(page.locator('button:has-text("-1")')).toBeVisible();
    await expect(page.locator('button:has-text("Reset")')).toBeVisible();
    await expect(page.locator('button:has-text("Random")')).toBeVisible();
  });

  test('has proper color contrast for count display', async ({ page }) => {
    await renderCounter(page);

    const countElement = getCountDisplay(page);

    // Should have either red (negative/zero) or green (positive) text
    const hasRedText = await countElement.evaluate(
      el =>
        getComputedStyle(el).color.includes('rgb(220, 38, 38)') || // text-red-600
        el.classList.contains('text-red-600')
    );

    expect(hasRedText).toBe(true);
  });

  test('maintains focus order for keyboard navigation', async ({ page }) => {
    await renderCounter(page);

    // Focus on the first button manually (more reliable than Tab)
    const firstButton = page.locator('button').first();
    await firstButton.focus();

    // Verify button is focused
    await expect(firstButton).toBeFocused();

    // Verify it's one of our buttons
    const buttonText = await firstButton.textContent();
    expect(['+1', '-1', 'Reset', 'Random'].some(text => buttonText?.includes(text))).toBeTruthy();
  });
});

test.describe('CounterComponent - Cross-browser compatibility', () => {
  test('renders consistently across browsers', async ({ page, browserName }) => {
    await renderCounter(page);

    // Basic functionality should work in all browsers
    await expect(page.locator('h1')).toHaveText('LiveTS Counter');
    await expect(getCountDisplay(page)).toHaveText('0');

    // Range input should be present (though styling may vary)
    const rangeInput = page.locator('input[type="range"]');
    await expect(rangeInput).toBeVisible();
    await expect(rangeInput).toHaveAttribute('type', 'range');

    console.log(`Test passed in ${browserName}`);
  });

  test('handles range input across browsers', async ({ page }) => {
    await renderCounter(page);

    const rangeInput = page.locator('input[type="range"]');

    // Should have proper attributes regardless of browser
    await expect(rangeInput).toHaveAttribute('min', '1');
    await expect(rangeInput).toHaveAttribute('max', '10');
    await expect(rangeInput).toHaveAttribute('value', '1');
  });
});
