import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const maxRootEntryBytes = 500 * 1024;
const disallowedPreloadMarkers = [
  'mantine-vendor',
  'misc-vendor',
  'chart-vendor',
  'pdf-',
  'jspdf',
];

function fail(message) {
  console.error(`[bundle-budget] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(indexHtmlPath)) {
  fail(`Missing build output: ${indexHtmlPath}`);
  process.exit(process.exitCode ?? 1);
}

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const preloadMatches = [...indexHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? '');
const rootEntryMatch = indexHtml.match(/<script[^>]+src="([^"]*index-[^"]+\.js)"/);

if (!rootEntryMatch?.[1]) {
  fail('Could not find the root entry script in dist/index.html.');
  process.exit(process.exitCode ?? 1);
}

const rootEntryRelativePath = rootEntryMatch[1].replace(/^\//, '').replace(/\//g, path.sep);
const rootEntryPath = path.join(distDir, rootEntryRelativePath.replace(/^assets[\\/]/, `assets${path.sep}`));

if (!fs.existsSync(rootEntryPath)) {
  fail(`Root entry file not found: ${rootEntryPath}`);
  process.exit(process.exitCode ?? 1);
}

const rootEntrySize = fs.statSync(rootEntryPath).size;
if (rootEntrySize > maxRootEntryBytes) {
  fail(`Root entry bundle is ${Math.round(rootEntrySize / 1024)}KB, above the 500KB budget.`);
}

for (const marker of disallowedPreloadMarkers) {
  const offendingHref = preloadMatches.find((href) => href.includes(marker));
  if (offendingHref) {
    fail(`Public entry preloads disallowed chunk "${offendingHref}".`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `[bundle-budget] OK - root entry ${Math.round(rootEntrySize / 1024)}KB; public preloads are within budget.`
);
