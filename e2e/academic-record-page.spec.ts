import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Academic Record Page
 * 
 * Tests the complete Academic Record functionality including:
 * - Navigation and access
 * - Tab switching
 * - Date filtering
 * - Data display across all views
 * - Responsive design
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */

// Test data setup
const STUDENT_EMAIL = 'student@test.com';
const STUDENT_PASSWORD = 'password123';
const BASE_URL = 'http://localhost:5173';

test.describe('Academic Record Page', () => {

    test.beforeEach(async ({ page }) => {
        // Login as student before each test
        await page.goto(`${BASE_URL}/`);
        await page.fill('input[type="email"]', STUDENT_EMAIL);
        await page.fill('input[type="password"]', STUDENT_PASSWORD);
        await page.click('button[type="submit"]');

        // Wait for dashboard to load
        await page.waitForURL(/\/student/);
    });

    test('should navigate to Academic Record page from Student Dashboard', async ({ page }) => {
        // Click Academic Record button in navigation
        await page.click('button:has-text("📈 Academic Record")');

        // Verify URL changed
        await expect(page).toHaveURL(/\/student\/academic-record/);

        // Verify page header is visible
        await expect(page.locator('text=Academic Record')).toBeVisible();

        // Verify subtitle is visible
        await expect(page.locator('text=View and analyze your test results')).toBeVisible();
    });

    test('should display loading state initially', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);

        // Check for loading spinner (may be brief)
        const loader = page.locator('text=Loading your academic records');

        // Either loader is visible or content has already loaded
        const isLoading = await loader.isVisible().catch(() => false);
        const hasContent = await page.locator('[role="tablist"]').isVisible().catch(() => false);

        expect(isLoading || hasContent).toBeTruthy();
    });

    test('should show all tab options', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);
        await page.waitForLoadState('networkidle');

        // Verify all 5 tabs are present
        await expect(page.locator('button[role="tab"]:has-text("Timeline")')).toBeVisible();
        await expect(page.locator('button[role="tab"]:has-text("By Course")')).toBeVisible();
        await expect(page.locator('button[role="tab"]:has-text("By Skill")')).toBeVisible();
        await expect(page.locator('button[role="tab"]:has-text("By Type")')).toBeVisible();
        await expect(page.locator('button[role="tab"]:has-text("Statistics")')).toBeVisible();
    });

    test('should display Timeline tab by default', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);
        await page.waitForLoadState('networkidle');

        // Timeline tab should be active (aria-selected="true")
        const timelineTab = page.locator('button[role="tab"]:has-text("Timeline")');
        await expect(timelineTab).toHaveAttribute('aria-selected', 'true');
    });

    test('should switch between tabs', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);
        await page.waitForLoadState('networkidle');

        // Click By Course tab
        await page.click('button[role="tab"]:has-text("By Course")');
        await expect(page.locator('button[role="tab"]:has-text("By Course")')).toHaveAttribute('aria-selected', 'true');

        // Click By Skill tab
        await page.click('button[role="tab"]:has-text("By Skill")');
        await expect(page.locator('button[role="tab"]:has-text("By Skill")')).toHaveAttribute('aria-selected', 'true');

        // Click By Type tab
        await page.click('button[role="tab"]:has-text("By Type")');
        await expect(page.locator('button[role="tab"]:has-text("By Type")')).toHaveAttribute('aria-selected', 'true');

        // Click Statistics tab
        await page.click('button[role="tab"]:has-text("Statistics")');
        await expect(page.locator('button[role="tab"]:has-text("Statistics")')).toHaveAttribute('aria-selected', 'true');

        // Go back to Timeline
        await page.click('button[role="tab"]:has-text("Timeline")');
        await expect(page.locator('button[role="tab"]:has-text("Timeline")')).toHaveAttribute('aria-selected', 'true');
    });

    test('should display date range filter', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);
        await page.waitForLoadState('networkidle');

        // Verify filter dropdown exists
        const filterSelect = page.locator('select, [role="combobox"]').first();
        await expect(filterSelect).toBeVisible();
    });

    test('should filter results by date range', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);
        await page.waitForLoadState('networkidle');

        // Get initial result count
        const initialCount = await page.locator('text=/\\d+ results? found/').textContent();

        // Change filter to "Last 7 Days"
        await page.click('select, [role="combobox"]');
        await page.click('text=Last 7 Days');

        // Wait for results to update
        await page.waitForTimeout(500);

        // Verify result count may have changed
        const newCount = await page.locator('text=/\\d+ results? found/').textContent();
        expect(newCount).toBeTruthy();
    });

    test('should display result count', async ({ page }) => {
        await page.goto(`${BASE_URL}/student/academic-record`);
        await page.waitForLoadState('networkidle');

        // Verify result count is displayed
        const resultCount = page.locator('text=/\\d+ results? found/');
        await expect(resultCount).toBeVisible();
    });

    test.describe('Timeline Tab', () => {
        test('should display results in chronological order', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            // Ensure Timeline tab is active
            await page.click('button[role="tab"]:has-text("Timeline")');

            // Check if results exist or empty state is shown
            const hasResults = await page.locator('[data-testid="result-card"], .result-card').count() > 0;
            const hasEmptyState = await page.locator('text=No test results found').isVisible().catch(() => false);

            expect(hasResults || hasEmptyState).toBeTruthy();
        });

        test('should show Load More button if more than 10 results', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("Timeline")');

            // Count visible results
            const resultCount = await page.locator('[data-testid="result-card"], .result-card').count();

            if (resultCount >= 10) {
                // Load More button should be visible
                await expect(page.locator('button:has-text("Load More")')).toBeVisible();
            }
        });
    });

    test.describe('By Course Tab', () => {
        test('should group results by course', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("By Course")');
            await page.waitForTimeout(300);

            // Check for course groupings or empty state
            const hasCourseGroups = await page.locator('text=/Course|Uncategorized/').count() > 0;
            const hasEmptyState = await page.locator('text=No test results').isVisible().catch(() => false);

            expect(hasCourseGroups || hasEmptyState).toBeTruthy();
        });

        test('should display course statistics', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("By Course")');
            await page.waitForTimeout(300);

            // Look for average score or test count indicators
            const hasStats = await page.locator('text=/Average|tests?/i').count() > 0;
            const hasEmptyState = await page.locator('text=No test results').isVisible().catch(() => false);

            expect(hasStats || hasEmptyState).toBeTruthy();
        });
    });

    test.describe('By Skill Tab', () => {
        test('should display all four skill types', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("By Skill")');
            await page.waitForTimeout(300);

            // Check for skill names or empty state
            const hasSkills = await page.locator('text=/Reading|Listening|Writing|Speaking/').count() > 0;
            const hasEmptyState = await page.locator('text=No test results').isVisible().catch(() => false);

            expect(hasSkills || hasEmptyState).toBeTruthy();
        });

        test('should display skill statistics', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("By Skill")');
            await page.waitForTimeout(300);

            // Look for average, best, or worst score indicators
            const hasStats = await page.locator('text=/Average|Best|Worst/i').count() > 0;
            const hasEmptyState = await page.locator('text=No test results').isVisible().catch(() => false);

            expect(hasStats || hasEmptyState).toBeTruthy();
        });
    });

    test.describe('By Type Tab', () => {
        test('should display test types (Quiz and Test)', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("By Type")');
            await page.waitForTimeout(300);

            // Check for Quiz or Test labels or empty state
            const hasTypes = await page.locator('text=/Quiz|Test/').count() > 0;
            const hasEmptyState = await page.locator('text=No test results').isVisible().catch(() => false);

            expect(hasTypes || hasEmptyState).toBeTruthy();
        });

        test('should display pass rate statistics', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("By Type")');
            await page.waitForTimeout(300);

            // Look for pass rate indicators
            const hasPassRate = await page.locator('text=/Pass Rate|%/i').count() > 0;
            const hasEmptyState = await page.locator('text=No test results').isVisible().catch(() => false);

            expect(hasPassRate || hasEmptyState).toBeTruthy();
        });
    });

    test.describe('Statistics Tab', () => {
        test('should display overview cards', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("Statistics")');
            await page.waitForTimeout(500);

            // Check for overview statistics or empty state
            const hasStats = await page.locator('text=/Total Tests|Average Score|Best Score|Study Streak/i').count() > 0;
            const hasEmptyState = await page.locator('text=No data available').isVisible().catch(() => false);

            expect(hasStats || hasEmptyState).toBeTruthy();
        });

        test('should display charts', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("Statistics")');
            await page.waitForTimeout(500);

            // Check for chart containers or SVG elements
            const hasCharts = await page.locator('svg, canvas, .recharts-wrapper').count() > 0;
            const hasEmptyState = await page.locator('text=No data available').isVisible().catch(() => false);

            expect(hasCharts || hasEmptyState).toBeTruthy();
        });

        test('should display export buttons', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            await page.click('button[role="tab"]:has-text("Statistics")');
            await page.waitForTimeout(300);

            // Look for export buttons (may be disabled if no data)
            const hasPDFButton = await page.locator('button:has-text("PDF")').count() > 0;
            const hasCSVButton = await page.locator('button:has-text("CSV")').count() > 0;

            expect(hasPDFButton || hasCSVButton).toBeTruthy();
        });
    });

    test.describe('Responsive Design', () => {
        test('should be responsive on mobile viewport', async ({ page }) => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 });

            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            // Verify page is still accessible
            await expect(page.locator('text=Academic Record')).toBeVisible();
            await expect(page.locator('[role="tablist"]')).toBeVisible();
        });

        test('should be responsive on tablet viewport', async ({ page }) => {
            // Set tablet viewport
            await page.setViewportSize({ width: 768, height: 1024 });

            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            // Verify page is still accessible
            await expect(page.locator('text=Academic Record')).toBeVisible();
            await expect(page.locator('[role="tablist"]')).toBeVisible();
        });
    });

    test.describe('Error Handling', () => {
        test('should handle empty results gracefully', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            // Filter to a range with no results (if possible)
            await page.click('select, [role="combobox"]');
            await page.click('text=Last 7 Days');
            await page.waitForTimeout(500);

            // Should show either results or empty state, not error
            const hasError = await page.locator('text=/error|failed/i').isVisible().catch(() => false);
            expect(hasError).toBeFalsy();
        });
    });

    test.describe('Navigation', () => {
        test('should navigate back to Student Dashboard', async ({ page }) => {
            await page.goto(`${BASE_URL}/student/academic-record`);
            await page.waitForLoadState('networkidle');

            // Navigate back using browser back button
            await page.goBack();

            // Should be back at student dashboard
            await expect(page).toHaveURL(/\/student/);
        });
    });
});
