const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const origin = process.argv[2] || 'http://localhost:5173';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.THCS_QA_BROWSER_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 768 } });
  try {
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Show dev quick login' }).click();
    await page.locator('#dev-login-teacher').click();
    await page.waitForURL(/\/lobby/, { timeout: 60000 });
    await page.getByRole('button', { name: 'Create New Test' }).click();
    await page.getByText('Vietnamese National High School Exam').click();
    await page.getByPlaceholder('Đề kiểm tra giữa kì 1 — Tiếng Anh 9').fill('QA bulk answer layout');
    await page.locator('input[placeholder="giữa kì"]').click();
    await page.getByRole('option', { name: 'ôn tập' }).click();
    await page.getByText('Start Blank', { exact: true }).click();
    await page.getByRole('button', { name: /Paste Questions/ }).first().click();
    const paste = page.getByRole('dialog', { name: /Paste Questions/ });
    await paste.locator('textarea').fill(Array.from({ length: 155 }, (_, i) => `${i + 1}. QA question ${i + 1}\nA. One\nB. Two\nC. Three\nD. Four`).join('\n'));
    await paste.getByRole('button', { name: /^Import/ }).click();
    await page.getByRole('button', { name: /Next: Answer Key/ }).click();
    await page.getByRole('button', { name: /Bulk Input/ }).click();
    await page.getByPlaceholder('Paste your answer key here', { exact: false }).fill(Array.from({ length: 155 }, (_, i) => `${i + 1}.${'ABCD'[i % 4]}`).join(' '));
    const apply = page.getByRole('button', { name: 'Apply 155 Answers' });
    for (const height of [768, 600, 900]) {
      await page.setViewportSize({ width: 1440, height });
      const metrics = await apply.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { top: rect.top, bottom: rect.bottom, viewport: innerHeight, topmost: hit === el || el.contains(hit), nativeModal: Boolean(el.closest('dialog')?.matches(':modal')) };
      });
      console.log('Apply button:', JSON.stringify(metrics));
      assert(metrics.top >= 0 && metrics.bottom <= metrics.viewport && metrics.topmost && metrics.nativeModal, 'Apply button is clipped, covered, or outside the native modal layer');
    }
    await apply.click({ timeout: 5000 });
    await page.getByText('155/155 answers completed', { exact: true }).waitFor();
    await page.getByRole('status').getByText('Applied 155 answers.', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Next: Review/ }).click();
    assert(await page.getByRole('button', { name: /Publish Test/ }).isEnabled(), 'Cannot continue to Review after applying answers');
    console.log('PASS: applied all 155 answers and continued to Review. No test saved or published.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
