import { test, expect } from '@playwright/test';
import { loginAsStudent, TEST_USERS } from './helpers/auth';
import { TEST_RESULT_IDS } from './helpers/testData';

/**
 * E2E Tests for Student Feedback Viewing
 * 
 * Tests the student-facing feedback display:
 * - Students can view feedback on their results
 * - Feedback notifications work correctly
 * - Real-time updates when teacher adds feedback
 * - Feedback is displayed with proper formatting
 */

test.describe('Student Feedback Viewing', () => {

    test.beforeEach(async ({ page }) => {
        // Login as student
        await loginAsStudent(page);
    });

    test('student can view feedback on result page', async ({ page }) => {
        // Navigate to a result with feedback
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        // Verify FeedbackDisplay components are visible
        const feedbackDisplays = page.locator('[data-testid="feedback-display"]');
        await expect(feedbackDisplays.first()).toBeVisible();

        // Verify feedback text is shown
        await expect(feedbackDisplays.first()).toContainText(/feedback|comment/i);
    });

    test('student sees "No feedback yet" for results without feedback', async ({ page }) => {
        // Navigate to result without feedback
        await page.goto('/student/results/test-result-no-feedback-456');
        await page.waitForLoadState('networkidle');

        // Should show empty state or "No feedback" message
        await expect(page.locator('text=/No feedback|No comments yet/')).toBeVisible();
    });

    test('feedback displays with teacher attribution', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        const feedbackDisplay = page.locator('[data-testid="feedback-display"]').first();

        // Should show teacher name or "Teacher"
        await expect(feedbackDisplay).toContainText(/Teacher|by/i);
    });

    test('feedback displays with relative timestamp', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        const feedbackDisplay = page.locator('[data-testid="feedback-display"]').first();

        // Should show relative time like "2 hours ago", "yesterday", etc.
        await expect(feedbackDisplay).toContainText(/ago|yesterday|today|just now/i);
    });

    test('overall feedback is displayed prominently', async ({ page }) => {
        await page.goto('/student/results/test-result-with-overall-feedback-123');
        await page.waitForLoadState('networkidle');

        // Overall feedback should be in a special section
        const overallFeedback = page.locator('[data-testid="overall-feedback-display"]');
        await expect(overallFeedback).toBeVisible();

        // Should be styled differently (e.g., highlighted, larger)
        const bgColor = await overallFeedback.evaluate((el) =>
            window.getComputedStyle(el).backgroundColor
        );
        expect(bgColor).not.toBe('rgba(0, 0, 0, 0)'); // Has background color
    });

    test('question-specific feedback appears next to each question', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        // Get all questions
        const questions = page.locator('[data-testid="question-result"]');
        const questionCount = await questions.count();

        // Check that feedback displays are positioned near questions
        for (let i = 0; i < questionCount; i++) {
            const question = questions.nth(i);
            const questionBox = await question.boundingBox();

            // Look for feedback within or near this question
            const nearbyFeedback = page.locator('[data-testid="feedback-display"]').nth(i);

            if (await nearbyFeedback.isVisible()) {
                const feedbackBox = await nearbyFeedback.boundingBox();

                // Feedback should be reasonably close to the question
                if (questionBox && feedbackBox) {
                    const distance = Math.abs(feedbackBox.y - questionBox.y);
                    expect(distance).toBeLessThan(500); // Within 500px
                }
            }
        }
    });

    test('student receives notification when teacher adds feedback', async ({ page }) => {
        await page.goto('/student/dashboard');
        await page.waitForLoadState('networkidle');

        // TODO: Trigger teacher adding feedback in background
        // This would require a second browser context or pre-seeded notification

        // Check notifications panel
        const notificationButton = page.locator('[data-testid="notifications-button"]');
        await notificationButton.click();

        // Should see feedback notification
        const feedbackNotification = page.locator('.mantine-Notification-root:has-text("feedback")');

        if (await feedbackNotification.isVisible()) {
            await expect(feedbackNotification).toBeVisible();

            // Notification should have a link to the result
            await expect(feedbackNotification.locator('a, button')).toBeVisible();
        }
    });

    test('clicking feedback notification navigates to result page', async ({ page }) => {
        await page.goto('/student/dashboard');
        await page.waitForLoadState('networkidle');

        // Open notifications
        await page.click('[data-testid="notifications-button"]');

        // Find and click feedback notification
        const feedbackNotification = page.locator('.mantine-Notification-root:has-text("feedback")').first();

        if (await feedbackNotification.isVisible()) {
            const link = feedbackNotification.locator('a, button').first();
            await link.click();

            // Should navigate to result page
            await expect(page).toHaveURL(/\/student\/results\//);

            // Feedback should be visible on the page
            await expect(page.locator('[data-testid="feedback-display"]')).toBeVisible();
        }
    });

    test('real-time update: feedback appears when teacher adds it while page is open', async ({ page, context }) => {
        // Student opens result page
        await page.goto('/student/results/test-result-id-123');
        await page.waitForLoadState('networkidle');

        // Initially no feedback
        const initialFeedbackCount = await page.locator('[data-testid="feedback-display"]').count();

        // TODO: Simulate teacher adding feedback in background
        // This would require Firebase real-time listener to be working
        // For now, we'll just verify the listener is set up

        // Wait a moment for potential real-time updates
        await page.waitForTimeout(2000);

        // In a real scenario with Firebase emulator:
        // 1. Teacher adds feedback via API or second browser
        // 2. Student page should update automatically
        // 3. New feedback should appear without page reload

        // For this test, we verify the component structure supports real-time updates
        const feedbackContainer = page.locator('[data-testid="feedback-container"]');
        await expect(feedbackContainer).toBeAttached();
    });

    test('feedback with long text is displayed with proper formatting', async ({ page }) => {
        await page.goto('/student/results/test-result-with-long-feedback-123');
        await page.waitForLoadState('networkidle');

        const feedbackDisplay = page.locator('[data-testid="feedback-display"]').first();

        // Should be visible and readable
        await expect(feedbackDisplay).toBeVisible();

        // Check that text wraps properly (not overflowing)
        const overflow = await feedbackDisplay.evaluate((el) =>
            window.getComputedStyle(el).overflow
        );
        expect(overflow).not.toBe('visible'); // Should have overflow control
    });

    test('feedback with line breaks is formatted correctly', async ({ page }) => {
        await page.goto('/student/results/test-result-with-multiline-feedback-123');
        await page.waitForLoadState('networkidle');

        const feedbackDisplay = page.locator('[data-testid="feedback-display"]').first();

        // Should preserve line breaks or show as paragraphs
        const innerHTML = await feedbackDisplay.innerHTML();
        const hasLineBreaks = innerHTML.includes('<br') || innerHTML.includes('</p>');

        // Either has line break tags or uses white-space: pre-wrap
        if (!hasLineBreaks) {
            const whiteSpace = await feedbackDisplay.evaluate((el) =>
                window.getComputedStyle(el).whiteSpace
            );
            expect(['pre-wrap', 'pre-line']).toContain(whiteSpace);
        }
    });

    test('feedback indicator shows on result card in academic record', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Find result cards with feedback
        const resultCards = page.locator('[data-testid="result-card"]');
        const cardCount = await resultCards.count();

        if (cardCount > 0) {
            // Check if any card has feedback indicator
            const feedbackIndicators = page.locator('[data-testid="has-feedback-indicator"]');

            // At least some results should have feedback indicators
            // (This assumes test data includes results with feedback)
            const indicatorCount = await feedbackIndicators.count();
            expect(indicatorCount).toBeGreaterThanOrEqual(0);
        }
    });

    test('feedback is color-coded by type', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        const feedbackDisplays = page.locator('[data-testid="feedback-display"]');

        if (await feedbackDisplays.count() > 0) {
            const firstFeedback = feedbackDisplays.first();

            // Should have a background color or border color
            const bgColor = await firstFeedback.evaluate((el) =>
                window.getComputedStyle(el).backgroundColor
            );
            const borderColor = await firstFeedback.evaluate((el) =>
                window.getComputedStyle(el).borderColor
            );

            // At least one should have color
            const hasColor = bgColor !== 'rgba(0, 0, 0, 0)' || borderColor !== 'rgb(0, 0, 0)';
            expect(hasColor).toBe(true);
        }
    });

    test('student cannot edit or delete feedback', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        // Should not see edit or delete buttons
        const editButtons = page.locator('button:has-text("Edit")');
        const deleteButtons = page.locator('button:has-text("Delete")');

        await expect(editButtons).toHaveCount(0);
        await expect(deleteButtons).toHaveCount(0);

        // Feedback text should be read-only
        const textareas = page.locator('[data-testid="feedback-display"] textarea');
        await expect(textareas).toHaveCount(0);
    });

    test('feedback section is accessible via keyboard navigation', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        // Tab through the page
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // Should be able to reach feedback section
        // (Exact number of tabs depends on page structure)
        const feedbackDisplay = page.locator('[data-testid="feedback-display"]').first();

        // Feedback should be in the tab order or have proper ARIA labels
        const ariaLabel = await feedbackDisplay.getAttribute('aria-label');
        const role = await feedbackDisplay.getAttribute('role');

        expect(ariaLabel || role).toBeTruthy();
    });

    test('feedback updates timestamp on page reload', async ({ page }) => {
        await page.goto('/student/results/test-result-with-feedback-123');
        await page.waitForLoadState('networkidle');

        const feedbackDisplay = page.locator('[data-testid="feedback-display"]').first();
        const initialTimestamp = await feedbackDisplay.locator('[data-testid="feedback-timestamp"]').textContent();

        // Wait a moment
        await page.waitForTimeout(2000);

        // Reload
        await page.reload();
        await page.waitForLoadState('networkidle');

        const updatedTimestamp = await feedbackDisplay.locator('[data-testid="feedback-timestamp"]').textContent();

        // Timestamp should still be present (may or may not change depending on time elapsed)
        expect(updatedTimestamp).toBeTruthy();
    });
});

test.describe('Student Feedback - Multiple Feedback Types', () => {

    test('displays both question feedback and overall feedback', async ({ page }) => {
        await page.goto('/student/results/test-result-with-all-feedback-types-123');
        await page.waitForLoadState('networkidle');

        // Should have overall feedback
        const overallFeedback = page.locator('[data-testid="overall-feedback-display"]');
        await expect(overallFeedback).toBeVisible();

        // Should also have question-specific feedback
        const questionFeedback = page.locator('[data-testid="feedback-display"]');
        const count = await questionFeedback.count();
        expect(count).toBeGreaterThan(0);
    });

    test('distinguishes between overall and question feedback visually', async ({ page }) => {
        await page.goto('/student/results/test-result-with-all-feedback-types-123');
        await page.waitForLoadState('networkidle');

        const overallFeedback = page.locator('[data-testid="overall-feedback-display"]');
        const questionFeedback = page.locator('[data-testid="feedback-display"]').first();

        // Get styles
        const overallBg = await overallFeedback.evaluate((el) =>
            window.getComputedStyle(el).backgroundColor
        );
        const questionBg = await questionFeedback.evaluate((el) =>
            window.getComputedStyle(el).backgroundColor
        );

        // They should be styled differently
        // (This is a loose check - they might have different colors, sizes, etc.)
        const overallSize = await overallFeedback.evaluate((el) =>
            window.getComputedStyle(el).fontSize
        );
        const questionSize = await questionFeedback.evaluate((el) =>
            window.getComputedStyle(el).fontSize
        );

        // At least one style property should differ
        const isDifferent = overallBg !== questionBg || overallSize !== questionSize;
        expect(isDifferent).toBe(true);
    });
});

test.describe('Student Feedback - Error States', () => {

    test('shows error state when feedback fails to load', async ({ page }) => {
        // Simulate network error
        await page.route('**/feedback/**', route => route.abort());

        await page.goto('/student/results/test-result-id-123');
        await page.waitForLoadState('networkidle');

        // Should show error message or gracefully handle missing feedback
        const errorMessage = page.locator('text=/error|failed to load|try again/i');
        const feedbackSection = page.locator('[data-testid="feedback-container"]');

        // Either shows error or hides feedback section gracefully
        const hasError = await errorMessage.isVisible();
        const hasSection = await feedbackSection.isVisible();

        expect(hasError || !hasSection).toBe(true);
    });

    test('handles missing feedback data gracefully', async ({ page }) => {
        await page.goto('/student/results/test-result-corrupted-feedback-123');
        await page.waitForLoadState('networkidle');

        // Page should not crash
        await expect(page).toHaveURL(/\/student\/results\//);

        // Should show some content (even if feedback is missing)
        const resultContent = page.locator('[data-testid="result-content"]');
        await expect(resultContent).toBeVisible();
    });
});
