import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { relocateOidcCredentials } from '../relocate-oidc-credentials.mjs';

test('relocates workspace credentials, rewrites CLI environment and removes the source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'oidc-relocation-'));
  const workspace = path.join(root, 'workspace');
  const runnerTemp = path.join(root, 'runner-temp');
  const source = path.join(workspace, 'gha-creds.json');
  const target = path.join(runnerTemp, 'gha-creds.json');
  const githubEnv = path.join(root, 'github-env');
  await Promise.all([mkdir(workspace), mkdir(runnerTemp)]);
  await Promise.all([writeFile(source, '{"type":"external_account"}'), writeFile(githubEnv, '')]);
  try {
    await relocateOidcCredentials({ source, target, workspace, githubEnv });
    await assert.rejects(() => access(source), { code: 'ENOENT' });
    assert.equal(await readFile(target, 'utf8'), '{"type":"external_account"}');
    assert.match(await readFile(githubEnv, 'utf8'), new RegExp(`GOOGLE_APPLICATION_CREDENTIALS=${target.replaceAll('\\', '\\\\')}`));
    await assert.rejects(() => relocateOidcCredentials({ source: path.join(root, 'outside.json'), target, workspace, githubEnv }), /workspace/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
