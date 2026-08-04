import { expect, test } from '@playwright/test';

const openState = async (
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  state: 'unreleased' | 'available' | 'overdue' | 'late-allowed' | 'review-retry' | 'review',
) => {
  await request.post('http://localhost:5187/__proof/control', { data: { state } });
  await page.goto(`/__smoke/book-runtime?window=${state}`, { waitUntil: 'domcontentloaded' });
  const marker = page.getByTestId('book-window-state');
  const expectedVisibleState = state === 'review-retry' ? 'review' : state;
  await expect(marker).toHaveAttribute('data-window-state', expectedVisibleState, { timeout: 30_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(marker).toHaveAttribute('data-window-state', expectedVisibleState, { timeout: 30_000 });
  return marker;
};

test('student consumes reload-safe effective Book Homework windows', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });

  await openState(page, request, 'unreleased');
  await expect(page.getByRole('heading', { name: 'This Activity is not released yet' })).toBeVisible();
  await expect(page.getByTestId('book-runtime-shell')).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-87/browser/unreleased-reload-safe.png',
    fullPage: true,
  });

  await openState(page, request, 'available');
  await expect(page.getByText('This Activity is available.')).toBeVisible();
  await expect(page.getByTestId('book-runtime-submit')).toBeEnabled();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-87/browser/available-reload-safe.png',
    fullPage: true,
  });

  await openState(page, request, 'overdue');
  await expect(page.getByText(/submission is closed/iu)).toBeVisible();
  await expect(page.getByTestId('book-runtime-submit')).toBeDisabled();
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-87/browser/overdue-reviewable.png',
    fullPage: true,
  });

  await openState(page, request, 'late-allowed');
  await expect(page.getByText(/late submission is allowed/iu)).toBeVisible();
  await expect(page.getByTestId('book-runtime-submit')).toBeEnabled();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-87/browser/late-allowed.png',
    fullPage: true,
  });

  await openState(page, request, 'review-retry');
  await expect(page.getByText('Completed Activity review is available.')).toBeVisible();
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await expect(page.getByTestId('book-runtime-submit')).toBeEnabled();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-87/browser/completed-review-retry-available.png',
    fullPage: true,
  });

  await openState(page, request, 'review');
  await expect(page.getByText('Completed Activity review is available.')).toBeVisible();
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await expect(page.getByTestId('book-runtime-submit')).toBeDisabled();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-87/browser/completed-review.png',
    fullPage: true,
  });

  await request.post('http://localhost:5187/__proof/control', { data: { state: 'unreleased' } });
  await page.goto('/__smoke/book-runtime?window=forged&clientNow=2099-01-01T00:00:00.000Z');
  await expect(page.getByTestId('book-window-state')).toHaveAttribute('data-window-state', 'unreleased');
  await expect(page.getByTestId('book-runtime-shell')).toHaveCount(0);

  await request.post('http://localhost:5187/__proof/control', { data: { state: 'available' } });
  await page.goto('/__smoke/book-runtime?window=stale-cache');
  await expect(page.getByTestId('book-window-state')).toHaveAttribute('data-window-state', 'available');
  await request.post('http://localhost:5187/__proof/control', { data: { state: 'unreleased' } });
  await page.reload();
  await expect(page.getByTestId('book-window-state')).toHaveAttribute('data-window-state', 'unreleased');
});
