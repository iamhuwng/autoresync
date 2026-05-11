import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-studio-final-editor';

const phase2Viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
] as const;

const longPassage = Array.from({ length: 18 }, (_, index) =>
  `Paragraph ${index + 1}. This IELTS Reading passage paragraph is intentionally long enough to exercise TipTap editing, passage scrolling, and preview projection without forcing page-level horizontal overflow. The answer word is resin.`,
).join('\n\n');

const startEvidenceCapture = (page: Page) => {
  const evidence = {
    console: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
  };

  page.on('console', (message) => {
    const text = message.text();
    if (
      text.includes('[Diag][ReadingV2Studio]') ||
      text.includes('[Diag][ReadingV2Smoke]') ||
      text.includes('[Diag][ReadingV2PasteImportGate]')
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

test.describe('Reading V2 Studio final editor Phase 2', () => {
  test.setTimeout(90_000);

  for (const viewport of phase2Viewports) {
    test(`TipTap passage editor stays editable and preview-safe at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const evidence = startEvidenceCapture(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/__smoke/reading-v2-studio');

      await page.getByRole('button', { name: 'Add Passage', exact: true }).click();
      await page.getByRole('button', { name: 'Add Passage', exact: true }).click();
      await page.getByRole('button', { name: 'Passage 3', exact: true }).click();
      await expect(page.getByLabel('Passage 3 editor')).toBeVisible();

      await page.getByLabel('Passage title').fill(`Final editor ${viewport.name} Passage 3`);
      const editor = page.getByRole('textbox', { name: 'Passage editor' });
      await editor.fill(longPassage);
      await expect(editor).toContainText('Paragraph 18');

      await page.getByRole('button', { name: 'Bold' }).click();
      await page.getByRole('button', { name: 'Italic' }).click();
      await page.getByRole('button', { name: 'Underline' }).click();
      await page.getByRole('button', { name: 'Heading' }).click();
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.getByRole('button', { name: 'Redo' }).click();

      await page.getByRole('button', { name: 'Add Question Group' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add Question Group' });
      await dialog.getByLabel('Search question types').fill('Sentence Completion');
      await dialog.getByRole('button', { name: 'Sentence Completion', exact: true }).click();
      await dialog.getByRole('button', { name: 'Continue' }).click();

      const card = page.locator('article.reading-v2-build-card').last();
      await card.getByLabel(/instruction 1/i).fill('Complete the sentences below. Choose ONE WORD ONLY from the passage.');
      const rows = card.locator('fieldset');
      await rows.nth(0).getByLabel(/sentence text/i).fill('The answer word is _____.');
      await rows.nth(0).getByLabel(/accepted answers/i).fill('resin');
      await rows.nth(1).getByLabel(/sentence text/i).fill('The long passage is edited in _____.');
      await rows.nth(1).getByLabel(/accepted answers/i).fill('tiptap');

      const layoutMetrics = await page.evaluate(() => {
        const pageRoot = document.documentElement;
        const editorElement = document.querySelector('.reading-v2-build__passage-rich-editor') as HTMLElement | null;
        const passagePanel = document.querySelector('.reading-v2-build__passage-panel') as HTMLElement | null;
        const questionPanel = document.querySelector('.reading-v2-build__question-panel') as HTMLElement | null;
        const toolbar = document.querySelector('.reading-v2-build__editor-tools') as HTMLElement | null;

        return {
          editorCanScroll: editorElement ? editorElement.scrollHeight > editorElement.clientHeight : false,
          editorHeight: editorElement?.clientHeight ?? 0,
          pageClientWidth: pageRoot.clientWidth,
          pageScrollWidth: pageRoot.scrollWidth,
          passagePanelCanScroll: passagePanel ? passagePanel.scrollHeight >= passagePanel.clientHeight : false,
          questionPanelCanScroll: questionPanel ? questionPanel.scrollHeight >= questionPanel.clientHeight : false,
          toolbarVisible: toolbar ? toolbar.getBoundingClientRect().height > 0 : false,
        };
      });

      expect(layoutMetrics.pageScrollWidth).toBeLessThanOrEqual(layoutMetrics.pageClientWidth + 2);
      expect(layoutMetrics.editorCanScroll).toBe(true);
      expect(layoutMetrics.toolbarVisible).toBe(true);

      await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
      await expect.poll(() =>
        evidence.console.some((message) => message.includes('saveDraft') && message.includes('success')),
      ).toBe(true);
      await page.getByRole('button', { name: 'Validate' }).click();
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
      await expect(preview).toBeVisible();
      await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();
      await preview.getByRole('button', { name: /Part 3/ }).click();
      await expect(preview).toContainText('Paragraph 18');

      const previewMetrics = await preview.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(previewMetrics.scrollWidth).toBeLessThanOrEqual(previewMetrics.clientWidth + 2);

      await page.screenshot({
        path: join(outputDir, `phase2-${viewport.name}-studio.png`),
        fullPage: true,
      });
      await preview.screenshot({
        path: join(outputDir, `phase2-${viewport.name}-preview.png`),
      });

      expect(evidence.pageErrors).toEqual([]);
      expect(evidence.console.some((message) => message.includes('passage_editor_text_changed'))).toBe(true);
      expect(evidence.console.some((message) => message.includes('passage_editor_action'))).toBe(true);

      saveEvidence(`phase2-${viewport.name}-evidence`, {
        viewport,
        layoutMetrics,
        previewMetrics,
        previewVisible: true,
        ...evidence,
      });
    });
  }
});
