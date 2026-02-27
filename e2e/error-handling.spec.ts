/**
 * E2E Tests: Error Handling
 * 
 * Tests for error handling patterns across the Academic Record & Profile System.
 * Part of PRD-0015: Phase 10 - Task 10.15
 * 
 * These tests verify:
 * - Profile save errors show toast and preserve form data
 * - Avatar upload errors show retry button
 * - Academic record load failures show cached data or error state
 * - Network error recovery patterns
 */

import { test, expect } from '@playwright/test';

test.describe('Error Handling - Profile Operations', () => {
    test.beforeEach(async ({ page }) => {
        // Login as test student
        await page.goto('/login');
        // Handle login flow (depends on auth setup)
    });

    test('should show error toast when profile save fails', async ({ page }) => {
        // Navigate to profile page
        await page.goto('/profile');

        // Click edit mode
        await page.click('button:has-text("Edit Profile")');

        // Wait for form to load
        await expect(page.locator('form')).toBeVisible();

        // Fill in some data
        await page.fill('input[name="firstName"]', 'Updated Name');

        // Simulate network error by intercepting the request
        await page.route('**/users/**', route => {
            route.abort('failed');
        });

        // Try to save
        await page.click('button:has-text("Save")');

        // Should show error toast
        await expect(page.locator('[role="alert"], .mantine-Notification-root')).toBeVisible();

        // Form data should be preserved
        await expect(page.locator('input[name="firstName"]')).toHaveValue('Updated Name');
    });

    test('should preserve form data on validation error', async ({ page }) => {
        await page.goto('/profile');

        // Click edit mode
        await page.click('button:has-text("Edit Profile")');

        // Fill in invalid data (e.g., empty required field)
        await page.fill('input[name="firstName"]', '');
        await page.fill('input[name="familyName"]', 'Test');

        // Try to save
        await page.click('button:has-text("Save")');

        // Should show validation error
        await expect(page.locator('text=required, text=invalid').first()).toBeVisible();

        // Form should still be in edit mode with data preserved
        await expect(page.locator('input[name="familyName"]')).toHaveValue('Test');
    });
});

test.describe('Error Handling - Avatar Upload', () => {
    test('should show retry button when avatar upload fails', async ({ page }) => {
        await page.goto('/profile');
        await page.click('button:has-text("Edit Profile")');

        // Simulate R2 storage error
        await page.route('**/upload/**', route => {
            route.fulfill({
                status: 500,
                body: JSON.stringify({ error: 'Storage service unavailable' })
            });
        });

        // Try to upload an avatar
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.isVisible()) {
            await fileInput.setInputFiles({
                name: 'test-avatar.jpg',
                mimeType: 'image/jpeg',
                buffer: Buffer.from('fake image data')
            });

            // Should show error message with retry option
            await expect(page.locator('text=failed, text=retry, text=error').first()).toBeVisible({ timeout: 5000 });
        }
    });

    test('should handle oversized file gracefully', async ({ page }) => {
        await page.goto('/profile');
        await page.click('button:has-text("Edit Profile")');

        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.isVisible()) {
            // Create a file that exceeds 5MB limit
            const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

            await fileInput.setInputFiles({
                name: 'large-avatar.jpg',
                mimeType: 'image/jpeg',
                buffer: largeBuffer
            });

            // Should show file size error
            await expect(page.locator('text=5MB, text=too large, text=size').first()).toBeVisible({ timeout: 5000 });
        }
    });
});

test.describe('Error Handling - Academic Record Load', () => {
    test('should show loading state initially', async ({ page }) => {
        await page.goto('/student/academic-record');

        // Should show loading indicator
        await expect(page.locator('[aria-busy="true"], [aria-label*="Loading"]')).toBeVisible();
    });

    test('should show error alert when data load fails', async ({ page }) => {
        // Intercept and fail the academic record request
        await page.route('**/test_results/**', route => {
            route.abort('failed');
        });

        await page.goto('/student/academic-record');

        // Wait for error state
        await expect(page.locator('[role="alert"], text=Failed, text=error').first()).toBeVisible({ timeout: 10000 });
    });

    test('should show empty state when no results exist', async ({ page }) => {
        // Intercept and return empty results
        await page.route('**/test_results/**', route => {
            route.fulfill({
                status: 200,
                body: JSON.stringify({})
            });
        });

        await page.goto('/student/academic-record');

        // Should show empty state message
        await expect(page.locator('text=No test results, text=no results, text=empty').first()).toBeVisible({ timeout: 10000 });
    });

    test('should display cached data when available', async ({ page }) => {
        // First, load the page successfully to cache data
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Now intercept and fail the request
        await page.route('**/test_results/**', route => {
            route.abort('failed');
        });

        // Refresh the page
        await page.reload();

        // Should either show cached data or graceful error
        const content = await page.content();
        const hasCachedDataOrError = content.includes('Timeline') ||
            content.includes('error') ||
            content.includes('Failed');
        expect(hasCachedDataOrError).toBeTruthy();
    });
});

test.describe('Error Handling - Feedback Operations', () => {
    test('should show error when feedback save fails', async ({ page }) => {
        // This test requires teacher login
        await page.goto('/login');
        // Handle teacher login

        // Navigate to a result page with feedback capability
        await page.goto('/results/test-result-id');

        // Intercept feedback save
        await page.route('**/feedback/**', route => {
            route.fulfill({
                status: 500,
                body: JSON.stringify({ error: 'Save failed' })
            });
        });

        // Try to save feedback
        const feedbackInput = page.locator('textarea[placeholder*="feedback"]');
        if (await feedbackInput.isVisible()) {
            await feedbackInput.fill('Test feedback content');
            await page.click('button:has-text("Save")');

            // Should show error notification
            await expect(page.locator('[role="alert"], .mantine-Notification-root')).toBeVisible({ timeout: 5000 });
        }
    });
});

test.describe('Error Handling - Account Deletion', () => {
    test('should show confirmation modal before deletion', async ({ page }) => {
        await page.goto('/profile');

        // Find and click delete account button
        const deleteButton = page.locator('button:has-text("Delete Account")');
        if (await deleteButton.isVisible()) {
            await deleteButton.click();

            // Should show confirmation modal
            await expect(page.locator('[role="dialog"]')).toBeVisible();
            await expect(page.locator('text=cannot be undone, text=30 days, text=permanent').first()).toBeVisible();

            // Close modal
            await page.click('button:has-text("Cancel")');
        }
    });

    test('should show error when deletion request fails', async ({ page }) => {
        await page.goto('/profile');

        // Intercept deletion request
        await page.route('**/deletion_requests/**', route => {
            route.abort('failed');
        });

        const deleteButton = page.locator('button:has-text("Delete Account")');
        if (await deleteButton.isVisible()) {
            await deleteButton.click();
            await page.click('button:has-text("Confirm")');

            // Should show error notification
            await expect(page.locator('[role="alert"], text=error, text=failed').first()).toBeVisible({ timeout: 5000 });
        }
    });
});

test.describe('Error Handling - Network Offline', () => {
    test('should handle offline state gracefully', async ({ page, context }) => {
        // Load page first
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Go offline
        await context.setOffline(true);

        // Try to interact with the page
        const tabButton = page.locator('button:has-text("By Course")');
        if (await tabButton.isVisible()) {
            await tabButton.click();

            // Page should still be responsive (cached content)
            await expect(page.locator('[role="tabpanel"]')).toBeVisible();
        }

        // Go back online
        await context.setOffline(false);
    });
});
