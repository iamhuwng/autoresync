/**
 * Fetch Test Data Script
 * 
 * Usage: node scripts/fetch-test-data.js <testId>
 * Example: node scripts/fetch-test-data.js test-1738745123456-abc123
 * 
 * This script fetches test data from Firebase and outputs it as JSON
 * for parser accuracy analysis.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase config from your project
const firebaseConfig = {
    apiKey: "AIzaSyC7njFVpMEPUJFZZvbm6kNLUBOdhpNJ8BE",
    authDomain: "temp-a1437.firebaseapp.com",
    databaseURL: "https://temp-a1437-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "temp-a1437",
    storageBucket: "temp-a1437.firebasestorage.app",
    messagingSenderId: "587597924288",
    appId: "1:587597924288:web:9015df11ea8c89bc08ee80"
};

async function fetchTestData(testId) {
    console.log(`🔍 Fetching test data for: ${testId}`);

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);

    try {
        // Fetch the test
        const testRef = ref(database, `tests/${testId}`);
        const snapshot = await get(testRef);

        if (!snapshot.exists()) {
            console.error(`❌ Test not found: ${testId}`);
            console.log('\nAvailable tests:');

            // List all test IDs
            const allTestsRef = ref(database, 'tests');
            const allSnapshot = await get(allTestsRef);
            if (allSnapshot.exists()) {
                const tests = allSnapshot.val();
                Object.keys(tests).forEach(id => {
                    console.log(`  - ${id}: ${tests[id].title}`);
                });
            }
            process.exit(1);
        }

        const testData = snapshot.val();

        console.log('\n✅ Test found!');
        console.log('═'.repeat(60));
        console.log(`Title: ${testData.title}`);
        console.log(`Type: ${testData.type}`);
        console.log(`Skill: ${testData.skill}`);
        console.log(`Questions: ${testData.questionCount || testData.questions?.length || 0}`);
        console.log(`Passages: ${testData.passages?.length || 0}`);
        console.log(`Created: ${new Date(testData.createdAt).toLocaleString()}`);
        console.log('═'.repeat(60));

        // Save to file for analysis
        const outputPath = join(__dirname, `../documentation/test-data-${testId}.json`);
        writeFileSync(outputPath, JSON.stringify(testData, null, 2));
        console.log(`\n📄 Full test data saved to: ${outputPath}`);

        // Print question summary
        console.log('\n📋 Question Summary:');
        if (testData.questions) {
            testData.questions.forEach((q, i) => {
                const answer = typeof q.answer === 'object'
                    ? JSON.stringify(q.answer)
                    : q.answer;
                console.log(`  Q${q.number || i + 1} [${q.type}]: ${q.question?.substring(0, 50)}... → ${answer}`);
            });
        }

        // Print passage summary
        if (testData.passages && testData.passages.length > 0) {
            console.log('\n📖 Passage Summary:');
            testData.passages.forEach((p, i) => {
                console.log(`  Passage ${i + 1}: "${p.title}" (${p.wordCount} words, Q${p.questionStart}-${p.questionEnd})`);
            });
        }

        return testData;

    } catch (error) {
        console.error('❌ Error fetching test:', error.message);
        process.exit(1);
    }
}

// Main
const testId = process.argv[2];
if (!testId) {
    console.log('Usage: node scripts/fetch-test-data.js <testId>');
    console.log('Example: node scripts/fetch-test-data.js test-1738745123456-abc123');

    // List all available tests
    console.log('\nFetching available tests...');

    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);
    const allTestsRef = ref(database, 'tests');

    get(allTestsRef).then(snapshot => {
        if (snapshot.exists()) {
            const tests = snapshot.val();
            console.log('\n📚 Available Tests:');
            Object.entries(tests).forEach(([id, test]) => {
                console.log(`  ${id}`);
                console.log(`    └─ ${test.title} (${test.type} ${test.skill}, ${test.questionCount || test.questions?.length || 0} questions)`);
            });
        } else {
            console.log('No tests found in database.');
        }
        process.exit(0);
    });
} else {
    fetchTestData(testId).then(() => process.exit(0));
}
