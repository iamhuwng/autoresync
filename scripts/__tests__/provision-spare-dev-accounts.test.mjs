import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProvisionArgs, provisionSpareDevAccounts, SPARE_DEV_ACCOUNTS } from '../provision-spare-dev-accounts.mjs';
import { spareFirebaseProject } from '../spare-dev-config.mjs';

test('Dev Quick Login provisioning hard-refuses production and unknown projects', () => {
  assert.equal(parseProvisionArgs([]).project, spareFirebaseProject);
  assert.throws(() => parseProvisionArgs(['--project', 'temp-a1437']), /Refusing Dev Quick Login provisioning target/u);
  assert.throws(() => parseProvisionArgs(['--project', 'demo-luyentap-local']), /Refusing Dev Quick Login provisioning target/u);
});

test('Dev Quick Login provisioning updates only the two spare accounts and profiles', async () => {
  const calls = [];
  const result = await provisionSpareDevAccounts({}, {
    getAccessToken: async () => 'test-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options: { ...options, headers: { ...options.headers } } });
      return new Response('{}', { status: 200 });
    },
  });
  assert.equal(result.accounts.length, 2);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.filter(call => call.options.method === 'POST').map(call => JSON.parse(call.options.body).localId), SPARE_DEV_ACCOUNTS.map(account => account.uid));
  assert.ok(calls.filter(call => call.options.method === 'PATCH').every(call => call.url.includes(`${spareFirebaseProject}-default-rtdb`)));
  assert.ok(calls.every(call => call.options.headers['x-goog-user-project'] === spareFirebaseProject));
});
