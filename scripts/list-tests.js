/**
 * List all tests in Firebase - outputs to JSON file
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import { writeFileSync } from 'fs';

const firebaseConfig = {
    apiKey: "AIzaSyC7njFVpMEPUJFZZvbm6kNLUBOdhpNJ8BE",
    authDomain: "temp-a1437.firebaseapp.com",
    databaseURL: "https://temp-a1437-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "temp-a1437",
    storageBucket: "temp-a1437.firebasestorage.app",
    messagingSenderId: "587597924288",
    appId: "1:587597924288:web:9015df11ea8c89bc08ee80"
};

async function listTests() {
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);

    const allTestsRef = ref(database, 'tests');
    const snapshot = await get(allTestsRef);

    if (snapshot.exists()) {
        const tests = snapshot.val();
        const testList = Object.entries(tests).map(([id, test]) => ({
            id,
            title: test.title,
            type: test.type,
            skill: test.skill,
            questionCount: test.questionCount || test.questions?.length || 0,
            passageCount: test.passages?.length || 0,
            createdAt: test.createdAt
        }));

        writeFileSync('scripts/all-tests.json', JSON.stringify(testList, null, 2));
        console.log('SUCCESS');
    } else {
        writeFileSync('scripts/all-tests.json', '[]');
        console.log('NO_TESTS');
    }
    process.exit(0);
}

listTests().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
