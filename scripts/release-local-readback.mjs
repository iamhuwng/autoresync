import { readLocalProductionBuild } from './release-evidence.mjs';

const [localOrigin, ...extra] = process.argv.slice(2);
try {
  if (!localOrigin || extra.length) throw new Error('Usage: node scripts/release-local-readback.mjs http://localhost:<port>');
  console.log(JSON.stringify(await readLocalProductionBuild({ cwd: process.cwd(), localOrigin }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
