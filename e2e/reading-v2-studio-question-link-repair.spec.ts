import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-studio-final-editor/question-link-repair';

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
      || text.includes('[Diag][ReadingV2Smoke]')
      || text.includes('[Diag][ReadingV2PasteImportGate]')
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

const fillAllAnswers = async (
  region: ReturnType<Page['getByLabel']>,
  label: RegExp,
  valueFor: (index: number) => string,
) => {
  const answers = region.getByLabel(label);
  const count = await answers.count();

  for (let index = 0; index < count; index += 1) {
    await answers.nth(index).fill(valueFor(index));
  }
};

test.describe('Reading V2 Studio question-link repair Phase 5', () => {
  test.setTimeout(90_000);

  test('repairs imported broken table, flowchart, and diagram links before preview', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-studio?fixture=structured-repair');

    await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-from-import');
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Passage 1', exact: true }).click();
    const tableEditor = page.getByLabel('Table Completion Builder');
    await expect(tableEditor).toBeVisible();
    await tableEditor.getByRole('button', { name: 'Create linked question' }).click();
    await fillAllAnswers(tableEditor, /Correct answers for Question/i, (index) => `table repair ${index + 1}`);

    await page.locator('article.reading-v2-build-card').filter({ hasText: 'Flowchart Completion' }).first().click();
    const flowchartEditor = page.getByLabel('Flowchart Completion dedicated editor');
    await expect(flowchartEditor).toBeVisible();
    await flowchartEditor.getByRole('button', { name: 'Mark as Blank' }).first().click();
    await fillAllAnswers(flowchartEditor, /Flowchart answer for Question/i, (index) => `flow repair ${index + 1}`);

    await page.locator('article.reading-v2-build-card').filter({ hasText: 'Diagram Labelling' }).first().click();
    const diagramEditor = page.getByLabel(/Diagram Labell?ing dedicated editor/i);
    await expect(diagramEditor).toBeVisible();
    await diagramEditor.getByRole('button', { name: 'Create answer key' }).first().click();
    await fillAllAnswers(diagramEditor, /Diagram answer for Question/i, (index) => `diagram repair ${index + 1}`);

    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(page.getByText('No required issues found.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();

    await page.screenshot({
      path: join(outputDir, 'desktop-question-link-repair-studio.png'),
      fullPage: true,
    });
    await preview.screenshot({
      path: join(outputDir, 'desktop-question-link-repair-preview.png'),
    });

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.console.some((message) => message.includes('questionLinkRepair'))).toBe(true);

    saveEvidence('desktop-question-link-repair-evidence', {
      repaired: ['table blank linked question', 'flowchart blank step', 'diagram target answer key'],
      previewVisible: true,
      publishReady: true,
      ...evidence,
    });
  });
});
