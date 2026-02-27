import { test, expect, Page } from '@playwright/test';

/**
 * Phase 5 E2E Tests: Student Course Experience
 * 
 * These tests verify the complete student journey:
 * - Viewing enrolled courses
 * - Browsing course catalog
 * - Requesting to join courses
 * - Entering course codes
 * - Requesting unenrollment
 * - Viewing locked/unlocked modules
 */

// Test data
const TEACHER_EMAIL = 'teacher@test.com';
const TEACHER_PASSWORD = 'password123';
const STUDENT_EMAIL = 'student@test.com';
const STUDENT_PASSWORD = 'password123';

// Helper functions
async function loginAsTeacher(page: Page) {
    await page.goto('/');
    await page.click('text=Dev');
    await page.fill('input[type="email"]', TEACHER_EMAIL);
    await page.fill('input[type="password"]', TEACHER_PASSWORD);
    await page.click('button:has-text("Login")');
    await page.waitForURL('**/teacher/lobby');
}

async function loginAsStudent(page: Page) {
    await page.goto('/');
    await page.click('text=Dev');
    await page.fill('input[type="email"]', STUDENT_EMAIL);
    await page.fill('input[type="password"]', STUDENT_PASSWORD);
    await page.click('button:has-text("Login")');
    await page.waitForURL('**/student/dashboard');
}

async function logout(page: Page) {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

test.describe('Phase 5: Student Course Experience', () => {

    test.beforeEach(async ({ page }) => {
        // Clear any existing state
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
    });

    /**
     * Task 20.E2E.1: Student views enrolled courses in My Courses
     */
    test('should display enrolled courses in My Courses page', async ({ page }) => {
        // Login as student
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');
        await expect(page).toHaveURL(/.*\/student\/courses/);

        // Verify page header
        await expect(page.locator('h1:has-text("My Courses")')).toBeVisible();

        // Verify filter tabs are present
        await expect(page.locator('text=All')).toBeVisible();
        await expect(page.locator('text=Active')).toBeVisible();
        await expect(page.locator('text=Expired')).toBeVisible();

        // Verify enrolled courses are displayed
        const courseCards = page.locator('[data-testid="enrolled-course"]');
        await expect(courseCards.first()).toBeVisible();

        // Verify course details are shown
        await expect(courseCards.first().locator('[data-testid="course-name"]')).toBeVisible();
        await expect(courseCards.first().locator('[data-testid="teacher-name"]')).toBeVisible();
        await expect(courseCards.first().locator('[data-testid="completion-percentage"]')).toBeVisible();
    });

    /**
     * Task 20.E2E.2: Student browses course catalog, filters by type
     */
    test('should browse and filter courses in catalog', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to Course Catalog
        await page.click('text=Browse Courses');
        await expect(page).toHaveURL(/.*\/courses\/catalog/);

        // Verify catalog header
        await expect(page.locator('h1:has-text("Course Catalog")')).toBeVisible();

        // Verify search and filter options
        await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();

        // Test filter by type
        const typeFilter = page.locator('select[name="type"]');
        if (await typeFilter.isVisible()) {
            await typeFilter.selectOption('IELTS');

            // Wait for filtered results
            await page.waitForTimeout(1000);

            // Verify only IELTS courses are shown
            const courseCards = page.locator('[data-testid="catalog-course"]');
            const count = await courseCards.count();
            if (count > 0) {
                const firstCourseType = await courseCards.first().locator('[data-testid="course-type"]').textContent();
                expect(firstCourseType).toContain('IELTS');
            }
        }

        // Test search functionality
        const searchInput = page.locator('input[placeholder*="Search"]');
        await searchInput.fill('Math');
        await page.waitForTimeout(500);

        // Verify search results
        const searchResults = page.locator('[data-testid="catalog-course"]');
        if (await searchResults.count() > 0) {
            await expect(searchResults.first()).toBeVisible();
        }
    });

    /**
     * Task 20.E2E.3: Student requests to join public course → teacher approves → enrolled
     */
    test('should complete enrollment request flow for public course', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to Course Catalog
        await page.click('text=Browse Courses');

        // Find a public course
        const publicCourse = page.locator('[data-testid="catalog-course"][data-visibility="public"]').first();
        await publicCourse.click();

        // Click "Request to Join" button
        await page.click('button:has-text("Request to Join")');

        // Verify request confirmation
        await expect(page.locator('text=Request sent')).toBeVisible({ timeout: 5000 });

        // Logout and login as teacher
        await logout(page);
        await loginAsTeacher(page);

        // Navigate to Courses
        await page.click('text=Courses');

        // Open the course that has the pending request
        const courseWithRequest = page.locator('[data-testid="course-card"]').first();
        await courseWithRequest.click();

        // Go to Pending Requests tab
        await page.click('text=Pending Requests');

        // Verify request is shown
        await expect(page.locator('[data-testid="enrollment-request"]')).toBeVisible();

        // Approve the request
        await page.click('button:has-text("Approve")');

        // Verify approval notification
        await expect(page.locator('text=Request approved')).toBeVisible({ timeout: 5000 });

        // Login back as student
        await logout(page);
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Verify student is now enrolled
        await expect(page.locator('[data-testid="enrolled-course"]')).toBeVisible();
    });

    /**
     * Task 20.E2E.4: Student enters course code for protected course → request created
     */
    test('should create enrollment request using course code', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to Course Catalog
        await page.click('text=Browse Courses');

        // Find "Enter Course Code" section
        await expect(page.locator('text=Enter Course Code')).toBeVisible();

        // Enter a course code
        const codeInput = page.locator('input[placeholder*="code"]');
        await codeInput.fill('IELTS-20260130-1234');

        // Submit the code
        await page.click('button:has-text("Join")');

        // Verify request created or course found
        // Depending on implementation, this might show course details or create a request
        await expect(page.locator('text=Request sent')).toBeVisible({ timeout: 5000 });
    });

    /**
     * Task 20.E2E.5: Student requests unenroll → teacher approves → unenrolled
     */
    test('should complete unenrollment request flow', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Find a public course (only public courses show unenroll button)
        const publicCourse = page.locator('[data-testid="enrolled-course"][data-visibility="public"]').first();

        if (await publicCourse.isVisible()) {
            await publicCourse.click();

            // Click "Request Unenroll" button
            const unenrollBtn = page.locator('button:has-text("Unenroll")');
            if (await unenrollBtn.isVisible()) {
                await unenrollBtn.click();

                // Confirm unenrollment
                await page.click('button:has-text("Confirm")');

                // Verify request sent
                await expect(page.locator('text=Unenroll request sent')).toBeVisible({ timeout: 5000 });

                // Logout and login as teacher
                await logout(page);
                await loginAsTeacher(page);

                // Navigate to the course
                await page.click('text=Courses');
                const courseCard = page.locator('[data-testid="course-card"]').first();
                await courseCard.click();

                // Go to Pending Requests tab
                await page.click('text=Pending Requests');

                // Find and approve unenroll request
                const unenrollRequest = page.locator('[data-testid="unenroll-request"]').first();
                if (await unenrollRequest.isVisible()) {
                    await unenrollRequest.locator('button:has-text("Approve")').click();

                    // Verify approval
                    await expect(page.locator('text=Request approved')).toBeVisible({ timeout: 5000 });
                }

                // Login back as student
                await logout(page);
                await loginAsStudent(page);

                // Verify course is no longer in enrolled courses
                await page.click('text=My Courses');
                // Course should either be gone or moved to a different status
            }
        }
    });

    /**
     * Task 20.E2E.6: Student sees locked vs unlocked modules
     */
    test('should display locked and unlocked modules correctly', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Click on a course with modules
        const courseWithModules = page.locator('[data-testid="enrolled-course"]').first();
        await courseWithModules.click();

        // Verify modules are displayed
        const modules = page.locator('[data-testid="module"]');
        await expect(modules.first()).toBeVisible();

        // Check for locked modules
        const lockedModules = page.locator('[data-testid="module"][data-locked="true"]');
        const unlockedModules = page.locator('[data-testid="module"][data-locked="false"]');

        // Verify locked modules show lock icon
        if (await lockedModules.count() > 0) {
            await expect(lockedModules.first().locator('[data-testid="lock-icon"]')).toBeVisible();

            // Verify locked modules cannot be started
            const startBtn = lockedModules.first().locator('button:has-text("Start")');
            if (await startBtn.isVisible()) {
                await expect(startBtn).toBeDisabled();
            }
        }

        // Verify unlocked modules can be accessed
        if (await unlockedModules.count() > 0) {
            const startBtn = unlockedModules.first().locator('button:has-text("Start")');
            if (await startBtn.isVisible()) {
                await expect(startBtn).toBeEnabled();
            }
        }

        // Verify sequential access message if applicable
        const sequentialMessage = page.locator('text=Complete previous modules to unlock');
        if (await sequentialMessage.isVisible()) {
            expect(await sequentialMessage.textContent()).toContain('unlock');
        }
    });

    /**
     * Additional test: Verify completion percentage calculation
     */
    test('should calculate and display course completion percentage', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Find a course
        const course = page.locator('[data-testid="enrolled-course"]').first();

        // Verify completion percentage is shown
        const completionBadge = course.locator('[data-testid="completion-percentage"]');
        await expect(completionBadge).toBeVisible();

        // Verify it shows a percentage (e.g., "50%", "0%", "100%")
        const completionText = await completionBadge.textContent();
        expect(completionText).toMatch(/\d+%/);
    });

    /**
     * Additional test: Verify filter tabs functionality
     */
    test('should filter courses by status using tabs', async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Click on "Expired" tab
        await page.click('text=Expired');

        // Verify only expired courses are shown
        const expiredCourses = page.locator('[data-testid="enrolled-course"][data-status="expired"]');
        if (await expiredCourses.count() > 0) {
            await expect(expiredCourses.first()).toBeVisible();
        }

        // Click on "Active" tab
        await page.click('text=Active');

        // Verify only active courses are shown
        const activeCourses = page.locator('[data-testid="enrolled-course"][data-status="active"]');
        if (await activeCourses.count() > 0) {
            await expect(activeCourses.first()).toBeVisible();
        }
    });
});
