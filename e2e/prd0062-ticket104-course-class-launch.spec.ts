import { expect, type Page, type Route, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const ORIGIN = 'http://localhost:5174';
const WORKER_ORIGIN = 'https://luyentap-book-source-canonical-preview.iamhuwng.workers.dev';
const COURSE_ROUTE = `/student/practice/book-1?bookSurface=course&courseMaterialId=course-material-1&bindingId=binding-1`;
const CLASS_ROUTE = `/student/practice/book-1?bookSurface=class&classId=class-1&copyId=copy-1&classPlacementId=placement-1&classCourseMaterialId=material-1&bindingId=binding-1`;
const CLASS_CONTEXT_ID = 'class-class-1-copy-copy-1-material-material-1-placement-placement-1';
const HARNESS_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>* { box-sizing: border-box; } html, body, #root { margin: 0; min-height: 100%; padding: 0; }</style>
    <script type="module" src="/@vite/client"></script>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
  </head>
  <body><div id="root"></div>
    <script type="module" src="/e2e/fixtures/prd0062-ticket104-runtime-host-harness.tsx"></script>
  </body>
</html>`;

const PDF_BYTES = await (async () => {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return new Uint8Array(await document.save());
})();
const PDF_ETAG = `"${createHash('sha256').update(PDF_BYTES).digest('hex')}"`;

type LaunchSurface = 'course' | 'class';
type FailureMode = 'none' | 'wrong-context' | 'expired';

interface WorkerCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

const activityProjection = {
  schemaVersion: 1,
  title: 'Choose one',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Choose one answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact' },
  interactions: [{
    interactionId: 'interaction-1',
    family: 'choice',
    prompt: 'Choose one.',
    options: [{ itemId: 'option-a', label: 'Option A' }, { itemId: 'option-b', label: 'Option B' }],
  }],
  scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
};

const deliveryProjection = (
  surface: LaunchSurface,
  failureMode: FailureMode,
) => {
  const expectedContextId = surface === 'course' ? 'course-material-1' : CLASS_CONTEXT_ID;
  const contextId = failureMode === 'wrong-context' ? 'wrong-context-1' : expectedContextId;
  const contextKind = surface === 'course' ? 'course' : 'class';
  const entitlementBasis = surface === 'course' ? 'enrollment' : 'membership';

  return {
    schemaVersion: 1,
    projectionKind: 'book-runtime-delivery',
    bindingId: 'binding-1',
    bindingRevision: 1,
    recipientId: 'student-1',
    context: { contextId, kind: contextKind, entitlementBasis },
    book: {
      bookId: 'book-1',
      bookMode: 'pdf',
      bookRevision: 1,
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      publicationStatus: 'published',
    },
    scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
    outline: [{
      nodeKey: 'node-1',
      parentNodeKey: null,
      nodeType: 'section',
      order: 1,
      titleSnapshot: 'Unit 1',
    }],
    sourceSet: {
      strategy: 'component_pdfs',
      // Student delivery exposes only the trusted combined document route.
      // Private component source identities stay behind the delivery boundary.
      sources: [],
    },
    pageGroups: [{ pageGroupKey: 'node-1', combinedPhysicalPages: [1] }],
    documentRequests: [{
      opaqueRouteKey: 'bd_0123456789abcdef0123456789abcdef01234567-1-student-document',
      expectedByteLength: PDF_BYTES.length,
      expectedEtag: PDF_ETAG,
    }],
    activities: [{
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
      activityVersion: 1,
      nodeKey: 'node-1',
      order: 1,
      contextMode: 'none',
      sourceContext: {
        available: false,
        description: 'No source context is required.',
        pageGroupKeys: ['node-1'],
        sourcePageScopes: [],
      },
    }],
    actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
    provenance: {
      publicationId: 'publication-1',
      publicationRevision: 1,
      bindingId: 'binding-1',
      bindingRevision: 1,
    },
  };
};

const corsHeaders = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'accept, authorization, content-type, idempotency-key, range',
  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
  'access-control-expose-headers': 'etag, content-length, content-range, accept-ranges',
};

const fulfillJson = async (
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> => {
  await route.fulfill({
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

const installHarnessDocument = async (page: Page): Promise<void> => {
  await page.route('**/student/practice/**', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: HARNESS_DOCUMENT,
  }));
};

const installExternalBoundaryMocks = async (
  page: Page,
  surface: LaunchSurface,
  failureMode: FailureMode = 'none',
): Promise<WorkerCall[]> => {
  const calls: WorkerCall[] = [];

  await page.route(`${WORKER_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    calls.push({ method: request.method(), path, body });

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (path.includes('/v1/book-runtime-launch/activities')) {
      await fulfillJson(route, {
        activities: [{
          activityId: 'activity-1',
          activityVersionId: 'activity-version-1',
          projection: activityProjection,
          label: 'Choose one',
        }],
      });
      return;
    }

    if (path.includes('/course-book-placement/current/')) {
      if (failureMode === 'expired') {
        await fulfillJson(route, { code: 'binding_expired' }, 410);
        return;
      }
      await fulfillJson(route, deliveryProjection(surface, failureMode));
      return;
    }

    if (path.includes('/v1/book-class-placement/current/')) {
      if (failureMode === 'expired') {
        await fulfillJson(route, { code: 'binding_expired' }, 410);
        return;
      }
      await fulfillJson(route, deliveryProjection(surface, failureMode));
      return;
    }

    if (path.includes('/v1/book-delivery/document/')) {
      const range = request.headers()['range'];
      const end = PDF_BYTES.length - 1;
      const headers = {
        ...corsHeaders,
        'content-type': 'application/pdf',
        'content-length': String(PDF_BYTES.length),
        etag: PDF_ETAG,
        'accept-ranges': 'bytes',
      };
      if (request.method() === 'HEAD') {
        await route.fulfill({ status: 200, headers });
        return;
      }
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/u.exec(range);
        if (!match) { await route.fulfill({ status: 416, headers }); return; }
        const start = Number(match[1]);
        const requestedEnd = match[2] ? Number(match[2]) : end;
        if (!Number.isSafeInteger(start) || start > end || requestedEnd < start) {
          await route.fulfill({ status: 416, headers }); return;
        }
        const boundedEnd = Math.min(requestedEnd, end);
        await route.fulfill({ status: 206, headers: { ...headers, 'content-length': String(boundedEnd - start + 1), 'content-range': `bytes ${start}-${boundedEnd}/${PDF_BYTES.length}` }, body: Buffer.from(PDF_BYTES.slice(start, boundedEnd + 1)) });
        return;
      }
      await route.fulfill({ status: 200, headers, body: Buffer.from(PDF_BYTES) });
      return;
    }

    await fulfillJson(route, { code: 'not_found' }, 404);
  });

  // StudentShellRoute and its data hooks are real route dependencies. Keep
  // their Firebase RTDB boundary deterministic without supplying application
  // data that could mask the Book resolver assertions.
  await page.route('**://dummy.firebaseio.com/**', (route) => fulfillJson(route, null));
  return calls;
};

const openBookRoute = async (
  page: Page,
  route: string,
  surface: LaunchSurface,
  failureMode: FailureMode = 'none',
): Promise<WorkerCall[]> => {
  await installHarnessDocument(page);
  const calls = await installExternalBoundaryMocks(page, surface, failureMode);
  await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded' });
  return calls;
};

const expectRuntime = async (
  page: Page,
  context: string,
  options: { readonly assertActivityHeading?: boolean } = {},
): Promise<void> => {
  const shell = page.getByTestId('book-runtime-shell');
  try {
    await expect(shell).toBeVisible();
  } catch (error) {
    const diagnostic = await page.evaluate(async () => {
      const { parseBookPlacementLaunchQuery, resolveBookPlacementLaunch } =
        await import(`${location.origin}/src/services/book-delivery/bookPlacementLaunch.browser.ts`);
      const launch = parseBookPlacementLaunchQuery(location.search);
      if (launch.kind === 'none' || launch.kind === 'invalid') return launch;
      const result = await resolveBookPlacementLaunch({ launch, studentId: 'student-1' });
      return { result, error: result.status === 'blocked' && result.error instanceof Error
        ? { name: result.error.name, message: result.error.message, ...result.error } : null };
    });
    const path = test.info().outputPath('launch-diagnostic.json');
    await writeFile(path, JSON.stringify({ diagnostic, bodyText: await page.locator('body').textContent() }, null, 2));
    await test.info().attach('launch-diagnostic.json', { contentType: 'application/json', path });
    throw error;
  }
  if (options.assertActivityHeading !== false) {
    await expect(page.getByRole('heading', { name: 'Choose one' })).toBeVisible();
  }
};

test('PRD0062 #104 dispatches Course through the registered route and preserves it on reload', async ({ page }) => {
  const calls = await openBookRoute(page, COURSE_ROUTE, 'course');
  await expectRuntime(page, 'course');

  const firstLaunch = calls.find((call) => call.path === '/course-book-placement/current/course-material-1');
  expect(firstLaunch?.method).toBe('GET');
  expect(calls.some((call) => call.path === '/v1/book-runtime-launch/activities')).toBeTruthy();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRuntime(page, 'course');
  expect(calls.filter((call) => call.path === '/course-book-placement/current/course-material-1')).toHaveLength(2);
});

test('PRD0062 #104 dispatches exact Class identity through the registered route and preserves it on reload', async ({ page }) => {
  const calls = await openBookRoute(page, CLASS_ROUTE, 'class');
  await expectRuntime(page, 'class');

  const classLaunch = calls.find((call) => call.path === '/v1/book-class-placement/current/class-1/copy-1/placement-1/material-1/binding-1');
  expect(classLaunch?.method).toBe('GET');
  expect(calls.some((call) => call.path === '/v1/book-runtime-launch/activities')).toBeTruthy();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRuntime(page, 'class');
  expect(calls.filter((call) => call.path === '/v1/book-class-placement/current/class-1/copy-1/placement-1/material-1/binding-1')).toHaveLength(2);
});

test('PRD0062 #104 denies a projection bound to the wrong Course context', async ({ page }) => {
  await openBookRoute(page, COURSE_ROUTE, 'course', 'wrong-context');
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await expect(page.getByTestId('book-runtime-shell')).toHaveCount(0);
});

test('PRD0062 #104 denies an expired Class binding', async ({ page }) => {
  await openBookRoute(page, CLASS_ROUTE, 'class', 'expired');
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await expect(page.getByTestId('book-runtime-shell')).toHaveCount(0);
});

for (const width of [375, 320]) {
  test(`PRD0062 #104 successful runtime controls are touch-safe without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await openBookRoute(page, CLASS_ROUTE, 'class');
    await expectRuntime(page, 'class', { assertActivityHeading: false });

    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByRole('heading', { name: 'Choose one' })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: Array.from(document.querySelectorAll('button:where(:not([disabled])), input'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const target = element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)
            ? element.labels?.[0] ?? element : element;
          const rect = target.getBoundingClientRect();
          return { width: rect.width, height: rect.height, label: target.getAttribute('aria-label') ?? target.textContent ?? target.tagName };
        }),
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.controls.length).toBeGreaterThan(0);
    expect(metrics.controls.filter(({ width: controlWidth, height }) => controlWidth < 44 || height < 44)).toEqual([]);
  });

  test(`PRD0062 #104 blocked runtime controls are touch-safe without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await openBookRoute(page, CLASS_ROUTE, 'class', 'wrong-context');
    await expect(page.getByRole('alert')).toContainText('no longer available');

    const metrics = await page.evaluate(() => {
      const button = document.querySelector('button')?.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        buttonHeight: button?.height ?? 0,
        buttonWidth: button?.width ?? 0,
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(metrics.buttonWidth).toBeGreaterThanOrEqual(44);
  });
}
