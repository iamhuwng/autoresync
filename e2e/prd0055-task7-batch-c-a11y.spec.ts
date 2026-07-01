import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = path.resolve('output/playwright/prd0055-task7-batch-c-a11y');

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'phone-375', width: 375, height: 667 },
  { name: 'phone-320', width: 320, height: 667 },
] as const;

async function loadHarness(page: import('@playwright/test').Page, viewport: typeof viewports[number], submitting = false) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(submitting ? '/?submitting=1' : '/');
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PRD-0055 Task 7 Batch C A11y Proof</title>
        <style>
          html,
          body,
          #root {
            margin: 0;
            width: 100%;
            min-height: 100%;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/e2e/fixtures/prd0055-task7-batch-c-a11y-harness.tsx"></script>
      </body>
    </html>`);
  await expect(page.getByTestId('prd0055-task7-batch-c-a11y-harness')).toBeVisible();
}

async function expectTouchFloor(page: import('@playwright/test').Page, testIds: string[]) {
  const metrics = await page.evaluate((ids) => ids.map((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!element) {
      throw new Error(`Missing ${id}`);
    }
    const rect = element.getBoundingClientRect();
    return { id, width: rect.width, height: rect.height };
  }), testIds);

  for (const metric of metrics) {
    expect(metric.width, `${metric.id} width`).toBeGreaterThanOrEqual(44);
    expect(metric.height, `${metric.id} height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe('PRD-0055 Task 7 Batch C runtime accessibility proof', () => {
  for (const viewport of viewports) {
    test(`header and submit sheet expose semantics and touch targets - ${viewport.name}`, async ({ page }) => {
      await loadHarness(page, viewport);

      const timer = page.getByRole('status', {
        name: /Time remaining: 04:00\. Less than 5 minutes left/,
      });
      await expect(timer).toBeVisible();
      await expect(timer).toHaveAttribute('aria-live', 'polite');

      const dialog = page.getByRole('dialog', { name: 'Submit Test' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-describedby', 'listening-submit-warning');

      await expect(page.getByRole('alert')).toContainText('unanswered questions');
      await expect(page.getByRole('button', { name: 'Submit test' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More options' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Confirm Submit' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Back to Test' })).toBeVisible();

      await page.getByRole('button', { name: 'Confirm Submit' }).focus();
      await expect(page.getByRole('button', { name: 'Confirm Submit' })).toBeFocused();
      await page.getByRole('button', { name: 'Back to Test' }).focus();
      await expect(page.getByRole('button', { name: 'Back to Test' })).toBeFocused();

      await expectTouchFloor(page, [
        'mobile-listening-header-submit',
        'mobile-listening-header-overflow',
        'submit-confirm-btn',
        'submit-cancel-btn',
      ]);

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.name}.png`),
        fullPage: true,
      });
    });

    test(`pending submit exposes disabled busy state - ${viewport.name}`, async ({ page }) => {
      await loadHarness(page, viewport, true);

      const confirm = page.getByTestId('submit-confirm-btn');
      await expect(confirm).toHaveAttribute('aria-busy', 'true');
      await expect(confirm).toBeDisabled();
      await expect(confirm).toHaveText('Submitting...');

      const headerSubmit = page.getByTestId('mobile-listening-header-submit');
      await expect(headerSubmit).toBeDisabled();
      await expect(headerSubmit).toHaveText('Submitting');
    });
  }
});
