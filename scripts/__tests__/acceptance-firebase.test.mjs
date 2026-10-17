import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptanceFirebaseBoundary } from '../../src/services/acceptanceFirebaseBoundary.mjs';

const safe = {
  MODE: 'acceptance', VITE_FIREBASE_ACCEPTANCE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-luyentap-acceptance',
  VITE_FIREBASE_DATABASE_URL: 'http://localhost:19000?ns=demo-luyentap-acceptance',
  VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:19099',
  VITE_FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:19000',
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: 'localhost:19080',
  VITE_R2_UPLOAD_WORKER_URL: 'http://localhost:19087',
};
test('acceptance requires complete disposable Firebase isolation', () => {
  assert.deepEqual(acceptanceFirebaseBoundary(safe), { AUTH:19099, DATABASE:19000, FIRESTORE:19080 });
  for (const key of Object.keys(safe).filter(key => key !== 'MODE')) {
    assert.throws(() => acceptanceFirebaseBoundary({ ...safe, [key]: '' }));
  }
  assert.throws(() => acceptanceFirebaseBoundary({ ...safe, VITE_FIREBASE_PROJECT_ID:'temp-a1437' }));
});
test('acceptance rejects provider endpoints but production is unaffected', () => {
  assert.throws(() => acceptanceFirebaseBoundary({ ...safe, VITE_BOOK_SOURCE_CONTROL_WORKER_URL:'https://live.workers.dev' }));
  assert.throws(() => acceptanceFirebaseBoundary({ ...safe, VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN:'https://s3.example.com' }));
  assert.equal(acceptanceFirebaseBoundary({ ...safe, MODE:'production' }), null);
});
