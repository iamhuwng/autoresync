import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-studio-final-editor/responsive-hardening';

const viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const longPassage = Array.from({ length: 24 }, (_, index) =>
  `Paragraph ${index + 1}. This long IELTS Reading passage checks independent editor scrolling, wrapped mobile controls, and repeated save validation performance for the final editor foundation.`,
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
      text.includes('[Diag][ReadingV2Studio]')
      || text.includes('[Diag][ReadingV2PasteImportGate]')
      || text.includes('[Diag][ReadingV2Smoke]')
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

const pressFocusedButton = async (page: Page, button: Locator) => {
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
};

const fillAllAnswers = async (
  region: Locator,
  label: RegExp,
  valueFor: (index: number) => string,
) => {
  const answers = region.getByLabel(label);
  const count = await answers.count();

  for (let index = 0; index < count; index += 1) {
    await answers.nth(index).fill(valueFor(index));
  }
};

const setStressTitle = async (page: Page) => {
  await page.locator('.reading-v2-build__identity h1').evaluate((node) => {
    const title = 'IELTS Reading-v2 Test - May 2026 Validation status and teacher review queue with a deliberately long title';
    node.textContent = title;
    node.setAttribute('title', title);
  });
};

const assertBuildTopbarLayout = async (page: Page, label: string) => {
  const metrics = await page.evaluate((viewportLabel) => {
    const topbar = document.querySelector('.reading-v2-build__topbar') as HTMLElement | null;
    const selectors = [
      ['identity', '.reading-v2-build__identity'],
      ['state', '.reading-v2-build__state-row'],
      ['actions', '.reading-v2-build__actions'],
    ] as const;

    const rectFor = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };

    const missing = selectors
      .filter(([, selector]) => !document.querySelector(selector))
      .map(([name]) => name);

    if (!topbar) {
      return {
        label: viewportLabel,
        missing: ['topbar', ...missing],
        topbarOverflowX: 0,
        zoneOverlapPairs: [] as string[],
        zonesInsideTopbar: false,
      };
    }

    const topbarRect = rectFor(topbar);
    const zoneRects = selectors
      .map(([name, selector]) => {
        const element = document.querySelector(selector);
        return element ? { name, rect: rectFor(element) } : null;
      })
      .filter((entry): entry is { name: string; rect: ReturnType<typeof rectFor> } => Boolean(entry));
    const zoneOverlapPairs: string[] = [];

    for (let index = 0; index < zoneRects.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < zoneRects.length; nextIndex += 1) {
        const first = zoneRects[index]!;
        const second = zoneRects[nextIndex]!;
        const horizontalOverlap = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
        const verticalOverlap = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);

        if (horizontalOverlap > 1 && verticalOverlap > 1) {
          zoneOverlapPairs.push(`${first.name}-${second.name}`);
        }
      }
    }

    return {
      label: viewportLabel,
      missing,
      topbarOverflowX: Math.max(0, topbar.scrollWidth - topbar.clientWidth),
      zoneOverlapPairs,
      zonesInsideTopbar: zoneRects.every(({ rect }) =>
        rect.left >= topbarRect.left - 1
        && rect.right <= topbarRect.right + 1
        && rect.top >= topbarRect.top - 1
        && rect.bottom <= topbarRect.bottom + 1),
    };
  }, label);

  expect(metrics.missing, `${label} topbar zones should exist`).toEqual([]);
  expect(metrics.topbarOverflowX, `${label} topbar must not overflow horizontally`).toBeLessThanOrEqual(4);
  expect(metrics.zoneOverlapPairs, `${label} topbar zones must not overlap`).toEqual([]);
  expect(metrics.zonesInsideTopbar, `${label} topbar zones must stay inside header`).toBe(true);

  return metrics;
};

const assertOverlayInsideViewport = async (page: Page, selector: string) => {
  const metrics = await page.evaluate((overlaySelector) => {
    const overlay = document.querySelector(overlaySelector) as HTMLElement | null;

    if (!overlay) {
      return { insideViewport: false, visible: false };
    }

    const rect = overlay.getBoundingClientRect();
    const style = getComputedStyle(overlay);

    return {
      insideViewport: rect.left >= -1
        && rect.right <= window.innerWidth + 1
        && rect.top >= -1
        && rect.bottom <= window.innerHeight + 1,
      visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
    };
  }, selector);

  expect(metrics.visible, `${selector} should be visible`).toBe(true);
  expect(metrics.insideViewport, `${selector} should stay inside viewport`).toBe(true);

  return metrics;
};

test.describe('Reading V2 Studio Phase 7 responsive hardening', () => {
  test.setTimeout(120_000);

  for (const viewport of viewports) {
    test(`long imported editor stays usable at ${viewport.name}`, async ({ page }) => {
      const evidence = startEvidenceCapture(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/__smoke/reading-v2-studio?fixture=valid-full-test');

      await expect(page.getByRole('main').first()).toHaveAttribute('data-mode', 'create-from-import');
      await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
      await setStressTitle(page);

      await page.getByRole('button', { name: 'Passage 3', exact: true }).click();
      await expect(page.getByLabel('Passage 3 editor')).toBeVisible();
      await page.getByRole('textbox', { name: 'Passage editor' }).fill(longPassage);
      const topbarMetrics = await assertBuildTopbarLayout(page, viewport.name);

      const metrics = await page.evaluate(() => {
        const html = document.documentElement;
        const passagePanel = document.querySelector('.reading-v2-build__passage-panel') as HTMLElement | null;
        const questionPanel = document.querySelector('.reading-v2-build__question-panel') as HTMLElement | null;
        const passageEditor = document.querySelector('.reading-v2-build__passage-rich-editor') as HTMLElement | null;
        const toolbar = document.querySelector('.reading-v2-build__editor-tools') as HTMLElement | null;
        const actions = Array.from(document.querySelectorAll('.reading-v2-build__actions button')) as HTMLElement[];
        const primaryActionsVisible = actions.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0
            && rect.height > 0
            && rect.left >= -1
            && rect.right <= window.innerWidth + 1;
        });

        return {
          rootClientWidth: html.clientWidth,
          rootScrollWidth: html.scrollWidth,
          pageHorizontalOverflow: html.scrollWidth - html.clientWidth,
          passagePanelOverflowY: passagePanel ? getComputedStyle(passagePanel).overflowY : '',
          passageEditorCanScroll: passageEditor ? passageEditor.scrollHeight > passageEditor.clientHeight : false,
          questionPanelCanScroll: questionPanel ? questionPanel.scrollHeight > questionPanel.clientHeight : false,
          questionPanelOverflowY: questionPanel ? getComputedStyle(questionPanel).overflowY : '',
          toolbarVisible: toolbar ? toolbar.getBoundingClientRect().height > 0 : false,
          primaryActionCount: actions.length,
          primaryActionsVisible,
        };
      });

      expect(metrics.pageHorizontalOverflow).toBeLessThanOrEqual(4);
      expect(metrics.passagePanelOverflowY).toBe('auto');
      expect(metrics.passageEditorCanScroll).toBe(true);
      expect(metrics.questionPanelCanScroll).toBe(true);
      expect(metrics.questionPanelOverflowY).toBe('auto');
      expect(metrics.toolbarVisible).toBe(true);
      expect(metrics.primaryActionCount).toBeGreaterThanOrEqual(4);
      expect(metrics.primaryActionsVisible).toBe(true);

      const perfStarted = Date.now();
      for (let index = 0; index < 3; index += 1) {
        await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
        await page.getByRole('button', { name: 'Validate', exact: true }).click();
      }
      const repeatedSaveValidateMs = Date.now() - perfStarted;

      expect(repeatedSaveValidateMs).toBeLessThan(8000);
      await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'No required issues found.' })).toBeVisible();

      await page.screenshot({
        path: join(outputDir, `${viewport.name}-layout.png`),
        fullPage: true,
      });

      expect(evidence.pageErrors).toEqual([]);
      expect(evidence.requestFailures).toEqual([]);

      saveEvidence(`${viewport.name}-layout-evidence`, {
        viewport,
        metrics,
        topbarMetrics,
        repeatedSaveValidateMs,
        keyboardReachableControls: ['Save Draft', 'Validate', 'Preview', 'Publish', 'More'],
        ...evidence,
      });
    });
  }

  test('topbar compacts warnings and secondary actions without overlap', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1208, height: 876 });
    await page.goto('/__smoke/reading-v2-studio');
    await setStressTitle(page);

    const warningButton = page.getByRole('button', { name: /validation item/i });
    await expect(warningButton).toBeVisible();
    await warningButton.focus();
    const warningOverlayMetrics = await assertOverlayInsideViewport(page, '.reading-v2-build__warning-popover');

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByLabel('More workspace actions')).toBeVisible();
    const moreOverlayMetrics = await assertOverlayInsideViewport(page, '.reading-v2-build__more-popover');
    const topbarMetrics = await assertBuildTopbarLayout(page, 'desktop-warning-topbar');

    await page.screenshot({
      path: join(outputDir, 'desktop-warning-topbar.png'),
      fullPage: true,
    });

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);

    saveEvidence('desktop-warning-topbar-evidence', {
      viewport: { width: 1208, height: 876 },
      topbarMetrics,
      warningOverlayMetrics,
      moreOverlayMetrics,
      ...evidence,
    });
  });

  test('keyboard controls reach toolbar, passage blocks, repairs, validation, preview, and publish', async ({ page }) => {
    const evidence = startEvidenceCapture(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/__smoke/reading-v2-studio?fixture=structured-repair');

    const passageEditor = page.getByRole('textbox', { name: 'Passage editor' });
    await passageEditor.focus();
    await expect(passageEditor).toBeFocused();

    await pressFocusedButton(page, page.getByRole('button', { name: 'Bold' }));
    await pressFocusedButton(page, page.getByRole('button', { name: 'Add image block' }));
    const imageBlock = page.getByRole('region', { name: 'Image block 1' });
    await expect(imageBlock).toBeVisible();
    await imageBlock.getByLabel('Image block 1 caption').fill('Keyboard inserted block');
    await imageBlock.getByLabel('Image block 1 URL').fill('data:image/gif;base64,R0lGODlhAQABAAAAACw=');
    await imageBlock.getByLabel('Image block 1 alt text').fill('Keyboard inserted diagram');
    await imageBlock.getByLabel('Image block 1 source').fill('Keyboard source');

    const tableEditor = page.getByLabel('Table Completion Builder');
    await pressFocusedButton(page, tableEditor.getByRole('button', { name: 'Create linked question' }));
    await fillAllAnswers(tableEditor, /Correct answers for Question/i, (index) => `table keyboard ${index + 1}`);

    await page.locator('article.reading-v2-build-card').filter({ hasText: 'Flowchart Completion' }).first().click();
    const flowchartEditor = page.getByLabel('Flowchart Completion dedicated editor');
    await pressFocusedButton(page, flowchartEditor.getByRole('button', { name: 'Mark as Blank' }).first());
    await fillAllAnswers(flowchartEditor, /Flowchart answer for Question/i, (index) => `flow keyboard ${index + 1}`);

    await page.locator('article.reading-v2-build-card').filter({ hasText: 'Diagram Labelling' }).first().click();
    const diagramEditor = page.getByLabel(/Diagram Labell?ing dedicated editor/i);
    await pressFocusedButton(page, diagramEditor.getByRole('button', { name: 'Create answer key' }).first());
    await fillAllAnswers(diagramEditor, /Diagram answer for Question/i, (index) => `diagram keyboard ${index + 1}`);

    await pressFocusedButton(page, page.getByRole('button', { name: 'Validate', exact: true }));
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'No required issues found.' })).toBeVisible();

    await pressFocusedButton(page, page.getByRole('button', { name: 'Preview', exact: true }));
    await expect(page.getByRole('dialog', { name: 'Reading V2 teacher preview' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Reading V2 teacher preview' }).getByRole('button', { name: /Close/i }).click();

    await pressFocusedButton(page, page.getByRole('button', { name: 'Publish', exact: true }));
    await expect(page.locator('.reading-v2-build__workflow-pill').filter({ hasText: 'Published successfully.' })).toBeVisible();

    await page.screenshot({
      path: join(outputDir, 'desktop-keyboard-repair-publish.png'),
      fullPage: true,
    });

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    expect(evidence.console.some((message) => message.includes('questionLinkRepair'))).toBe(true);
    expect(evidence.console.some((message) => message.includes('publish') && message.includes('success'))).toBe(true);

    saveEvidence('desktop-keyboard-evidence', {
      keyboardPaths: [
        'passage editor focus',
        'toolbar Bold',
        'Add image block',
        'table repair link',
        'flowchart repair link',
        'diagram repair link',
        'Validate',
        'Preview',
        'Publish',
      ],
      ...evidence,
    });
  });
});
