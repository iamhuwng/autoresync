import { access, appendFile } from 'node:fs/promises';

const inputPath = process.env.INPUT_PATH;
const statePath = process.env.GITHUB_STATE;
const stateKey = 'oidc_path';

if (process.env.STATE_oidc_path !== undefined) {
  try {
    await access(process.env.STATE_oidc_path);
    console.error('Relocated OIDC credential file still exists after auth post-job cleanup.');
    process.exitCode = 1;
  } catch (error) {
    if (error?.code !== 'ENOENT') { console.error(error.message); process.exitCode = 1; }
  }
} else if (inputPath && statePath) {
  await appendFile(statePath, `${stateKey}=${inputPath}\n`);
}
