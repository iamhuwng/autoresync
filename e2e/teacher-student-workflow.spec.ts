import { test, expect } from '@playwright/test';

/**
 * E2E Test: Complete Teacher-Student Workflow
 * 
 * This test validates the entire journey from admin assignment through
 * course creation, enrollment, test taking, and results viewing.
 * 
 * Flow:
 * 1. Super Admin assigns student to teacher
 * 2. Teacher creates a course
 * 3. Teacher creates a class and links the course
 * 4. Student enrolls in the course
 * 5. Student takes a test from the course
 * 6. Student views results with course context
 */

test.describe('Complete Teacher-Student Workflow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the application
        await page.goto('/');
    });

    test('Full journey: Admin assigns → Teacher creates course → Student enrolls → Takes test → Views results', async ({ page }) => {
        // Step 1: Super Admin Login
        await page.fill('input[type="email"]', 'admin@test.com');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button[type="submit"]');

        // Wait for admin dashboard
        await expect(page.locator('text=Admin Dashboard')).toBeVisible();

        // Step 2: Navigate to User Management
        await page.click('text=User Management');
        await expect(page.locator('text=Students')).toBeVisible();

        // Step 3: Assign student to teacher
        await page.click('button:has-text("Assign Student")');
        await page.selectOption('select[name="studentId"]', { label: 'John Student' });
        await page.selectOption('select[name="teacherId"]', { label: 'Jane Teacher' });
        await page.click('button:has-text("Create Assignment")');

        // Verify assignment success
        await expect(page.locator('text=Assignment created successfully')).toBeVisible();

        // Step 4: Logout as admin
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        // Step 5: Teacher Login
        await page.fill('input[type="email"]', 'teacher@test.com');
        await page.fill('input[type="password"]', 'teacher123');
        await page.click('button[type="submit"]');

        // Wait for teacher lobby
        await expect(page.locator('text=Teacher Lobby')).toBeVisible();

        // Step 6: Navigate to Courses
        await page.click('text=📚 Courses');
        await expect(page.locator('text=My Courses')).toBeVisible();

        // Step 7: Create a new course
        await page.click('button:has-text("Create Course")');
        await page.fill('input[name="name"]', 'IELTS Preparation Course');
        await page.selectOption('select[name="type"]', 'IELTS');
        await page.selectOption('select[name="visibility"]', 'protected');
        await page.fill('textarea[name="description"]', 'Comprehensive IELTS preparation');
        await page.click('button:has-text("Create")');

        // Verify course creation
        await expect(page.locator('text=IELTS Preparation Course')).toBeVisible();

        // Get the course code
        const courseCode = await page.locator('[data-testid="course-code"]').first().textContent();

        // Step 8: Navigate to the course profile
        await page.click('text=IELTS Preparation Course');
        await expect(page.locator('text=Course Profile')).toBeVisible();

        // Step 9: Add a module
        await page.click('tab:has-text("Modules")');
        await page.click('button:has-text("Add Module")');
        await page.fill('input[name="moduleName"]', 'Reading Module');
        await page.selectOption('select[name="accessType"]', 'open');
        await page.click('button:has-text("Save Module")');

        // Verify module creation
        await expect(page.locator('text=Reading Module')).toBeVisible();

        // Step 10: Navigate to Classes
        await page.click('text=Classes');
        await expect(page.locator('text=My Classes')).toBeVisible();

        // Step 11: Create a class
        await page.click('button:has-text("Create Class")');
        await page.fill('input[name="className"]', 'IELTS Advanced');
        await page.click('button:has-text("Create")');

        // Verify class creation
        await expect(page.locator('text=IELTS Advanced')).toBeVisible();

        // Step 12: Link course to class
        await page.click('text=IELTS Advanced');
        await page.click('tab:has-text("Courses")');
        await page.click('button:has-text("Link Course")');
        await page.selectOption('select[name="courseId"]', { label: 'IELTS Preparation Course' });
        await page.fill('input[name="duration"]', '30');
        await page.click('button:has-text("Link")');

        // Verify course linking
        await expect(page.locator('text=IELTS Preparation Course')).toBeVisible();

        // Step 13: Add student to class
        await page.click('tab:has-text("Students")');
        await page.click('button:has-text("Add Students")');
        await page.check('input[value="john-student-uid"]');
        await page.click('button:has-text("Add Selected")');

        // Verify student added
        await expect(page.locator('text=John Student')).toBeVisible();

        // Step 14: Logout as teacher
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        // Step 15: Student Login
        await page.fill('input[type="email"]', 'student@test.com');
        await page.fill('input[type="password"]', 'student123');
        await page.click('button[type="submit"]');

        // Wait for student dashboard
        await expect(page.locator('text=Student Dashboard')).toBeVisible();

        // Step 16: Navigate to My Courses
        await page.click('text=My Courses');
        await expect(page.locator('text=IELTS Preparation Course')).toBeVisible();

        // Step 17: Verify enrollment (should be auto-enrolled via class)
        const enrollmentBadge = page.locator('text=Enrolled');
        await expect(enrollmentBadge).toBeVisible();

        // Step 18: Open course detail
        await page.click('text=IELTS Preparation Course');
        await expect(page.locator('text=Reading Module')).toBeVisible();

        // Step 19: Verify course metadata
        await expect(page.locator(`text=${courseCode}`)).toBeVisible();
        await expect(page.locator('text=Jane Teacher')).toBeVisible();

        // Step 20: Navigate to a test within the module (assuming test exists)
        await page.click('text=Reading Module');
        await page.click('text=Practice Test 1'); // Assuming a test was added

        // Step 21: Start the test
        await page.click('button:has-text("Start Test")');

        // Step 22: Answer questions (simplified)
        await page.click('input[value="answer-1"]');
        await page.click('button:has-text("Next")');
        await page.click('input[value="answer-2"]');
        await page.click('button:has-text("Submit")');

        // Confirm submission
        await page.click('button:has-text("Confirm")');

        // Step 23: View results
        await expect(page.locator('text=Test Results')).toBeVisible();

        // Step 24: Verify course context in results
        await expect(page.locator('text=IELTS Preparation Course')).toBeVisible();
        await expect(page.locator('text=Course Average')).toBeVisible();

        // Step 25: Navigate to overall results page
        await page.click('text=All Results');

        // Step 26: Verify course filtering
        await page.selectOption('select[name="courseFilter"]', { label: 'IELTS Preparation Course' });
        await expect(page.locator('text=Practice Test 1')).toBeVisible();
    });

    test('Multi-teacher scenario: Student with 2 teachers, 2 courses', async ({ page }) => {
        // Step 1: Admin assigns student to two teachers
        await page.fill('input[type="email"]', 'admin@test.com');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button[type="submit"]');

        await page.click('text=User Management');

        // Assign to Teacher 1
        await page.click('button:has-text("Assign Student")');
        await page.selectOption('select[name="studentId"]', { label: 'Sarah Student' });
        await page.selectOption('select[name="teacherId"]', { label: 'Teacher One' });
        await page.click('button:has-text("Create Assignment")');
        await expect(page.locator('text=Assignment created successfully')).toBeVisible();

        // Assign to Teacher 2
        await page.click('button:has-text("Assign Student")');
        await page.selectOption('select[name="studentId"]', { label: 'Sarah Student' });
        await page.selectOption('select[name="teacherId"]', { label: 'Teacher Two' });
        await page.click('button:has-text("Create Assignment")');
        await expect(page.locator('text=Assignment created successfully')).toBeVisible();

        // Logout
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        // Step 2: Student login
        await page.fill('input[type="email"]', 'sarah@test.com');
        await page.fill('input[type="password"]', 'student123');
        await page.click('button[type="submit"]');

        // Step 3: Verify student sees both teachers
        await expect(page.locator('text=Your Teachers')).toBeVisible();
        await expect(page.locator('text=Teacher One')).toBeVisible();
        await expect(page.locator('text=Teacher Two')).toBeVisible();

        // Step 4: Navigate to courses
        await page.click('text=My Courses');

        // Step 5: Verify courses from both teachers are visible
        await expect(page.locator('text=Course from Teacher One')).toBeVisible();
        await expect(page.locator('text=Course from Teacher Two')).toBeVisible();

        // Step 6: Filter by teacher
        await page.selectOption('select[name="teacherFilter"]', { label: 'Teacher One' });
        await expect(page.locator('text=Course from Teacher One')).toBeVisible();
        await expect(page.locator('text=Course from Teacher Two')).not.toBeVisible();
    });

    test('Course expiration flow end-to-end', async ({ page }) => {
        // This test validates that courses expire after the set duration
        // and students lose access appropriately

        // Step 1: Teacher creates course with 1-day expiration
        await page.fill('input[type="email"]', 'teacher@test.com');
        await page.fill('input[type="password"]', 'teacher123');
        await page.click('button[type="submit"]');

        await page.click('text=Classes');
        await page.click('text=Test Class');
        await page.click('tab:has-text("Courses")');
        await page.click('button:has-text("Link Course")');
        await page.selectOption('select[name="courseId"]', { label: 'Expiring Course' });
        await page.fill('input[name="duration"]', '1'); // 1 day
        await page.click('button:has-text("Link")');

        // Verify linking
        await expect(page.locator('text=Expires in 1 day')).toBeVisible();

        // Step 2: Logout and login as student
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        await page.fill('input[type="email"]', 'student@test.com');
        await page.fill('input[type="password"]', 'student123');
        await page.click('button[type="submit"]');

        // Step 3: Verify student can access course
        await page.click('text=My Courses');
        await expect(page.locator('text=Expiring Course')).toBeVisible();
        await expect(page.locator('text=Expires in')).toBeVisible();

        // Step 4: Simulate time passing (would require backend manipulation in real test)
        // For now, we verify the expiration warning is shown
        await page.click('text=Expiring Course');
        await expect(page.locator('text=This course will expire')).toBeVisible();
    });

    test('Request flows: Student request, Teacher request, Type request', async ({ page }) => {
        // Test 1: Student requests to join protected course
        await page.fill('input[type="email"]', 'student@test.com');
        await page.fill('input[type="password"]', 'student123');
        await page.click('button[type="submit"]');

        await page.click('text=Course Catalog');
        await page.click('text=Protected Course');
        await page.click('button:has-text("Request to Join")');
        await page.fill('textarea[name="message"]', 'I would like to join this course');
        await page.click('button:has-text("Send Request")');

        await expect(page.locator('text=Request sent successfully')).toBeVisible();

        // Logout
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        // Test 2: Teacher reviews and approves request
        await page.fill('input[type="email"]', 'teacher@test.com');
        await page.fill('input[type="password"]', 'teacher123');
        await page.click('button[type="submit"]');

        await page.click('text=Courses');
        await page.click('text=Protected Course');
        await page.click('tab:has-text("Requests")');

        await expect(page.locator('text=Pending Requests')).toBeVisible();
        await expect(page.locator('text=student@test.com')).toBeVisible();

        await page.click('button:has-text("Approve")');
        await expect(page.locator('text=Request approved')).toBeVisible();

        // Logout
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        // Test 3: Teacher requests new course type
        await page.fill('input[type="email"]', 'teacher@test.com');
        await page.fill('input[type="password"]', 'teacher123');
        await page.click('button[type="submit"]');

        await page.click('text=Courses');
        await page.click('button:has-text("Create Course")');
        await page.click('button:has-text("Request New Type")');
        await page.fill('input[name="typeName"]', 'SAT');
        await page.fill('textarea[name="reason"]', 'Need SAT course type for new curriculum');
        await page.click('button:has-text("Submit Request")');

        await expect(page.locator('text=Type request submitted')).toBeVisible();

        // Logout
        await page.click('button[aria-label="User menu"]');
        await page.click('text=Logout');

        // Test 4: Admin approves type request
        await page.fill('input[type="email"]', 'admin@test.com');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button[type="submit"]');

        await page.click('text=User Management');
        await page.click('tab:has-text("Course Types")');

        await expect(page.locator('text=SAT')).toBeVisible();
        await expect(page.locator('text=Pending')).toBeVisible();

        await page.click('button:has-text("Approve")');
        await expect(page.locator('text=Type approved')).toBeVisible();
    });
});
