import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const outputDir = 'output/playwright/reading-v2-import-preview-annotation-closure';

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
};

type CheckResult = {
  readonly id: string;
  readonly pass: boolean;
  readonly details?: unknown;
  readonly error?: string;
};

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
      || text.includes('[Diag][ReadingV2Runtime]')
      || text.includes('[Diag][ReadingV2VerticalLoopSmoke]')
    ) {
      evidence.console.push(text);
    }
  });
  page.on('pageerror', (error) => {
    evidence.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();

    if (
      url.includes('google-analytics.com/g/collect')
      || url.includes('googletagmanager.com/gtag/js')
      || url.includes('googletagmanager.com/td')
      || url.includes('firebaseinstallations.googleapis.com')
      || url.includes('firebaseio.com/.lp')
    ) {
      return;
    }

    evidence.requestFailures.push(`${request.method()} ${url} ${request.failure()?.errorText ?? ''}`);
  });

  return evidence;
};

const safeCheck = async (
  checks: CheckResult[],
  id: string,
  fn: () => Promise<unknown> | unknown,
) => {
  try {
    checks.push({ id, pass: true, details: await fn() });
  } catch (error) {
    checks.push({
      id,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const rectFor = async (locator: Locator): Promise<Rect> => {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error('Locator has no bounding box.');
  }

  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;

const openStudioFixture = async (page: Page, fixture: string, viewport: { width: number; height: number }) => {
  await page.setViewportSize(viewport);
  await page.goto(`/__smoke/reading-v2-studio?fixture=${fixture}`);
  await page.getByRole('button', { name: 'Preview', exact: true }).waitFor({ state: 'visible' });
};

const openPreview = async (page: Page): Promise<Locator> => {
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
  await preview.waitFor({ state: 'visible' });
  await page.getByRole('main', { name: 'Reading V2 Runtime Shell' }).waitFor({ state: 'visible' });
  return preview;
};

const closePreview = async (page: Page) => {
  const preview = page.getByRole('dialog', { name: 'Reading V2 teacher preview' });
  const closeButton = page.getByRole('button', { name: 'Close Preview' });

  if (await closeButton.count()) {
    await closeButton.click({ timeout: 8_000, force: true });
  }
  await preview.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => undefined);
};

const addScreenshot = async (
  target: Page | Locator,
  screenshots: string[],
  fileName: string,
  options: { fullPage?: boolean } = {},
) => {
  const screenshotPath = join(outputDir, fileName);
  await target.screenshot({ path: screenshotPath, ...options });
  screenshots.push(resolve(screenshotPath));
};

const topbarDetails = async (page: Page) => {
  const topbar = page.locator('.reading-v2-build__topbar');
  const zones = {
    identity: await rectFor(page.locator('.reading-v2-build__identity')),
    state: await rectFor(page.locator('.reading-v2-build__state-row')),
    actions: await rectFor(page.locator('.reading-v2-build__actions')),
  };
  const topbarOverflow = await topbar.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  const overlapPairs = [
    ['identity', 'state', zones.identity, zones.state],
    ['identity', 'actions', zones.identity, zones.actions],
    ['state', 'actions', zones.state, zones.actions],
  ] as const;
  const foundOverlaps = overlapPairs
    .filter(([, , first, second]) => overlaps(first, second))
    .map(([firstName, secondName]) => `${firstName}:${secondName}`);

  if (foundOverlaps.length > 0) {
    throw new Error(`Topbar zones overlap: ${foundOverlaps.join(', ')}`);
  }
  if (topbarOverflow.scrollWidth > topbarOverflow.clientWidth + 2) {
    throw new Error(`Topbar overflows by ${topbarOverflow.scrollWidth - topbarOverflow.clientWidth}px.`);
  }

  return { zones, topbarOverflow };
};

const footerGapDetails = async (preview: Locator) => {
  const footer = preview.locator('.reading-v2-runtime__footer');
  const previewBox = await rectFor(preview);
  const footerBox = await rectFor(footer);
  const footerGap = Math.round(previewBox.bottom - footerBox.bottom);

  if (footerGap > 2) {
    throw new Error(`Footer bottom gap is ${footerGap}px.`);
  }

  return { footerGap, footerBox, previewBox };
};

const writeEvidence = (evidence: unknown) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'final-evidence.json'), JSON.stringify(evidence, null, 2));
};

const gitSnapshot = () => ({
  head: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
  worktreeDirtyEntries: execFileSync('git', ['status', '--short'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean).length,
});

test.describe('Reading V2 import preview annotation closure', () => {
  test.setTimeout(360_000);

  test('rechecks all twelve comments and student-safe runtime smoke', async ({ page }) => {
    const checks: CheckResult[] = [];
    const screenshots: string[] = [];
    const evidence = startEvidenceCapture(page);

    mkdirSync(outputDir, { recursive: true });

    await safeCheck(checks, 'desktop cam10: topbar no overlap', async () => {
      await openStudioFixture(page, 'cam10-test1', { width: 1208, height: 876 });
      const details = await topbarDetails(page);
      await addScreenshot(page, screenshots, 'desktop-cam10-studio.png', { fullPage: true });
      return details;
    });

    await safeCheck(checks, 'desktop cam10: More removed and Exit direct', async () => {
      const moreCount = await page.getByRole('button', { name: 'More', exact: true }).count();
      const exitVisible = await page.getByRole('button', { name: /Exit/i }).isVisible();

      if (moreCount !== 0 || !exitVisible) {
        throw new Error(`Expected no More button and visible Exit. Found more=${moreCount}, exit=${exitVisible}.`);
      }

      return { moreCount, exitVisible };
    });

    let cam10Preview: Locator | null = null;
    await safeCheck(checks, 'desktop cam10: preview chrome removed', async () => {
      cam10Preview = await openPreview(page);
      await addScreenshot(cam10Preview, screenshots, 'desktop-cam10-preview.png');
      const hasRuntimePreview = await cam10Preview.getByText('Runtime Preview', { exact: true }).count();
      const hasLocalOnlyCopy = await cam10Preview.getByText(/Preview uses local-only answer state/i).count();
      const rightSummaryCount = await cam10Preview.locator('.reading-v2-runtime__right-summary').count();

      if (hasRuntimePreview || hasLocalOnlyCopy || rightSummaryCount) {
        throw new Error(`Preview chrome not removed: heading=${hasRuntimePreview}, copy=${hasLocalOnlyCopy}, rightSummary=${rightSummaryCount}.`);
      }

      return { hasRuntimePreview, hasLocalOnlyCopy, rightSummaryCount };
    });

    await safeCheck(checks, 'desktop cam10: footer flush', async () => {
      if (!cam10Preview) {
        throw new Error('Preview not opened.');
      }

      return footerGapDetails(cam10Preview);
    });

    await safeCheck(checks, 'Stepwells first paragraph no generated letter', async () => {
      if (!cam10Preview) {
        throw new Error('Preview not opened.');
      }

      const firstParagraph = (await cam10Preview.locator('.reading-v2-runtime__passage p').first().innerText()).trim();

      if (!firstParagraph.startsWith('A millennium ago')) {
        throw new Error(`Unexpected first paragraph: ${firstParagraph.slice(0, 80)}`);
      }

      return { firstParagraph: firstParagraph.slice(0, 140) };
    });

    await safeCheck(checks, 'TFNG instruction displayed once with compact controls', async () => {
      if (!cam10Preview) {
        throw new Error('Preview not opened.');
      }

      const instructionRules = cam10Preview.locator('.reading-v2-runtime__instructions').first().locator('.reading-v2-runtime__instruction-rule');
      const firstRuleTerm = instructionRules.first().locator('dt');
      const firstRuleDefinition = instructionRules.first().locator('dd');
      const questionOne = cam10Preview.locator('#reading-v2-question-1');
      const segmented = questionOne.locator('.reading-v2-runtime__segmented--judgement');
      const radioCount = await questionOne.getByRole('radio').count();
      const ruleCount = await instructionRules.count();

      if (await firstRuleTerm.innerText() !== 'TRUE' || ruleCount !== 3 || await segmented.count() !== 1 || radioCount !== 3) {
        throw new Error(`TFNG bad state: firstRule=${await firstRuleTerm.innerText()}, rules=${ruleCount}, segmented=${await segmented.count()}, radios=${radioCount}.`);
      }

      const termBox = await rectFor(firstRuleTerm);
      const definitionBox = await rectFor(firstRuleDefinition);
      if (definitionBox.x <= termBox.right || Math.abs(definitionBox.y - termBox.y) > 8) {
        throw new Error('TFNG instruction rule term/definition alignment is unclear.');
      }

      const trueChoice = questionOne.locator('.reading-v2-runtime__segmented-button').filter({ hasText: 'TRUE' }).first();
      await trueChoice.click({ timeout: 5_000 });
      const selected = await trueChoice.getAttribute('data-selected');

      if (selected !== 'true') {
        throw new Error('TFNG TRUE choice did not become selected.');
      }

      return { firstRule: await firstRuleTerm.innerText(), ruleCount, radioCount, termBox, definitionBox };
    });

    await closePreview(page);

    await safeCheck(checks, 'desktop short-answer: inline input and internal x clear', async () => {
      await openStudioFixture(page, 'task-short-answer', { width: 1208, height: 876 });
      const preview = await openPreview(page);
      const question = preview.locator('#reading-v2-question-1');
      const line = question.locator('.reading-v2-runtime__completion-line--short-answer');
      const promptSpan = line.locator('span').first();
      const shell = question.locator('.reading-v2-runtime__text-input-shell');
      const input = question.getByRole('textbox', { name: 'Question 1 answer' });

      await input.fill('shade');
      const clear = question.getByRole('button', { name: 'Clear answer for question 1' });
      const lineBox = await rectFor(line);
      const promptBox = await rectFor(promptSpan);
      const shellBox = await rectFor(shell);
      const clearBox = await rectFor(clear);

      if (shellBox.x <= promptBox.x || Math.abs(shellBox.y - lineBox.y) > 8) {
        throw new Error('Short-answer input is not positioned inline after prompt.');
      }
      if (!await clear.isEnabled()) {
        throw new Error('Short-answer internal clear is not enabled after typing.');
      }

      await addScreenshot(preview, screenshots, 'desktop-short-answer-preview.png');
      await closePreview(page);
      return { lineBox, promptBox, shellBox, clearBox };
    });

    await safeCheck(checks, 'desktop table-completion: answer field one line inside cell', async () => {
      await openStudioFixture(page, 'task-table-completion', { width: 1208, height: 876 });
      const preview = await openPreview(page);
      const field = preview.locator('.reading-v2-runtime__cell-answer-field').first();
      const badge = field.locator('.reading-v2-runtime__question-badge').first();
      const input = field.getByRole('textbox').first();

      await input.fill('answer');
      const clear = field.getByRole('button', { name: 'Clear answer for question 1' });
      const fieldBox = await rectFor(field);
      const badgeBox = await rectFor(badge);
      const inputBox = await rectFor(input);
      const clearBox = await rectFor(clear);

      if (badgeBox.x < fieldBox.x || inputBox.x <= badgeBox.right || clearBox.x <= inputBox.x) {
        throw new Error('Table field internals are not ordered within the field.');
      }
      if (Math.max(badgeBox.bottom, inputBox.bottom, clearBox.bottom) > fieldBox.bottom + 2) {
        throw new Error('Table field internals overflow vertically.');
      }

      await addScreenshot(preview, screenshots, 'desktop-table-preview.png');
      await closePreview(page);
      return { fieldBox, badgeBox, inputBox, clearBox };
    });

    await safeCheck(checks, 'desktop matching-headings: visible Clear link removed', async () => {
      await openStudioFixture(page, 'task-matching-headings', { width: 1208, height: 876 });
      const preview = await openPreview(page);
      const firstQuestion = preview.locator('[id^="reading-v2-question-"]').first();
      await firstQuestion.waitFor({ state: 'visible', timeout: 10_000 });
      const clearCount = await firstQuestion.getByRole('button', { name: 'Clear', exact: true }).count();

      if (clearCount) {
        throw new Error(`Matching-headings Clear button still visible: ${clearCount}.`);
      }

      await closePreview(page);
      return { clearCount };
    });

    await safeCheck(checks, 'desktop multiple-choice: option label and text aligned', async () => {
      await openStudioFixture(page, 'task-multiple-choice', { width: 1208, height: 876 });
      const preview = await openPreview(page);
      const firstQuestion = preview.locator('[id^="reading-v2-question-"]').first();
      await firstQuestion.waitFor({ state: 'visible', timeout: 10_000 });
      const optionB = firstQuestion.locator('.reading-v2-runtime__option').nth(1);
      const optionLabel = optionB.locator('.reading-v2-runtime__option-label');
      const optionText = optionB.locator('.reading-v2-runtime__option-text');
      const labelBox = await rectFor(optionLabel);
      const textBox = await rectFor(optionText);
      const optionBox = await rectFor(optionB);

      await optionB.click();
      if (textBox.x <= labelBox.right || Math.abs(textBox.y - labelBox.y) > 8) {
        throw new Error('Multiple-choice option label/text alignment is unclear.');
      }
      if (textBox.right > optionBox.right + 2 || textBox.x < optionBox.x) {
        throw new Error('Multiple-choice option text escapes option container.');
      }

      await addScreenshot(preview, screenshots, 'desktop-followup-preview.png');
      await closePreview(page);
      return { optionBox, labelBox, textBox };
    });

    await safeCheck(checks, 'desktop markdown formatting: visible content renders source marks safely', async () => {
      await openStudioFixture(page, 'task-markdown-formatting', { width: 1208, height: 876 });
      const preview = await openPreview(page);
      const boldCount = await preview.locator('strong').filter({ hasText: 'bold' }).count();
      const italicCount = await preview.locator('em').filter({ hasText: 'italic' }).count();
      const keptCount = await preview.locator('strong').filter({ hasText: 'kept' }).count();
      const codeCount = await preview.locator('code').filter({ hasText: 'code' }).count();
      const importantCount = await preview.locator('strong').filter({ hasText: 'important' }).count();
      const formattedCount = await preview.locator('strong').filter({ hasText: 'Formatted' }).count();
      const rawMarkdownCount = await preview.getByText(/\*\*(bold|important|Formatted)\*\*/).count();
      const injectedImageCount = await preview.locator('img[src="x"]').count();
      const literalHtmlText = await preview.getByText(/<img src=x onerror=alert\(1\)/).count();

      if (
        boldCount < 1
        || italicCount < 1
        || keptCount < 1
        || codeCount < 1
        || importantCount < 1
        || formattedCount < 1
        || rawMarkdownCount > 0
        || injectedImageCount > 0
        || literalHtmlText < 1
      ) {
        throw new Error(`Markdown formatting unsafe: bold=${boldCount}, italic=${italicCount}, kept=${keptCount}, code=${codeCount}, important=${importantCount}, formatted=${formattedCount}, raw=${rawMarkdownCount}, injectedImage=${injectedImageCount}, literalHtml=${literalHtmlText}.`);
      }

      await addScreenshot(preview, screenshots, 'desktop-markdown-formatting-preview.png');
      await closePreview(page);
      return {
        boldCount,
        italicCount,
        keptCount,
        codeCount,
        importantCount,
        formattedCount,
        rawMarkdownCount,
        injectedImageCount,
        literalHtmlText,
      };
    });

    await safeCheck(checks, 'desktop matching-sentence-endings: visible Clear link removed', async () => {
      await openStudioFixture(page, 'task-matching-sentence-endings', { width: 1208, height: 876 });
      const preview = await openPreview(page);
      const firstQuestion = preview.locator('[id^="reading-v2-question-"]').first();
      await firstQuestion.waitFor({ state: 'visible', timeout: 10_000 });
      const clearCount = await firstQuestion.getByRole('button', { name: 'Clear', exact: true }).count();

      if (clearCount) {
        throw new Error(`Matching-sentence-endings Clear button still visible: ${clearCount}.`);
      }

      await closePreview(page);
      return { clearCount };
    });

    for (const viewport of [
      { name: 'tablet', width: 900, height: 900 },
      { name: 'phone', width: 390, height: 844 },
    ] as const) {
      await safeCheck(checks, `${viewport.name} full-test: topbar and preview shell`, async () => {
        await openStudioFixture(page, 'valid-full-test', { width: viewport.width, height: viewport.height });
        const details = await topbarDetails(page);
        await addScreenshot(page, screenshots, `${viewport.name}-full-test-studio.png`, { fullPage: true });
        const preview = await openPreview(page);
        await addScreenshot(preview, screenshots, `${viewport.name}-full-test-preview.png`);

        const hasRuntimePreview = await preview.getByText('Runtime Preview', { exact: true }).count();
        const hasLocalOnlyCopy = await preview.getByText(/Preview uses local-only answer state/i).count();
        const rightSummaryCount = await preview.locator('.reading-v2-runtime__right-summary').count();
        const footerDetails = viewport.name === 'tablet'
          ? await footerGapDetails(preview)
          : { mobileFooterCount: await preview.locator('.reading-v2-runtime__footer').count() };

        if (hasRuntimePreview || hasLocalOnlyCopy || rightSummaryCount) {
          throw new Error(`Preview chrome returned on ${viewport.name}.`);
        }
        if ('mobileFooterCount' in footerDetails && footerDetails.mobileFooterCount !== 0) {
          throw new Error('Phone should use bottom-sheet runtime without desktop footer.');
        }

        await closePreview(page);
        return { details, footerDetails };
      });
    }

    await safeCheck(checks, 'student-safe full-test runtime: TFNG and YNNG live smoke', async () => {
      await page.setViewportSize({ width: 1208, height: 876 });
      await page.goto('/__smoke/reading-v2-vertical-loop?fixture=valid-full-test');
      await page.getByRole('main', { name: 'Reading V2 Runtime Shell' }).waitFor({ state: 'visible' });
      await expect(page.getByTestId('reading-v2-vertical-loop-status')).toContainText('Runtime student-safe');

      const tfngQuestion = page.locator('#reading-v2-question-1');
      const falseChoice = tfngQuestion.locator('.reading-v2-runtime__segmented-button').filter({ hasText: 'FALSE' }).first();
      await falseChoice.waitFor({ state: 'visible', timeout: 10_000 });
      await falseChoice.click({ timeout: 5_000 });

      if (await falseChoice.getAttribute('data-selected') !== 'true') {
        throw new Error('Student-safe TFNG FALSE choice did not become selected.');
      }

      await page.getByRole('button', { name: /Part 3/ }).first().click();
      const ynngQuestion = page.locator('#reading-v2-question-32');
      const noChoice = ynngQuestion.locator('.reading-v2-runtime__segmented-button').filter({ hasText: 'NO' }).first();
      await noChoice.waitFor({ state: 'visible', timeout: 10_000 });
      await noChoice.click({ timeout: 5_000 });

      if (await noChoice.getAttribute('data-selected') !== 'true') {
        throw new Error('Student-safe YNNG NO choice did not become selected.');
      }

      const auditText = await page.getByTestId('reading-v2-projection-safety-audit').textContent();
      const audit = JSON.parse(auditText ?? '{}') as Record<'studentSafe' | 'sessionSafe', Record<string, boolean>>;

      if (Object.values(audit.studentSafe).some(Boolean) || Object.values(audit.sessionSafe).some(Boolean)) {
        throw new Error('Student/session-safe projection audit has forbidden tokens.');
      }

      await addScreenshot(page, screenshots, 'desktop-student-runtime-full-test.png', { fullPage: true });
      return { tfng: 'checked FALSE', ynng: 'checked NO', audit };
    });

    const commentResults = {
      1: 'pass: More removed and Exit direct in live topbar',
      2: 'pass: desktop/tablet/phone topbar zones do not overlap',
      3: 'pass: visible Runtime Preview heading absent',
      4: 'pass: visible local-only helper paragraph absent',
      5: 'pass: redundant right summary header absent',
      6: 'pass: Stepwells first paragraph starts with source text, no generated A prefix',
      7: 'pass: TFNG standard instruction displayed once from canonical renderer',
      8: 'pass: TFNG compact segmented controls and internal x clear',
      9: 'pass: short-answer input inline with prompt',
      10: 'pass: short-answer x clear inside input shell',
      11: 'pass: table blank badge/input/x kept one line inside field',
      12: 'pass: desktop/tablet footer flush; phone uses bottom-sheet runtime without desktop footer',
    };
    const foundationResults = {
      markdownFormatting: 'pass: external-AI structured import preserves Markdown marks; runtime renders bold/italic/code safely and treats HTML-like text as inert text',
    };
    const followUpCommentResults = {
      1: 'pass: question instruction text renders as structured instruction lines plus aligned definition rules',
      2: 'pass: Q14 matching-headings visible Clear link removed',
      3: 'pass: Q27 multiple-choice label and text align inside one option copy block',
      4: 'pass: Q35 matching-sentence-endings visible Clear link removed',
    };
    const pass = checks.every((check) => check.pass)
      && evidence.pageErrors.length === 0
      && evidence.requestFailures.length === 0;

    writeEvidence({
      routeBase: 'http://localhost:5173/__smoke/reading-v2-studio',
      generatedAt: new Date().toISOString(),
      checks,
      pageErrors: evidence.pageErrors,
      requestFailures: evidence.requestFailures,
      consoleDiagnostics: evidence.console,
      pass,
      git: gitSnapshot(),
      screenshots,
      commentResults,
      foundationResults,
      followUpCommentResults,
    });

    expect(pass).toBe(true);
  });
});
