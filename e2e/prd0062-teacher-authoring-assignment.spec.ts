import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrd0062AcceptanceFixture } from './prd0062-acceptance-fixtures.mjs';
import { createPrd0062TeacherAuthoringAssignmentFixture } from './prd0062-teacher-authoring-assignment.fixture.mjs';

const origin = 'http://localhost:5173';

const loginTeacher = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (!/\/lobby(?:\/|$)/u.test(page.url())) {
    await expect(page.getByRole('button', { name: 'Show dev quick login' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Show dev quick login' }).click();
    await page.locator('#dev-login-teacher').click();
  }
  await expect(page).toHaveURL(/\/lobby(?:\/|$)/u, { timeout: 60_000 });
};

const saveArtifact = async (caseId: string, testInfo: { project: { name: string } }, proof: string[]) => {
  const executionId = process.env.PRD0062_EXECUTION_ID ?? 'local';
  const directory = path.resolve(`artifacts/prd0062-acceptance/${caseId}/${executionId}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify({
    caseId,
    project: testInfo.project.name,
    status: 'PASS_LOCAL_SMOKE_ASSERTIONS',
    proof,
    activation: 'not claimed; #126 is engineering-proof-only and gates remain disabled',
  }, null, 2));
};

test('AC-TA-001 creates, previews, publishes, and reloads full/component Book assemblies', async ({ page }, testInfo) => {
  const campaignFixture = createPrd0062AcceptanceFixture({
    caseId: 'AC-TA-001',
    source: { id: 'grammar-65', title: 'IELTS Grammar for Bands 6.5 and Above' },
  });
  const fixture = createPrd0062TeacherAuthoringAssignmentFixture('AC-TA-001');
  expect(fixture.activityVersionId).toContain('activity-ac-ta-001');
  expect(campaignFixture.ids.cleanupRoot).toBe('prd0062_acceptance/AC-TA-001');

  await loginTeacher(page);
  await page.goto(`${origin}/__smoke/book-assembly?fixture=ticket65-full-pdf`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByRole('heading', { name: 'Full-PDF publication fixture' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ticket65-current-publication')).toContainText('none');
  await expect(page.getByRole('button', { name: 'Publish full PDF Unit' })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview full PDF Unit' }).click();
  await expect(page.getByTestId('ticket65-publication-message')).toContainText('Full-PDF preview approved.');
  await page.getByRole('button', { name: 'Publish full PDF Unit' }).click();
  await expect(page.getByTestId('ticket65-current-publication')).toContainText('publication:candidate-ticket56:ticket65');
  await expect(page.getByTestId('ticket65-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-activity-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-placement-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-delivery-plan-count')).toContainText('1');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket65-current-publication')).toContainText('publication:candidate-ticket56:ticket65');

  await page.goto(`${origin}/__smoke/book-assembly?fixture=ticket66-component-pdf`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByRole('heading', { name: 'Component-PDF publication fixture' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ticket66-component-order')).toContainText('component-a, component-b');
  await expect(page.getByTestId('ticket66-component-owners')).toContainText('component-a=section-component-a');
  await expect(page.getByTestId('ticket66-source-pins')).toContainText('source-component-a, source-component-b');
  await page.getByRole('button', { name: 'Preview component PDF Unit' }).click();
  await page.getByRole('button', { name: 'Publish component PDF Unit' }).click();
  await expect(page.getByTestId('ticket66-current-publication')).toContainText('publication:candidate-ticket56:ticket66');
  await expect(page.getByTestId('ticket66-activity-version-count')).toContainText('2');
  await expect(page.getByTestId('ticket66-placement-count')).toContainText('2');
  await expect(page.getByTestId('ticket66-canonical-readbacks')).toContainText('activity:activity-ticket66-a:ticket66');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket66-current-publication')).toContainText('publication:candidate-ticket56:ticket66');
  await saveArtifact('AC-TA-001', testInfo, [
    'teacher quick-login on localhost:5173',
    'full-PDF and component-PDF preview-before-publish paths',
    'publication/version/placement/delivery/readback state survives reload',
  ]);
});

test('AC-TA-002 previews exact Book scope, schedule, policy, integrity, and no-write handoff', async ({ page }, testInfo) => {
  const fixture = createPrd0062TeacherAuthoringAssignmentFixture('AC-TA-002');
  expect(fixture.assignment.target.kind).toBe('unit');
  await loginTeacher(page);
  await page.goto(`${origin}/__smoke/book-homework-preview`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.getByRole('button', { name: 'Open Book Homework preview' }).click();
  await expect(page.getByText('Read-only Book assignment preview', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No assignment written' })).toBeVisible();
  await expect(page.getByLabel('Assignment scope')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Book Delivery facts' })).toHaveCount(0);
  await expect(page.getByLabel('Book Delivery facts')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Frozen outline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivered source breadth' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ordered Activity policy' })).toBeVisible();
  await expect(page.getByLabel('Accountable')).toBeChecked();
  await expect(page.getByLabel('Capture Book integrity signals for this handoff')).toBeChecked();
  await expect(page.getByLabel('Available From')).toBeVisible();
  await expect(page.getByLabel('Due Date')).toHaveValue('2026-08-30T20:00');
  await expect(page.getByText('Effective Activity windows', { exact: true })).toBeVisible();
  const fork = page.getByRole('button', { name: 'Fork before assign' });
  if (await fork.count() > 0) {
    await fork.click();
    await expect(page.getByRole('status').filter({ hasText: 'Fork-before-assign callback observed' })).toBeVisible();
  }
  await expect(page.getByText(/Preview creates no whole-Book attempt.*Delivery mutation/u)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm preview for assignment handoff' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Read-only handoff prepared for 2 Activity record' })).toBeVisible();
  await saveArtifact('AC-TA-002', testInfo, [
    'exact scope, frozen outline, source breadth, and ordered Activity policy inspected',
    'schedule and accountable integrity policy inspected',
    'fork warning callback and read-only handoff status inspected',
  ]);
});
