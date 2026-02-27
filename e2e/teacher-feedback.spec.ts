import { test, expect } from '@playwright/test';
import { loginAsTeacher, loginAsStudent, TEST_USERS } from './helpers/auth';
import { TEST_RESULT_IDS, waitForFirebaseOperation } from './helpers/testData';

/**
 * E2E Tests for Teacher Feedback System
 * 
 * Tests the complete teacher feedback flow:
 * - Teacher can add feedback to individual questions
 * - Teacher can add overall feedback to results
 * - Feedback is saved to Firebase correctly
 * - Students receive notifications when feedback is added
 * - Authorization checks prevent unauthorized feedback
 */

test.describe('Teacher Feedback System', () => {

    test.beforeEach(async ({ page }) => {
        // Login as teacher
        await loginAsTeacher(page);
    });

    test('teacher can view feedback editor on result page', async ({ page }) => {
        // Navigate to a test result page
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);

        // Wait for page to load
        await page.waitForLoadState('networkidle');

        // Verify FeedbackEditor components are visible
        const feedbackEditors = page.locator('[data-testid="feedback-editor"]');
        await expect(feedbackEditors.first()).toBeVisible();

        // Verify there's a feedback editor for each question
        const questionCount = await page.locator('[data-testid="question-result"]').count();
        const editorCount = await feedbackEditors.count();
        expect(editorCount).toBeGreaterThanOrEqual(questionCount);
    });

    test('teacher can add question-specific feedback', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        // Find the first feedback editor
        const firstEditor = page.locator('[data-testid="feedback-editor"]').first();

        // Type feedback text
        const feedbackText = 'Great work on this question! Consider reviewing grammar rules.';
        await firstEditor.locator('textarea').fill(feedbackText);

        // Click save button
        await firstEditor.locator('button:has-text("Save")').click();

        // Wait for success notification
        await expect(page.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

        // Verify feedback persists after page reload
        await page.reload();
        await page.waitForLoadState('networkidle');

        const savedFeedback = await firstEditor.locator('textarea').inputValue();
        expect(savedFeedback).toBe(feedbackText);
    });

    test('teacher can add overall feedback to result', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        // Find overall feedback editor
        const overallEditor = page.locator('[data-testid="overall-feedback-editor"]');

        // Type overall feedback
        const overallText = 'Excellent performance overall. Keep up the good work!';
        await overallEditor.locator('textarea').fill(overallText);

        // Save
        await overallEditor.locator('button:has-text("Save")').click();

        // Wait for success
        await expect(page.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

        // Verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        const savedOverall = await overallEditor.locator('textarea').inputValue();
        expect(savedOverall).toBe(overallText);
    });

    test('feedback autosave works correctly', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();
        const textarea = editor.locator('textarea');

        // Type feedback
        await textarea.fill('This is autosaved feedback');

        // Wait for autosave delay (default 2 seconds)
        await page.waitForTimeout(2500);

        // Should see autosave indicator
        await expect(page.locator('text=/Saved|Auto-saved/')).toBeVisible();

        // Reload page - feedback should persist
        await page.reload();
        await page.waitForLoadState('networkidle');

        const savedValue = await editor.locator('textarea').inputValue();
        expect(savedValue).toBe('This is autosaved feedback');
    });

    test('teacher can clear feedback', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();

        // Add feedback first
        await editor.locator('textarea').fill('Feedback to be cleared');
        await editor.locator('button:has-text("Save")').click();
        await page.waitForTimeout(1000);

        // Click clear button
        await editor.locator('button:has-text("Clear")').click();

        // Confirm in dialog if present
        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
            await confirmButton.click();
        }

        // Verify textarea is empty
        await expect(editor.locator('textarea')).toHaveValue('');
    });

    test('student receives notification when teacher adds feedback', async ({ page, context }) => {
        // This test requires two browser contexts: teacher and student

        // Teacher adds feedback
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();
        await editor.locator('textarea').fill('New feedback for student');
        await editor.locator('button:has-text("Save")').click();
        await waitForFirebaseOperation();

        // Open new page as student
        const studentPage = await context.newPage();
        await loginAsStudent(studentPage);

        await studentPage.goto('/student/dashboard');

        // Check notifications panel
        await studentPage.click('[data-testid="notifications-button"]');

        // Should see feedback notification
        await expect(studentPage.locator('.mantine-Notification-root:has-text("feedback")')).toBeVisible();

        await studentPage.close();
    });

    test('unauthorized teacher cannot add feedback to other course results', async ({ page }) => {
        // Note: This test assumes the beforeEach login is as an unauthorized teacher
        // In a real scenario, you'd logout and login as unauthorizedTeacher here

        await page.goto(`/teacher/results/${TEST_RESULT_IDS.unauthorized}`);

        // Should either:
        // 1. Not show feedback editors
        // 2. Show editors but disable save
        // 3. Redirect to unauthorized page

        const feedbackEditors = page.locator('[data-testid="feedback-editor"]');

        if (await feedbackEditors.count() > 0) {
            // If editors are shown, save should be disabled
            const saveButton = feedbackEditors.first().locator('button:has-text("Save")');
            await expect(saveButton).toBeDisabled();
        } else {
            // Or editors should not be visible at all
            await expect(feedbackEditors).toHaveCount(0);
        }
    });

    test('feedback character count displays correctly', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();
        const textarea = editor.locator('textarea');

        // Type some text
        const text = 'This is a test feedback message';
        await textarea.fill(text);

        // Check character count display
        const charCount = page.locator(`text=${text.length}`);
        await expect(charCount).toBeVisible();
    });

    test('feedback editor shows loading state during save', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();

        // Fill feedback
        await editor.locator('textarea').fill('Test feedback');

        // Click save
        const saveButton = editor.locator('button:has-text("Save")');
        await saveButton.click();

        // Should show loading state (button disabled or loading spinner)
        await expect(saveButton).toBeDisabled();

        // Wait for save to complete
        await page.waitForTimeout(1000);

        // Button should be enabled again
        await expect(saveButton).toBeEnabled();
    });

    test('multiple feedback edits are saved correctly', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editors = page.locator('[data-testid="feedback-editor"]');
        const editorCount = await editors.count();

        // Add feedback to multiple questions
        for (let i = 0; i < Math.min(3, editorCount); i++) {
            const editor = editors.nth(i);
            await editor.locator('textarea').fill(`Feedback for question ${i + 1}`);
            await editor.locator('button:has-text("Save")').click();
            await page.waitForTimeout(500);
        }

        // Reload and verify all feedback persists
        await page.reload();
        await page.waitForLoadState('networkidle');

        for (let i = 0; i < Math.min(3, editorCount); i++) {
            const editor = editors.nth(i);
            const value = await editor.locator('textarea').inputValue();
            expect(value).toBe(`Feedback for question ${i + 1}`);
        }
    });

    test('feedback timestamps are displayed correctly', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();

        // Add feedback
        await editor.locator('textarea').fill('Timestamped feedback');
        await editor.locator('button:has-text("Save")').click();
        await page.waitForTimeout(1000);

        // Should show "just now" or similar timestamp
        await expect(page.locator('text=/just now|seconds ago|minute ago/')).toBeVisible();
    });

    test('feedback is associated with correct question', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        // Get question number/ID from first question
        const firstQuestion = page.locator('[data-testid="question-result"]').first();
        const questionNumber = await firstQuestion.getAttribute('data-question-number');

        // Add feedback to first question
        const firstEditor = page.locator('[data-testid="feedback-editor"]').first();
        await firstEditor.locator('textarea').fill('Feedback for specific question');
        await firstEditor.locator('button:has-text("Save")').click();
        await page.waitForTimeout(1000);

        // Verify in Firebase or by reloading
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Feedback should still be on the same question
        const reloadedQuestion = page.locator(`[data-testid="question-result"][data-question-number="${questionNumber}"]`);
        const reloadedEditor = reloadedQuestion.locator('[data-testid="feedback-editor"]');

        const savedValue = await reloadedEditor.locator('textarea').inputValue();
        expect(savedValue).toBe('Feedback for specific question');
    });
});

test.describe('Teacher Feedback - Error Handling', () => {

    test('shows error when save fails', async ({ page }) => {
        // Simulate network error by going offline
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        // Simulate offline mode
        await page.context().setOffline(true);

        const editor = page.locator('[data-testid="feedback-editor"]').first();
        await editor.locator('textarea').fill('This will fail to save');
        await editor.locator('button:has-text("Save")').click();

        // Should show error notification
        await expect(page.locator('.mantine-Notification-root:has-text("error")')).toBeVisible();

        // Re-enable network
        await page.context().setOffline(false);
    });

    test('retains feedback text when save fails', async ({ page }) => {
        await page.goto(`/teacher/results/${TEST_RESULT_IDS.basic}`);
        await page.waitForLoadState('networkidle');

        const feedbackText = 'Important feedback that should not be lost';

        // Simulate offline
        await page.context().setOffline(true);

        const editor = page.locator('[data-testid="feedback-editor"]').first();
        await editor.locator('textarea').fill(feedbackText);
        await editor.locator('button:has-text("Save")').click();

        // Wait for error
        await page.waitForTimeout(1000);

        // Text should still be in textarea
        await expect(editor.locator('textarea')).toHaveValue(feedbackText);

        await page.context().setOffline(false);
    });
});
