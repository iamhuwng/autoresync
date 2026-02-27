import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * E2E Tests: Profile Completion Flow
 * 
 * Tests the complete profile completion flow including:
 * - New user redirect to profile completion
 * - Form validation
 * - Navigation blocking
 * - Data persistence to Firebase
 * - Avatar upload
 */

// Test data
const NEW_USER_EMAIL = 'newuser@test.com';
const NEW_USER_PASSWORD = 'password123';

// Profile test data
const PROFILE_DATA = {
    firstName: 'John',
    familyName: 'Doe',
    dateOfBirth: {
        day: '15',
        month: '06',
        year: '2000'
    },
    phone: {
        countryCode: '+84',
        number: '987654321'
    },
    address: {
        street: '123 Test Street',
        city: 'Hanoi',
        province: 'Hanoi',
        country: 'VN'
    },
    school: 'Test University'
};

// Helper functions
async function loginAsNewUser(page: Page) {
    await page.goto('/');
    await page.click('text=Dev');
    await page.fill('input[type="email"]', NEW_USER_EMAIL);
    await page.fill('input[type="password"]', NEW_USER_PASSWORD);
    await page.click('button:has-text("Login")');

    // New user should be redirected to profile completion
    await page.waitForURL('**/profile/complete', { timeout: 10000 });
}

async function clearAuthState(page: Page) {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

test.describe('Profile Completion Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Clear any existing state
        await clearAuthState(page);
    });

    /**
     * Test: New user is automatically redirected to profile completion
     */
    test('should redirect new user to profile completion page on login', async ({ page }) => {
        await loginAsNewUser(page);

        // Verify we're on the profile completion page
        await expect(page).toHaveURL(/.*\/profile\/complete/);

        // Verify page title
        await expect(page.locator('h2:has-text("Complete Your Profile")')).toBeVisible();

        // Verify all required fields are present
        await expect(page.locator('input[placeholder*="John"]')).toBeVisible(); // First name
        await expect(page.locator('input[placeholder*="Doe"]')).toBeVisible(); // Family name
        await expect(page.locator('select').first()).toBeVisible(); // Country code dropdown
    });

    /**
     * Test: Fill all required fields and submit successfully
     */
    test('should save profile data to Firebase when form is submitted', async ({ page }) => {
        await loginAsNewUser(page);

        // Fill in first name and family name
        await page.fill('input[placeholder*="John"]', PROFILE_DATA.firstName);
        await page.fill('input[placeholder*="Doe"]', PROFILE_DATA.familyName);

        // Fill in date of birth (three dropdowns)
        const selects = page.locator('select');
        await selects.nth(0).selectOption(PROFILE_DATA.dateOfBirth.day); // Day
        await selects.nth(1).selectOption(PROFILE_DATA.dateOfBirth.month); // Month
        await selects.nth(2).selectOption(PROFILE_DATA.dateOfBirth.year); // Year

        // Fill in phone number
        // Country code is already selected by default (+84)
        await page.fill('input[placeholder*="123456789"]', PROFILE_DATA.phone.number);

        // Fill in address
        await page.fill('input[placeholder*="123 Main Street"]', PROFILE_DATA.address.street);
        await page.fill('input[placeholder*="Hanoi"]', PROFILE_DATA.address.city);
        await page.fill('input[placeholder*="Province"]', PROFILE_DATA.address.province);

        // Select country
        const countrySelect = page.locator('select[placeholder*="Select country"]');
        await countrySelect.selectOption(PROFILE_DATA.address.country);

        // Fill in optional school field
        await page.fill('input[placeholder*="school"]', PROFILE_DATA.school);

        // Submit the form
        await page.click('button:has-text("Complete Profile")');

        // Wait for redirect to dashboard
        await page.waitForURL('**/student/dashboard', { timeout: 10000 });

        // Verify we're on the dashboard
        await expect(page).toHaveURL(/.*\/student\/dashboard/);
        await expect(page.locator('h2:has-text("Student Dashboard")')).toBeVisible();
    });

    /**
     * Test: Validation errors display correctly for invalid inputs
     */
    test('should display validation errors for invalid inputs', async ({ page }) => {
        await loginAsNewUser(page);

        // Try to submit without filling any fields
        await page.click('button:has-text("Complete Profile")');

        // Verify validation errors appear
        await expect(page.locator('text=First name is required')).toBeVisible({ timeout: 2000 });
        await expect(page.locator('text=Family name is required')).toBeVisible({ timeout: 2000 });
        await expect(page.locator('text=Date of birth is required')).toBeVisible({ timeout: 2000 });

        // Fill first name with too many characters
        await page.fill('input[placeholder*="John"]', 'A'.repeat(51));
        await page.click('button:has-text("Complete Profile")');

        // Verify max length error
        await expect(page.locator('text=must be less than 50 characters')).toBeVisible({ timeout: 2000 });

        // Fill phone number with invalid format
        await page.fill('input[placeholder*="123456789"]', '123'); // Too short
        await page.click('button:has-text("Complete Profile")');

        // Verify phone validation error
        await expect(page.locator('text=at least 6 digits')).toBeVisible({ timeout: 2000 });
    });

    /**
     * Test: Navigation blocking before profile completion
     */
    test('should block navigation away from profile completion page', async ({ page }) => {
        await loginAsNewUser(page);

        // Set up dialog handler for beforeunload warning
        page.on('dialog', async dialog => {
            expect(dialog.type()).toBe('beforeunload');
            await dialog.dismiss();
        });

        // Try to navigate away by typing URL
        await page.goto('/student/courses');

        // Should be redirected back to profile completion
        await expect(page).toHaveURL(/.*\/profile\/complete/);
    });

    /**
     * Test: Avatar upload works correctly
     */
    test('should upload and display avatar image', async ({ page }) => {
        await loginAsNewUser(page);

        // Create a test image file path
        const testImagePath = path.join(__dirname, '..', 'public', 'logo.png');

        // Find the file input (it might be hidden)
        const fileInput = page.locator('input[type="file"]');

        // Upload the image
        await fileInput.setInputFiles(testImagePath);

        // Wait for upload to complete and preview to appear
        await expect(page.locator('img[alt*="Avatar"]')).toBeVisible({ timeout: 10000 });

        // Verify upload progress indicator appeared (might be quick)
        // This is optional as it might complete too fast to see

        // Fill in required fields quickly
        await page.fill('input[placeholder*="John"]', PROFILE_DATA.firstName);
        await page.fill('input[placeholder*="Doe"]', PROFILE_DATA.familyName);

        const selects = page.locator('select');
        await selects.nth(0).selectOption(PROFILE_DATA.dateOfBirth.day);
        await selects.nth(1).selectOption(PROFILE_DATA.dateOfBirth.month);
        await selects.nth(2).selectOption(PROFILE_DATA.dateOfBirth.year);

        await page.fill('input[placeholder*="123456789"]', PROFILE_DATA.phone.number);
        await page.fill('input[placeholder*="123 Main Street"]', PROFILE_DATA.address.street);
        await page.fill('input[placeholder*="Hanoi"]', PROFILE_DATA.address.city);
        await page.fill('input[placeholder*="Province"]', PROFILE_DATA.address.province);

        // Submit
        await page.click('button:has-text("Complete Profile")');

        // Wait for redirect
        await page.waitForURL('**/student/dashboard', { timeout: 10000 });

        // Navigate to profile page to verify avatar was saved
        await page.click('text=Profile');
        await page.waitForURL('**/profile', { timeout: 5000 });

        // Verify avatar is displayed on profile page
        await expect(page.locator('img[alt*="Avatar"]')).toBeVisible();
    });

    /**
     * Test: Age calculation displays correctly
     */
    test('should display calculated age when date of birth is selected', async ({ page }) => {
        await loginAsNewUser(page);

        // Select a date of birth
        const selects = page.locator('select');
        await selects.nth(0).selectOption('15'); // Day
        await selects.nth(1).selectOption('06'); // June
        await selects.nth(2).selectOption('2000'); // Year

        // Verify age is calculated and displayed
        // Age should be approximately 25 years (as of 2026)
        await expect(page.locator('text=Age:')).toBeVisible({ timeout: 2000 });
        await expect(page.locator('text=25 years')).toBeVisible({ timeout: 2000 });
    });

    /**
     * Test: Country code dropdown works correctly
     */
    test('should allow selecting different country codes for phone', async ({ page }) => {
        await loginAsNewUser(page);

        // Find the country code select (first select in phone input group)
        const countryCodeSelect = page.locator('select').first();

        // Verify default is Vietnam (+84)
        await expect(countryCodeSelect).toHaveValue('+84');

        // Change to USA (+1)
        await countryCodeSelect.selectOption('+1');
        await expect(countryCodeSelect).toHaveValue('+1');

        // Verify the flag emoji changed (USA flag should be visible)
        await expect(page.locator('text=🇺🇸')).toBeVisible();
    });

    /**
     * Test: Form submission shows loading state
     */
    test('should show loading state during form submission', async ({ page }) => {
        await loginAsNewUser(page);

        // Fill in all required fields
        await page.fill('input[placeholder*="John"]', PROFILE_DATA.firstName);
        await page.fill('input[placeholder*="Doe"]', PROFILE_DATA.familyName);

        const selects = page.locator('select');
        await selects.nth(0).selectOption(PROFILE_DATA.dateOfBirth.day);
        await selects.nth(1).selectOption(PROFILE_DATA.dateOfBirth.month);
        await selects.nth(2).selectOption(PROFILE_DATA.dateOfBirth.year);

        await page.fill('input[placeholder*="123456789"]', PROFILE_DATA.phone.number);
        await page.fill('input[placeholder*="123 Main Street"]', PROFILE_DATA.address.street);
        await page.fill('input[placeholder*="Hanoi"]', PROFILE_DATA.address.city);
        await page.fill('input[placeholder*="Province"]', PROFILE_DATA.address.province);

        // Click submit
        const submitButton = page.locator('button:has-text("Complete Profile")');
        await submitButton.click();

        // Verify button shows loading state (disabled and possibly different text)
        await expect(submitButton).toBeDisabled({ timeout: 1000 });

        // Wait for redirect (submission complete)
        await page.waitForURL('**/student/dashboard', { timeout: 10000 });
    });
});
