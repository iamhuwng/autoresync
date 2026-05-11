import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-studio-final-editor/final-regression';

const startEvidenceCapture = (page: Page) => {
  const evidence = {
    console: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
  };

  page.on('console', (message) => {
    const text = message.text();

    if (
      text.includes('[Diag][ReadingV2Studio]')
      || text.includes('[Diag][ReadingV2PasteImportGate]')
      || text.includes('[Diag][ReadingV2VerticalLoopSmoke]')
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

const expectVisibleTaskCard = async (page: Page, label: string) => {
  await expect(page.locator('article.reading-v2-build-card').filter({ hasText: label }).first()).toBeVisible();
};

test.describe('Reading V2 final editor regression gate', () => {
  test.setTimeout(120_000);

  test('publishes a mixed three-passage 40-question import with all final task families', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/__smoke/reading-v2-studio?fixture=valid-full-test');

    await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-from-import');
    await expect(page.getByRole('button', { name: 'Passage 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passage 2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passage 3', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Passage 1', exact: true }).click();
    await expectVisibleTaskCard(page, 'True / False / Not Given');
    await expectVisibleTaskCard(page, 'Matching Information');
    await expectVisibleTaskCard(page, 'Sentence Completion');

    await page.getByRole('button', { name: 'Passage 2', exact: true }).click();
    await expectVisibleTaskCard(page, 'Table Completion');
    await expectVisibleTaskCard(page, 'Flowchart Completion');
    await expectVisibleTaskCard(page, 'Multiple Choice');

    await page.getByRole('button', { name: 'Passage 3', exact: true }).click();
    await expectVisibleTaskCard(page, 'Diagram Labelling');
    await expectVisibleTaskCard(page, 'Yes / No / Not Given');
    await expectVisibleTaskCard(page, 'Multiple Selection');

    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'No required issues found.' })).toBeVisible();

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();
    await preview.screenshot({ path: join(outputDir, 'mixed-40-import-preview.png') });
    await preview.getByRole('button', { name: /Close/i }).click();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'Published successfully.' })).toBeVisible();
    await page.screenshot({ path: join(outputDir, 'mixed-40-import-studio.png'), fullPage: true });

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    expect(evidence.console.some((message) => message.includes('publish') && message.includes('success'))).toBe(true);
    saveEvidence('mixed-40-import-evidence', {
      taskFamilies: [
        'table-completion',
        'diagram-labeling',
        'flowchart-completion',
        'matching-information',
        'true-false-not-given',
        'yes-no-not-given',
        'multiple-choice',
        'multiple-select',
        'sentence-completion',
      ],
      questionCount: 40,
      passageCount: 3,
      publishSuccess: true,
      ...evidence,
    });
  });

  test('publishes a manually authored blank Studio material', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-studio');

    await page.getByLabel('Passage title').fill('Manual final regression passage');
    await page.getByLabel('Passage editor').fill('Manual final regression passage. The answer word is resin.');
    await page.getByRole('button', { name: 'Add Question Group' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Add Question Group' });
    await dialog.getByLabel('Search question types').fill('Sentence Completion');
    await dialog.getByRole('button', { name: 'Sentence Completion', exact: true }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();

    const card = page.locator('article.reading-v2-build-card').last();
    await card.getByLabel(/instruction 1/i).fill('Complete the sentence below. Choose ONE WORD ONLY from the passage.');
    await card.locator('fieldset').nth(0).getByLabel(/sentence text/i).fill('The answer word is _____.');
    await card.locator('fieldset').nth(0).getByLabel(/accepted answers/i).fill('resin');
    await card.locator('fieldset').nth(1).getByLabel(/sentence text/i).fill('The source was authored manually in _____.');
    await card.locator('fieldset').nth(1).getByLabel(/accepted answers/i).fill('studio');

    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'Draft saved.' })).toBeVisible();
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'No required issues found.' })).toBeVisible();

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();
    await preview.getByRole('button', { name: /Close/i }).click();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'Published successfully.' })).toBeVisible();
    await page.screenshot({ path: join(outputDir, 'manual-blank-publish.png'), fullPage: true });

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    saveEvidence('manual-blank-evidence', {
      createBlank: true,
      previewVisible: true,
      publishSuccess: true,
      ...evidence,
    });
  });

  test('audits student-safe and session-safe projections for forbidden author tokens', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-vertical-loop');

    await expect(page.getByTestId('reading-v2-vertical-loop-status')).toContainText('Runtime student-safe');
    const auditText = await page.getByTestId('reading-v2-projection-safety-audit').textContent();
    const audit = JSON.parse(auditText ?? '{}') as Record<'studentSafe' | 'sessionSafe', Record<string, boolean>>;

    expect(Object.values(audit.studentSafe)).toEqual(Object.values(audit.studentSafe).map(() => false));
    expect(Object.values(audit.sessionSafe)).toEqual(Object.values(audit.sessionSafe).map(() => false));
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    saveEvidence('projection-safety-audit', {
      audit,
      forbiddenTokenCount: Object.keys(audit.studentSafe).length,
      ...evidence,
    });
  });
});
