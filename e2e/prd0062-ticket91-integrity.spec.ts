import { expect, test } from '@playwright/test';

const openStudentRuntime = async (
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
) => {
  await request.post('http://localhost:5187/__proof/control', { data: { state: 'available' } });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
  await page.goto('/__smoke/book-runtime', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('book-window-state')).toHaveAttribute(
    'data-window-state',
    'available',
  );
};

test('student sees immediate bounded integrity warnings and still completes and submits', async ({
  page,
  request,
}) => {
  await openStudentRuntime(page, request);
  const proof = page.getByTestId('book-integrity-proof');
  await expect(proof).toBeVisible();
  await expect(page.getByTestId('book-integrity-configured-signals').getByRole('listitem'))
    .toHaveCount(8);
  await expect(proof).toContainText('never locks, submits, scores, consumes an attempt, or blocks completion');
  const recordedCount = async (): Promise<number> => Number(
    (await page.getByTestId('book-integrity-recorded-count').textContent())?.match(/\d+\s*$/u)?.[0] ?? 0,
  );
  const initialCount = await recordedCount();

  await page.evaluate(() => document.dispatchEvent(new Event('paste', {
    bubbles: true,
    cancelable: true,
  })));
  await expect(page.getByText(
    'An integrity signal was recorded. You can continue this Activity and submit normally.',
  ).last()).toBeVisible();
  await expect.poll(recordedCount).toBeGreaterThan(initialCount);
  const pasteCount = await recordedCount();

  await page.getByTestId('book-integrity-protected-content').evaluate((element) => {
    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    (window as unknown as { ticket91CopyPrevented?: boolean }).ticket91CopyPrevented = false;
    document.addEventListener('copy', (event) => {
      (window as unknown as { ticket91CopyPrevented?: boolean }).ticket91CopyPrevented =
        event.defaultPrevented;
    }, { once: true });
  });
  await page.keyboard.press('Control+C');
  await expect.poll(() => page.evaluate(
    () => (window as unknown as { ticket91CopyPrevented?: boolean }).ticket91CopyPrevented,
  )).toBe(true);
  await expect.poll(recordedCount).toBeGreaterThan(pasteCount);
  const copyCount = await recordedCount();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(recordedCount).toBeGreaterThan(copyCount);

  await page.getByLabel('Statement A').check();
  await page.getByTestId('book-runtime-submit').click();
  await expect(page.getByTestId('book-runtime-submit')).toContainText('Activity submitted');
  await expect(page.getByTestId('book-runtime-submit')).toBeDisabled();
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-91/browser/configured-signals-warning-submitted-desktop.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('book-window-state')).toHaveAttribute(
    'data-window-state',
    'available',
  );
  await expect(proof).toBeVisible();
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-91/browser/configured-signals-warning-submitted-375.png',
    fullPage: true,
  });
});

test('reload recovery records the same exit operation and preserves normal continuation', async ({
  page,
  request,
}) => {
  await openStudentRuntime(page, request);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('book-window-state')).toHaveAttribute(
    'data-window-state',
    'available',
  );
  await expect(page.getByText(
    'An integrity signal was recorded. You can continue this Activity and submit normally.',
  ).last()).toBeVisible();
  await expect(page.getByTestId('book-runtime-submit')).toBeEnabled();
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
});
