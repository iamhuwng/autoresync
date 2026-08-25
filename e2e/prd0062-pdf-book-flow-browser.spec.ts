import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';

const ORIGIN = 'http://localhost:5173';

test('PDF Book upload flow inspects a selected PDF locally before authorizing the mock upload', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=pdf-upload`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'One complete PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Start with one PDF' })).toBeVisible({ timeout: 60_000 });

  const pdfBytes = Buffer.from(new jsPDF({ unit: 'pt', format: 'a4' }).output('arraybuffer'));
  await page.locator('input[type="file"]').setInputFiles({
    name: 'mock-book.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes,
  });
  await expect(page.getByText('Checking your PDF')).toBeVisible();
  await expect(page.getByText('mock-book.pdf')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Looks good')).toBeVisible();
  await expect(page.getByText('Complete on this device')).not.toBeVisible();

  await page.getByRole('button', { name: 'Upload PDF' }).click();
  const uploadRights = page.getByRole('checkbox', { name: 'I have permission to use this PDF with my students.' });
  await expect(uploadRights).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload PDF' })).toBeDisabled();
  await uploadRights.check();
  await page.getByRole('button', { name: 'Upload PDF' }).click();
  await expect(page.getByText('Your PDF is ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Book PDF' }).getByText('Ready', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build the Book structure' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book chooser switches to the separate component-PDF interface', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=none`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Several component PDFs' }).click();
  await expect(page.getByRole('heading', { name: 'Bring in your PDF sections' })).toBeVisible();
  await expect(page.getByText('0 of 2 files')).toBeVisible();
  await page.getByRole('button', { name: 'Add a PDF' }).click();
  await expect(page.getByRole('region', { name: 'PDF 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a PDF' }).click();
  await expect(page.getByRole('region', { name: 'PDF 2' })).toBeVisible();
  await expect(page.getByText('0 of 2 files')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book component workflow exercises the approved production flow with mock data', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket66-component-pdf`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Bring in your PDF sections' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'PDF 1' })).toContainText('already part of the saved Book draft');
  await expect(page.getByRole('region', { name: 'PDF 2' })).toContainText('already part of the saved Book draft');

  await page.getByRole('button', { name: '2 Build your Book' }).click();
  await expect(page.getByRole('region', { name: 'Give each PDF a place' }).getByRole('heading', { name: 'Give each PDF a place', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move first PDF down' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('row', { name: 'activity-ticket66-a PDF 2 1 1' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'activity-ticket66-b PDF 1 1 1' })).toBeVisible();
  await page.getByRole('button', { name: /Build your Book/ }).click();
  await expect(page.getByRole('region', { name: 'Give each PDF a place' }).getByRole('heading', { name: 'Give each PDF a place', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect activities to pages' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a reference page' }).click();
  await expect(page.getByText('Change page connections')).toBeVisible();
  await page.getByRole('button', { name: 'Save page connection' }).click();
  await expect(page.getByText('Change page connections')).not.toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Everything needed for Unit 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Assembly draft saved.' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Preview as a student' }).click();
  await expect(page.getByText('Ready to approve')).toBeVisible();
  await page.getByRole('button', { name: 'Approve this preview' }).click();
  await expect(page.getByText('Preview approved. You can now publish this draft')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();

  await expect(page.getByRole('heading', { name: 'Ready to share Unit 1?' })).toBeVisible();
  const rights = page.getByRole('checkbox', { name: 'I confirm the PDF permission is still valid for publishing.' });
  await expect(rights).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish Unit 1', exact: true })).toBeDisabled();
  await rights.check();
  await page.getByRole('button', { name: 'Publish Unit 1', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Publish Unit 1?' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Publish Unit 1?' }).getByRole('button', { name: 'Publish Unit 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unit 1 is live' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview homework handoff' })).toBeDisabled();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book full-PDF workflow keeps its single-source structure and publishes through the same final gates', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket65-full-pdf`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Start with one PDF' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Book PDF' })).toContainText('already part of the saved Book draft');
  await page.getByRole('button', { name: '2 Build your Book' }).click();
  await expect(page.getByRole('heading', { name: 'Build the Book structure' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('row', { name: 'activity-ticket65 Complete Book PDF 2, 3 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Preview as a student' }).click();
  await page.getByRole('button', { name: 'Approve this preview' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Ready to share Unit 1?' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I confirm the PDF permission is still valid for publishing.' }).check();
  await page.getByRole('button', { name: 'Publish Unit 1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish Unit 1?' }).getByRole('button', { name: 'Publish Unit 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unit 1 is live' }).last()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
