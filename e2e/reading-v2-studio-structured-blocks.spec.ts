import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-studio-final-editor/structured-blocks';
const sampleImageDataUrl = [
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22120%22%3E',
  '%3Crect width=%22240%22 height=%22120%22 fill=%22%23f8fafc%22/%3E',
  '%3Ccircle cx=%22120%22 cy=%2260%22 r=%2230%22 fill=%22%230f766e%22/%3E%3C/svg%3E',
].join('');

const viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
] as const;

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

const addQuestionGroup = async (page: Page, taskType: string) => {
  const searchToken = taskType.toLowerCase().includes('diagram')
    ? 'diagram'
    : taskType.toLowerCase().includes('flowchart')
      ? 'flowchart'
      : taskType;
  await page.getByRole('button', { name: 'Add Question Group' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Question Group' });
  await dialog.getByLabel('Search question types').fill(searchToken);
  await dialog.getByRole('button', { name: new RegExp(searchToken, 'i') }).first().click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
};

const selectQuestionGroupCard = async (page: Page, taskType: string) => {
  const card = page.locator('article.reading-v2-build-card').filter({ hasText: taskType }).first();
  await expect(card).toBeVisible();
  await card.click();
};

test.describe('Reading V2 Studio structured blocks Phase 3', () => {
  test.setTimeout(90_000);

  for (const viewport of viewports) {
    test(`structured editors visible actions at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const evidence = startEvidenceCapture(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/__smoke/reading-v2-studio');

      await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-blank');
      await page.getByLabel('Passage title').fill(`Structured blocks ${viewport.name}`);
      await page.getByLabel('Passage editor').fill('Structured block smoke content. Resin is answer.');
      await page.getByRole('button', { name: 'Add image block' }).click();
      const imageBlock = page.getByRole('region', { name: 'Image block 1' });
      await expect(imageBlock).toBeVisible();
      await imageBlock.getByLabel('Image block 1 caption').fill('Resin extraction diagram');
      await imageBlock.getByLabel('Image block 1 URL').fill(sampleImageDataUrl);
      await imageBlock.getByLabel('Image block 1 alt text').fill('Resin extraction image');
      await imageBlock.getByLabel('Image block 1 source').fill('Teacher source');
      await expect(imageBlock.getByRole('img', { name: 'Resin extraction image' })).toBeVisible();

      await addQuestionGroup(page, 'Table Completion');
      await addQuestionGroup(page, 'Diagram Labeling');
      await addQuestionGroup(page, 'Flowchart Completion');

      await selectQuestionGroupCard(page, 'Table Completion');
      const tableEditor = page.getByLabel('Table Completion Builder');
      await expect(tableEditor).toBeVisible();
      await tableEditor.getByRole('button', { name: /Select Cells/i }).click();
      await tableEditor.getByRole('button', { name: 'Add Row' }).click();
      await tableEditor.getByRole('button', { name: 'Add Col' }).click();
      await tableEditor.getByLabel('Table cell 1.1 text').click();
      await tableEditor.getByRole('button', { name: /Insert blank/i }).click();

      const tableAnswerInput = tableEditor.getByLabel(/Correct answers for Question/i).first();
      await expect(tableAnswerInput).toBeVisible();
      await tableAnswerInput.fill('resin');

      await selectQuestionGroupCard(page, 'Diagram');
      const diagramEditor = page.getByLabel(/Diagram Labell?ing dedicated editor/i);
      await expect(diagramEditor).toBeVisible();
      await diagramEditor.getByRole('button', { name: 'Use URL' }).click();
      const diagramUrlInput = diagramEditor.getByLabel('Diagram image URL');
      await diagramUrlInput.fill('https://example.com/diagram.png');
      await diagramEditor.getByRole('button', { name: 'Add answer field' }).click();
      await diagramEditor.getByLabel(/Diagram answer for Question/i).first().fill('A');

      await selectQuestionGroupCard(page, 'Flowchart Completion');
      const flowchartEditor = page.getByLabel('Flowchart Completion dedicated editor');
      await expect(flowchartEditor).toBeVisible();
      await flowchartEditor.getByRole('button', { name: 'Add Step' }).click();
      await flowchartEditor.getByLabel('Flowchart step 4 text').fill('Final step');
      await flowchartEditor.getByRole('button', { name: 'Mark as Blank' }).nth(0).click();
      await flowchartEditor.getByRole('button', { name: 'Move flowchart step 2 down' }).click();
      await flowchartEditor.getByLabel(/Flowchart answer for Question/i).first().fill('flow');

      await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
      await expect.poll(() => evidence.console.some((message) => message.includes('saveDraft') && message.includes('success'))).toBe(true);

      await page.screenshot({
        path: join(outputDir, `${viewport.name}-structured-editors.png`),
        fullPage: true,
      });

      expect(evidence.pageErrors).toEqual([]);
      saveEvidence(`${viewport.name}-structured-editors-evidence`, {
        viewport,
        imageActions: ['Add image block', 'fill caption', 'fill URL', 'fill alt text', 'fill source', 'preview image'],
        tableActions: ['Select cells', 'Add Row', 'Add Column', 'Select blank', 'fill answer'],
        diagramActions: ['Use URL', 'fill diagram URL', 'Add answer field', 'fill answer'],
        flowchartActions: ['Add Step', 'fill step text', 'Mark as Blank', 'Move step down', 'fill answer'],
        ...evidence,
      });
    });
  }
});
