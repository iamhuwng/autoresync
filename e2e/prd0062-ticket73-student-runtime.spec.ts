import { expect, test, type Page } from '@playwright/test';

const fixtureUrl = '/__smoke/book-runtime?bookId=book-runtime-fixture&unitKey=unit-fixture';

const signInAsStudent = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
};

test('student Book Runtime shell assembles registered Activities and PDF reference state', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await signInAsStudent(page);
  await page.goto(`${fixtureUrl}&pageGroup=group-1&activity=activity-choice`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByTestId('reference-only-pdf')).toBeVisible();

  await page.getByRole('button', { name: 'Collapse page navigator' }).click();
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-navigator-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand page navigator' }).click();
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-navigator-collapsed', 'false');

  await page.getByRole('button', { name: 'Page Group 2' }).click();
  await expect(page.getByRole('heading', { name: 'Written response' })).toBeVisible();
  await page.locator('textarea').fill('Draft for teacher review.');
  await expect(page.getByText(/Pending review/)).toBeVisible();
  await expect(page.getByText(/Reference context:/)).toBeVisible();

  await page.getByRole('button', { name: 'Focus PDF' }).click();
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'pdf-focus');
  await page.getByRole('button', { name: 'Restore split view' }).click();
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'split');
  await expect(page).toHaveURL(/pageGroup=group-2.*activity=activity-long/u);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('student Book Runtime preserves mobile layout, URL state, and fail-closed identity', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await signInAsStudent(page);
  await page.goto(`${fixtureUrl}&pageGroup=group-1&activity=activity-choice`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  const mobileLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    activityPanel: getComputedStyle(document.querySelector('.book-runtime-shell__activity-pane')).display,
    viewerPanel: getComputedStyle(document.querySelector('.book-runtime-shell__viewer-pane')).display,
  }));
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.bodyWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.activityPanel).toBe('grid');
  expect(mobileLayout.viewerPanel).toBe('none');
  await page.getByRole('tab', { name: 'Book Page' }).click();
  await expect(page.getByRole('tab', { name: 'Book Page' })).toHaveAttribute('aria-selected', 'true');

  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(zoomLayout.documentWidth).toBeLessThanOrEqual(zoomLayout.viewportWidth);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${fixtureUrl}&pageGroup=group-1&activity=activity-choice`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const next = new URL(location.href);
    next.searchParams.set('pageGroup', 'group-2');
    next.searchParams.set('activity', 'activity-long');
    history.pushState({}, '', next);
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Written response' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Main claim' })).toBeVisible();
  await page.goto(`${fixtureUrl}&pageGroup=group-2&activity=activity-long`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Written response' })).toBeVisible();

  await page.goto('/__smoke/book-runtime?bookId=wrong-book&unitKey=unit-fixture', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Student fixture unavailable' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
