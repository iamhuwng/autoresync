/**
 * Fetch specific test: test-1770275660747-cuau3w4
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

const TEST_ID = 'test-1770275660747-cuau3w4';

async function fetchTest() {
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);

    const testRef = ref(database, `tests/${TEST_ID}`);
    const snapshot = await get(testRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        writeFileSync('documentation/fetched-test.json', JSON.stringify(data, null, 2), 'utf8');
        console.log('DONE');
    } else {
        console.log('NOT_FOUND');
    }
    process.exit(0);
}

fetchTest().catch(e => { console.error(e.message); process.exit(1); });
