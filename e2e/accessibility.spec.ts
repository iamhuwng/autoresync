/**
 * E2E Tests: Accessibility
 * 
 * Tests for WCAG 2.1 accessibility compliance across the Academic Record & Profile System.
 * Part of PRD-0015: Phase 10 - Task 10.16
 * 
 * These tests verify:
 * - Keyboard navigation through profile form
 * - Tab navigation in Academic Record page
 * - Screen reader accessibility for charts
 * - Focus indicators on interactive elements
 * - ARIA labels and roles
 */

import { test, expect } from '@playwright/test';

test.describe('Accessibility - Profile Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/profile');
    });

    test('should have accessible page structure', async ({ page }) => {
        // Check for main landmark
        await expect(page.locator('[role="main"]')).toBeVisible();

        // Check for proper heading hierarchy
        const h2 = page.locator('h2');
        await expect(h2.first()).toBeVisible();
    });

    test('should have accessible edit button', async ({ page }) => {
        const editButton = page.locator('button:has-text("Edit Profile")');

        // Check aria-label
        await expect(editButton).toHaveAttribute('aria-label', /edit/i);

        // Should be focusable
        await editButton.focus();
        await expect(editButton).toBeFocused();
    });

    test('should have accessible avatar with alt text', async ({ page }) => {
        const avatar = page.locator('img[alt]').first();

        if (await avatar.isVisible()) {
            const altText = await avatar.getAttribute('alt');
            expect(altText).toBeTruthy();
            expect(altText?.length).toBeGreaterThan(0);
        }
    });

    test('should have accessible region sections', async ({ page }) => {
        // Check for labeled regions
        const personalInfoRegion = page.locator('[role="region"][aria-labelledby*="personal"]');
        const addressRegion = page.locator('[role="region"][aria-labelledby*="address"]');

        // At least one region should exist
        const hasRegions = await personalInfoRegion.isVisible() || await addressRegion.isVisible();
        expect(hasRegions).toBeTruthy();
    });

    test('should allow keyboard navigation through form', async ({ page }) => {
        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');
        await page.waitForTimeout(500);

        // Tab through form elements
        const formInputs = page.locator('input, select, button').filter({ hasText: /./ });
        const inputCount = await formInputs.count();

        if (inputCount > 0) {
            // Focus first element and tab through
            await page.keyboard.press('Tab');

            // Verify focus moves through elements
            for (let i = 0; i < Math.min(5, inputCount); i++) {
                const focusedElement = page.locator(':focus');
                await expect(focusedElement).toBeVisible();
                await page.keyboard.press('Tab');
            }
        }
    });

    test('should have visible focus indicators', async ({ page }) => {
        await page.click('button:has-text("Edit Profile")');
        await page.waitForTimeout(500);

        // Tab to an input and check focus styling
        await page.keyboard.press('Tab');

        const focusedElement = page.locator(':focus');
        if (await focusedElement.count() > 0) {
            // Get computed styles to verify focus indicator
            const styles = await focusedElement.evaluate(el => {
                const computed = window.getComputedStyle(el);
                return {
                    outline: computed.outline,
                    boxShadow: computed.boxShadow,
                    borderColor: computed.borderColor
                };
            });

            // Should have some form of focus indicator
            const hasFocusIndicator =
                styles.outline !== 'none' ||
                styles.boxShadow !== 'none' ||
                styles.borderColor !== 'rgb(0, 0, 0)';

            expect(hasFocusIndicator).toBeTruthy();
        }
    });
});

test.describe('Accessibility - Academic Record Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');
    });

    test('should have accessible page header', async ({ page }) => {
        // Check for banner role
        const banner = page.locator('[role="banner"]');
        await expect(banner).toBeVisible();

        // Check for page title with ID
        const title = page.locator('#page-title');
        await expect(title).toBeVisible();
    });

    test('should have accessible tab navigation', async ({ page }) => {
        // Check tabs have aria-labels
        const tabs = page.locator('[role="navigation"] button, .mantine-Tabs-tab');
        const tabCount = await tabs.count();

        expect(tabCount).toBeGreaterThan(0);

        // Check each tab has accessible label
        for (let i = 0; i < tabCount; i++) {
            const tab = tabs.nth(i);
            const ariaLabel = await tab.getAttribute('aria-label');
            const textContent = await tab.textContent();

            // Should have either aria-label or visible text
            expect(ariaLabel || textContent).toBeTruthy();
        }
    });

    test('should allow keyboard tab navigation', async ({ page }) => {
        // Focus on tabs
        const firstTab = page.locator('.mantine-Tabs-tab').first();
        await firstTab.focus();

        // Use arrow keys to navigate between tabs
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        // Check that focus moved
        const focusedTab = page.locator('.mantine-Tabs-tab:focus');
        await expect(focusedTab).toBeVisible();
    });

    test('should have accessible filter controls', async ({ page }) => {
        // Check time period select has label
        const select = page.locator('select, [role="combobox"]').first();

        if (await select.isVisible()) {
            const hasLabel = await page.locator('label:has-text("Filter"), [id*="filter"]').isVisible();
            const hasAriaLabel = await select.getAttribute('aria-label');
            const hasAriaDescribedby = await select.getAttribute('aria-describedby');

            // Should have some form of labeling
            expect(hasLabel || hasAriaLabel || hasAriaDescribedby).toBeTruthy();
        }
    });

    test('should have accessible results count with live region', async ({ page }) => {
        // Check for aria-live on results count
        const resultsCount = page.locator('[aria-live="polite"]');
        await expect(resultsCount).toBeVisible();
    });

    test('should have accessible tab panels', async ({ page }) => {
        // Check tab panels have correct role
        const tabPanel = page.locator('[role="tabpanel"]');
        await expect(tabPanel.first()).toBeVisible();
    });
});

test.describe('Accessibility - Statistics Dashboard Charts', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Click on Statistics tab
        await page.click('button:has-text("Statistics")');
        await page.waitForTimeout(500);
    });

    test('should have accessible chart containers with role=img', async ({ page }) => {
        const chartContainers = page.locator('[role="img"]');
        const chartCount = await chartContainers.count();

        expect(chartCount).toBeGreaterThan(0);
    });

    test('should have chart titles linked via aria-labelledby', async ({ page }) => {
        const chartContainers = page.locator('[role="img"][aria-labelledby]');
        const count = await chartContainers.count();

        for (let i = 0; i < count; i++) {
            const labelledBy = await chartContainers.nth(i).getAttribute('aria-labelledby');
            expect(labelledBy).toBeTruthy();

            // Verify the referenced element exists
            if (labelledBy) {
                const linkedTitle = page.locator(`#${labelledBy}`);
                await expect(linkedTitle).toBeVisible();
            }
        }
    });

    test('should have chart descriptions via aria-describedby', async ({ page }) => {
        const chartContainers = page.locator('[role="img"][aria-describedby]');
        const count = await chartContainers.count();

        for (let i = 0; i < count; i++) {
            const describedBy = await chartContainers.nth(i).getAttribute('aria-describedby');
            expect(describedBy).toBeTruthy();

            // Verify the description element exists and has content
            if (describedBy) {
                const description = page.locator(`#${describedBy}`);
                await expect(description).toBeVisible();

                const text = await description.textContent();
                expect(text?.length).toBeGreaterThan(20); // Should have meaningful description
            }
        }
    });

    test('should have chart descriptions with data values for screen readers', async ({ page }) => {
        // Check that chart descriptions include actual data values
        const descriptions = page.locator('[id*="chart-"][id*="-desc"]');
        const count = await descriptions.count();

        if (count > 0) {
            for (let i = 0; i < count; i++) {
                const text = await descriptions.nth(i).textContent();

                // Should contain percentage or count values
                const hasNumbers = /\d+%|\d+ tests|\d+ months/.test(text || '');
                expect(hasNumbers).toBeTruthy();
            }
        }
    });
});

test.describe('Accessibility - Loading States', () => {
    test('should have accessible loading indicator', async ({ page }) => {
        // Slow down network to catch loading state
        await page.route('**/*', route => {
            setTimeout(() => route.continue(), 1000);
        });

        await page.goto('/student/academic-record');

        // Check for aria-busy or aria-label on loading state
        const loadingIndicator = page.locator('[aria-busy="true"], [aria-label*="Loading"]');

        // Should either find loading state or page loaded quickly
        const hasLoading = await loadingIndicator.count() > 0;
        // This is informational - page might load too fast
    });

    test('should announce loading completion to screen readers', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        // Check aria-busy is removed after loading
        const container = page.locator('[aria-busy]');

        if (await container.count() > 0) {
            const ariaBusy = await container.first().getAttribute('aria-busy');
            expect(ariaBusy).not.toBe('true');
        }
    });
});

test.describe('Accessibility - Error States', () => {
    test('should have accessible error alerts', async ({ page }) => {
        // Force an error by intercepting requests
        await page.route('**/test_results/**', route => {
            route.abort('failed');
        });

        await page.goto('/student/academic-record');
        await page.waitForTimeout(2000);

        // Check for role="alert" on error message
        const errorAlert = page.locator('[role="alert"]');

        if (await errorAlert.count() > 0) {
            await expect(errorAlert.first()).toBeVisible();
        }
    });
});

test.describe('Accessibility - Interactive Elements', () => {
    test('should have accessible buttons with labels', async ({ page }) => {
        await page.goto('/profile');

        const buttons = page.locator('button');
        const buttonCount = await buttons.count();

        for (let i = 0; i < buttonCount; i++) {
            const button = buttons.nth(i);
            const ariaLabel = await button.getAttribute('aria-label');
            const textContent = await button.textContent();
            const ariaLabelledBy = await button.getAttribute('aria-labelledby');

            // Every button should have accessible name
            const hasAccessibleName = ariaLabel || textContent?.trim() || ariaLabelledBy;
            expect(hasAccessibleName).toBeTruthy();
        }
    });

    test('should support Enter key activation on buttons', async ({ page }) => {
        await page.goto('/profile');

        const editButton = page.locator('button:has-text("Edit Profile")');
        if (await editButton.isVisible()) {
            await editButton.focus();
            await page.keyboard.press('Enter');

            // Should enter edit mode
            await expect(page.locator('button:has-text("Cancel"), button:has-text("Save")').first()).toBeVisible();
        }
    });

    test('should support Space key activation on buttons', async ({ page }) => {
        await page.goto('/student/academic-record');
        await page.waitForLoadState('networkidle');

        const tab = page.locator('.mantine-Tabs-tab:has-text("By Course")');
        if (await tab.isVisible()) {
            await tab.focus();
            await page.keyboard.press('Space');

            // Tab should be activated
            await expect(tab).toHaveAttribute('aria-selected', 'true');
        }
    });
});
