import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { requiredProductionModes } from '../deploy-live.mjs';
import {
  spareBookSourceB2UploadOrigin,
  spareDevelopmentEnv,
  spareFeatureFlags,
  spareFirebaseProject,
  spareMediaOrigin,
  spareUploadWorker,
} from '../spare-dev-config.mjs';
import { allocateFreePort, parseSpareDevArgs, resolveSparePort, SPARE_AUTO_PORT_POOL } from '../spare-dev.mjs';
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

test('spare development replaces browser config, discards ambient Vite settings, and injects production feature flags', () => {
  const env = spareDevelopmentEnv(spareBrowserConfig, {
    PATH: 'native',
    VITE_FIREBASE_PROJECT_ID: 'temp-a1437',
    vite_homework_notification_url: 'https://production.invalid',
    VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
    VITE_READING_V2_ROLLOUT_MODE: 'off',
    VITE_MATERIAL_BOOKS: 'disabled',
    VITE_BOOK_ACTIVITY_CREATE_PRESENTATION: 'enabled',
  });
  assert.equal(env.PATH, 'native');
  assert.equal(env.VITE_FIREBASE_PROJECT_ID, spareFirebaseProject);
  assert.equal(env.VITE_R2_UPLOAD_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_R2_PUBLIC_ORIGIN, spareMediaOrigin);
  assert.equal(env.vite_homework_notification_url, undefined);
  assert.equal(env.VITE_FIREBASE_AUTH_EMULATOR_HOST, undefined);
  assert.deepEqual(spareFeatureFlags, {
    ...requiredProductionModes,
    VITE_BOOK_ACTIVITY_CREATE_PRESENTATION: 'enabled',
    VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION: 'enabled',
    VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION: 'enabled',
    VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION: 'enabled',
    VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'enabled',
    VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled',
    VITE_BOOK_COURSE_PLACEMENT_PRESENTATION: 'enabled',
  });
  for (const [key, value] of Object.entries(spareFeatureFlags)) {
    assert.equal(env[key], value, `${key} should match spare mode ${value}`);
  }
  for (const gate of [
    'VITE_BOOK_ACTIVITY_CREATE_PRESENTATION',
    'VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION',
    'VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION',
    'VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION',
    'VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION',
    'VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION',
    'VITE_BOOK_COURSE_PLACEMENT_PRESENTATION',
  ]) {
    assert.equal(requiredProductionModes[gate], 'enabled', `${gate} must be enabled for Book PDF V1 production rollout`);
  }
  assert.equal(env.VITE_READING_V2_ROLLOUT_MODE, 'public');
  assert.equal(env.VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY, 'opt-in');
  assert.equal(env.VITE_READING_PASSAGE_LIBRARY, 'enabled');
  assert.equal(env.VITE_READING_PASSAGE_HOMEWORK, 'enabled');
  assert.equal(env.VITE_MATERIAL_BOOKS, 'enabled');
  assert.equal(env.VITE_MATERIAL_BOOK_EDITOR, 'enabled');
  assert.equal(env.VITE_BOOK_ACTIVITY_CREATE_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_COURSE_PLACEMENT_PRESENTATION, 'enabled');
  assert.equal(env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_ASSEMBLY_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_DELIVERY_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_HOMEWORK_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_RUNTIME_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_RESULT_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_EVALUATION_WORKER_URL, spareUploadWorker);
  assert.equal(env.VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN, spareBookSourceB2UploadOrigin);
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

test('spare dev accepts whitelisted and auto ports while rejecting ports outside 5173-5182', async () => {
  assert.deepEqual(parseSpareDevArgs(['dev']), { operation: 'dev', portSpec: '5173' });
  assert.deepEqual(parseSpareDevArgs(['preview', '5174']), { operation: 'preview', portSpec: '5174' });
  assert.deepEqual(parseSpareDevArgs(['dev', '--port', '5182']), { operation: 'dev', portSpec: '5182' });
  assert.deepEqual(parseSpareDevArgs(['dev', '--port', 'auto']), { operation: 'dev', portSpec: 'auto' });
  assert.equal(await resolveSparePort('auto', async () => 5176), 5176);
  assert.equal(await resolveSparePort('5174'), 5174);
  for (const argv of [
    ['dev', '--port'],
    ['dev', '--port', '0'],
    ['dev', '--port', '05173'],
    ['dev', '--port', '5172'],
    ['dev', '--port', '5183'],
    ['dev', '--port', '3000'],
    ['dev', '--port', '43210'],
    ['dev', '--port', '65536'],
    ['dev', 'nope'],
    ['build', '--port', '5173'],
  ]) {
    assert.throws(() => parseSpareDevArgs(argv));
  }
  await assert.rejects(resolveSparePort('auto', async () => 43210), /5173-5182/u);
  for (const invalid of ['0', '05173', '5172', '5183', '3000', '43210', '65536']) {
    await assert.rejects(resolveSparePort(invalid), /5173-5182/u);
  }
});

test('spare dev allocates a free localhost port from the whitelisted 5173-5182 pool', async () => {
  const port = await allocateFreePort();
  assert.equal(SPARE_AUTO_PORT_POOL.includes(port), true);
});

test('spare dev skips an earlier whitelisted port occupied by a real listener', async t => {
  const available = [];
  for (const candidate of SPARE_AUTO_PORT_POOL) {
    const server = net.createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: 'localhost', port: candidate, exclusive: true }, resolve);
      });
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      available.push(candidate);
    } catch {
      server.close(() => {});
    }
    if (available.length >= 2) break;
  }
  if (available.length < 2) {
    t.skip('fewer than two ports are available in the whitelisted pool');
    return;
  }
  const [occupied, expected] = available;
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: 'localhost', port: occupied, exclusive: true }, resolve);
  });
  try {
    assert.equal(await allocateFreePort('localhost', { pool: [occupied, expected] }), expected);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('spare dev skips a whitelisted port occupied only on 127.0.0.1 or ::1 when probing localhost', async t => {
  const listenOn = async (host, port) => {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host, port, exclusive: true }, resolve);
    });
    return () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  let ipv6Supported = true;
  const available = [];
  for (const candidate of SPARE_AUTO_PORT_POOL) {
    try {
      const closeV4 = await listenOn('127.0.0.1', candidate);
      await closeV4();
      try {
        const closeV6 = await listenOn('::1', candidate);
        await closeV6();
      } catch (error) {
        if (error?.code === 'EADDRNOTAVAIL' || error?.code === 'EAFNOSUPPORT') {
          ipv6Supported = false;
        } else {
          throw error;
        }
      }
      available.push(candidate);
    } catch {
      // candidate occupied on one of the loopback families
    }
    if (available.length >= 2) break;
  }
  if (available.length < 2) {
    t.skip('fewer than two dual-stack loopback ports are available in the whitelisted pool');
    return;
  }
  const [occupied, expected] = available;
  const closeV4 = await listenOn('127.0.0.1', occupied);
  try {
    assert.equal(await allocateFreePort('localhost', { pool: [occupied, expected] }), expected);
  } finally {
    await closeV4();
  }
  if (ipv6Supported) {
    const closeV6 = await listenOn('::1', occupied);
    try {
      assert.equal(await allocateFreePort('localhost', { pool: [occupied, expected] }), expected);
    } finally {
      await closeV6();
    }
  }
});

test('spare dev reports when all whitelisted ports are occupied', async () => {
  await assert.rejects(
    allocateFreePort('localhost', { isPortFree: async () => false }),
    /whitelisted spare localhost ports \(5173-5182\) are occupied/u,
  );
});

test('spare readback accepts arbitrary valid localhost origins only', () => {
  for (const origin of ['http://localhost:1', 'http://localhost:5173', 'http://localhost:65535']) assert.equal(isLocalhostSpareOrigin(origin), true);
  for (const origin of ['http://127.0.0.1:5173', 'https://localhost:5173', 'http://localhost:5173/', 'http://localhost:5173/path', 'http://localhost:5173?x=1', 'http://localhost:0', 'http://localhost:05173', 'http://localhost:65536']) {
    assert.equal(isLocalhostSpareOrigin(origin), false);
  }
});
