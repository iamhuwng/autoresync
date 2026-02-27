import { Page, expect } from '@playwright/test';

/**
 * Authentication Helper Functions for E2E Tests
 * 
 * These functions handle login flows for different user types.
 * Update the selectors and URLs based on your actual login implementation.
 */

export interface TestUser {
    email: string;
    password: string;
    displayName: string;
    role: 'teacher' | 'student' | 'admin';
}

/**
 * Test user credentials
 * These should match users created in your Firebase test environment
 */
export const TEST_USERS = {
    teacher: {
        email: 'teacher@test.com',
        password: 'TestPassword123!',
        displayName: 'Test Teacher',
        role: 'teacher' as const,
    },
    teacher2: {
        email: 'teacher2@test.com',
        password: 'TestPassword123!',
        displayName: 'Test Teacher 2',
        role: 'teacher' as const,
    },
    unauthorizedTeacher: {
        email: 'unauthorized@test.com',
        password: 'TestPassword123!',
        displayName: 'Unauthorized Teacher',
        role: 'teacher' as const,
    },
    student: {
        email: 'student@test.com',
        password: 'TestPassword123!',
        displayName: 'Test Student',
        role: 'student' as const,
    },
    student2: {
        email: 'student2@test.com',
        password: 'TestPassword123!',
        displayName: 'Test Student 2',
        role: 'student' as const,
    },
};

/**
 * Login as a teacher user
 */
export async function loginAsTeacher(
    page: Page,
    email: string = TEST_USERS.teacher.email,
    password: string = TEST_USERS.teacher.password
): Promise<void> {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill login form
    // Update selectors based on your actual login form
    const emailInput = page.locator('input[type="email"], input[name="email"], #email');
    const passwordInput = page.locator('input[type="password"], input[name="password"], #password');
    const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await submitButton.click();

    // Wait for navigation to dashboard
    // Update URL pattern based on your routing
    await page.waitForURL(/\/(teacher|dashboard)/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
}

/**
 * Login as a student user
 */
export async function loginAsStudent(
    page: Page,
    email: string = TEST_USERS.student.email,
    password: string = TEST_USERS.student.password
): Promise<void> {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"], #email');
    const passwordInput = page.locator('input[type="password"], input[name="password"], #password');
    const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await submitButton.click();

    // Wait for navigation to student dashboard
    await page.waitForURL(/\/(student|dashboard)/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
}

/**
 * Login with custom credentials
 */
export async function login(page: Page, user: TestUser): Promise<void> {
    if (user.role === 'teacher') {
        await loginAsTeacher(page, user.email, user.password);
    } else if (user.role === 'student') {
        await loginAsStudent(page, user.email, user.password);
    } else {
        throw new Error(`Unsupported user role: ${user.role}`);
    }
}

/**
 * Logout current user
 */
export async function logout(page: Page): Promise<void> {
    // Look for logout button/link
    // Update selector based on your UI
    const logoutButton = page.locator(
        'button:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Logout"), [data-testid="logout-button"]'
    );

    if (await logoutButton.isVisible({ timeout: 2000 })) {
        await logoutButton.click();
        await page.waitForURL(/\/(login|home|\/)/, { timeout: 5000 });
    } else {
        // Try to navigate to logout endpoint directly
        await page.goto('/logout');
    }

    await page.waitForLoadState('networkidle');
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
    try {
        // Check for elements that only appear when logged in
        const loggedInIndicators = [
            '[data-testid="user-menu"]',
            '[data-testid="logout-button"]',
            'text=/Dashboard|Profile|Settings/',
        ];

        for (const selector of loggedInIndicators) {
            if (await page.locator(selector).isVisible({ timeout: 1000 })) {
                return true;
            }
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Get current user info from the page
 */
export async function getCurrentUser(page: Page): Promise<{ displayName?: string; email?: string } | null> {
    try {
        // Try to find user display name
        const userNameElement = page.locator('[data-testid="user-display-name"], [data-testid="user-name"]');
        const displayName = await userNameElement.textContent({ timeout: 2000 });

        // Try to find user email
        const userEmailElement = page.locator('[data-testid="user-email"]');
        const email = await userEmailElement.textContent({ timeout: 2000 });

        return {
            displayName: displayName || undefined,
            email: email || undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Wait for authentication state to be ready
 */
export async function waitForAuth(page: Page, timeout: number = 5000): Promise<void> {
    // Wait for Firebase auth to initialize
    await page.waitForFunction(
        () => {
            // Check if Firebase auth is ready
            // This assumes you have a global auth state indicator
            return (window as any).authReady === true || document.querySelector('[data-auth-ready="true"]') !== null;
        },
        { timeout }
    ).catch(() => {
        // If no auth ready indicator, just wait for network idle
        return page.waitForLoadState('networkidle');
    });
}

/**
 * Clear all cookies and local storage (full logout)
 */
export async function clearAuthState(page: Page): Promise<void> {
    await page.context().clearCookies();
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

/**
 * Login and navigate to a specific page
 */
export async function loginAndNavigate(page: Page, user: TestUser, url: string): Promise<void> {
    await login(page, user);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
}
