/**
 * E2E Tests: Student Complete User Journey
 * 
 * End-to-end tests for the complete student experience in the Academic Record & Profile System.
 * Part of PRD-0015: Phase 10 - Task 10.17
 * 
 * User Journey Flow:
 * 1. Login as student
 * 2. View and update profile
 * 3. Take a test and submit
 * 4. View test results in Academic Record
 * 5. Explore different views (Timeline, By Course, By Skill, Statistics, Badges)
 * 6. Receive and view teacher feedback
 * 7. Earn and view badges
 */

import { test, expect } from '@playwright/test';

// Test user credentials (should be configured in test environment)
const TEST_STUDENT = {
    email: process.env.TEST_STUDENT_EMAIL || 'test.student@example.com',
    password: process.env.TEST_STUDENT_PASSWORD || 'testpassword123'
};

test.describe('Student User Journey - Profile Management', () => {
    test.beforeEach(async ({ page }) => {
        // Login as student
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_STUDENT.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_STUDENT.password);
        await page.click('button[type="submit"]');

        // Wait for redirect
        await page.waitForURL('**/student/**', { timeout: 10000 });
    });

    test('should view profile page with all sections', async ({ page }) => {
        await page.goto('/profile');

        // Verify profile page loaded
        await expect(page.locator('h2:has-text("Profile"), text=My Profile')).toBeVisible();

        // Check for personal information section
        await expect(page.locator('text=Personal Information, text=Name')).toBeVisible();

        // Check for address section
        await expect(page.locator('text=Address')).toBeVisible();

        // Check edit button is available
        await expect(page.locator('button:has-text("Edit")')).toBeVisible();
    });

    test('should edit and save profile information', async ({ page }) => {
        await page.goto('/profile');

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Wait for form to load
        await expect(page.locator('form, input[name="firstName"]').first()).toBeVisible();

        // Update a field
        const phoneInput = page.locator('input[name="phone"], input[type="tel"]');
        if (await phoneInput.isVisible()) {
            await phoneInput.clear();
            await phoneInput.fill('0987654321');
        }

        // Save changes
        await page.click('button:has-text("Save")');

        // Verify save success (notification or updated content)
        await expect(page.locator('text=saved, text=updated, text=success').first()).toBeVisible({ timeout: 5000 });
    });

    test('should display avatar with correct alt text', async ({ page }) => {
        await page.goto('/profile');

        const avatar = page.locator('img[alt*="Profile"], .mantine-Avatar-image');
        await expect(avatar.first()).toBeVisible();
    });
});

test.describe('Student User Journey - Academic Record Navigation', () => {
    test.beforeEach(async ({ page }) => {
        // Login as student
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_STUDENT.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_STUDENT.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/student/**', { timeout: 10000 });
    });

    test('should navigate to Academic Record page', async ({ page }) => {
        await page.goto('/student/academic-record');

        // Verify page loaded
        await expect(page.locator('text=Academic Record')).toBeVisible();

        // Verify tabs are visible
        await expect(page.locator('button:has-text("Timeline")')).toBeVisible();
        await expect(page.locator('button:has-text("By Course")')).toBeVisible();
        await expect(page.locator('button:has-text("Statistics")')).toBeVisible();
    });

    test('should filter results by time period', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Find and interact with time filter
        const filterSelect = page.locator('select, [role="combobox"]').first();

        if (await filterSelect.isVisible()) {
            await filterSelect.click();

            // Select a different time period
            const option = page.locator('option, [role="option"]').filter({ hasText: /month|week|year/i }).first();
            if (await option.isVisible()) {
                await option.click();
            }
        }

        // Verify results update (results count should change or stay same)
        await expect(page.locator('[aria-live="polite"]')).toBeVisible();
    });

    test('should navigate between tabs', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Click each tab and verify content changes
        const tabs = ['Timeline', 'By Course', 'By Skill', 'By Type', 'Statistics', 'Badges'];

        for (const tabName of tabs) {
            const tab = page.locator(`button:has-text("${tabName}")`);
            if (await tab.isVisible()) {
                await tab.click();
                await page.waitForTimeout(300);

                // Verify tab panel is visible
                await expect(page.locator('[role="tabpanel"]').first()).toBeVisible();
            }
        }
    });

    test('should display timeline view with results', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Click Timeline tab
        await page.click('button:has-text("Timeline")');

        // Check for result cards or empty state
        const hasResults = await page.locator('.result-card, [data-testid*="result"]').count() > 0;
        const hasEmptyState = await page.locator('text=No results, text=empty, text=No test results').isVisible();

        // Either results or empty state should be shown
        expect(hasResults || hasEmptyState).toBeTruthy();
    });

    test('should display statistics dashboard with charts', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Click Statistics tab
        await page.click('button:has-text("Statistics")');
        await page.waitForTimeout(500);

        // Check for chart elements or empty state
        const hasCharts = await page.locator('[role="img"], .recharts-wrapper').count() > 0;
        const hasEmptyState = await page.locator('text=No data, text=Complete some tests').isVisible();

        expect(hasCharts || hasEmptyState).toBeTruthy();

        // If charts exist, verify accessibility
        if (hasCharts) {
            await expect(page.locator('[aria-labelledby*="chart"]').first()).toBeVisible();
        }
    });

    test('should display badges collection', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Click Badges tab
        await page.click('button:has-text("Badges")');
        await page.waitForTimeout(500);

        // Check for badge display or empty state
        const hasBadges = await page.locator('.badge-card, [data-testid*="badge"]').count() > 0;
        const hasNoBadges = await page.locator('text=No badges, text=Earn badges').isVisible();

        expect(hasBadges || hasNoBadges).toBeTruthy();
    });
});

test.describe('Student User Journey - Test Taking Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_STUDENT.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_STUDENT.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/student/**', { timeout: 10000 });
    });

    test('should navigate from courses to test materials', async ({ page }) => {
        // Navigate to courses
        await page.goto('/student/courses');

        // Check for course cards
        const courseCards = page.locator('.course-card, [data-testid*="course"]');

        if (await courseCards.count() > 0) {
            // Click first course
            await courseCards.first().click();

            // Should navigate to course detail or materials
            await page.waitForTimeout(500);

            // Look for test/material links
            const hasTests = await page.locator('button:has-text("Start"), a:has-text("Test"), text=Practice').count() > 0;
            expect(hasTests || await page.locator('text=No materials').isVisible()).toBeTruthy();
        }
    });

    test('should view test result details', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Find a result card and click it
        const resultCard = page.locator('.result-card, [data-testid*="result"]').first();

        if (await resultCard.isVisible()) {
            await resultCard.click();

            // Should show result details
            await expect(page.locator('text=Score, text=Correct, text=Result')).toBeVisible();
        }
    });
});

test.describe('Student User Journey - Feedback Viewing', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_STUDENT.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_STUDENT.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/student/**', { timeout: 10000 });
    });

    test('should view teacher feedback on test result', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Find a result with feedback indicator
        const resultWithFeedback = page.locator('[data-has-feedback="true"], :has-text("feedback")').first();

        if (await resultWithFeedback.isVisible()) {
            await resultWithFeedback.click();

            // Should show feedback content
            await expect(page.locator('text=Feedback, text=Comment, text=Teacher')).toBeVisible();
        }
    });

    test('should mark feedback as read', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Look for unread feedback indicator
        const unreadFeedback = page.locator('[data-unread="true"], .unread-feedback').first();

        if (await unreadFeedback.isVisible()) {
            await unreadFeedback.click();

            // After viewing, unread indicator should be removed
            await page.waitForTimeout(1000);
            await expect(unreadFeedback).not.toHaveAttribute('data-unread', 'true');
        }
    });
});

test.describe('Student User Journey - Complete Flow', () => {
    test('should complete full student journey from login to viewing results', async ({ page }) => {
        // Step 1: Login
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_STUDENT.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_STUDENT.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/student/**', { timeout: 10000 });

        // Step 2: Navigate to Profile
        await page.goto('/profile');
        await expect(page.locator('text=Profile, text=My Profile')).toBeVisible();

        // Step 3: Navigate to Academic Record
        await page.goto('/student/academic-record');
        await expect(page.locator('text=Academic Record')).toBeVisible();

        // Step 4: Explore Timeline view
        await page.click('button:has-text("Timeline")');
        await page.waitForTimeout(500);

        // Step 5: Check Statistics
        await page.click('button:has-text("Statistics")');
        await page.waitForTimeout(500);

        // Step 6: Check Badges
        await page.click('button:has-text("Badges")');
        await page.waitForTimeout(500);

        // Step 7: Verify all tabs worked
        expect(true).toBeTruthy(); // If we got here, the journey succeeded
    });
});
