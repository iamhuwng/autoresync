import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';

const appUrl = process.argv[2] ?? 'http://localhost:5174/';
const fixture = JSON.parse(readFileSync(
  'artifacts/prd0062-ticket-100/fixture.json',
  'utf8',
));
const fragment = JSON.parse(readFileSync(
  'cloudflare/src/upload-worker/book-rules/fragments/38B5.json',
  'utf8',
));
const browserRules = JSON.parse(readFileSync(
  'artifacts/prd0062-ticket-99/browser-rules.json',
  'utf8',
));
const flattenRules = (node, path = 'notifications') => Object.entries(node).flatMap(
  ([key, value]) => key.startsWith('.')
    ? [[`${path}/${key}`, value]]
    : flattenRules(value, `${path}/${key}`),
);
const fragmentEntries = fragment.operations
  .map(operation => [`${operation.path}/${operation.rule}`, operation.expression])
  .sort(([left], [right]) => left.localeCompare(right));
const browserEntries = flattenRules(browserRules.rules.notifications)
  .sort(([left], [right]) => left.localeCompare(right));
if (JSON.stringify(fragmentEntries) !== JSON.stringify(browserEntries)) {
  throw new Error('Browser rules do not exactly match fragment 38B5');
}

const env = loadEnv(
  'development',
  process.env.TICKET100_ENV_ROOT ?? process.cwd(),
  '',
);
const studentPassword = process.env.TICKET100_STUDENT_PASSWORD;
if (!studentPassword) throw new Error('TICKET100_STUDENT_PASSWORD is required');
const authResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FIREBASE_API_KEY}`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(appUrl).origin,
      referer: appUrl,
    },
    body: JSON.stringify({
      email: 'student@test.com',
      password: studentPassword,
      returnSecureToken: true,
    }),
  },
);
if (!authResponse.ok) throw new Error(`student_fixture_auth_failed:${authResponse.status}`);
const identity = await authResponse.json();
const namespace = new URL(env.VITE_FIREBASE_DATABASE_URL).hostname.split('.')[0];
const emulatorOrigin = 'http://localhost:9002';
const pathUrl = path => {
  const url = new URL(`${emulatorOrigin}/${path.replace(/^\/+|\/+$/gu, '')}.json`);
  url.searchParams.set('ns', namespace);
  return url;
};
const adminRead = async path => {
  const response = await fetch(pathUrl(path), {
    headers: { authorization: 'Bearer owner' },
  });
  if (!response.ok) throw new Error(`admin_read_failed:${path}:${response.status}`);
  return response.json();
};
const rows = await adminRead(`notifications/${identity.localId}`);
const matchingEntries = Object.entries(rows ?? {}).filter(([, row]) => (
  row.title === fixture.title
  && row.message === fixture.message
  && row.link === fixture.destination
  && row.metadata?.contextId === fixture.assignmentId
  && row.metadata?.updateActionId === fixture.operationId
));
if (matchingEntries.length !== 1) throw new Error('exact_trusted_notification_missing_or_duplicated');
const [notificationId, beforeRow] = matchingEntries[0];
if (beforeRow.read !== false) throw new Error('trusted_notification_not_unread');

const browserAuth = `auth=${encodeURIComponent(identity.idToken)}`;
const browserRequest = async (path, init = {}, authenticated = true) => {
  const url = pathUrl(path);
  if (authenticated) url.search += `&${browserAuth}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
  });
};
const probes = {
  creation: await browserRequest(`notifications/${identity.localId}/browser-create`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'info', title: 'forged', message: 'forged', read: false, createdAt: 1 }),
  }),
  contentMutation: await browserRequest(`notifications/${identity.localId}/${notificationId}/title`, {
    method: 'PUT', body: JSON.stringify('forged'),
  }),
  destinationMutation: await browserRequest(`notifications/${identity.localId}/${notificationId}/link`, {
    method: 'PUT', body: JSON.stringify('/teacher/forged'),
  }),
  deletion: await browserRequest(`notifications/${identity.localId}/${notificationId}`, { method: 'DELETE' }),
  ancestorMutation: await browserRequest(`notifications/${identity.localId}`, {
    method: 'PUT', body: JSON.stringify({ forged: true }),
  }),
  anonymousRead: await browserRequest(`notifications/${identity.localId}/${notificationId}`, {}, false),
  crossUserRead: await browserRequest('notifications/ticket100-cross-user/cross-user-row'),
  crossUserWrite: await browserRequest('notifications/ticket100-cross-user/cross-user-row/read', {
    method: 'PUT', body: JSON.stringify(true),
  }),
};
const denialStatuses = Object.fromEntries(
  Object.entries(probes).map(([key, response]) => [key, response.status]),
);
if (!Object.values(denialStatuses).every(status => status === 401)) {
  throw new Error(`browser_denial_failed:${JSON.stringify(denialStatuses)}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleEntries = [];
page.on('console', message => consoleEntries.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', error => consoleEntries.push(`pageerror: ${error.message}`));
try {
  await page.goto(appUrl, { waitUntil: 'commit', timeout: 15_000 });
  await page.getByRole('button', { name: 'Show dev quick login' }).waitFor({
    state: 'visible', timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  const bell = page.getByTitle('Toggle unread feed items');
  await bell.waitFor({ state: 'visible', timeout: 30_000 });
  const appDatabaseBinding = '[Firebase] Database emulator connected at localhost:9002';
  if (!consoleEntries.some(entry => entry.includes(appDatabaseBinding))) {
    throw new Error(`app_database_binding_missing:${appDatabaseBinding}`);
  }
  await bell.click();
  const row = page.locator('section[aria-label="Student dashboard feed"] article')
    .filter({ hasText: fixture.title });
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  const visibleText = await row.innerText();
  if (!visibleText.includes(fixture.message)) throw new Error('notification_message_not_visible');
  await row.click();
  await page.waitForURL(url => url.pathname === fixture.destination, { timeout: 15_000 });

  let afterRow = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    afterRow = await adminRead(`notifications/${identity.localId}/${notificationId}`);
    if (afterRow?.read === true) break;
    await page.waitForTimeout(200);
  }
  if (afterRow?.read !== true) throw new Error('read_leaf_not_persisted');
  const withoutRead = value => Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'read'),
  );
  if (JSON.stringify(withoutRead(beforeRow)) !== JSON.stringify(withoutRead(afterRow))) {
    throw new Error('read_action_changed_non_read_leaf');
  }
  const consoleReview = consoleEntries.filter(entry => (
    entry.startsWith('error:') || entry.startsWith('warning:') || entry.startsWith('pageerror:')
  ));
  const notificationErrors = consoleReview.filter(entry => (
    (entry.startsWith('error:') || entry.startsWith('pageerror:'))
    && entry.toLowerCase().includes('notification')
  ));
  if (notificationErrors.length > 0) {
    throw new Error(`notification_console_error:${JSON.stringify(notificationErrors)}`);
  }

  console.log(JSON.stringify({
    proofKind: 'prd0062-ticket100-local-student-browser',
    appUrl,
    appDatabaseBinding,
    namespace,
    recipientId: identity.localId,
    notificationId,
    visibleContent: {
      title: fixture.title,
      message: fixture.message,
      destination: fixture.destination,
    },
    finalUrl: page.url(),
    exactReadLeafChanged: true,
    denialStatuses,
    consoleReview,
    remoteStateClaimed: false,
  }, null, 2));
} finally {
  await browser.close();
}
