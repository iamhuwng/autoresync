import { expect, test } from '@playwright/test';

test('THCS section delete dialog stays topmost and supports cancel and delete with 7 sections / 158 questions', async ({ page, context }) => {
  test.setTimeout(90_000);
  const blockedRemoteWrites: string[] = [];
  const remoteWriteResponses: string[] = [];
  page.on('response', (response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (url.hostname !== 'localhost' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      remoteWriteResponses.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost') return route.continue();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      blockedRemoteWrites.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
    return route.abort();
  });

  await page.goto('/');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/thcs-section-delete-heavy-harness.tsx"></script></body></html>`, { waitUntil: 'domcontentloaded' });

  const fixture = page.getByTestId('heavy-thcs-fixture');
  await expect(fixture).toHaveAttribute('data-section-count', '7');
  await expect(fixture).toHaveAttribute('data-question-count', '158');
  await expect(page.getByRole('button', { name: 'Delete Section 1' })).toBeVisible();

  const sectionDelete = async () => {
    await page.getByRole('button', { name: 'Delete Section 1' }).click();
    const confirmation = page.locator('dialog.thcs-delete-dialog');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Delete Section 1 and all 23 question(s) inside?');
    await expect.poll(() => confirmation.evaluate((dialog) => {
      if (!(dialog instanceof HTMLDialogElement) || !dialog.matches(':modal')) return false;
      const rect = dialog.getBoundingClientRect();
      const centered = Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2) < 2
        && Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) < 2;
      const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return centered && (topmost === dialog || dialog.contains(topmost));
    })).toBe(true);
    return confirmation;
  };

  const cancelDialog = await sectionDelete();
  await cancelDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(cancelDialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Questions 158' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Context & Resources 7' })).toBeVisible();

  const confirmDialog = await sectionDelete();
  page.once('dialog', (dialog) => dialog.accept());
  await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirmDialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Questions 135' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Context & Resources 6' })).toBeVisible();
  expect(blockedRemoteWrites).toEqual(['POST https://firebaseinstallations.googleapis.com/v1/projects/temp-a1437/installations']);
  expect(remoteWriteResponses).toEqual([]);
});
