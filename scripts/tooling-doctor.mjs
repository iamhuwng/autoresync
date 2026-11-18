import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = `${process.version} ${process.platform}/${process.arch}`;
console.log(`LuyenTap tooling doctor: ${runtime} (${process.execPath})`);

const packages = [
  ['root', 'node_modules', ['vite', 'vitest', '@playwright/test', 'firebase-tools']],
  ['Cloudflare', 'cloudflare/node_modules', ['wrangler', 'vitest']],
  ['R2 backup', 'r2-backup-worker/node_modules', ['wrangler', 'vitest']],
];

for (const [label, directory, tools] of packages) {
  const missing = tools.filter(tool => !existsSync(path.join(root, directory, tool, 'package.json')));
  if (missing.length > 0) {
    console.log(`[missing] ${label}: ${missing.join(', ')}`);
    if (label === 'root' || process.argv.includes('--workers')) process.exitCode = 1;
  } else console.log(`[ok] ${label}: ${tools.join(', ')}`);
}
