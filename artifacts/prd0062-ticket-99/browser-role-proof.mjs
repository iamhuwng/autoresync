import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';

const [url, account] = process.argv.slice(2);
if (!url || !['teacher', 'teacher2', 'student'].includes(account)) {
  throw new Error('Usage: node browser-role-proof.mjs <url> <teacher|teacher2|student>');
}
const role = account === 'student' ? 'student' : 'teacher';
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
  .map((operation) => [`${operation.path}/${operation.rule}`, operation.expression])
  .sort(([left], [right]) => left.localeCompare(right));
const browserEntries = flattenRules(browserRules.rules.notifications)
  .sort(([left], [right]) => left.localeCompare(right));
if (JSON.stringify(browserEntries) !== JSON.stringify(fragmentEntries)) {
  throw new Error('Browser notification rules do not exactly match fragment 38B5');
}
const env = loadEnv('development', process.cwd(), '');
const credentials = {
  teacher: { email: 'teacher@test.com', password: 'password123' },
  teacher2: { email: 'teacher2@test.com', password: 'password123' },
  student: { email: 'student@test.com', password: 'password123' },
};
const authResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FIREBASE_API_KEY}`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(url).origin,
      referer: url,
    },
    body: JSON.stringify({
      ...credentials[account],
      returnSecureToken: true,
    }),
  },
);
if (!authResponse.ok) {
  const authError = await authResponse.json().catch(() => ({}));
  throw new Error(
    `Unable to obtain the ${account} browser fixture identity: `
    + `${authResponse.status} ${authError?.error?.message ?? 'unknown error'}`,
  );
}
const identity = await authResponse.json();
const namespace = new URL(env.VITE_FIREBASE_DATABASE_URL).hostname.split('.')[0];
const emulatorOrigin = 'http://localhost:9002';
const fixtureId = `ticket99-browser-${account}`;
const fixtureTitle = `Ticket 99 ${role} unread fixture`;
const crossUserId = 'ticket99-cross-user';
const crossUserFixtureId = 'ticket99-cross-user-notification';
const adminWrite = async (path, value) => {
  const response = await fetch(`${emulatorOrigin}/${path}.json?ns=${namespace}`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    throw new Error(`Unable to seed ${path} in the local browser rules harness`);
  }
};

await adminWrite(`users/${identity.localId}`, {
  uid: identity.localId,
  email: credentials[account].email,
  displayName: account === 'student' ? 'Student Test' : `Teacher ${account === 'teacher2' ? 'Two' : 'Test'}`,
  role,
  status: 'active',
  forceReauth: false,
  profileCompletedAt: 1,
});
await adminWrite(`notifications/${identity.localId}/${fixtureId}`, {
  type: 'info',
  title: fixtureTitle,
  message: 'Local browser proof for the restrictive notification read-state seam.',
  read: false,
  createdAt: Date.now(),
});
await adminWrite(`notifications/${crossUserId}/${crossUserFixtureId}`, {
  type: 'info',
  title: 'Ticket 99 cross-user fixture',
  message: 'This fixture must remain inaccessible to the browser identity.',
  read: false,
  createdAt: Date.now(),
});

const browserAuthQuery = `auth=${encodeURIComponent(identity.idToken)}`;
const contentMutationProbe = await fetch(
  `${emulatorOrigin}/notifications/${identity.localId}/${fixtureId}/title.json?ns=${namespace}&${browserAuthQuery}`,
  {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify('Browser mutation must fail'),
  },
);
const creationProbe = await fetch(
  `${emulatorOrigin}/notifications/${identity.localId}/browser-create.json?ns=${namespace}&${browserAuthQuery}`,
  {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'info',
      title: 'Browser create must fail',
      message: 'denied',
      read: false,
      createdAt: Date.now(),
    }),
  },
);
const destinationMutationProbe = await fetch(
  `${emulatorOrigin}/notifications/${identity.localId}/${fixtureId}/link.json?ns=${namespace}&${browserAuthQuery}`,
  {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify('/teacher/forged-destination'),
  },
);
const crossUserReadProbe = await fetch(
  `${emulatorOrigin}/notifications/${crossUserId}/${crossUserFixtureId}.json?ns=${namespace}&${browserAuthQuery}`,
);
const crossUserWriteProbe = await fetch(
  `${emulatorOrigin}/notifications/${crossUserId}/${crossUserFixtureId}/read.json?ns=${namespace}&${browserAuthQuery}`,
  {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(true),
  },
);
const denialProbeStatuses = {
  contentMutation: contentMutationProbe.status,
  creation: creationProbe.status,
  destinationMutation: destinationMutationProbe.status,
  crossUserRead: crossUserReadProbe.status,
  crossUserWrite: crossUserWriteProbe.status,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleEntries = [];

page.on('console', (message) => {
  consoleEntries.push(`${message.type()}: ${message.text()}`);
});
page.on('pageerror', (error) => {
  consoleEntries.push(`pageerror: ${error.message}`);
});

const relevantConsoleEntries = () => consoleEntries.filter((entry) =>
  entry.startsWith('error:') || entry.startsWith('warning:') || entry.startsWith('pageerror:'),
);
const appDatabaseBinding = `[Firebase] Database emulator connected at ${new URL(emulatorOrigin).host}`;
const assertAppDatabaseBinding = () => {
  if (!consoleEntries.some((entry) => entry.includes(appDatabaseBinding))) {
    throw new Error(`App did not confirm database emulator binding: ${appDatabaseBinding}`);
  }
};

try {
  await page.goto(url, { waitUntil: 'commit', timeout: 15_000 });
  await page.getByRole('button', { name: 'Show dev quick login' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator(`#dev-login-${account}`).click();

  if (role === 'student') {
    await page.getByTitle('Toggle unread feed items').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    assertAppDatabaseBinding();
    const routeAfterLogin = new URL(page.url()).pathname;
    await page.getByTitle('Toggle unread feed items').click();
    const unreadFeedItems = page.locator('section[aria-label="Student dashboard feed"] article');
    await unreadFeedItems.first().waitFor({ state: 'visible', timeout: 15_000 });
    const unreadCountBefore = await unreadFeedItems.count();
    const unreadFeedTexts = await unreadFeedItems.allInnerTexts();
    const unreadFixtureIndex = unreadFeedTexts.findIndex((text) => text.includes(fixtureTitle));
    if (unreadFixtureIndex < 0) {
      throw new Error(`Seeded ${role} notification fixture did not render`);
    }
    const unreadFixture = unreadFeedTexts[unreadFixtureIndex]
      .split('\n')
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ');

    consoleEntries.length = 0;
    await unreadFeedItems.nth(unreadFixtureIndex).click();
    await page.waitForTimeout(1_000);
    await page.reload({ waitUntil: 'commit', timeout: 15_000 });
    await page.getByTitle('Toggle unread feed items').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.getByTitle('Toggle unread feed items').click();
    await page.waitForTimeout(1_000);
    const unreadCountAfter = await page
      .locator('section[aria-label="Student dashboard feed"] article')
      .count();
    const markedRead = unreadCountAfter < unreadCountBefore;
    const consoleReview = relevantConsoleEntries();

    console.log(JSON.stringify({
      url,
      role,
      account,
      loginRoute: routeAfterLogin,
      fixture: unreadFixture,
      action: 'filtered to unread feed and clicked one notification',
      visibleResult: markedRead
        ? 'notification left the unread feed after reload'
        : 'read state not visibly confirmed',
      unreadCountBefore,
      unreadCountAfter,
      trustedCreation: 'local emulator admin seed succeeded',
      appDatabaseBinding,
      denialProbeStatuses,
      consoleReview,
    }, null, 2));

    const blockingConsoleEntries = consoleReview.filter((entry) =>
      (entry.startsWith('error:') || entry.startsWith('pageerror:'))
      && entry.toLowerCase().includes('notification'),
    );
    const denialProbesPassed = Object.values(denialProbeStatuses).every((status) => status === 401);
    if (!markedRead || !denialProbesPassed || blockingConsoleEntries.length > 0) {
      process.exitCode = 1;
    }
  } else {
    try {
      await page.getByRole('button', { name: 'Notifications' }).waitFor({
        state: 'visible',
        timeout: 30_000,
      });
    } catch (error) {
      console.log(JSON.stringify({
        url,
        role,
        account,
        currentUrl: page.url(),
        body: (await page.locator('body').innerText()).slice(0, 2_000),
        consoleEntries,
        denialProbeStatuses,
      }, null, 2));
      throw error;
    }
    assertAppDatabaseBinding();
    const routeAfterLogin = new URL(page.url()).pathname;
    await page.getByRole('button', { name: 'Notifications' }).click();
    await page.getByText('Notifications', { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const notificationItems = await page.locator('.notification-item').evaluateAll((items) =>
      items.map((item, index) => ({
        index,
        title: item.textContent?.trim().slice(0, 160) ?? '',
        unread: item.style.backgroundColor !== 'transparent',
        destination: item.getAttribute('role') === 'button',
      })),
    );
    const unreadFixture = notificationItems.find((item) =>
      item.unread && item.title.includes(fixtureTitle),
    );
    if (!unreadFixture) {
      console.log(JSON.stringify({
        url,
        role,
        account,
        loginRoute: routeAfterLogin,
        notificationItems,
        consoleReview: relevantConsoleEntries(),
      }, null, 2));
      throw new Error(`No unread ${account} notification fixture was available`);
    }

    consoleEntries.length = 0;
    await page.locator('.notification-item').nth(unreadFixture.index).click();
    await page.waitForTimeout(1_000);
    await page.reload({ waitUntil: 'commit', timeout: 15_000 });
    const bell = page.getByRole('button', { name: 'Notifications' });
    await bell.waitFor({ state: 'visible', timeout: 30_000 });
    await bell.click();
    const matchingItem = page.locator('.notification-item').filter({ hasText: fixtureTitle });
    const matchingCount = await matchingItem.count();
    const markedRead = matchingCount === 1
      ? await matchingItem.evaluate((item) => item.style.backgroundColor === 'transparent')
      : false;
    const consoleReview = relevantConsoleEntries();

    console.log(JSON.stringify({
      url,
      role,
      account,
      loginRoute: routeAfterLogin,
      fixture: unreadFixture.title,
      action: 'clicked one unread notification',
      visibleResult: markedRead
        ? 'notification rendered as read after reload'
        : 'read state not visibly confirmed',
      notificationCount: notificationItems.length,
      trustedCreation: 'local emulator admin seed succeeded',
      appDatabaseBinding,
      denialProbeStatuses,
      consoleReview,
    }, null, 2));

    const denialProbesPassed = Object.values(denialProbeStatuses).every((status) => status === 401);
    const notificationConsoleBlockers = consoleReview.filter((entry) =>
      (entry.startsWith('error:') || entry.startsWith('pageerror:'))
      && entry.toLowerCase().includes('notification'),
    );
    if (!markedRead || !denialProbesPassed || notificationConsoleBlockers.length > 0) {
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}

process.exit(process.exitCode ?? 0);
