import { access, copyFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export async function relocateOidcCredentials({ source, target, workspace, githubEnv }) {
  if (!source || !target || !workspace || !githubEnv) throw new Error('OIDC credential relocation requires source, target, workspace and GITHUB_ENV paths');
  if (!inside(workspace, source)) throw new Error('Google authentication action did not create its credential file in the workspace');
  await access(source);
  if (!(await stat(source)).isFile()) throw new Error('Google authentication credential path is not a file');
  await copyFile(source, target);
  await rm(source, { force: false });
  await access(target);
  try { await access(source); throw new Error('workspace credential file still exists after relocation'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await writeFile(githubEnv, `GOOGLE_APPLICATION_CREDENTIALS=${target}\nCLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE=${target}\nGOOGLE_GHA_CREDS_PATH=${target}\n`, { flag: 'a' });
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await relocateOidcCredentials({ source: process.env.GOOGLE_APPLICATION_CREDENTIALS, target: path.join(process.env.RUNNER_TEMP || '', 'gha-creds.json'), workspace: process.env.GITHUB_WORKSPACE, githubEnv: process.env.GITHUB_ENV });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
