import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, remove, set, update } from 'firebase/database';
import { qualificationDatabaseRules } from '../release-browser-gate.mjs';

const port = Number(process.env.FIREBASE_DATABASE_EMULATOR_PORT || 9000);
const environment = await initializeTestEnvironment({
  projectId: 'phase3-qualification-rules',
  database: { host: '127.0.0.1', port, rules: JSON.stringify(qualificationDatabaseRules) },
});

try {
  const database = environment.authenticatedContext('student-1').database();
  await assertSucceeds(set(ref(database, 'users/student-1'), { uid: 'student-1', role: 'student', status: 'active' }));
  await assertFails(update(ref(database, 'users/student-1'), { role: 'teacher' }));
  await assertSucceeds(remove(ref(database, 'users/student-1')));
  assert.ok(true, 'qualification role invariants passed');
} finally {
  await environment.cleanup();
}
