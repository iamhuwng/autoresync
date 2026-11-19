import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { isQualificationChannelOrigin, readQualificationHostingBuild } from './release-evidence.mjs';
import { assertSpareBuildIdentity, spareIdentityFile, spareIdentityHeader, spareIdentityPath, spareSourceIdentity } from './spare-preview-identity.mjs';

export const spareBrowserOrigins = ['http://localhost:5173', 'http://localhost:5174'];

export async function readSparePreview({ cwd, origin, fetchImpl = fetch }) {
  if (!spareBrowserOrigins.includes(origin)) throw new Error('Use the teacher or student localhost preview origin.');
  const response = await fetchImpl(origin + spareIdentityPath, {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || response.headers.get(spareIdentityHeader) !== '1'
    || !response.headers.get('content-type')?.startsWith('application/json')) {
    throw new Error('Spare preview identity is unavailable. Rebuild and restart the preview from the candidate.');
  }
  const served = await response.text();
  const local = await readFile(spareIdentityFile(cwd), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('The candidate checkout has no spare build identity. Rebuild its spare preview.');
  });
  if (local !== served) throw new Error('Spare preview is serving a different build. Restart it from the candidate checkout.');
  const identity = JSON.parse(served);
  assertSpareBuildIdentity(identity, spareSourceIdentity(cwd));
  return { origin, observedAt: new Date().toISOString(), identity };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/release-spare-readback.mjs <localhost-role-origin-or-spare-channel-origin>');
    const origin = process.argv[2];
    const read = isQualificationChannelOrigin(origin) ? readQualificationHostingBuild : readSparePreview;
    console.log(JSON.stringify(await read({ cwd: process.cwd(), origin })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
