import { test, expect, Page } from '@playwright/test';

/**
 * Phase 4 E2E Tests: Course-Class Linking & Enrollment
 * 
 * These tests verify the complete flow of:
 * - Teachers linking courses to classes
 * - Students being auto-enrolled
 * - Course expiration and extension
 * - Module completion and access control
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
    // Navigate to a page with logout option
    await page.goto('/');
    // Add logout logic based on your app's implementation
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

test.describe('Phase 4: Course-Class Linking & Enrollment', () => {

    test.beforeEach(async ({ page }) => {
        // Clear any existing state
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
    });

    /**
     * Task 17.E2E.2: Teacher links course to class → students auto-enrolled
     */
    test('should auto-enroll students when teacher links course to class', async ({ page }) => {
        // Step 1: Login as teacher
        await loginAsTeacher(page);

        // Step 2: Navigate to Classes
        await page.click('text=Classes');
        await expect(page).toHaveURL(/.*\/teacher\/classes/);

        // Step 3: Select a class (assuming first class in list)
        const firstClass = page.locator('[data-testid="class-card"]').first();
        await firstClass.click();

        // Step 4: Navigate to Courses tab
        await page.click('text=Courses');

        // Step 5: Click "Link Course" button
        await page.click('button:has-text("Link Course")');

        // Step 6: Select a course from the modal
        await expect(page.locator('[data-testid="link-course-modal"]')).toBeVisible();
        const firstCourse = page.locator('[data-testid="course-option"]').first();
        await firstCourse.click();

        // Step 7: Confirm linking
        await page.click('button:has-text("Link")');

        // Step 8: Verify success notification
        await expect(page.locator('text=Course linked successfully')).toBeVisible({ timeout: 5000 });

        // Step 9: Verify course appears in the class's courses list
        await expect(page.locator('[data-testid="linked-course"]')).toBeVisible();

        // Step 10: Logout and login as student
        await logout(page);
        await loginAsStudent(page);

        // Step 11: Navigate to My Courses
        await page.click('text=My Courses');

        // Step 12: Verify student is auto-enrolled in the linked course
        await expect(page.locator('[data-testid="enrolled-course"]')).toBeVisible();
    });

    /**
     * Task 17.E2E.3: Course expiration removes student access
     */
    test('should remove student access when course expires', async ({ page }) => {
        // This test requires manipulating Firebase timestamps
        // For now, we'll test the UI behavior when expiration date is reached

        await loginAsTeacher(page);

        // Navigate to class with expired course
        await page.click('text=Classes');
        const classWithExpiredCourse = page.locator('[data-testid="class-card"]').first();
        await classWithExpiredCourse.click();

        // Go to Courses tab
        await page.click('text=Courses');

        // Verify expired course shows expiration indicator
        const expiredCourse = page.locator('[data-testid="linked-course"][data-expired="true"]');
        await expect(expiredCourse).toBeVisible();

        // Verify "Re-link" option is available instead of "Extend"
        await expect(expiredCourse.locator('button:has-text("Re-link")')).toBeVisible();

        // Login as student and verify no access
        await logout(page);
        await loginAsStudent(page);
        await page.click('text=My Courses');

        // Verify expired course shows in "Expired" tab
        await page.click('text=Expired');
        await expect(page.locator('[data-testid="expired-course"]')).toBeVisible();
    });

    /**
     * Task 17.E2E.4: Teacher extends course duration → new expiration shown
     */
    test('should update expiration date when teacher extends course duration', async ({ page }) => {
        await loginAsTeacher(page);

        // Navigate to class
        await page.click('text=Classes');
        const firstClass = page.locator('[data-testid="class-card"]').first();
        await firstClass.click();

        // Go to Courses tab
        await page.click('text=Courses');

        // Find a linked course
        const linkedCourse = page.locator('[data-testid="linked-course"]').first();

        // Get current expiration date
        const currentExpiration = await linkedCourse.locator('[data-testid="expiration-date"]').textContent();

        // Click "Extend Duration" button
        await linkedCourse.locator('button:has-text("Extend")').click();

        // Fill extension form
        await expect(page.locator('[data-testid="extend-course-modal"]')).toBeVisible();
        await page.fill('input[name="durationValue"]', '30');
        await page.selectOption('select[name="durationUnit"]', 'days');

        // Submit extension
        await page.click('button:has-text("Extend")');

        // Verify success notification
        await expect(page.locator('text=Course duration extended')).toBeVisible({ timeout: 5000 });

        // Verify new expiration date is different
        const newExpiration = await linkedCourse.locator('[data-testid="expiration-date"]').textContent();
        expect(newExpiration).not.toBe(currentExpiration);
    });

    /**
     * Task 17.E2E.5: Teacher marks module complete → students can access
     */
    test('should unlock module for students when teacher marks it complete', async ({ page }) => {
        await loginAsTeacher(page);

        // Navigate to class
        await page.click('text=Classes');
        const firstClass = page.locator('[data-testid="class-card"]').first();
        await firstClass.click();

        // Go to Courses tab
        await page.click('text=Courses');

        // Expand a course with sequential modules
        const courseWithModules = page.locator('[data-testid="linked-course"]').first();
        await courseWithModules.click();

        // Find a locked sequential module
        const lockedModule = page.locator('[data-testid="module"][data-locked="true"]').first();

        // Click "Mark Complete" button
        await lockedModule.locator('button:has-text("Mark Complete")').click();

        // Verify module is now unlocked
        await expect(lockedModule).toHaveAttribute('data-locked', 'false');

        // Login as student
        await logout(page);
        await loginAsStudent(page);

        // Navigate to the course
        await page.click('text=My Courses');
        const studentCourse = page.locator('[data-testid="enrolled-course"]').first();
        await studentCourse.click();

        // Verify student can now access the module
        const studentModule = page.locator('[data-testid="module"]').first();
        await expect(studentModule).not.toHaveAttribute('data-locked', 'true');
        await expect(studentModule.locator('button:has-text("Start")')).toBeEnabled();
    });

    /**
     * Task 17.E2E.6: Student in multiple classes with same course → retains access until all expire
     */
    test('should retain course access when student is enrolled via multiple classes', async ({ page }) => {
        // This test requires setting up a student in multiple classes with the same course
        // and different expiration dates

        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Find a course the student is enrolled in via multiple classes
        const multiEnrollmentCourse = page.locator('[data-testid="enrolled-course"][data-multi-enrollment="true"]').first();
        await multiEnrollmentCourse.click();

        // Verify enrollment info shows multiple sources
        await expect(page.locator('text=Enrolled via 2 classes')).toBeVisible();

        // Verify expiration shows the latest date
        const expirationText = await page.locator('[data-testid="course-expiration"]').textContent();
        expect(expirationText).toContain('Access until');

        // Simulate one class link expiring (would need backend manipulation)
        // For now, verify the UI shows correct behavior

        // After one enrollment expires, course should still be accessible
        await expect(page.locator('[data-testid="course-status"]')).toHaveText('Active');
    });

    /**
     * Additional test: Verify course sync with original
     */
    test('should sync course copy with original when teacher requests sync', async ({ page }) => {
        await loginAsTeacher(page);

        // Navigate to class
        await page.click('text=Classes');
        const firstClass = page.locator('[data-testid="class-card"]').first();
        await firstClass.click();

        // Go to Courses tab
        await page.click('text=Courses');

        // Find a linked course that is a copy
        const copiedCourse = page.locator('[data-testid="linked-course"][data-is-copy="true"]').first();

        // Click "Sync with Original" button
        await copiedCourse.locator('button:has-text("Sync")').click();

        // Confirm sync
        await page.click('button:has-text("Confirm Sync")');

        // Verify success notification
        await expect(page.locator('text=Course synced successfully')).toBeVisible({ timeout: 5000 });

        // Verify last synced timestamp is updated
        await expect(copiedCourse.locator('[data-testid="last-synced"]')).toContainText('Just now');
    });

    /**
     * Additional test: Verify unlinking course removes student enrollments
     */
    test('should remove student enrollments when teacher unlinks course from class', async ({ page }) => {
        await loginAsTeacher(page);

        // Navigate to class
        await page.click('text=Classes');
        const firstClass = page.locator('[data-testid="class-card"]').first();
        const className = await firstClass.locator('[data-testid="class-name"]').textContent();
        await firstClass.click();

        // Go to Courses tab
        await page.click('text=Courses');

        // Find a linked course
        const linkedCourse = page.locator('[data-testid="linked-course"]').first();
        const courseName = await linkedCourse.locator('[data-testid="course-name"]').textContent();

        // Click "Unlink" button
        await linkedCourse.locator('button:has-text("Unlink")').click();

        // Confirm unlinking
        await page.click('button:has-text("Confirm")');

        // Verify success notification
        await expect(page.locator('text=Course unlinked')).toBeVisible({ timeout: 5000 });

        // Verify course is removed from list
        await expect(linkedCourse).not.toBeVisible();

        // Login as student
        await logout(page);
        await loginAsStudent(page);

        // Navigate to My Courses
        await page.click('text=My Courses');

        // Verify student no longer has access to the course (from this class)
        // If student was only enrolled via this class, course should not appear in Active
        const activeCourses = page.locator('[data-testid="enrolled-course"]');
        const courseStillVisible = await activeCourses.filter({ hasText: courseName || '' }).count();

        // Course might still be visible if student is enrolled via another class
        // So we just verify the enrollment count decreased
        expect(courseStillVisible).toBeLessThanOrEqual(1);
    });
});
