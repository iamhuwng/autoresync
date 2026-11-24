import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { wave } from './fixtures/external-audio-media.mjs';

const teacherUrl = 'http://localhost:5173';
const studentUrl = 'http://localhost:5174';
const disabledTeacherUrl = 'http://localhost:5175';
const gateway = 'http://localhost:8787/external-audio/';
const sample = { objectKey: 'teacher/Unit 1 – Dialogue.wav', providerVersionId: 'version-first', contentType: 'audio/wav', sizeBytes: 16_044 };
const second = { ...sample, objectKey: 'teacher/Unit 2.wav', providerVersionId: 'version-second' };
const previewUrl = 'https://s3.us-west-004.backblazeb2.com/qa-private/teacher/dialogue.wav?versionId=version-first&X-Amz-Signature=LOCAL_ONLY';
const credentialId = 'fixture-key-id';
const credential = 'fixture-key-secret';

async function fixtures(context: BrowserContext) {
  let generation = 0;
  let activeConnectionId: string | null = null;
  let failNextList = true;
  let failNextImpact = true;
  let stale = false;
  let audioRequests = 0;
  const connections: Array<{ id: string; label?: string; state: string; bucketName: string; prefix: string; health: string; checkedAt: number }> = [];
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  const storageTraffic: string[] = [];
  context.on('request', (request) => {
    if (!request.url().startsWith(gateway) && request.postData()) storageTraffic.push(request.postData()!);
  });
  await context.routeWebSocket((url) => url.hostname !== 'localhost' || url.port === '9000', (socket) => {
    if (new URL(socket.url()).hostname !== 'localhost') {
      socket.close();
      return;
    }
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      storageTraffic.push(String(message));
      server.send(message);
    });
  });
  await context.route((url) => url.hostname !== 'localhost' || url.href.startsWith(gateway), async (route) => {
    const request = route.request();
    const url = request.url();
    const origin = request.headers().origin ?? teacherUrl;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET, HEAD',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
      'Cache-Control': 'no-store',
    };
    if (url === previewUrl) {
      audioRequests += 1;
      const audio = wave();
      const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers().range ?? '');
      const from = range ? Number(range[1]) : 0;
      const to = range?.[2] ? Number(range[2]) : audio.length - 1;
      return route.fulfill({
        status: range ? 206 : 200, contentType: 'audio/wav',
        headers: { ...cors, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${from}-${to}/${audio.length}` } : {}) },
        body: audio.subarray(from, to + 1),
      });
    }
    if (url.startsWith(gateway)) {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      expect(request.method()).toBe('POST');
      expect(request.headers().authorization).toMatch(/^Bearer /u);
      const action = url.slice(gateway.length);
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.push({ action, body });
      const respond = (value: unknown, status = 200) => route.fulfill({ status, json: value, headers: cors });
      const summary = () => ({ generation, activeConnectionId, connections });
      if (action === 'connections') return respond(summary());
      if (action === 'impact') {
        if (failNextImpact) {
          failNextImpact = false;
          return respond({ error: 'store_unavailable' }, 503);
        }
        return respond({ connectionId: body.connectionId, linkedFileCount: 4, draftCount: 2,
          publishedCount: 3, publicTestCount: 1, homeworkCount: 2, resultCount: 5, cleanupEligible: false });
      }
      if (action === 'validate') return respond({ bucketName: body.bucketName, prefix: body.prefix, health: 'healthy' });
      if (action === 'list') {
        if (failNextList) {
          failNextList = false;
          return respond({ error: 'provider_unavailable' }, 503);
        }
        if (body.filenamePrefix) {
          const files = [sample, second].filter(file => file.objectKey.slice('teacher/'.length).startsWith(String(body.filenamePrefix)));
          return respond({ files, nextCursor: null });
        }
        if (body.prefix === 'teacher/empty/') return respond({ files: [], nextCursor: null });
        return respond(body.cursor ? { files: [second], nextCursor: null } : { files: [sample], nextCursor: second.objectKey });
      }
      if (action === 'inspect') return respond(body.providerVersionId === sample.providerVersionId ? sample : second);
      if (action === 'preview') return respond({ file: sample, url: previewUrl, expiresAt: Date.now() + 120_000 });
      if (stale) {
        stale = false;
        generation += 1;
        return respond({ error: 'generation_conflict' }, 409);
      }
      expect(body.generation).toBe(generation);
      generation += 1;
      const current = connections.find(({ id }) => id === body.connectionId);
      if (action === 'connect' || action === 'switch') {
        if (current) current.state = 'archived';
        activeConnectionId = `fixture-${generation}`;
        connections.push({
          id: activeConnectionId, ...(typeof body.label === 'string' && body.label.trim() ? { label: body.label.trim() } : {}),
          state: 'active', bucketName: String(body.bucketName), prefix: String(body.prefix),
          health: 'healthy', checkedAt: Date.now(),
        });
      } else if (action === 'select' && current) {
        for (const item of connections) {
          if (item.state === 'active') item.state = 'archived';
        }
        current.state = 'active';
        activeConnectionId = current.id;
      } else if (action === 'recheck' && current) current.health = 'invalid_key';
      else if (action === 'rotate' && current) current.health = 'healthy';
      else if (action === 'revoke' && current) {
        current.state = 'revoked';
        current.health = 'revoked_connection';
        if (activeConnectionId === current.id) activeConnectionId = null;
      } else throw new Error('Unexpected fixture action');
      return respond(summary());
    }
    return route.abort();
  });
  return { calls, storageTraffic, audioRequests: () => audioRequests, staleNext: () => { stale = true; } };
}

async function signInToProfile(page: Page, url: string, role: 'Teacher' | 'Student') {
  await page.goto(`${url}/login`, { waitUntil: 'domcontentloaded' });
  const quickLogin = page.getByRole('button', { name: 'Show dev quick login' });
  try {
    await quickLogin.waitFor({ timeout: 12_000 });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await quickLogin.click({ timeout: 25_000 });
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForURL((current) => current.pathname !== '/login');
  await page.goto(`${url}/profile`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Profile/i }).first()).toBeVisible();
}

async function enterKey(page: Page) {
  await page.getByLabel('Application key ID', { exact: true }).fill(credentialId);
  await page.getByLabel('Application key', { exact: true }).fill(credential);
}

test('teacher connects, browses, selects, plays, repairs, switches and revokes', async ({ page, context }) => {
  const f = await fixtures(context);
  const consoleText: string[] = [];
  page.on('console', (message) => consoleText.push(message.text()));
  await signInToProfile(page, teacherUrl, 'Teacher');
  const storageTab = page.getByRole('tab', { name: 'External audio storage' });
  await expect(storageTab).toBeVisible();
  expect(f.calls).toHaveLength(0);
  await storageTab.click();
  await page.getByRole('button', { name: 'Add B2 account', exact: true }).click();
  await page.getByLabel('Account label (optional)').fill('Account A');
  await page.getByLabel('Bucket name').fill('qa-private');
  await page.getByLabel(/Folder prefix/u).fill('teacher/');
  await enterKey(page);
  await page.getByRole('button', { name: 'Validate key' }).click();
  await expect(page.getByText('Key is valid.')).toBeVisible();
  await expect(page.getByLabel('Application key', { exact: true })).toHaveValue(credential);
  await expect(page.getByLabel('Application key ID', { exact: true })).toHaveValue(credentialId);
  await page.getByRole('button', { name: 'Connect storage' }).click();
  await expect(page.getByText('Backblaze B2 account connected.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Browse/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(page.getByTestId('b2-account-active')).toContainText('The key is invalid or expired');
  await page.getByRole('button', { name: 'Rotate key' }).click();
  await enterKey(page);
  f.staleNext();
  await page.getByRole('button', { name: 'Save replacement key' }).click();
  await expect(page.getByText('The connection changed. Review the refreshed status before trying again.').first()).toBeVisible();
  expect(f.calls.filter(({ action }) => action === 'connections')).toHaveLength(2);
  await page.getByRole('button', { name: 'Rotate key' }).click();
  await enterKey(page);
  await page.getByRole('button', { name: 'Save replacement key' }).click();
  await expect(page.getByText('Application key rotated.')).toBeVisible();

  // Add second B2 account; Account A stays retained and can be reactivated without credentials.
  await page.getByRole('button', { name: 'Add another B2 account' }).click();
  await page.getByLabel('Account label (optional)').fill('Account B');
  await page.getByLabel('Bucket name').fill('second-private');
  await page.getByLabel(/Folder prefix/u).fill('teacher/');
  await enterKey(page);
  await page.getByRole('button', { name: 'Connect storage' }).click();
  const retainedCard = page.getByRole('listitem').filter({ hasText: 'qa-private' });
  await expect(retainedCard).toContainText('Healthy');
  await retainedCard.getByRole('button', { name: 'Use for authoring' }).click();
  await expect(page.getByTestId('b2-account-active')).toContainText('Account A');
  const retainedB = page.getByRole('listitem').filter({ hasText: 'second-private' });
  await expect(retainedB).toContainText('Healthy');

  await retainedB.getByRole('button', { name: 'Revoke', exact: true }).click();
  const revokeDialog = page.getByRole('dialog', { name: 'Revoke Account B?' });
  await expect(revokeDialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(revokeDialog.getByRole('alert')).toContainText('Could not check linked use');
  await expect(revokeDialog.getByRole('button', { name: 'Confirm revoke' })).toBeDisabled();
  await revokeDialog.getByRole('button', { name: 'Retry impact check' }).click();
  await expect(revokeDialog.locator('dl')).toContainText('Linked files4');
  await expect(revokeDialog.locator('dl')).toContainText('Published tests3');
  await expect(revokeDialog.locator('dl')).toContainText('Public tests1');
  await page.keyboard.press('Escape');
  await expect(revokeDialog).toHaveCount(0);
  await retainedB.getByRole('button', { name: 'Revoke', exact: true }).click();
  await revokeDialog.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(page.getByText('Revoked (1)')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const panel = page.getByRole('region', { name: 'External audio storage' });
  await expect(panel.getByRole('button', { name: 'Add another B2 account' })).toBeVisible();
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const persistent = await page.evaluate(() => JSON.stringify({ localStorage: { ...localStorage }, sessionStorage: { ...sessionStorage } }));
  for (const sensitive of [credentialId, credential, previewUrl]) {
    expect(persistent).not.toContain(sensitive);
    expect(JSON.stringify(f.storageTraffic)).not.toContain(sensitive);
    expect(JSON.stringify(consoleText)).not.toContain(sensitive);
    expect(page.url()).not.toContain(sensitive);
  }
});

test('student and disabled teacher cannot start an external audio request', async ({ browser }) => {
  for (const [url, role] of [[studentUrl, 'Student'], [disabledTeacherUrl, 'Teacher']] as const) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const f = await fixtures(context);
      const page = await context.newPage();
      await signInToProfile(page, url, role);
      await expect(page.getByRole('heading', { name: `${role} Test` })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'External audio storage' })).toHaveCount(0);
      expect(f.calls).toHaveLength(0);
    } finally {
      await context.close();
    }
  }
});
