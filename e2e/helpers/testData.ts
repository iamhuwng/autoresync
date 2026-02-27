/**
 * Test Data Helpers for E2E Tests
 * 
 * Provides consistent test data IDs and helper functions
 * for creating/managing test data in Firebase.
 */

/**
 * Test Result IDs used across E2E tests
 * These should be created in your Firebase test database
 */
export const TEST_RESULT_IDS = {
    // Basic test results
    basic: 'test-result-id-123',
    withFeedback: 'test-result-with-feedback-123',
    noFeedback: 'test-result-no-feedback-456',
    withOverallFeedback: 'test-result-with-overall-feedback-123',
    withLongFeedback: 'test-result-with-long-feedback-123',
    withMultilineFeedback: 'test-result-with-multiline-feedback-123',
    withAllFeedbackTypes: 'test-result-with-all-feedback-types-123',
    corruptedFeedback: 'test-result-corrupted-feedback-123',

    // Integration test results
    integration: 'integration-test-result-123',
    realtime: 'realtime-test-result-456',
    auth: 'auth-test-result-789',
    persistence: 'persistence-test-result-999',
    concurrent: 'concurrent-test-result-111',
    timing: 'timing-test-result-222',

    // Error handling test results
    network: 'network-test-result-333',
    longFeedback: 'long-feedback-test-444',
    specialChars: 'special-chars-test-555',
    unauthorized: 'unauthorized-result-id',
};

/**
 * Test User IDs
 */
export const TEST_USER_IDS = {
    teacher: 'test-teacher-001',
    teacher2: 'test-teacher-002',
    unauthorizedTeacher: 'test-teacher-unauthorized',
    student: 'test-student-001',
    student2: 'test-student-002',
};

/**
 * Test Course IDs
 */
export const TEST_COURSE_IDS = {
    english101: 'course-english-101',
    english102: 'course-english-102',
    math101: 'course-math-101',
};

/**
 * Test Class IDs
 */
export const TEST_CLASS_IDS = {
    classA: 'class-a-001',
    classB: 'class-b-002',
};

/**
 * Test Module IDs
 */
export const TEST_MODULE_IDS = {
    module1: 'module-001',
    module2: 'module-002',
    module3: 'module-003',
};

/**
 * Sample test result data structure
 */
export interface TestResultData {
    id: string;
    studentId: string;
    testId: string;
    testTitle: string;
    score: number;
    totalQuestions: number;
    submittedAt: number;
    courseId?: string;
    courseName?: string;
    classId?: string;
    className?: string;
    moduleId?: string;
    moduleName?: string;
    overallFeedback?: string;
    feedbackUpdatedAt?: number;
    feedbackUpdatedBy?: string;
    questions?: QuestionResultData[];
}

export interface QuestionResultData {
    questionNumber: number;
    question: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    teacherFeedback?: string;
}

/**
 * Generate sample test result
 */
export function createSampleTestResult(overrides: Partial<TestResultData> = {}): TestResultData {
    return {
        id: TEST_RESULT_IDS.basic,
        studentId: TEST_USER_IDS.student,
        testId: 'test-001',
        testTitle: 'Sample English Test',
        score: 80,
        totalQuestions: 10,
        submittedAt: Date.now() - 86400000, // 1 day ago
        courseId: TEST_COURSE_IDS.english101,
        courseName: 'English 101',
        classId: TEST_CLASS_IDS.classA,
        className: 'Class A',
        moduleId: TEST_MODULE_IDS.module1,
        moduleName: 'Module 1: Grammar Basics',
        questions: [
            {
                questionNumber: 1,
                question: 'What is the past tense of "go"?',
                studentAnswer: 'went',
                correctAnswer: 'went',
                isCorrect: true,
            },
            {
                questionNumber: 2,
                question: 'What is the plural of "child"?',
                studentAnswer: 'childs',
                correctAnswer: 'children',
                isCorrect: false,
            },
        ],
        ...overrides,
    };
}

/**
 * Generate test result with feedback
 */
export function createTestResultWithFeedback(): TestResultData {
    return createSampleTestResult({
        id: TEST_RESULT_IDS.withFeedback,
        overallFeedback: 'Great work overall! Keep practicing grammar rules.',
        feedbackUpdatedAt: Date.now() - 3600000, // 1 hour ago
        feedbackUpdatedBy: TEST_USER_IDS.teacher,
        questions: [
            {
                questionNumber: 1,
                question: 'What is the past tense of "go"?',
                studentAnswer: 'went',
                correctAnswer: 'went',
                isCorrect: true,
                teacherFeedback: 'Perfect! Well done.',
            },
            {
                questionNumber: 2,
                question: 'What is the plural of "child"?',
                studentAnswer: 'childs',
                correctAnswer: 'children',
                isCorrect: false,
                teacherFeedback: 'Remember: irregular plurals don\'t follow the standard -s/-es rule.',
            },
        ],
    });
}

/**
 * Generate multiple test results for a student
 */
export function createMultipleTestResults(count: number, studentId: string = TEST_USER_IDS.student): TestResultData[] {
    const results: TestResultData[] = [];

    for (let i = 0; i < count; i++) {
        results.push(
            createSampleTestResult({
                id: `test-result-${studentId}-${i}`,
                studentId,
                testTitle: `Test ${i + 1}`,
                score: Math.floor(Math.random() * 40) + 60, // Random score 60-100
                submittedAt: Date.now() - (i * 86400000), // Each day older
            })
        );
    }

    return results;
}

/**
 * Wait for element with retry
 */
export async function waitForElement(
    page: any,
    selector: string,
    options: { timeout?: number; visible?: boolean } = {}
): Promise<void> {
    const { timeout = 5000, visible = true } = options;

    if (visible) {
        await page.waitForSelector(selector, { state: 'visible', timeout });
    } else {
        await page.waitForSelector(selector, { timeout });
    }
}

/**
 * Get timestamp for relative time testing
 */
export function getRelativeTimestamp(daysAgo: number = 0, hoursAgo: number = 0, minutesAgo: number = 0): number {
    const now = Date.now();
    const offset = (daysAgo * 86400000) + (hoursAgo * 3600000) + (minutesAgo * 60000);
    return now - offset;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Generate long feedback text for testing
 */
export function generateLongFeedback(length: number = 5000): string {
    const baseText = 'This is a very detailed feedback comment that provides comprehensive analysis of the student\'s performance. ';
    return baseText.repeat(Math.ceil(length / baseText.length)).substring(0, length);
}

/**
 * Generate feedback with special characters
 */
export function generateSpecialCharsFeedback(): string {
    return 'Great work! 🎉 Consider reviewing: <script>alert("test")</script> & "quotes" \'apostrophes\' émojis 你好 مرحبا';
}

/**
 * Wait for Firebase operation to complete
 */
export async function waitForFirebaseOperation(delayMs: number = 1000): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
    return !!process.env.CI;
}

/**
 * Get test timeout based on environment
 */
export function getTestTimeout(): number {
    return isCI() ? 60000 : 30000; // 60s in CI, 30s locally
}
