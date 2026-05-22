import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const smokeViewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const pasteGateOutputDir = 'output/playwright/reading-v2-paste-import-gate';

const startEvidenceCapture = (page: Page) => {
  const evidence = {
    console: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
  };

  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[Diag][ReadingV2Studio]') || text.includes('[Diag][ReadingV2PasteImportGate]')) {
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
  mkdirSync(pasteGateOutputDir, { recursive: true });
  writeFileSync(join(pasteGateOutputDir, `${name}.json`), JSON.stringify(evidence, null, 2));
};

test.describe('Reading V2 Studio smoke', () => {
  for (const viewport of smokeViewports) {
    test(`completes Studio preview and publish loop at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/__smoke/reading-v2-studio');

      await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-blank');
      await expect(page.getByRole('heading', { name: 'Reading V2 Smoke Material' })).toBeVisible();

      await page.getByLabel('Passage title').fill(`Smoke passage ${viewport.name}`);
      await page.getByLabel('Passage editor').fill(`Smoke paragraph ${viewport.name}. The answer word is resin.`);

      await page.getByRole('button', { name: 'Add Question Group' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add Question Group' });
      await dialog.getByLabel('Search question types').fill('Sentence Completion');
      await dialog.getByRole('button', { name: 'Sentence Completion', exact: true }).click();
      await dialog.getByRole('button', { name: 'Continue' }).click();

      const card = page.locator('article.reading-v2-build-card').last();
      await card.getByLabel(/instruction 1/i).fill('Complete the sentences below. Choose ONE WORD ONLY from the passage for each answer.');
      const rows = card.locator('fieldset');
      await rows.nth(0).getByLabel(/sentence text/i).fill('The answer word is _____.');
      await rows.nth(0).getByLabel(/accepted answers/i).fill('resin');
      await rows.nth(1).getByLabel(/sentence text/i).fill('The paragraph is a _____ paragraph.');
      await rows.nth(1).getByLabel(/accepted answers/i).fill('smoke');

      await page.getByRole('button', { name: 'Save Draft' }).click();
      await expect(page.getByText('Draft saved.')).toBeVisible();
      await page.getByRole('button', { name: 'Validate' }).click();

      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
      await expect(preview).toBeVisible();
      await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();
      const previewOverflow = await preview.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(previewOverflow.scrollWidth).toBeLessThanOrEqual(previewOverflow.clientWidth + 2);
      await preview.screenshot({
        path: `output/playwright/reading-v2-studio-preview-${viewport.name}.png`,
      });
      if (viewport.name === 'phone') {
        await preview.getByRole('button', { name: 'Open Questions' }).click();
        await expect(preview.getByLabel('Grouped question panel')).toBeVisible();
        const sheetOverflow = await preview.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        expect(sheetOverflow.scrollWidth).toBeLessThanOrEqual(sheetOverflow.clientWidth + 2);
        await preview.screenshot({
          path: 'output/playwright/reading-v2-studio-preview-phone-questions.png',
        });
        await preview.getByRole('button', { name: 'Close Questions' }).click();
        await expect(preview.getByLabel('Bottom-sheet question surface')).toBeHidden();
      }
      await page.getByRole('button', { name: 'Close Preview' }).click();

      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(page.getByText('Published successfully.')).toBeVisible();
    });

    test(`paste import diagnostics, preview, and publish success at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const evidence = startEvidenceCapture(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/__smoke/reading-v2-studio?fixture=valid-import');

      const diagnostics = page.getByLabel('Reading V2 import diagnostics');
      await expect(diagnostics).toBeVisible();
      await expect(diagnostics).toContainText('Teacher key authoritative');
      await expect(page.getByLabel('Metadata and publish readiness')).toContainText('Teacher answer key is authoritative for marking.');
      await page.screenshot({
        path: join(pasteGateOutputDir, `${viewport.name}-valid-import-studio.png`),
        fullPage: true,
      });

      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
      await expect(preview).toBeVisible();
      await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();
      await preview.screenshot({
        path: join(pasteGateOutputDir, `${viewport.name}-valid-import-preview.png`),
      });
      if (viewport.name === 'phone') {
        await preview.getByRole('button', { name: 'Open Questions' }).click();
        await expect(preview.getByLabel('Grouped question panel')).toBeVisible();
        await preview.screenshot({
          path: join(pasteGateOutputDir, 'phone-valid-import-preview-questions.png'),
        });
        await preview.getByRole('button', { name: 'Close Questions' }).click();
        await expect(preview.getByLabel('Bottom-sheet question surface')).toBeHidden();
      }
      await page.getByRole('button', { name: 'Close Preview' }).click();

      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(page.getByText('Published successfully.')).toBeVisible();

      expect(evidence.pageErrors).toEqual([]);
      saveEvidence(`${viewport.name}-valid-import-evidence`, {
        viewport,
        diagnosticsVisible: true,
        previewVisible: true,
        publishSuccess: true,
        ...evidence,
      });
    });
  }

  test('Auto V4 smoke import opens Studio, previews, and publishes without provider calls', async ({ page }) => {
    test.setTimeout(120_000);
    const evidence = startEvidenceCapture(page);
    const providerRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();

      if (url.includes('generativelanguage.googleapis.com') || url.includes('api.groq.com')) {
        providerRequests.push(url);
      }
    });

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-studio?fixture=auto-v4-valid-full-test', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-from-auto');
    await expect(page.getByText('Create from Auto')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reading V2 Smoke auto-v4-valid-full-test' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passage 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passage 2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passage 3', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'No required issues found.' })).toBeVisible();

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeVisible();
    await preview.screenshot({
      path: join(pasteGateOutputDir, 'desktop-auto-v4-import-preview.png'),
    });
    await page.getByRole('button', { name: 'Close Preview' }).click();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'Published successfully.' })).toBeVisible();
    await page.screenshot({
      path: join(pasteGateOutputDir, 'desktop-auto-v4-import-studio.png'),
      fullPage: true,
    });

    expect(providerRequests).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    saveEvidence('desktop-auto-v4-import-evidence', {
      mode: 'create-from-auto',
      providerRequests,
      previewVisible: true,
      publishSuccess: true,
      ...evidence,
    });
  });

  test('Auto V4 malformed smoke import fails closed without provider calls', async ({ page }) => {
    test.setTimeout(120_000);
    const evidence = startEvidenceCapture(page);
    const providerRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();

      if (url.includes('generativelanguage.googleapis.com') || url.includes('api.groq.com')) {
        providerRequests.push(url);
      }
    });

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-studio?fixture=auto-v4-malformed-key', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-from-auto');
    await expect(page.getByText('Create from Auto')).toBeVisible();
    await expect(page.getByText('Needs review')).toBeVisible();
    await expect(page.getByRole('button', { name: '2 validation items' })).toBeVisible();
    await expect(page.getByText('Missing answer').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Review import details' }).click();
    const diagnostics = page.getByLabel('Reading V2 import diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toContainText('Teacher key needs repair');
    await expect(diagnostics).toContainText('appears more than once');
    await expect(diagnostics).toContainText('Publish is blocked by teacher answer-key binding.');

    expect(providerRequests).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    saveEvidence('desktop-auto-v4-malformed-evidence', {
      mode: 'create-from-auto',
      providerRequests,
      diagnosticsVisible: true,
      publishBlocked: true,
      ...evidence,
    });
  });

  test('paste import malformed key shows diagnostics, repair jump, and publish block', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-studio?fixture=malformed-key');

    const diagnostics = page.getByLabel('Reading V2 import diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toContainText('Teacher key needs repair');
    await expect(diagnostics).toContainText('appears more than once');
    await diagnostics.locator('li').filter({ hasText: 'appears more than once' }).first()
      .getByRole('button', { name: 'Review' })
      .click();
    await expect.poll(
      () => evidence.console.some((message) =>
        message.includes('jumpImportDiagnostic') || message.includes('answer-key-line'),
      ),
    ).toBe(true);

    await expect(diagnostics).toContainText('Publish is blocked by teacher answer-key binding.');
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await page.screenshot({
      path: join(pasteGateOutputDir, 'desktop-malformed-key-diagnostics.png'),
      fullPage: true,
    });

    expect(evidence.pageErrors).toEqual([]);
    saveEvidence('desktop-malformed-key-evidence', {
      diagnosticsVisible: true,
      repairJump: true,
      publishBlocked: true,
      ...evidence,
    });
  });
});
