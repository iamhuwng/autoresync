import assert from 'node:assert/strict';
import test from 'node:test';
import { spareDevelopmentEnv, spareFirebaseProject, spareMediaOrigin, spareUploadWorker } from '../spare-dev-config.mjs';

const spareBrowserConfig = {
  projectId: spareFirebaseProject,
  authDomain: `${spareFirebaseProject}.firebaseapp.com`,
  databaseURL: `https://${spareFirebaseProject}-default-rtdb.asia-southeast1.firebasedatabase.app`,
  storageBucket: `${spareFirebaseProject}.firebasestorage.app`,
  apiKey: 'fixture-key',
  appId: 'fixture-app',
  messagingSenderId: 'fixture-sender',
};

test('spare development replaces browser config and discards ambient Vite settings', () => {
  const env = spareDevelopmentEnv(spareBrowserConfig, {
    PATH: 'native',
    VITE_FIREBASE_PROJECT_ID: 'temp-a1437',
    vite_homework_notification_url: 'https://production.invalid',
    VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  });
  assert.equal(env.PATH, 'native');
  assert.equal(env.VITE_FIREBASE_PROJECT_ID, spareFirebaseProject);
  assert.equal(env.VITE_R2_UPLOAD_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_R2_PUBLIC_ORIGIN, spareMediaOrigin);
  assert.equal(env.vite_homework_notification_url, undefined);
  assert.equal(env.VITE_FIREBASE_AUTH_EMULATOR_HOST, undefined);
});

test('spare development refuses incomplete or mismatched Firebase metadata', () => {
  for (const override of [
    { projectId: 'temp-a1437' },
    { authDomain: 'kahut1.web.app' },
    { databaseURL: 'https://temp-a1437-default-rtdb.firebaseio.com' },
    { storageBucket: 'temp-a1437.appspot.com' },
    { appId: '' },
  ]) {
    assert.throws(() => spareDevelopmentEnv({ ...spareBrowserConfig, ...override }), /expected browser configuration/u);
  }
});
