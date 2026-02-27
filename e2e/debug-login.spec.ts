import { test, expect, Page } from '@playwright/test';

async function loginAsTeacher(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const goToDashboard = page.locator('button:has-text("Go to Dashboard")');
    if (await goToDashboard.isVisible({ timeout: 2000 }).catch(() => false)) {
        await goToDashboard.click();
        await page.waitForURL(/\/(lobby|admin)/, { timeout: 10000 });
        await page.waitForLoadState('networkidle');
        return;
    }
    const devTab = page.locator('[role="tab"]:has-text("Dev")');
    await expect(devTab).toBeVisible({ timeout: 5000 });
    await devTab.click();
    await page.locator('input[name="email"]').fill('teacher@test.com');
    await page.locator('input[name="password"]').fill('password123');
    await page.locator('form button[type="submit"]:has-text("Login")').click();
    await page.waitForTimeout(3000);
    const dashboardBtn = page.locator('button:has-text("Go to Dashboard")');
    if (await dashboardBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dashboardBtn.click();
    }
    await page.waitForURL(/\/(lobby|admin)/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
}

test('debug parsing transition', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/lobby');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Test Mode → Create New Test → Modal
    await page.locator('button:has-text("Test Mode")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Create New Test")').click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // IELTS → Reading → (auto on Metadata) → Continue → Upload
    await page.locator('text=IELTS').first().click();
    await page.waitForTimeout(500);
    await page.locator('text=Reading').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Continue")').click({ force: true });
    await page.waitForTimeout(500);
    console.log('[1] On upload step');

    // Paste mode
    await page.locator('button:has-text("Paste")').first().click();
    await page.waitForTimeout(300);

    // Fill textarea (>50 chars)
    await page.locator('textarea').fill('Sample IELTS Reading content for E2E testing. This is a long enough passage about renewable energy sources and their impact on modern society.');
    await page.waitForTimeout(300);
    console.log('[2] Filled textarea');

    // Click "Start Parsing" — the ENABLED one (TestUploadWizard's button)
    const startParsingBtns = page.locator('button:has-text("Start Parsing")');
    // Find the enabled one
    const count = await startParsingBtns.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
        const dis = await startParsingBtns.nth(i).isDisabled().catch(() => true);
        if (!dis) {
            await startParsingBtns.nth(i).scrollIntoViewIfNeeded();
            await startParsingBtns.nth(i).click();
            clicked = true;
            console.log(`[3] Clicked Start Parsing #${i}`);
            break;
        }
    }

    if (!clicked) {
        console.log('[3] FAILED: No enabled Start Parsing button found');
        expect(clicked).toBe(true);
        return;
    }

    // Wait a bit and check what's on screen
    await page.waitForTimeout(500);

    // Check if we moved to parsing step
    const headingText = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return 'NO DIALOG';
        const headings = dialog.querySelectorAll('h2');
        return Array.from(headings).map(h => h.textContent).join(' | ');
    });
    console.log('[4] Dialog headings:', headingText);

    // Check for parsing indicators
    const parsingText = await page.locator('text=/Parsing|Converting|Extracting/i').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
    console.log('[5] Has parsing text:', parsingText);

    // What are the visible texts in the dialog?
    const visibleText = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return 'NO DIALOG';
        // Get h2, p, span, button text
        const elems = dialog.querySelectorAll('h2, p, button');
        return Array.from(elems)
            .filter(e => (e as HTMLElement).offsetParent !== null)
            .map(e => `<${e.tagName.toLowerCase()}> ${e.textContent?.trim().substring(0, 80)}`)
            .join('\n');
    });
    console.log('[6] Dialog visible elements:\n' + visibleText);

    // Wait longer for parsing
    await page.waitForTimeout(8000);

    // Check again
    const visibleText2 = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return 'NO DIALOG';
        const elems = dialog.querySelectorAll('h2, p, button');
        return Array.from(elems)
            .filter(e => (e as HTMLElement).offsetParent !== null)
            .map(e => `<${e.tagName.toLowerCase()}> ${e.textContent?.trim().substring(0, 80)}`)
            .join('\n');
    });
    console.log('[7] After 8s:\n' + visibleText2);

    // Check for Continue to Review
    const reviewBtn = page.locator('button:has-text("Continue to Review")');
    const reviewVisible = await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('[8] Continue to Review visible:', reviewVisible);

    expect(reviewVisible).toBe(true);
});
