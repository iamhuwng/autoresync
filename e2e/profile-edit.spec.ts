import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * E2E Tests: Profile Edit Flow
 * 
 * Tests the profile viewing and editing functionality including:
 * - Viewing existing profile data
 * - Toggling edit mode
 * - Saving changes
 * - Canceling edits
 * - Avatar update
 */

// Test data for existing user with completed profile
const EXISTING_USER_EMAIL = 'student@test.com';
const EXISTING_USER_PASSWORD = 'password123';

// Updated profile data
const UPDATED_PROFILE = {
    firstName: 'Jane',
    familyName: 'Smith',
    dateOfBirth: {
        day: '20',
        month: '03',
        year: '1998'
    },
    phone: {
        countryCode: '+1',
        number: '5551234567'
    },
    address: {
        street: '456 New Avenue',
        city: 'Ho Chi Minh',
        province: 'Ho Chi Minh',
        country: 'VN'
    },
    school: 'Updated University'
};

// Helper functions
async function loginAsExistingUser(page: Page) {
    await page.goto('/');
    await page.click('text=Dev');
    await page.fill('input[type="email"]', EXISTING_USER_EMAIL);
    await page.fill('input[type="password"]', EXISTING_USER_PASSWORD);
    await page.click('button:has-text("Login")');

    // Should go to dashboard (profile already complete)
    await page.waitForURL('**/student/dashboard', { timeout: 10000 });
}

async function navigateToProfile(page: Page) {
    // Click the Profile tab/button
    await page.click('text=Profile');
    await page.waitForURL('**/profile', { timeout: 5000 });
}

async function clearAuthState(page: Page) {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

test.describe('Profile Edit Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Clear any existing state
        await clearAuthState(page);
    });

    /**
     * Test: Existing user can view their profile page
     */
    test('should display all profile data correctly in view mode', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Verify we're on the profile page
        await expect(page).toHaveURL(/.*\/profile/);
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible();

        // Verify Edit Profile button is visible
        await expect(page.locator('button:has-text("Edit Profile")')).toBeVisible();

        // Verify profile data is displayed (not in input fields)
        // Check for static text displays
        await expect(page.locator('text=First Name')).toBeVisible();
        await expect(page.locator('text=Family Name')).toBeVisible();
        await expect(page.locator('text=Date of Birth')).toBeVisible();
        await expect(page.locator('text=Phone')).toBeVisible();
        await expect(page.locator('text=Address')).toBeVisible();

        // Verify Profile Complete badge
        await expect(page.locator('text=Profile Complete')).toBeVisible();
    });

    /**
     * Test: User can toggle to edit mode
     */
    test('should switch to edit mode when Edit Profile button is clicked', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Click Edit Profile button
        await page.click('button:has-text("Edit Profile")');

        // Verify page switches to edit mode
        await expect(page.locator('h2:has-text("Edit Profile")')).toBeVisible();

        // Verify Cancel button appears
        await expect(page.locator('button:has-text("Cancel")').or(page.locator('text=Cancel'))).toBeVisible();

        // Verify form fields are now editable (input elements visible)
        await expect(page.locator('input[placeholder*="John"]')).toBeVisible();
        await expect(page.locator('input[placeholder*="Doe"]')).toBeVisible();

        // Verify Complete Profile button is visible
        await expect(page.locator('button:has-text("Complete Profile")')).toBeVisible();
    });

    /**
     * Test: User can save changes to their profile
     */
    test('should save changes when user edits and submits profile', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Update first name
        const firstNameInput = page.locator('input[placeholder*="John"]');
        await firstNameInput.clear();
        await firstNameInput.fill(UPDATED_PROFILE.firstName);

        // Update family name
        const familyNameInput = page.locator('input[placeholder*="Doe"]');
        await familyNameInput.clear();
        await familyNameInput.fill(UPDATED_PROFILE.familyName);

        // Update phone number
        const phoneInput = page.locator('input[placeholder*="123456789"]');
        await phoneInput.clear();
        await phoneInput.fill(UPDATED_PROFILE.phone.number);

        // Update address street
        const streetInput = page.locator('input[placeholder*="123 Main Street"]');
        await streetInput.clear();
        await streetInput.fill(UPDATED_PROFILE.address.street);

        // Submit changes
        await page.click('button:has-text("Complete Profile")');

        // Wait for save to complete and return to view mode
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible({ timeout: 5000 });

        // Verify changes are displayed
        await expect(page.locator(`text=${UPDATED_PROFILE.firstName}`)).toBeVisible();
        await expect(page.locator(`text=${UPDATED_PROFILE.familyName}`)).toBeVisible();
        await expect(page.locator(`text=${UPDATED_PROFILE.phone.number}`)).toBeVisible();
        await expect(page.locator(`text=${UPDATED_PROFILE.address.street}`)).toBeVisible();
    });

    /**
     * Test: User can cancel edit without saving changes
     */
    test('should discard changes when user cancels edit', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Get original first name (assuming it's displayed)
        const originalName = await page.locator('text=First Name').locator('..').locator('text=/[A-Z][a-z]+/').first().textContent();

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Make a change
        const firstNameInput = page.locator('input[placeholder*="John"]');
        await firstNameInput.clear();
        await firstNameInput.fill('TemporaryName');

        // Click Cancel
        await page.click('button:has-text("Cancel")');

        // Verify we're back in view mode
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible();
        await expect(page.locator('button:has-text("Edit Profile")')).toBeVisible();

        // Verify original data is still displayed (change was discarded)
        if (originalName) {
            await expect(page.locator(`text=${originalName}`)).toBeVisible();
        }

        // Verify temporary name is NOT displayed
        await expect(page.locator('text=TemporaryName')).not.toBeVisible();
    });

    /**
     * Test: User can update their avatar
     */
    test('should update avatar when user uploads new image in edit mode', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Upload new avatar
        const testImagePath = path.join(__dirname, '..', 'public', 'logo.png');
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testImagePath);

        // Wait for upload and preview
        await expect(page.locator('img[alt*="Avatar"]')).toBeVisible({ timeout: 10000 });

        // Submit changes
        await page.click('button:has-text("Complete Profile")');

        // Wait for save
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible({ timeout: 5000 });

        // Verify avatar is displayed in view mode
        await expect(page.locator('img[alt*="Avatar"]')).toBeVisible();
    });

    /**
     * Test: Profile page shows correct role-specific fields
     */
    test('should display school field for student users', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Verify "School" or "Additional Information" section exists
        await expect(page.locator('text=School').or(page.locator('text=Additional Information'))).toBeVisible();

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Verify school input field is present
        await expect(page.locator('input[placeholder*="school"]')).toBeVisible();
    });

    /**
     * Test: Validation still works in edit mode
     */
    test('should show validation errors when invalid data is entered in edit mode', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Clear first name (required field)
        const firstNameInput = page.locator('input[placeholder*="John"]');
        await firstNameInput.clear();

        // Try to submit
        await page.click('button:has-text("Complete Profile")');

        // Verify validation error appears
        await expect(page.locator('text=First name is required')).toBeVisible({ timeout: 2000 });

        // Verify we're still in edit mode (not saved)
        await expect(page.locator('h2:has-text("Edit Profile")')).toBeVisible();
    });

    /**
     * Test: Date of birth can be updated
     */
    test('should allow updating date of birth in edit mode', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Update date of birth
        const selects = page.locator('select');
        await selects.nth(0).selectOption(UPDATED_PROFILE.dateOfBirth.day); // Day
        await selects.nth(1).selectOption(UPDATED_PROFILE.dateOfBirth.month); // Month
        await selects.nth(2).selectOption(UPDATED_PROFILE.dateOfBirth.year); // Year

        // Verify age recalculates
        await expect(page.locator('text=Age:')).toBeVisible({ timeout: 2000 });

        // Submit changes
        await page.click('button:has-text("Complete Profile")');

        // Wait for save
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible({ timeout: 5000 });

        // Verify new date of birth is displayed
        const newDOB = `${UPDATED_PROFILE.dateOfBirth.day}/${UPDATED_PROFILE.dateOfBirth.month}/${UPDATED_PROFILE.dateOfBirth.year}`;
        await expect(page.locator(`text=${newDOB}`)).toBeVisible();
    });

    /**
     * Test: Country can be changed in address
     */
    test('should allow changing country in address', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Find and change country select
        const countrySelect = page.locator('select').last(); // Country is usually the last select
        await countrySelect.selectOption('US'); // Change to United States

        // Submit changes
        await page.click('button:has-text("Complete Profile")');

        // Wait for save
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible({ timeout: 5000 });

        // Verify country name is displayed (should show "United States" not "US")
        await expect(page.locator('text=United States')).toBeVisible();
    });

    /**
     * Test: Phone country code can be changed
     */
    test('should allow changing phone country code', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Change country code to USA (+1)
        const countryCodeSelect = page.locator('select').first();
        await countryCodeSelect.selectOption('+1');

        // Verify flag changed
        await expect(page.locator('text=🇺🇸')).toBeVisible();

        // Submit changes
        await page.click('button:has-text("Complete Profile")');

        // Wait for save
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible({ timeout: 5000 });

        // Verify new country code is displayed in view mode
        await expect(page.locator('text=+1')).toBeVisible();
    });

    /**
     * Test: Loading state during save
     */
    test('should show loading state when saving profile changes', async ({ page }) => {
        await loginAsExistingUser(page);
        await navigateToProfile(page);

        // Enter edit mode
        await page.click('button:has-text("Edit Profile")');

        // Make a small change
        const firstNameInput = page.locator('input[placeholder*="John"]');
        await firstNameInput.fill('UpdatedName');

        // Click submit
        const submitButton = page.locator('button:has-text("Complete Profile")');
        await submitButton.click();

        // Verify button is disabled during save
        await expect(submitButton).toBeDisabled({ timeout: 1000 });

        // Wait for save to complete
        await expect(page.locator('h2:has-text("My Profile")')).toBeVisible({ timeout: 5000 });
    });
});
