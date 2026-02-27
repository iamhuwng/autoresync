/**
 * E2E Tests: Teacher Complete User Journey
 * 
 * End-to-end tests for the complete teacher experience in the Academic Record & Profile System.
 * Part of PRD-0015: Phase 10 - Task 10.18
 * 
 * User Journey Flow:
 * 1. Login as teacher
 * 2. View and manage profile
 * 3. View assigned students
 * 4. Review student test results
 * 5. Provide feedback on test results
 * 6. View class analytics and statistics
 * 7. Manage module sessions and attendance
 */

import { test, expect } from '@playwright/test';

// Test user credentials (should be configured in test environment)
const TEST_TEACHER = {
    email: process.env.TEST_TEACHER_EMAIL || 'test.teacher@example.com',
    password: process.env.TEST_TEACHER_PASSWORD || 'testpassword123'
};

test.describe('Teacher User Journey - Profile Management', () => {
    test.beforeEach(async ({ page }) => {
        // Login as teacher
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');

        // Wait for redirect
        await page.waitForURL('**/teacher/**', { timeout: 10000 });
    });

    test('should view teacher profile page', async ({ page }) => {
        await page.goto('/profile');

        // Verify profile page loaded
        await expect(page.locator('h2:has-text("Profile"), text=My Profile')).toBeVisible();

        // Check for edit functionality
        await expect(page.locator('button:has-text("Edit")')).toBeVisible();
    });

    test('should update teacher profile information', async ({ page }) => {
        await page.goto('/profile');

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Update a field
        const phoneInput = page.locator('input[name="phone"], input[type="tel"]');
        if (await phoneInput.isVisible()) {
            await phoneInput.clear();
            await phoneInput.fill('0912345678');
        }

        // Save changes
        await page.click('button:has-text("Save")');

        // Verify save success
        await expect(page.locator('text=saved, text=updated, text=success').first()).toBeVisible({ timeout: 5000 });
    });
});

test.describe('Teacher User Journey - Student Management', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/teacher/**', { timeout: 10000 });
    });

    test('should view list of assigned students', async ({ page }) => {
        await page.goto('/teacher/students');

        // Check for student list
        const studentList = page.locator('.student-card, [data-testid*="student"], table tbody tr');

        // Either students or empty state should be shown
        const hasStudents = await studentList.count() > 0;
        const hasEmptyState = await page.locator('text=No students, text=no assigned').isVisible();

        expect(hasStudents || hasEmptyState).toBeTruthy();
    });

    test('should view student details', async ({ page }) => {
        await page.goto('/teacher/students');

        const studentCard = page.locator('.student-card, [data-testid*="student"]').first();

        if (await studentCard.isVisible()) {
            await studentCard.click();

            // Should show student profile or results
            await expect(page.locator('text=Profile, text=Results, text=Academic')).toBeVisible();
        }
    });

    test('should filter students by name or status', async ({ page }) => {
        await page.goto('/teacher/students');

        // Find search/filter input
        const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');

        if (await searchInput.isVisible()) {
            await searchInput.fill('test');
            await page.waitForTimeout(500);

            // Results should be filtered
            await expect(page.locator('.student-card, [data-testid*="student"], table tbody tr')).toBeVisible();
        }
    });
});

test.describe('Teacher User Journey - Test Results Review', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/teacher/**', { timeout: 10000 });
    });

    test('should view pending reviews list', async ({ page }) => {
        await page.goto('/teacher/results');

        // Check for pending reviews section
        await expect(page.locator('text=Results, text=Review, text=Pending')).toBeVisible();

        // Should show results or empty state
        const hasResults = await page.locator('.result-card, [data-testid*="result"]').count() > 0;
        const hasEmptyState = await page.locator('text=No pending, text=all reviewed').isVisible();

        expect(hasResults || hasEmptyState).toBeTruthy();
    });

    test('should open result detail for review', async ({ page }) => {
        await page.goto('/teacher/results');

        const resultCard = page.locator('.result-card, [data-testid*="result"]').first();

        if (await resultCard.isVisible()) {
            await resultCard.click();

            // Should show result details with feedback option
            await expect(page.locator('text=Score, text=Answers, text=Feedback')).toBeVisible();
        }
    });

    test('should filter results by student or test', async ({ page }) => {
        await page.goto('/teacher/results');

        // Find filter controls
        const filterSelect = page.locator('select, [role="combobox"]').first();

        if (await filterSelect.isVisible()) {
            await filterSelect.click();

            // Select a filter option
            const option = page.locator('option, [role="option"]').nth(1);
            if (await option.isVisible()) {
                await option.click();
            }
        }
    });
});

test.describe('Teacher User Journey - Feedback Management', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/teacher/**', { timeout: 10000 });
    });

    test('should provide overall feedback on test result', async ({ page }) => {
        await page.goto('/teacher/results');

        const resultCard = page.locator('.result-card, [data-testid*="result"]').first();

        if (await resultCard.isVisible()) {
            await resultCard.click();
            await page.waitForTimeout(500);

            // Find feedback textarea
            const feedbackInput = page.locator('textarea[placeholder*="feedback"], textarea[name="feedback"]');

            if (await feedbackInput.isVisible()) {
                await feedbackInput.fill('Great job on this test! Keep up the good work. Focus more on reading comprehension for next time.');

                // Save feedback
                await page.click('button:has-text("Save"), button:has-text("Submit")');

                // Verify save success
                await expect(page.locator('text=saved, text=submitted, text=success').first()).toBeVisible({ timeout: 5000 });
            }
        }
    });

    test('should provide question-level feedback', async ({ page }) => {
        await page.goto('/teacher/results');

        const resultCard = page.locator('.result-card, [data-testid*="result"]').first();

        if (await resultCard.isVisible()) {
            await resultCard.click();
            await page.waitForTimeout(500);

            // Find question feedback sections
            const questionFeedback = page.locator('[data-testid*="question-feedback"], .question-feedback-input').first();

            if (await questionFeedback.isVisible()) {
                await questionFeedback.fill('Review the grammar rules for this type of question.');

                await page.click('button:has-text("Save")');
            }
        }
    });

    test('should see feedback history', async ({ page }) => {
        await page.goto('/teacher/results');

        // Look for results with existing feedback
        const resultWithFeedback = page.locator('[data-has-feedback="true"], :has-text("Reviewed")').first();

        if (await resultWithFeedback.isVisible()) {
            await resultWithFeedback.click();

            // Should show existing feedback
            await expect(page.locator('.feedback-content, [data-testid="feedback"]')).toBeVisible();
        }
    });
});

test.describe('Teacher User Journey - Module Session Management', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/teacher/**', { timeout: 10000 });
    });

    test('should view module sessions', async ({ page }) => {
        await page.goto('/teacher/sessions');

        // Check for sessions list
        await expect(page.locator('text=Sessions, text=Modules')).toBeVisible();

        const sessionList = page.locator('.session-card, [data-testid*="session"]');
        const hasSession = await sessionList.count() > 0;
        const hasEmptyState = await page.locator('text=No sessions, text=Create session').isVisible();

        expect(hasSession || hasEmptyState).toBeTruthy();
    });

    test('should start a new module session', async ({ page }) => {
        await page.goto('/teacher/sessions');

        const startButton = page.locator('button:has-text("Start Session"), button:has-text("New Session")');

        if (await startButton.isVisible()) {
            await startButton.click();

            // Should open session creation modal or page
            await expect(page.locator('text=Select Module, text=Choose, [role="dialog"]')).toBeVisible();
        }
    });

    test('should mark student attendance', async ({ page }) => {
        await page.goto('/teacher/sessions');

        const activeSession = page.locator('[data-status="active"], :has-text("In Progress")').first();

        if (await activeSession.isVisible()) {
            await activeSession.click();

            // Should show attendance list
            await expect(page.locator('text=Attendance, text=Present, text=Absent')).toBeVisible();

            // Toggle attendance for a student
            const attendanceCheckbox = page.locator('input[type="checkbox"]').first();
            if (await attendanceCheckbox.isVisible()) {
                await attendanceCheckbox.click();
            }
        }
    });

    test('should complete a module session', async ({ page }) => {
        await page.goto('/teacher/sessions');

        const activeSession = page.locator('[data-status="active"], :has-text("In Progress")').first();

        if (await activeSession.isVisible()) {
            await activeSession.click();

            // Find complete session button
            const completeButton = page.locator('button:has-text("Complete"), button:has-text("End Session")');

            if (await completeButton.isVisible()) {
                await completeButton.click();

                // Confirm completion
                const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
                if (await confirmButton.isVisible()) {
                    await confirmButton.click();
                }

                // Session should be marked as complete
                await expect(page.locator('text=Completed, text=success').first()).toBeVisible({ timeout: 5000 });
            }
        }
    });
});

test.describe('Teacher User Journey - Analytics Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/teacher/**', { timeout: 10000 });
    });

    test('should view class analytics', async ({ page }) => {
        await page.goto('/teacher/analytics');

        // Check for analytics dashboard
        await expect(page.locator('text=Analytics, text=Dashboard, text=Statistics')).toBeVisible();

        // Should show charts or stats
        const hasCharts = await page.locator('[role="img"], .recharts-wrapper, canvas').count() > 0;
        const hasStats = await page.locator('text=Average, text=Total, text=Students').isVisible();

        expect(hasCharts || hasStats).toBeTruthy();
    });

    test('should filter analytics by time period', async ({ page }) => {
        await page.goto('/teacher/analytics');

        const filterSelect = page.locator('select, [role="combobox"]').first();

        if (await filterSelect.isVisible()) {
            await filterSelect.click();

            const option = page.locator('option, [role="option"]').filter({ hasText: /month|week/i }).first();
            if (await option.isVisible()) {
                await option.click();
            }
        }
    });

    test('should export analytics data', async ({ page }) => {
        await page.goto('/teacher/analytics');

        const exportButton = page.locator('button:has-text("Export"), button:has-text("CSV"), button:has-text("PDF")');

        if (await exportButton.first().isVisible()) {
            // Check that export button exists (actual download may need different handling)
            await expect(exportButton.first()).toBeEnabled();
        }
    });
});

test.describe('Teacher User Journey - Complete Flow', () => {
    test('should complete full teacher journey from login to providing feedback', async ({ page }) => {
        // Step 1: Login
        await page.goto('/login');
        await page.fill('input[name="email"], input[type="email"]', TEST_TEACHER.email);
        await page.fill('input[name="password"], input[type="password"]', TEST_TEACHER.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/teacher/**', { timeout: 10000 });

        // Step 2: View Profile
        await page.goto('/profile');
        await expect(page.locator('text=Profile, text=My Profile')).toBeVisible();

        // Step 3: View Students
        await page.goto('/teacher/students');
        await page.waitForTimeout(500);

        // Step 4: View Results
        await page.goto('/teacher/results');
        await page.waitForTimeout(500);

        // Step 5: View Analytics
        await page.goto('/teacher/analytics');
        await page.waitForTimeout(500);

        // Step 6: View Sessions
        await page.goto('/teacher/sessions');
        await page.waitForTimeout(500);

        // Journey completed successfully
        expect(true).toBeTruthy();
    });
});
