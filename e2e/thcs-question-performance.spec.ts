import { expect, test, type Page } from '@playwright/test';
import { performance } from 'node:perf_hooks';

declare global {
  interface Window {
    __thcsQuestionPerf?: { mountDurationMs: number; commits: number };
  }
}

const fixtureUrl = '/thcs-question-perf-entry?mode=';
const editorFixturePath = '/e2e/fixtures/thcs-question-performance-harness.tsx';

async function mountFixture(page: Page, mode: 'create' | 'draft' | 'modal' | 'large') {
  await page.route('**/thcs-question-perf-entry?*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
    </head>
    <body><div id="root"></div><script type="module" src="${editorFixturePath}"></script></body></html>`,
  }));
  await page.goto(`${fixtureUrl}${mode}`, { waitUntil: 'domcontentloaded' });
  const fixture = page.getByTestId('thcs-question-performance');
  await expect(fixture).toHaveAttribute('data-mode', mode);
  return fixture;
}

async function questionEditorCount(page: Page) {
  return page.getByText(/^Q\d+$/).count();
}

function sectionButton(page: Page, order: number, name: string, questionCount: number) {
  return page.getByRole('button', { name: `${order} ${name} ${questionCount} Q · ${questionCount}pts`, exact: true });
}

async function recordMeasurement(page: Page, fixture: ReturnType<Page['getByTestId']>, label: string, initialCount: number, scrolledCount: number) {
  const data = await fixture.evaluate((element) => ({
    mode: element.getAttribute('data-mode'),
    sectionCount: Number(element.getAttribute('data-section-count')),
    questionCount: Number(element.getAttribute('data-question-count')),
    renderReadyMs: Number(element.getAttribute('data-render-ready-ms')),
    reactMountDurationMs: window.__thcsQuestionPerf?.mountDurationMs ?? null,
  }));
  const measurement = {
    label,
    ...data,
    initialQuestionEditors: initialCount,
    afterScrollQuestionEditors: scrolledCount,
  };
  console.info(`[thcs-question-perf] ${JSON.stringify(measurement)}`);
  await test.info().attach(`${label}-measurement.json`, {
    body: JSON.stringify(measurement, null, 2),
    contentType: 'application/json',
  });
  return measurement;
}

function expectNoRemoteWrites(page: Page) {
  const trackedPage = page as Page & { externalWrites?: string[]; externalWriteResponses?: string[] };
  const firebaseInstallationsInit = 'POST https://firebaseinstallations.googleapis.com/v1/projects/dummy/installations';
  const writes = trackedPage.externalWrites ?? [];
  expect(writes.filter((write) => write !== firebaseInstallationsInit)).toEqual([]);
  expect(writes.length).toBeLessThanOrEqual(1);
  expect(trackedPage.externalWriteResponses).toEqual([]);
}

test.beforeEach(async ({ page, context }) => {
  const externalWrites: string[] = [];
  const externalWriteResponses: string[] = [];
  page.on('response', (response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (url.hostname !== 'localhost' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      externalWriteResponses.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      externalWrites.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
    await route.abort();
  });
  (page as Page & { externalWrites?: string[] }).externalWrites = externalWrites;
  (page as Page & { externalWriteResponses?: string[] }).externalWriteResponses = externalWriteResponses;
});

test('creation mounts one active section and loads questions in 20-question scroll batches', async ({ page }) => {
  test.setTimeout(90_000);
  const start = performance.now();
  const fixture = await mountFixture(page, 'create');
  await expect(fixture).toHaveAttribute('data-section-count', '1');
  await expect(fixture).toHaveAttribute('data-question-count', '100');
  const initialCount = await questionEditorCount(page);

  await page.mouse.move(950, 800);
  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(40);
  const afterScrollCount = await questionEditorCount(page);
  const measurement = await recordMeasurement(page, fixture, 'creation-one-active-section', initialCount, afterScrollCount);
  console.info(`[thcs-question-perf] end-to-end-to-first-scroll-ms=${Math.round(performance.now() - start)}`);

  expect(initialCount, 'first paint should mount the first 20 question editors').toBe(20);
  expect(afterScrollCount, 'one scroll batch should mount 20 more editors').toBe(40);
  expect(measurement.renderReadyMs).toBeGreaterThanOrEqual(0);
  expectNoRemoteWrites(page);
});

test('draft editing batches 7 sections / 158 questions and retains the active section batch', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await mountFixture(page, 'draft');
  await expect(fixture).toHaveAttribute('data-section-count', '7');
  await expect(fixture).toHaveAttribute('data-question-count', '158');
  const initialCount = await questionEditorCount(page);

  await sectionButton(page, 2, 'Section 2', 23).click();
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBe(20);
  await page.mouse.move(950, 800);
  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBe(23);
  const scrolledCount = await questionEditorCount(page);

  await sectionButton(page, 1, 'Section 1', 23).click();
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBe(20);
  await sectionButton(page, 2, 'Section 2', 23).click();
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBe(23);

  const editStart = performance.now();
  const firstQuestion = page.getByRole('textbox', { name: 'Question', exact: true }).first();
  await firstQuestion.fill('Edited fixture question');
  await expect(firstQuestion).toHaveValue('Edited fixture question');
  console.info(`[thcs-question-perf] edit-round-trip-ms=${Math.round(performance.now() - editStart)}`);

  const sectionTwoHandle = page.getByRole('button', { name: 'Drag to reorder Section 2', exact: true });
  const sectionOneHandle = page.getByRole('button', { name: 'Drag to reorder Section 1', exact: true });
  const sourceBox = await sectionTwoHandle.boundingBox();
  const targetBox = await sectionOneHandle.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  console.info(`[thcs-sidebar-drag] ${JSON.stringify({ sourceBox, targetBox })}`);
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2, { steps: 2 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(sectionButton(page, 1, 'Section 2', 23)).toBeVisible();
  await page.getByRole('button', { name: 'Move section down' }).click();
  await expect(sectionButton(page, 2, 'Section 2', 23)).toBeVisible();
  await recordMeasurement(page, fixture, 'draft-seven-sections-158-questions', initialCount, scrolledCount);

  expect(initialCount, 'editing should mount only the first 20 question editors').toBe(20);
  expectNoRemoteWrites(page);
});

test('published THCS editor modal uses the same question batches', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await mountFixture(page, 'modal');
  await expect(fixture).toHaveAttribute('data-section-count', '7');
  await expect(fixture).toHaveAttribute('data-question-count', '158');
  await expect(page.getByRole('dialog')).toBeVisible();
  const initialCount = await questionEditorCount(page);

  await page.mouse.move(900, 750);
  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBe(23);
  const afterScrollCount = await questionEditorCount(page);
  await recordMeasurement(page, fixture, 'published-modal-seven-sections-158-questions', initialCount, afterScrollCount);

  expect(initialCount, 'published modal should mount the first 20 question editors').toBe(20);
  expectNoRemoteWrites(page);
});

test('large draft editing fixture starts with one 20-question batch', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await mountFixture(page, 'large');
  await expect(fixture).toHaveAttribute('data-section-count', '7');
  await expect(fixture).toHaveAttribute('data-question-count', '700');
  const initialCount = await questionEditorCount(page);
  await page.mouse.move(950, 800);
  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => questionEditorCount(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(40);
  const afterScrollCount = await questionEditorCount(page);
  await recordMeasurement(page, fixture, 'large-seven-sections-700-questions', initialCount, afterScrollCount);

  expect(initialCount, 'large editing should mount only the first 20 question editors').toBe(20);
  expect(afterScrollCount, 'large editing should add one 20-question batch on scroll').toBe(40);
  expectNoRemoteWrites(page);
});
