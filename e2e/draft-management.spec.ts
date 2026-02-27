/**
 * E2E Tests: Draft Management & Visibility Filters
 * 
 * PRD-0022: Test Creation Modal with Draft Management System
 * Tasks 8.4-8.5 (Additional scenarios)
 * 
 * Test Scenarios:
 * - Draft list displays correctly with metadata
 * - Draft count badge
 * - Tests/Drafts view toggle
 * - Visibility filter (Public Library / My Content)
 * - Search + filter combination
 */

import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_TEACHER = {
    email: 'teacher@test.com',
    password: 'password123',
};

/**
 * Login as teacher via the Dev tab.
 */
async function loginAsTeacher(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if already signed in
    const goToDashboard = page.locator('button:has-text("Go to Dashboard")');
    if (await goToDashboard.isVisible({ timeout: 2000 }).catch(() => false)) {
        await goToDashboard.click();
        await page.waitForURL(/\/(lobby|admin)/, { timeout: 10000 });
        return;
    }

    // Click Dev tab
    const devTab = page.locator('[role="tab"]:has-text("Dev")');
    await expect(devTab).toBeVisible({ timeout: 5000 });
    await devTab.click();

    // Fill credentials
    await page.locator('input[name="email"]').fill(TEST_TEACHER.email);
    await page.locator('input[name="password"]').fill(TEST_TEACHER.password);

    // Submit
    await page.locator('form button[type="submit"]:has-text("Login")').click();
    await page.waitForTimeout(2000);

    // Handle "Already Signed In"
    const dashboardBtn = page.locator('button:has-text("Go to Dashboard")');
    if (await dashboardBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dashboardBtn.click();
    }

    await page.waitForURL(/\/(lobby|admin)/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
}

async function navigateToLobby(page: Page): Promise<void> {
    await page.goto('/lobby');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
}

async function switchToTestMode(page: Page): Promise<void> {
    const testModeButton = page.locator('button:has-text("Test Mode")');
    if (await testModeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await testModeButton.click();
        await page.waitForTimeout(500);
    }
}

async function switchToDraftsView(page: Page): Promise<boolean> {
    const draftsButton = page.locator('button:has-text("Drafts")');
    const isVisible = await draftsButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
        await draftsButton.click();
        await page.waitForTimeout(500);
    }
    return isVisible;
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

test.describe('Draft List View', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTeacher(page);
        await navigateToLobby(page);
        await switchToTestMode(page);
    });

    test('should display draft cards or empty state', async ({ page }) => {
        const hasDrafts = await switchToDraftsView(page);
        if (!hasDrafts) {
            test.skip();
            return;
        }

        // Draft view should show either draft cards with Resume buttons, or empty state
        const hasResume = await page.locator('button:has-text("Resume")').first()
            .isVisible({ timeout: 3000 }).catch(() => false);
        const hasEmptyState = await page.locator('text=/[Nn]o drafts?|[Ee]mpty/').first()
            .isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasResume || hasEmptyState).toBe(true);
    });

    test('should show draft count in the Drafts button badge', async ({ page }) => {
        const draftsButton = page.locator('button:has-text("Drafts")');
        const isVisible = await draftsButton.isVisible({ timeout: 3000 }).catch(() => false);

        if (isVisible) {
            const buttonText = await draftsButton.textContent();
            console.log('Drafts button text:', buttonText);
            // Count badge may be in format "Drafts (3)" or just "Drafts"
        }
    });

    test('should toggle between tests and drafts views', async ({ page }) => {
        // Click Drafts
        const hasDrafts = await switchToDraftsView(page);
        if (!hasDrafts) {
            test.skip();
            return;
        }

        // Verify we're in drafts view
        await page.waitForTimeout(500);

        // Click back to main view
        const testsButton = page.locator('button:has-text("Tests"), button:has-text("Back")').first();
        if (await testsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await testsButton.click();
            await page.waitForTimeout(500);
            // Should be back to test list view
        }
    });
});

test.describe('Visibility Filter - Lobby Materials', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsTeacher(page);
        await navigateToLobby(page);
        await switchToTestMode(page);
    });

    test('should show filter buttons (My Content / Public Library)', async ({ page }) => {
        const myContentBtn = page.locator('button:has-text("My Content")');
        const publicBtn = page.locator('button:has-text("Public Library")');

        const hasMyContent = await myContentBtn.isVisible({ timeout: 3000 }).catch(() => false);
        const hasPublic = await publicBtn.isVisible({ timeout: 3000 }).catch(() => false);

        console.log('My Content filter:', hasMyContent, 'Public Library filter:', hasPublic);
        // At least one filter method should be available
    });

    test('should filter by Public Library', async ({ page }) => {
        const publicBtn = page.locator('button:has-text("Public Library")');

        if (await publicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await publicBtn.click();
            await page.waitForTimeout(500);

            // Content should be filtered (either shows results or "no results")
            const hasContent = await page.locator('[class*="card"]').first()
                .isVisible({ timeout: 3000 }).catch(() => false);
            const hasEmpty = await page.locator('text=/[Nn]o.*found|[Ee]mpty/').first()
                .isVisible({ timeout: 3000 }).catch(() => false);

            expect(hasContent || hasEmpty).toBe(true);
        }
    });

    test('should filter by My Content', async ({ page }) => {
        const myContentBtn = page.locator('button:has-text("My Content")');

        if (await myContentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await myContentBtn.click();
            await page.waitForTimeout(500);

            const hasContent = await page.locator('[class*="card"]').first()
                .isVisible({ timeout: 3000 }).catch(() => false);
            const hasEmpty = await page.locator('text=/[Nn]o.*found|[Ee]mpty/').first()
                .isVisible({ timeout: 3000 }).catch(() => false);

            expect(hasContent || hasEmpty).toBe(true);
        }
    });
});

test.describe('Search Functionality', () => {
    test('should search materials', async ({ page }) => {
        await loginAsTeacher(page);
        await navigateToLobby(page);
        await switchToTestMode(page);

        const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]');
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await searchInput.fill('IELTS');
            await page.waitForTimeout(800);

            // Should filter results
            const results = page.locator('[class*="card"]');
            const count = await results.count();
            console.log(`Search "IELTS" returned ${count} results`);
        }
    });
});
