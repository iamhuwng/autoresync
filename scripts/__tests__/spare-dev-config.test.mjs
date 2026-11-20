import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { spareDevelopmentEnv, spareFirebaseProject, spareMediaOrigin, spareUploadWorker } from '../spare-dev-config.mjs';
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
