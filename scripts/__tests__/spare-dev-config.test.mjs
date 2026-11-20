import assert from 'node:assert/strict';
import test from 'node:test';
import { spareDevelopmentEnv, spareFirebaseProject, spareMediaOrigin, spareUploadWorker } from '../spare-dev-config.mjs';
import { allocateFreePort, parseSpareDevArgs, resolveSparePort } from '../spare-dev.mjs';
import { isLocalhostSpareOrigin } from '../release-spare-readback.mjs';

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

test('spare dev accepts explicit, default, and auto ports while rejecting invalid forms', async () => {
  assert.deepEqual(parseSpareDevArgs(['dev']), { operation: 'dev', portSpec: '5173' });
  assert.deepEqual(parseSpareDevArgs(['preview', '5174']), { operation: 'preview', portSpec: '5174' });
  assert.deepEqual(parseSpareDevArgs(['dev', '--port', 'auto']), { operation: 'dev', portSpec: 'auto' });
  assert.equal(await resolveSparePort('auto', async () => 43210), 43210);
  assert.equal(await resolveSparePort('5174'), 5174);
  for (const argv of [['dev', '--port'], ['dev', '--port', '0'], ['dev', '--port', '05173'], ['dev', '--port', '65536'], ['dev', 'nope'], ['build', '--port', '5173']]) {
    assert.throws(() => parseSpareDevArgs(argv));
  }
  await assert.rejects(resolveSparePort('0'), /1 to 65535/u);
  await assert.rejects(resolveSparePort('05173'), /1 to 65535/u);
});

test('spare dev allocates an ephemeral free localhost port', async () => {
  const port = await allocateFreePort();
  assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535);
});

test('spare readback accepts arbitrary valid localhost origins only', () => {
  for (const origin of ['http://localhost:1', 'http://localhost:5173', 'http://localhost:65535']) assert.equal(isLocalhostSpareOrigin(origin), true);
  for (const origin of ['http://127.0.0.1:5173', 'https://localhost:5173', 'http://localhost:5173/', 'http://localhost:5173/path', 'http://localhost:5173?x=1', 'http://localhost:0', 'http://localhost:05173', 'http://localhost:65536']) {
    assert.equal(isLocalhostSpareOrigin(origin), false);
  }
});
