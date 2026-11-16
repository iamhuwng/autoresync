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

test('qualification Worker config is isolated from production resources', async () => {
  const source = await readFile(new URL('../../cloudflare/wrangler.qualification.jsonc', import.meta.url), 'utf8');
  assert.match(source, /luyentap-qualification-upload-signer/u);
  assert.match(source, /luyentap-qualification-media/u);
  assert.match(source, /luyentap-qualification-listening-audio/u);
  assert.match(source, /luyentap-pdf-qa-20261021/u);
  assert.doesNotMatch(source, /kahoot-media|luyentap-listening-audio-private|name": "r2-upload-signer"/u);
});
