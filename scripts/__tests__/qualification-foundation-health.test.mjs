import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('qualification health command is read-only and fail-closed for missing Worker bindings', async () => {
  const source = await readFile(new URL('../qualification-foundation-health.mjs', import.meta.url), 'utf8');
  assert.match(source, /read-only command failed/u);
  assert.match(source, /no non-production Worker endpoint bindings configured/u);
  assert.match(source, /identitytoolkit.googleapis.com/u);
  assert.doesNotMatch(source, /firebase deploy|database:set|database:remove|hosting:deploy/u);
});
