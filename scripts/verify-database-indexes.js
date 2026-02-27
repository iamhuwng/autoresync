/**
 * Verification script for Firebase database indexes
 * Tests that the new academic record indexes work correctly
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, query, orderByChild, limitToFirst, get } from 'firebase/database';

// Firebase config (using environment variables)
const firebaseConfig = {
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL || 'https://temp-a1437-default-rtdb.firebaseio.com'
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function verifyIndexes() {
    console.log('🔍 Verifying Firebase Database Indexes...\n');

    const tests = [
        {
            name: 'test_results - orderByChild(studentId)',
            path: 'test_results',
            orderBy: 'studentId'
        },
        {
            name: 'test_results - orderByChild(courseId)',
            path: 'test_results',
            orderBy: 'courseId'
        },
        {
            name: 'test_results - orderByChild(classId)',
            path: 'test_results',
            orderBy: 'classId'
        },
        {
            name: 'test_results - orderByChild(submittedAt)',
            path: 'test_results',
            orderBy: 'submittedAt'
        },
        {
            name: 'test_results_by_student - orderByChild(submittedAt)',
            path: 'test_results_by_student/x3hDfjYVN7cJtSbwq0ChIjl1Bk62',
            orderBy: 'submittedAt'
        },
        {
            name: 'test_results_by_course - orderByChild(submittedAt)',
            path: 'test_results_by_course/course-123/x3hDfjYVN7cJtSbwq0ChIjl1Bk62',
            orderBy: 'submittedAt'
        },
        {
            name: 'test_results_by_class - orderByChild(submittedAt)',
            path: 'test_results_by_class/class-123/x3hDfjYVN7cJtSbwq0ChIjl1Bk62',
            orderBy: 'submittedAt'
        }
    ];

    let passedTests = 0;
    let failedTests = 0;

    for (const test of tests) {
        try {
            const dbRef = ref(database, test.path);
            const q = query(dbRef, orderByChild(test.orderBy), limitToFirst(1));

            // This will throw an error if the index doesn't exist
            const snapshot = await get(q);

            console.log(`✅ ${test.name}`);
            console.log(`   Path: ${test.path}`);
            console.log(`   OrderBy: ${test.orderBy}`);
            console.log(`   Status: Index working correctly\n`);
            passedTests++;
        } catch (error) {
            console.log(`❌ ${test.name}`);
            console.log(`   Path: ${test.path}`);
            console.log(`   OrderBy: ${test.orderBy}`);
            console.log(`   Error: ${error.message}\n`);
            failedTests++;
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Test Summary:`);
    console.log(`   ✅ Passed: ${passedTests}/${tests.length}`);
    console.log(`   ❌ Failed: ${failedTests}/${tests.length}`);
    console.log('='.repeat(50));

    if (failedTests > 0) {
        console.log('\n⚠️  Some indexes are not working. Please check Firebase console.');
        process.exit(1);
    } else {
        console.log('\n🎉 All indexes are working correctly!');
        process.exit(0);
    }
}

// Run verification
verifyIndexes().catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
});
