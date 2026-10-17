import fs from 'node:fs';
import path from 'node:path';

if (process.argv.includes('--simulate-zero')) {
  process.stderr.write('No test files found\n');
  process.exit(1);
}
if (process.argv.includes('--simulate-startup')) {
  process.stderr.write('Unsupported platform: win32 arm64\n');
  process.exit(1);
}
if (process.argv.includes('--simulate-product')) {
  process.stderr.write('AssertionError: expected true\n');
  process.exit(1);
}
if (process.argv.includes('--simulate-timeout')) {
  setInterval(() => {}, 1000);
} else {

  process.stdout.write(`${JSON.stringify({
    marker: fs.readFileSync(path.join(process.cwd(), 'source-marker.txt'), 'utf8').trim(),
    arguments: process.argv.slice(2),
  })}\n`);
}
