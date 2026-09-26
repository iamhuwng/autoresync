import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerRoot = resolve(root, 'cloudflare');
const source = JSON.parse(await readFile(resolve(workerRoot, 'wrangler.notifications.jsonc'), 'utf8'));
const output = resolve(workerRoot, 'tmp', 'notification-recovery');
const originalMain = resolve(workerRoot, source.main).replaceAll('\\', '/');
const recoveryMain = resolve(output, 'notification-command-recovery.js').replaceAll('\\', '/');

assert.equal(source.name, 'luyentap-notification-command');
assert.deepEqual(source.durable_objects, {
  bindings: [{ name: 'NOTIFICATION_RETRY_EXECUTOR', class_name: 'NotificationRetryExecutor' }],
});
assert.deepEqual(source.migrations, [{
  tag: 'v1-notification-retry-executor', new_sqlite_classes: ['NotificationRetryExecutor'],
}]);

const paused = { ...source, main: originalMain, triggers: { ...source.triggers, crons: [] } };
const recovery = { ...paused, main: recoveryMain };
await mkdir(output, { recursive: true });
await writeFile(recoveryMain, `import notificationWorker, { NotificationRetryExecutor } from '../../notification-command-worker.js';
export { NotificationRetryExecutor };
export default { fetch: notificationWorker.fetch, scheduled() {} };
`);

for (const [name, config] of [['paused', paused], ['recovery', recovery]]) {
  const path = resolve(output, `wrangler.notifications.${name}.jsonc`);
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  const generated = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(Object.keys(generated), Object.keys(source));
  assert.deepEqual(generated, {
    ...source,
    main: name === 'paused' ? originalMain : recoveryMain,
    triggers: { ...source.triggers, crons: [] },
  });
  assert.deepEqual(generated.durable_objects, source.durable_objects);
  assert.deepEqual(generated.migrations, source.migrations);
}
console.log(`Prepared and checked notification recovery artifacts: ${output}`);
