import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = path.resolve('output/playwright/prd0055-task7-mobile-keyboard');

const viewports = [
  { name: 'phone-375', width: 375, height: 667 },
  { name: 'phone-320', width: 320, height: 667 },
] as const;

test.describe('PRD-0055 Task 7 mobile keyboard proof', () => {
  for (const viewport of viewports) {
    test(`answer sheet keeps focused answer controls visible - ${viewport.name}`, async ({ page }) => {
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/');
      await page.setContent(`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>PRD-0055 Task 7 Keyboard Proof</title>
            <style>
              html,
              body,
              #root {
                margin: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
              }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="module" src="/e2e/fixtures/prd0055-task7-mobile-keyboard-harness.tsx"></script>
          </body>
        </html>`);

      await expect(page.getByTestId('prd0055-task7-keyboard-harness')).toBeVisible();
      await expect(page.getByTestId('mobile-listening-answer-sheet-body')).toHaveAttribute(
        'data-keyboard-safe-bottom',
        'calc(16rem + env(safe-area-inset-bottom, 0px))',
      );
      await expect(page.getByTestId('mobile-listening-answer-sheet-body')).toHaveAttribute(
        'data-scroll-safe-bottom',
        'calc(17rem + env(safe-area-inset-bottom, 0px))',
      );

      const answerBody = page.getByTestId('mobile-listening-answer-sheet-body');
      const finalInput = page.getByTestId('answer-input-20');
      await finalInput.scrollIntoViewIfNeeded();
      await finalInput.focus();
      await answerBody.evaluate((body) => {
        const input = document.querySelector('[data-testid="answer-input-20"]') as HTMLElement | null;
        const keyboard = document.querySelector('[data-testid="simulated-mobile-keyboard"]') as HTMLElement | null;
        if (!input || !keyboard) {
          throw new Error('Missing focused input or simulated keyboard.');
        }

        const inputRect = input.getBoundingClientRect();
        const keyboardTop = keyboard.getBoundingClientRect().top;
        const requiredScroll = Math.ceil(inputRect.bottom - keyboardTop + 12);
        if (requiredScroll > 0) {
          body.scrollTop = Math.min(body.scrollTop + requiredScroll, body.scrollHeight - body.clientHeight);
        }
      });
      await expect(finalInput).toBeFocused();
      await expect(page.getByTestId('simulated-mobile-keyboard')).toBeVisible();

      const metrics = await page.evaluate(() => {
        const input = document.querySelector('[data-testid="answer-input-20"]') as HTMLElement | null;
        const footer = document.querySelector('[data-testid="mobile-listening-answer-sheet-footer"]') as HTMLElement | null;
        const sheet = document.querySelector('[data-testid="mobile-listening-answer-sheet"]') as HTMLElement | null;
        const body = document.querySelector('[data-testid="mobile-listening-answer-sheet-body"]') as HTMLElement | null;
        const simulatedKeyboard = document.querySelector('[data-testid="simulated-mobile-keyboard"]') as HTMLElement | null;
        if (!input || !footer || !sheet || !body || !simulatedKeyboard) {
          throw new Error('Missing answer sheet proof elements.');
        }

        const inputRect = input.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const keyboardRect = simulatedKeyboard.getBoundingClientRect();

        return {
          bodyClientHeight: body.clientHeight,
          bodyScrollHeight: body.scrollHeight,
          footerTop: footerRect.top,
          inputBottom: inputRect.bottom,
          inputLeft: inputRect.left,
          inputRight: inputRect.right,
          keyboardTop: keyboardRect.top,
          sheetLeft: sheetRect.left,
          sheetRight: sheetRect.right,
          viewportHeight: document.documentElement.clientHeight,
          viewportWidth: document.documentElement.clientWidth,
        };
      });

      expect(metrics.bodyScrollHeight).toBeGreaterThan(metrics.bodyClientHeight);
      expect(metrics.inputBottom).toBeLessThanOrEqual(metrics.footerTop);
      expect(metrics.inputBottom).toBeLessThanOrEqual(metrics.keyboardTop);
      expect(metrics.inputLeft).toBeGreaterThanOrEqual(metrics.sheetLeft);
      expect(metrics.inputRight).toBeLessThanOrEqual(metrics.sheetRight);
      expect(metrics.sheetRight).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.footerTop).toBeLessThan(metrics.viewportHeight);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.name}.png`),
        fullPage: true,
      });
    });
  }
});
