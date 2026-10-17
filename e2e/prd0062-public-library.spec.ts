import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const fixture = 'http://localhost:8793';
const runtimeMatrix = process.env.PUBLIC_RUNTIME_MATRIX === '1';
/** Only Firebase SDK's external DataSnapshot/query transport is substituted. */
const databaseTransport = (nativeUrl: string) => `
export * from ${JSON.stringify(nativeUrl)};
const origin = ${JSON.stringify(fixture)};
const call = async (payload) => {
  const response = await fetch(origin + '/__homework-production/storage', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if (!response.ok) throw new Error('public_fixture_sdk_transport_' + response.status);
  return response.json();
};
export const ref = (_, path = '') => ({path, key:path.split('/').at(-1), toString:() => path});
export const child = (parent, path) => ref(null, parent.path + '/' + path);
export const query = (base, ...constraints) => ({...base, constraints});
export const orderByChild = value => ({type:'orderByChild',value});
export const orderByKey = () => ({type:'orderByKey',value:'$key'});
export const limitToLast = value => ({type:'limitToLast',value});
export const limitToFirst = value => ({type:'limitToFirst',value});
export const endBefore = (value, key) => ({type:'endBefore',value,key});
export const endAt = (value, key) => ({type:'endAt',value,key});
export const startAt = value => ({type:'startAt',value});
export const equalTo = value => ({type:'equalTo',value});
const snapshot = (reference, value) => ({ref:reference,key:reference.key,val:()=>value,exists:()=>value!==null,
  child:path=>snapshot(child(reference,path),path.split('/').reduce((row,key)=>row?.[key],value)??null),
  hasChild:path=>path.split('/').reduce((row,key)=>row?.[key],value)!=null,
  forEach:callback=>{for(const [key,row] of Object.entries(value??{})){if(callback(snapshot(child(reference,key),row))===true)return true;}return false;}});
export const get = async reference => snapshot(reference,await call({method:'read',path:reference.path,query:reference.constraints}));
export const onValue = (reference, callback, error) => {let active=true;get(reference).then(row=>{if(active)callback(row);}).catch(error);return()=>{active=false;};};
export const onChildAdded = (reference, callback) => onValue(reference,row=>row.forEach(callback));
export const onChildChanged = () => () => {};
export const onChildRemoved = () => () => {};
export const off = () => {};
export const set = (reference,value) => call({method:'write',path:reference.path,value});
export const remove = reference => call({method:'remove',path:reference.path});
export const update = (reference,payload) => call({method:'update',payload:Object.fromEntries(Object.entries(payload).map(([path,value])=>[reference.path ? reference.path+'/'+path : path,value]))});
export const push = (reference,value) => {const result=child(reference,'qa-'+Date.now()+'-'+Math.random().toString(36).slice(2));if(value!==undefined)void set(result,value);return result;};
export const onDisconnect = () => ({remove:async()=>{},cancel:async()=>{},set:async()=>{}});
`;

test('Admin moderation approves Library Books for genuine Public Runtime and private ungraded Results', async ({ page, request, browser }, testInfo) => {
  test.setTimeout(360_000);
  const bootstrap = await request.post(`${fixture}/__public-production/bootstrap?review=pending${runtimeMatrix ? '&matrix=1' : ''}`);
  const bootstrapBody = await bootstrap.text();
  expect(bootstrap.status(), bootstrapBody).toBe(200);
  const proof = JSON.parse(bootstrapBody);
  expect(proof.producers).toEqual(['bootstrapPublication', 'updateBookMetadata']);
  expect(proof.readiness).toBeNull();
  const commands: Array<{ url: string; body: string }> = [];
  let publicContextId = '';
  let publicDocumentRoute = '';
  let referencePage = 0;
  page.on('response', async response => {
    if (/\/v1\/book-public\/books\/[^/]+\/launch$/u.test(new URL(response.url()).pathname) && response.ok()) {
      const projection = (await response.json()).projection;
      publicContextId = projection.context.contextId;
      publicDocumentRoute = projection.documentRequests[0].opaqueRouteKey;
      referencePage = projection.pageGroups.find((group: { pageGroupKey: string }) => group.pageGroupKey === 'pages-reference')?.combinedPhysicalPages[0] ?? 0;
    }
  });
  page.on('request', outgoing => {
    if (outgoing.url().includes('/book-runtime/commands')) commands.push({ url: outgoing.url(), body: outgoing.postData() ?? '' });
  });
  const installTransports = async (page: Page, request: APIRequestContext, uid: string) => {
  await page.route('**/firebase_database.js*', async route => {
    if (route.request().url().includes('public-native=1')) return route.continue();
    const nativeUrl = route.request().url() + '&public-native=1';
    return route.fulfill({ contentType: 'text/javascript', body: databaseTransport(nativeUrl) });
  });
  await page.route(url => url.hostname === 'identitytoolkit.googleapis.com' || url.hostname === 'securetoken.googleapis.com', async route => {
    const response = await request.get(`${fixture}/__homework-production/auth-response?uid=${uid}`);
    const auth = await response.json();
    const url = new URL(route.request().url());
    const payload = url.pathname.includes('accounts:lookup') ? { users: [{ localId: uid, email: `${uid}@example.test`, emailVerified: true }] }
      : url.hostname === 'securetoken.googleapis.com' ? { access_token: auth.idToken, id_token: auth.idToken, refresh_token: auth.refreshToken, expires_in: auth.expiresIn, user_id: uid, project_id: 'homework-production-fixture' }
      : { ...auth, localId: uid };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.route(url => /^\/(?:v1\/book-public|v1\/book-runtime-launch|v1\/book-delivery|v1\/book-evaluation|book-delivery|book-runtime|book-integrity|book-evaluation)(?:\/|$)/u.test(url.pathname), async route => {
    const url = new URL(route.request().url());
    if (url.origin === fixture) return route.continue();
    const response = await route.fetch({ url: `${fixture}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  };
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await installTransports(admin, request, 'admin-1');
  // Admin has no dev quick-login button. Use the genuine SDK custom-token path
  // for the fixture's explicit Admin identity, in a separate role context.
  await admin.route('**/firebase_firestore.js*', async route => {
    if (route.request().url().includes('public-native=1')) return route.continue();
    await route.fulfill({ contentType: 'text/javascript', body: `export * from ${JSON.stringify(route.request().url() + '&public-native=1')};
      export const getDoc = async () => ({exists:()=>false,data:()=>undefined});
      export const onSnapshot = (_, callback) => {callback({exists:()=>false,data:()=>undefined});return()=>{};};` });
  });
  await admin.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  const adminToken = await (await request.get(`${fixture}/__homework-production/auth-token?uid=admin-1`)).json();
  await admin.evaluate(async token => {
    const { auth } = await import('/src/services/firebase.js');
    const { signInWithCustomToken } = await import('/node_modules/.vite-5173/deps/firebase_auth.js');
    await signInWithCustomToken(auth, token);
  }, adminToken.token);
  await expect(admin).toHaveURL(/\/admin\/dashboard$/u, { timeout: 60_000 });
  await admin.goto('http://localhost:5173/admin/settings', { waitUntil: 'domcontentloaded' });
  await admin.getByRole('button', { name: 'Show public Book reviews settings section' }).click();
  await admin.getByRole('textbox', { name: 'Approval reason for Homework production fixture' }).fill('Browser QA content reviewed.');
  await admin.getByRole('button', { name: 'Approve Homework production fixture', exact: true }).click();
  await expect(admin.getByRole('status').filter({ hasText: 'Homework production fixture approved for public library.' })).toBeVisible();
  const approvedState = await (await request.get(`${fixture}/__homework-production/diagnostics`)).json();
  expect(approvedState.publicReadiness[proof.bookId]).toMatchObject({ bookId: proof.bookId,
    sourceStrategy: 'component_pdfs', sourceVersionId: proof.studentDocumentSourceVersionId });
  await admin.screenshot({ path: `output/prd0062-public-admin-approval${runtimeMatrix ? '-matrix' : ''}.png` });
  await admin.unrouteAll({ behavior: 'ignoreErrors' });
  await adminContext.close();
  await installTransports(page, request, 'student-1');
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
  await page.goto('http://localhost:5174/student/library', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Books', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Book', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Book', exact: true }).click();
  await expect(page).toHaveURL(/bookSurface=public/u);
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.book-pdf-viewer__canvas-host[data-render-state="ready"] canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.book-pdf-viewer__canvas-host')).toHaveCount(1);
  const activity = page.locator('article[data-book-activity]').filter({ has: page.getByRole('heading', { name: 'Source-assisted choice', exact: true }) });
  await activity.getByRole('radio').first().check();
  await expect(activity.getByTestId('book-runtime-persistence')).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });
  if (runtimeMatrix) {
    const shell = page.getByTestId('book-runtime-shell');
    const canvas = page.locator('.book-pdf-viewer__canvas-host[data-render-state="ready"] canvas');
    const pageInput = page.getByRole('spinbutton', { name: 'Page number' });
    const initialPage = await pageInput.inputValue();
    await page.setViewportSize({ width: 1440, height: 900 });
    const splitter = page.getByRole('separator', { name: 'Resize Book and Activity panels' });
    const splitBefore = Number(await splitter.getAttribute('aria-valuenow'));
    await splitter.focus();
    await page.keyboard.press('ArrowRight');
    await expect(splitter).toHaveAttribute('aria-valuenow', String(splitBefore + 2));
    await page.getByRole('button', { name: 'Only book', exact: true }).click();
    await expect(activity).not.toBeVisible();
    await page.getByRole('button', { name: 'Restore Activities', exact: true }).click();
    await expect(activity.getByRole('radio').first()).toBeChecked();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const zoom = await page.getByLabel('Zoom level', { exact: true }).innerText();
    for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 768, 1024],
      ['mobile-375', 375, 812], ['mobile-320', 320, 640], ['short', 320, 480]] as const) {
      await page.setViewportSize({ width, height });
      if (width <= 760) {
        await page.getByRole('tab', { name: 'Activity', exact: true }).click();
        await expect(activity.getByRole('radio').first()).toBeChecked();
        await page.getByRole('tab', { name: 'Book Page', exact: true }).click();
      }
      await expect(canvas).toBeVisible();
      await expect(page.locator('.book-pdf-viewer__canvas-host')).toHaveCount(1);
      await expect(pageInput).toHaveValue(initialPage);
      await expect(page.getByLabel('Zoom level', { exact: true })).toHaveText(zoom);
      const bounds = await shell.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: `output/prd0062-runtime-${name}.png` });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const host = page.locator('.book-pdf-viewer__canvas-host');
    await host.hover();
    await page.mouse.wheel(0, 250);
    await expect.poll(() => host.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const scrollBefore = await host.evaluate(element => element.scrollTop);
    await page.getByRole('tab', { name: 'Activity', exact: true }).click();
    await expect(activity.getByRole('radio').first()).toBeChecked();
    await page.getByRole('tab', { name: 'Book Page', exact: true }).click();
    expect(await host.evaluate(element => element.scrollTop)).toBe(scrollBefore);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(canvas).toBeVisible();
    await page.getByRole('tab', { name: 'Activity', exact: true }).click();
    await expect(activity.getByRole('radio').first()).toBeChecked();
    const enlargedBounds = await shell.boundingBox();
    const enlargedGeometry = await page.evaluate(() => ({ viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      ancestors: [...document.querySelectorAll('.book-runtime-host, .book-runtime-shell, .book-runtime-shell__mobile-tabs, .book-runtime-shell__activity-pane')]
        .map(element => ({ className: element.className, scrollWidth: element.scrollWidth,
          x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width })) }));
    await writeFile('output/prd0062-runtime-text-200-geometry.json', JSON.stringify(enlargedGeometry, null, 2));
    expect(enlargedBounds!.x).toBeGreaterThanOrEqual(-1);
    expect(enlargedBounds!.x + enlargedBounds!.width).toBeLessThanOrEqual(376);
    expect(enlargedGeometry.documentWidth).toBeLessThanOrEqual(enlargedGeometry.viewport + 1);
    for (const tab of await page.getByRole('tab').all()) {
      const bounds = await tab.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(376);
    }
    await page.screenshot({ path: 'output/prd0062-runtime-text-200.png' });
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '16px', 'important'));
    await page.getByRole('tab', { name: 'Book Page', exact: true }).click();
    expect(referencePage).toBeGreaterThan(0);
    await pageInput.fill(String(referencePage));
    await pageInput.press('Enter');
    await expect(shell).toHaveAttribute('data-reference-only', 'true');
    await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toBeDisabled();
    await page.screenshot({ path: 'output/prd0062-runtime-reference-only.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.book-runtime-shell__outline summary').click();
    await page.getByRole('button', { name: /^Page Group 2 /u }).click();
    await page.getByRole('button', { name: /^Source-assisted long response, question/u }).first().click();
    const written = page.locator('article[data-book-activity]').filter({ has: page.getByRole('heading', { name: 'Source-assisted long response', exact: true }) });
    await written.getByRole('textbox').fill('Independent saved evidence from the second Activity.');
    await expect(written.getByTestId('book-runtime-persistence')).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });
    if (!(await page.locator('.book-runtime-shell__outline').evaluate(element => (element as HTMLDetailsElement).open))) {
      await page.locator('.book-runtime-shell__outline summary').click();
    }
    await page.getByRole('button', { name: /^Page Group 1 /u }).click();
    await page.getByRole('button', { name: /^Source-assisted choice, question/u }).first().focus();
    await page.keyboard.press('Enter');
    await expect(activity.getByRole('radio').first()).toBeChecked();
    await expect(pageInput).toHaveValue(initialPage);
    await expect(page.getByLabel('Zoom level', { exact: true })).toHaveText(zoom);
  }
  await activity.getByTestId('book-runtime-submit').click();
  await activity.getByRole('dialog').getByRole('button', { name: 'Confirm submission' }).click();
  await expect(activity.getByTestId('book-runtime-submit')).toHaveText('Activity submitted', { timeout: 30_000 });
  if (runtimeMatrix) {
    if (!(await page.locator('.book-runtime-shell__outline').evaluate(element => (element as HTMLDetailsElement).open))) {
      await page.locator('.book-runtime-shell__outline summary').click();
    }
    await page.getByRole('button', { name: /^Page Group 2 /u }).click();
    await page.getByRole('button', { name: /^Source-assisted long response, question/u }).first().click();
    const written = page.locator('article[data-book-activity]').filter({ has: page.getByRole('heading', { name: 'Source-assisted long response', exact: true }) });
    await expect(written.getByRole('textbox')).toHaveValue('Independent saved evidence from the second Activity.');
    await written.getByTestId('book-runtime-submit').click();
    await written.getByRole('dialog').getByRole('button', { name: 'Confirm submission' }).click();
    await expect(written.getByTestId('book-runtime-submit')).toHaveText('Activity submitted', { timeout: 30_000 });
  }
  expect(commands.length).toBeGreaterThan(0);
  const state = await (await request.get(`${fixture}/__homework-production/diagnostics`)).json();
  expect(state.grading).toBeNull();
  expect(state.notifications).toBeNull();
  if (runtimeMatrix) {
    const details = Object.values(state.resultReadModels.details) as Array<{ activityId: string; bookId: string;
      contextId: string; resultId: string; placementId: string; interactionId: string; completionId: string;
      completion: { resultId: string; status: string }; evaluation: { status: string } }>;
    for (const publishedActivity of proof.activities) {
      const rows = details.filter(row => row.activityId === publishedActivity.activityId && row.bookId === proof.bookId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ contextId: publicContextId, evaluation: { status: 'submitted' },
        completion: { resultId: rows[0].resultId, status: 'completed' } });
      const terminal = state.runtimeScopes['student-1'][publicContextId][rows[0].placementId][rows[0].interactionId];
      expect(terminal.results[rows[0].resultId]).toMatchObject({ resultId: rows[0].resultId,
        placementId: rows[0].placementId, activityId: publishedActivity.activityId, status: 'submitted' });
      expect(terminal.completions[rows[0].completionId]).toMatchObject({ resultId: rows[0].resultId, status: 'completed' });
    }
    await writeFile('output/prd0062-public-runtime-matrix-proof.json', JSON.stringify({ bootstrap: proof,
      contextId: publicContextId, viewports: ['1440x900', '768x1024', '375x812', '320x640', '320x480'],
      checks: ['keyboard split and question navigation', 'PDF-only restore', 'single canvas',
        'retained page, zoom, nonzero scroll and draft', '200% text interaction and containment',
        'reference-only focus', 'two independent Activity saves and terminal submissions'],
      terminals: state.runtimeScopes['student-1'][publicContextId],
      evidenceClass: 'genuine production producers with substituted external transports; two distinct Activities, not duplicate immutable placement authoring',
    }, null, 2));
  }
  const result = await page.evaluate(async ({ bookId, activityId, contextId }) => {
    const { createBookResultRouteHandle, createBookResultBrowserClient } = await import('/src/services/bookResult.browser.ts');
    const { bookResultGroupKey } = await import('/src/services/book-activity/results/bookResult.types.ts');
    const address = { bookId, studentId: 'student-1', groupKey: bookResultGroupKey('student-1', activityId), contextKind: 'public' as const, contextId };
    const client = createBookResultBrowserClient();
    const group = await client.readGroup(address);
    const detail = await client.readDetail(address, group.attempts[0].resultId);
    return { handle: createBookResultRouteHandle(address), address, group, detail };
  }, { bookId: proof.bookId, activityId: proof.activities[0].activityId, contextId: publicContextId });
  expect(result.detail.surface).toBe('public');
  expect(result.detail.studentId).toBe('student-1');
  expect(result.detail.evaluation.status).toBe('submitted');
  expect(result.detail.evaluation).not.toHaveProperty('score');
  expect(result.detail.evaluation).not.toHaveProperty('earnedScore');
  expect(result.detail.feedback).toEqual({ release: 'not-applicable', available: false });
  const teacherAuth = await (await request.get(`${fixture}/__homework-production/auth-response?uid=teacher-1`)).json();
  const teacherRead = await request.get(`${fixture}/v1/book-evaluation/results/${proof.bookId}/student-1/contexts/public/${publicContextId}/groups/${encodeURIComponent(result.address.groupKey)}`, { headers: { authorization: `Bearer ${teacherAuth.idToken}` } });
  expect(teacherRead.status()).toBe(403);
  await Promise.all([
    page.waitForResponse(response => response.url().includes(`/details/${encodeURIComponent(result.detail.resultId)}`) && response.ok()),
    page.goto(`http://localhost:5174/result/${result.handle}`, { waitUntil: 'domcontentloaded' }),
  ]);
  await expect(page.locator('.book-result-adapter-main')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Loading result details…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Public practice', { exact: true })).toBeVisible();
  await expect(page.getByText('Not applicable', { exact: true })).toBeVisible();
  await expect(page.getByText('Feedback does not apply to Public practice.', { exact: true })).toBeVisible();
  await expect(page.locator('.book-result').getByText(/^(Homework|Feedback pending|Score|Grade|Correction)$/u)).toHaveCount(0);
  await testInfo.attach('public-library-proof.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ bootstrap: proof, result, commands: commands.length,
    evidenceClass: 'actual Library/Runtime/Results with substituted external Firebase SDK/Auth/RTDB/B2 transports; native Rules proof is separate' }, null, 2)) });
  await testInfo.attach('public-private-results.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.screenshot({ path: `output/prd0062-public-private-results${runtimeMatrix ? '-matrix' : ''}.png` });
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:5174/student/library');
  await page.getByRole('button', { name: 'Books', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Book', exact: true })).toHaveCount(1);
  const archived = await request.post(`${fixture}/__public-production/archive`);
  expect(archived.status(), await archived.text()).toBe(200);
  expect(await archived.json()).toMatchObject({ producer: 'updateBookMetadata', status: 'archived', readiness: null });
  const studentAuth = await (await request.get(`${fixture}/__homework-production/auth-response?uid=student-1`)).json();
  const beforeDenial = await (await request.get(`${fixture}/__homework-production/diagnostics`)).json();
  const headers = { authorization: `Bearer ${studentAuth.idToken}` };
  const deniedDocument = await request.get(`${fixture}/v1/book-delivery/document/${encodeURIComponent(publicDocumentRoute)}`, { headers });
  expect(deniedDocument.status()).toBe(403);
  const deniedLaunch = await request.post(`${fixture}/v1/book-public/books/${proof.bookId}/launch`, {
    headers, data: { operationId: '00000000-0000-4000-8000-000000000099' },
  });
  expect(deniedLaunch.status()).toBe(403);
  const afterDenial = await (await request.get(`${fixture}/__homework-production/diagnostics`)).json();
  expect(afterDenial.publicProviderReads).toBe(beforeDenial.publicProviderReads);
  await testInfo.attach('public-archive-denial.json', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    archive: await archived.json(), resourceStatus: deniedDocument.status(), launchStatus: deniedLaunch.status(),
    providerCallsBefore: beforeDenial.publicProviderReads,
    providerCallsAfter: afterDenial.publicProviderReads,
    evidenceClass: 'genuine producers; substituted external provider transport; native Rules separate',
  }, null, 2)) });
  const catalogState = await (await request.get(`${fixture}/__homework-production/diagnostics`)).json();
  expect(catalogState.trace).toEqual(expect.arrayContaining([expect.stringContaining('SDK GET material_catalog/public_book_readiness [{"type":"orderByChild","value":"updatedAt"},{"type":"limitToLast","value":13}]')]));
  await writeFile(`output/prd0062-public-admin-library-proof${runtimeMatrix ? '-matrix' : ''}.json`, JSON.stringify({ bootstrap: proof,
    adminApproval: { actorId: 'admin-1', route: 'http://localhost:5173/admin/settings',
      readiness: approvedState.publicReadiness[proof.bookId], announcement: 'approved for public library' },
    result, commands: commands.length, teacherReadStatus: teacherRead.status(),
    settledPublicResults: true, backToLibrary: page.url(),
    evidenceClass: 'actual Admin/Library/Runtime/Results; external Firebase SDK/Auth/RTDB/Firestore/B2 transports substituted; native Rules proof separate',
  }, null, 2));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
