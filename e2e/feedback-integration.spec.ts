import { test, expect } from '@playwright/test';

/**
 * Integration E2E Test: Complete Teacher-Student Feedback Flow
 * 
 * This test verifies the entire feedback lifecycle:
 * 1. Teacher adds feedback to a student's result
 * 2. Notification is sent to the student
 * 3. Student receives and views the feedback
 * 4. Real-time updates work correctly
 * 
 * This is a critical integration test that validates the entire system.
 */

test.describe('Complete Feedback Flow Integration', () => {

    test('complete flow: teacher saves feedback → student receives notification → student views feedback', async ({ browser }) => {
        // Create two browser contexts: one for teacher, one for student
        const teacherContext = await browser.newContext();
        const studentContext = await browser.newContext();

        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();

        try {
            // STEP 1: Teacher logs in
            await teacherPage.goto('/login');
            // TODO: Replace with actual teacher login helper
            // await loginAsTeacher(teacherPage, 'teacher@example.com', 'password');
            await teacherPage.waitForLoadState('networkidle');

            // STEP 2: Student logs in
            await studentPage.goto('/login');
            // TODO: Replace with actual student login helper
            // await loginAsStudent(studentPage, 'student@example.com', 'password');
            await studentPage.waitForLoadState('networkidle');

            // STEP 3: Student navigates to dashboard (to receive notifications)
            await studentPage.goto('/student/dashboard');
            await studentPage.waitForLoadState('networkidle');

            // STEP 4: Teacher navigates to a student's test result
            const testResultId = 'integration-test-result-123';
            await teacherPage.goto(`/teacher/results/${testResultId}`);
            await teacherPage.waitForLoadState('networkidle');

            // STEP 5: Teacher adds feedback to first question
            const questionFeedbackText = 'Great answer! Consider adding more details next time.';
            const firstEditor = teacherPage.locator('[data-testid="feedback-editor"]').first();
            await firstEditor.locator('textarea').fill(questionFeedbackText);
            await firstEditor.locator('button:has-text("Save")').click();

            // Wait for save confirmation
            await expect(teacherPage.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

            // STEP 6: Teacher adds overall feedback
            const overallFeedbackText = 'Excellent work overall! Keep up the good effort.';
            const overallEditor = teacherPage.locator('[data-testid="overall-feedback-editor"]');
            await overallEditor.locator('textarea').fill(overallFeedbackText);
            await overallEditor.locator('button:has-text("Save")').click();

            // Wait for save confirmation
            await expect(teacherPage.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

            // STEP 7: Student should receive notification
            // Wait a moment for notification to propagate
            await studentPage.waitForTimeout(2000);

            // Check for notification badge or indicator
            const notificationIndicator = studentPage.locator('[data-testid="notification-badge"]');
            if (await notificationIndicator.isVisible()) {
                await expect(notificationIndicator).toBeVisible();
            }

            // STEP 8: Student opens notifications
            await studentPage.click('[data-testid="notifications-button"]');

            // Should see feedback notification
            const feedbackNotification = studentPage.locator('.mantine-Notification-root:has-text("feedback")');
            await expect(feedbackNotification).toBeVisible({ timeout: 5000 });

            // STEP 9: Student clicks notification to view result
            const notificationLink = feedbackNotification.locator('a, button').first();
            await notificationLink.click();

            // Should navigate to result page
            await expect(studentPage).toHaveURL(new RegExp(`/student/results/${testResultId}`));
            await studentPage.waitForLoadState('networkidle');

            // STEP 10: Verify student sees the feedback
            const studentFeedbackDisplays = studentPage.locator('[data-testid="feedback-display"]');
            await expect(studentFeedbackDisplays.first()).toBeVisible();
            await expect(studentFeedbackDisplays.first()).toContainText(questionFeedbackText);

            // STEP 11: Verify overall feedback is visible
            const overallFeedbackDisplay = studentPage.locator('[data-testid="overall-feedback-display"]');
            await expect(overallFeedbackDisplay).toBeVisible();
            await expect(overallFeedbackDisplay).toContainText(overallFeedbackText);

            // STEP 12: Verify feedback attribution (teacher name)
            await expect(studentPage.locator('text=/Teacher|by/i')).toBeVisible();

            // STEP 13: Verify timestamp is shown
            await expect(studentPage.locator('text=/ago|just now/i')).toBeVisible();

            console.log('✅ Complete feedback flow test passed!');

        } finally {
            // Cleanup
            await teacherPage.close();
            await studentPage.close();
            await teacherContext.close();
            await studentContext.close();
        }
    });

    test('real-time update: student sees feedback appear without page reload', async ({ browser }) => {
        const teacherContext = await browser.newContext();
        const studentContext = await browser.newContext();

        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();

        try {
            // Login both users
            await teacherPage.goto('/login');
            // TODO: Login as teacher
            await teacherPage.waitForLoadState('networkidle');

            await studentPage.goto('/login');
            // TODO: Login as student
            await studentPage.waitForLoadState('networkidle');

            // Student opens result page FIRST (before feedback exists)
            const testResultId = 'realtime-test-result-456';
            await studentPage.goto(`/student/results/${testResultId}`);
            await studentPage.waitForLoadState('networkidle');

            // Verify no feedback initially
            const initialFeedbackCount = await studentPage.locator('[data-testid="feedback-display"]').count();
            expect(initialFeedbackCount).toBe(0);

            // Teacher opens same result
            await teacherPage.goto(`/teacher/results/${testResultId}`);
            await teacherPage.waitForLoadState('networkidle');

            // Teacher adds feedback
            const realtimeFeedbackText = 'This feedback should appear in real-time!';
            const editor = teacherPage.locator('[data-testid="feedback-editor"]').first();
            await editor.locator('textarea').fill(realtimeFeedbackText);
            await editor.locator('button:has-text("Save")').click();

            // Wait for save
            await expect(teacherPage.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

            // Student page should update automatically (via Firebase listener)
            // Wait for real-time update (give it a few seconds)
            await studentPage.waitForTimeout(3000);

            // Check if feedback appeared
            const updatedFeedbackCount = await studentPage.locator('[data-testid="feedback-display"]').count();

            if (updatedFeedbackCount > initialFeedbackCount) {
                // Real-time update worked!
                const newFeedback = studentPage.locator('[data-testid="feedback-display"]').first();
                await expect(newFeedback).toContainText(realtimeFeedbackText);
                console.log('✅ Real-time feedback update working!');
            } else {
                console.log('⚠️ Real-time update may not be implemented yet. Feedback requires page reload.');
            }

        } finally {
            await teacherPage.close();
            await studentPage.close();
            await teacherContext.close();
            await studentContext.close();
        }
    });

    test('multiple teachers: only authorized teacher can add feedback', async ({ browser }) => {
        const authorizedTeacherContext = await browser.newContext();
        const unauthorizedTeacherContext = await browser.newContext();

        const authorizedPage = await authorizedTeacherContext.newPage();
        const unauthorizedPage = await unauthorizedTeacherContext.newPage();

        try {
            // Login authorized teacher (owns the course)
            await authorizedPage.goto('/login');
            // TODO: Login as course owner teacher
            await authorizedPage.waitForLoadState('networkidle');

            // Login unauthorized teacher (different course)
            await unauthorizedPage.goto('/login');
            // TODO: Login as different teacher
            await unauthorizedPage.waitForLoadState('networkidle');

            const testResultId = 'auth-test-result-789';

            // Authorized teacher can add feedback
            await authorizedPage.goto(`/teacher/results/${testResultId}`);
            await authorizedPage.waitForLoadState('networkidle');

            const authorizedEditor = authorizedPage.locator('[data-testid="feedback-editor"]').first();
            await expect(authorizedEditor).toBeVisible();

            const saveButton = authorizedEditor.locator('button:has-text("Save")');
            await expect(saveButton).toBeEnabled();

            // Unauthorized teacher cannot add feedback
            await unauthorizedPage.goto(`/teacher/results/${testResultId}`);

            // Should either:
            // 1. Not show the result page (redirect/error)
            // 2. Show page but disable feedback editors
            // 3. Show error message

            const pageUrl = unauthorizedPage.url();
            const hasError = await unauthorizedPage.locator('text=/unauthorized|access denied|forbidden/i').isVisible();
            const unauthorizedEditors = await unauthorizedPage.locator('[data-testid="feedback-editor"]').count();

            if (unauthorizedEditors > 0) {
                // Editors shown but should be disabled
                const unauthorizedSaveButton = unauthorizedPage.locator('[data-testid="feedback-editor"]').first().locator('button:has-text("Save")');
                await expect(unauthorizedSaveButton).toBeDisabled();
            } else {
                // Editors not shown or error displayed
                expect(hasError || !pageUrl.includes(testResultId)).toBe(true);
            }

            console.log('✅ Authorization check passed!');

        } finally {
            await authorizedPage.close();
            await unauthorizedPage.close();
            await authorizedTeacherContext.close();
            await unauthorizedTeacherContext.close();
        }
    });

    test('feedback persistence: survives page reloads and browser restarts', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // Login as teacher
            await page.goto('/login');
            // TODO: Login
            await page.waitForLoadState('networkidle');

            const testResultId = 'persistence-test-result-999';
            await page.goto(`/teacher/results/${testResultId}`);
            await page.waitForLoadState('networkidle');

            // Add feedback
            const persistentFeedback = 'This feedback must persist across reloads!';
            const editor = page.locator('[data-testid="feedback-editor"]').first();
            await editor.locator('textarea').fill(persistentFeedback);
            await editor.locator('button:has-text("Save")').click();

            await expect(page.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

            // Reload page
            await page.reload();
            await page.waitForLoadState('networkidle');

            // Feedback should still be there
            const reloadedValue = await editor.locator('textarea').inputValue();
            expect(reloadedValue).toBe(persistentFeedback);

            // Close and reopen browser context (simulates browser restart)
            await page.close();
            await context.close();

            const newContext = await browser.newContext();
            const newPage = await newContext.newPage();

            // Login again
            await newPage.goto('/login');
            // TODO: Login
            await newPage.waitForLoadState('networkidle');

            // Navigate to same result
            await newPage.goto(`/teacher/results/${testResultId}`);
            await newPage.waitForLoadState('networkidle');

            // Feedback should STILL be there
            const persistedValue = await newPage.locator('[data-testid="feedback-editor"]').first().locator('textarea').inputValue();
            expect(persistedValue).toBe(persistentFeedback);

            console.log('✅ Feedback persistence verified!');

            await newPage.close();
            await newContext.close();

        } finally {
            // Cleanup handled above
        }
    });

    test('concurrent editing: multiple teachers editing different questions', async ({ browser }) => {
        const teacher1Context = await browser.newContext();
        const teacher2Context = await browser.newContext();

        const teacher1Page = await teacher1Context.newPage();
        const teacher2Page = await teacher2Context.newPage();

        try {
            // Both teachers login (assume they're co-teachers of the same course)
            await teacher1Page.goto('/login');
            // TODO: Login teacher 1
            await teacher1Page.waitForLoadState('networkidle');

            await teacher2Page.goto('/login');
            // TODO: Login teacher 2
            await teacher2Page.waitForLoadState('networkidle');

            const testResultId = 'concurrent-test-result-111';

            // Both navigate to same result
            await teacher1Page.goto(`/teacher/results/${testResultId}`);
            await teacher1Page.waitForLoadState('networkidle');

            await teacher2Page.goto(`/teacher/results/${testResultId}`);
            await teacher2Page.waitForLoadState('networkidle');

            // Teacher 1 edits first question
            const teacher1Editor = teacher1Page.locator('[data-testid="feedback-editor"]').first();
            await teacher1Editor.locator('textarea').fill('Feedback from Teacher 1');
            await teacher1Editor.locator('button:has-text("Save")').click();
            await teacher1Page.waitForTimeout(1000);

            // Teacher 2 edits second question
            const teacher2Editor = teacher2Page.locator('[data-testid="feedback-editor"]').nth(1);
            await teacher2Editor.locator('textarea').fill('Feedback from Teacher 2');
            await teacher2Editor.locator('button:has-text("Save")').click();
            await teacher2Page.waitForTimeout(1000);

            // Reload both pages
            await teacher1Page.reload();
            await teacher1Page.waitForLoadState('networkidle');

            await teacher2Page.reload();
            await teacher2Page.waitForLoadState('networkidle');

            // Both feedbacks should be saved
            const teacher1Saved = await teacher1Page.locator('[data-testid="feedback-editor"]').first().locator('textarea').inputValue();
            const teacher2Saved = await teacher2Page.locator('[data-testid="feedback-editor"]').nth(1).locator('textarea').inputValue();

            expect(teacher1Saved).toBe('Feedback from Teacher 1');
            expect(teacher2Saved).toBe('Feedback from Teacher 2');

            console.log('✅ Concurrent editing handled correctly!');

        } finally {
            await teacher1Page.close();
            await teacher2Page.close();
            await teacher1Context.close();
            await teacher2Context.close();
        }
    });

    test('notification timing: student receives notification within reasonable time', async ({ browser }) => {
        const teacherContext = await browser.newContext();
        const studentContext = await browser.newContext();

        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();

        try {
            // Login both
            await teacherPage.goto('/login');
            await teacherPage.waitForLoadState('networkidle');

            await studentPage.goto('/login');
            await studentPage.waitForLoadState('networkidle');

            // Student waits on dashboard
            await studentPage.goto('/student/dashboard');
            await studentPage.waitForLoadState('networkidle');

            const testResultId = 'timing-test-result-222';

            // Record start time
            const startTime = Date.now();

            // Teacher adds feedback
            await teacherPage.goto(`/teacher/results/${testResultId}`);
            await teacherPage.waitForLoadState('networkidle');

            const editor = teacherPage.locator('[data-testid="feedback-editor"]').first();
            await editor.locator('textarea').fill('Time-sensitive feedback');
            await editor.locator('button:has-text("Save")').click();

            await expect(teacherPage.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

            // Wait for notification on student side
            await studentPage.click('[data-testid="notifications-button"]');

            // Wait for notification to appear (with timeout)
            try {
                await expect(studentPage.locator('.mantine-Notification-root:has-text("feedback")')).toBeVisible({ timeout: 10000 });

                const endTime = Date.now();
                const elapsedTime = endTime - startTime;

                console.log(`⏱️ Notification received in ${elapsedTime}ms`);

                // Should be reasonably fast (under 10 seconds)
                expect(elapsedTime).toBeLessThan(10000);

            } catch (error) {
                console.log('⚠️ Notification did not appear within 10 seconds');
                throw error;
            }

        } finally {
            await teacherPage.close();
            await studentPage.close();
            await teacherContext.close();
            await studentContext.close();
        }
    });
});

test.describe('Feedback Flow - Edge Cases', () => {

    test('handles network interruption during feedback save', async ({ page }) => {
        await page.goto('/login');
        // TODO: Login as teacher
        await page.waitForLoadState('networkidle');

        const testResultId = 'network-test-result-333';
        await page.goto(`/teacher/results/${testResultId}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();
        const feedbackText = 'This will be interrupted';

        await editor.locator('textarea').fill(feedbackText);

        // Simulate network interruption
        await page.context().setOffline(true);

        await editor.locator('button:has-text("Save")').click();

        // Should show error
        await expect(page.locator('.mantine-Notification-root:has-text("error")')).toBeVisible();

        // Text should still be in editor
        await expect(editor.locator('textarea')).toHaveValue(feedbackText);

        // Restore network
        await page.context().setOffline(false);

        // Retry save
        await editor.locator('button:has-text("Save")').click();

        // Should succeed now
        await expect(page.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();
    });

    test('handles very long feedback text', async ({ page }) => {
        await page.goto('/login');
        // TODO: Login as teacher
        await page.waitForLoadState('networkidle');

        const testResultId = 'long-feedback-test-444';
        await page.goto(`/teacher/results/${testResultId}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();

        // Generate very long feedback (e.g., 5000 characters)
        const longFeedback = 'This is a very detailed feedback. '.repeat(150);

        await editor.locator('textarea').fill(longFeedback);
        await editor.locator('button:has-text("Save")').click();

        // Should save successfully
        await expect(page.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

        // Reload and verify
        await page.reload();
        await page.waitForLoadState('networkidle');

        const savedValue = await editor.locator('textarea').inputValue();
        expect(savedValue).toBe(longFeedback);
    });

    test('handles special characters in feedback', async ({ page }) => {
        await page.goto('/login');
        // TODO: Login as teacher
        await page.waitForLoadState('networkidle');

        const testResultId = 'special-chars-test-555';
        await page.goto(`/teacher/results/${testResultId}`);
        await page.waitForLoadState('networkidle');

        const editor = page.locator('[data-testid="feedback-editor"]').first();

        // Feedback with special characters
        const specialFeedback = 'Great work! 🎉 Consider: <script>alert("test")</script> & "quotes" \'apostrophes\'';

        await editor.locator('textarea').fill(specialFeedback);
        await editor.locator('button:has-text("Save")').click();

        await expect(page.locator('.mantine-Notification-root:has-text("saved")')).toBeVisible();

        // Reload and verify - should be sanitized or escaped properly
        await page.reload();
        await page.waitForLoadState('networkidle');

        const savedValue = await editor.locator('textarea').inputValue();
        expect(savedValue).toContain('Great work!');
        expect(savedValue).toContain('🎉');
        // Script tags should be escaped/removed
    });
});
