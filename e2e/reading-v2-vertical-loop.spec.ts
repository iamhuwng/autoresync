import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-studio-final-editor/vertical-loop';

const startEvidenceCapture = (page: Page) => {
  const evidence = {
    console: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
  };

  page.on('console', (message) => {
    const text = message.text();
    if (
      text.includes('[Diag][ReadingV2VerticalLoopSmoke]')
      || text.includes('[Diag][ReadingV2Runtime]')
      || text.includes('[Diag][ReadingV2ResultReview]')
    ) {
      evidence.console.push(text);
    }
  });
  page.on('pageerror', (error) => {
    evidence.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('google-analytics.com/g/collect')) {
      return;
    }
    evidence.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });

  return evidence;
};

const saveEvidence = (name: string, evidence: unknown) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, `${name}.json`), JSON.stringify(evidence, null, 2));
};

const openPassage = async (page: Page, passageNumber: number) => {
  await page.getByRole('button', { name: new RegExp(`Part ${passageNumber}`) }).first().click();
};

const fillAnswer = async (page: Page, questionNumber: number, value: string) => {
  const exactInput = page.getByRole('textbox', { name: `Question ${questionNumber} answer` });
  const structuredInput = page.getByRole('textbox', { name: `Question ${questionNumber} structured answer` });

  if (await exactInput.count()) {
    await exactInput.fill(value);
    return;
  }

  await structuredInput.fill(value);
};

test.describe('Reading V2 Phase 6 vertical loop', () => {
  test.setTimeout(90_000);

  test('publishes clean projection, answers as student, submits, scores, and renders review', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-vertical-loop');

    const status = page.getByTestId('reading-v2-vertical-loop-status');
    await expect(status).toContainText('Preview ready');
    await expect(status).toContainText('Runtime student-safe');
    await expect(status).toContainText('source import evidence: true');
    await expect(status).toContainText('editor internals leaked: false');
    await expect(status).toContainText('answers leaked: false');
    await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();

    await fillAnswer(page, 1, 'answer one');
    await fillAnswer(page, 2, 'answer two');

    await openPassage(page, 2);
    await fillAnswer(page, 3, 'answer one');
    await fillAnswer(page, 4, 'answer two');

    await openPassage(page, 3);
    await fillAnswer(page, 5, 'answer one');
    await fillAnswer(page, 6, 'answer two');

    await openPassage(page, 4);
    await fillAnswer(page, 7, 'answer one');
    await fillAnswer(page, 8, 'answer two');

    await page.screenshot({
      path: join(outputDir, 'desktop-vertical-loop-runtime-answered.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Submit' }).click();
    const reviewSummary = page.getByLabel('Pre-submit review summary');
    await expect(reviewSummary).toContainText('Answered 8 of 8');
    await page.getByRole('button', { name: 'Confirm Submit' }).click();

    const review = page.getByLabel('Reading V2 vertical loop review');
    await expect(review).toBeVisible();
    await expect(page.getByTestId('reading-v2-review-adapter')).toBeVisible();
    await expect(review).toContainText('table completion');
    await expect(review).toContainText('flowchart completion');
    await expect(review).toContainText('diagram labeling');
    await expect(page.getByText(/Correct answer:/)).toHaveCount(8);
    await expect(status).toContainText('Review ready');

    await page.screenshot({
      path: join(outputDir, 'desktop-vertical-loop-review.png'),
      fullPage: true,
    });

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    expect(evidence.console.some((message) => message.includes('vertical_loop_submitted'))).toBe(true);

    saveEvidence('desktop-vertical-loop-evidence', {
      previewReady: true,
      runtimeAnswered: true,
      submitted: true,
      reviewVisible: true,
      checkedQuestionCount: 8,
      ...evidence,
    });
  });
});
