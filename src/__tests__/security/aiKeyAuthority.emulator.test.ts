import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ai-key-authority',
    database: { rules: readFileSync(join(process.cwd(), 'database.rules.json'), 'utf8') },
    firestore: { rules: readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('users/admin/role').set('super_admin');
    await context.firestore().doc('settings/api_keys').set({ legacy: true });
  });
});

afterAll(async () => { await env?.cleanup(); });

it('prevents a signed-in user from creating or promoting their own admin role', async () => {
  const user = env.authenticatedContext('new-user').database();
  await assertFails(user.ref('users/new-user').set({ role: 'super_admin' }));
  await assertSucceeds(user.ref('users/new-user').set({ role: 'student' }));
  await assertFails(user.ref('users/new-user/role').set('super_admin'));
  await assertFails(user.ref('users/new-user').set({ role: 'super_admin' }));
  await assertSucceeds(env.authenticatedContext('admin').database().ref('users/new-user/role').set('super_admin'));
});

it('denies browser reads and writes of the retired Firestore key document', async () => {
  const firestore = env.authenticatedContext('admin').firestore();
  await assertFails(firestore.doc('settings/api_keys').get());
  await assertFails(firestore.doc('settings/api_keys').set({ legacy: false }));
  await env.withSecurityRulesDisabled(async (context) => {
    expect((await context.firestore().doc('settings/api_keys').get()).exists).toBe(true);
  });
});
