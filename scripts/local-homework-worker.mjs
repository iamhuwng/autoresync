import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = path.join(repoRoot, 'r2-backup-worker', 'tmp');
const configPath = path.join(tempDir, 'wrangler.local-homework.jsonc');

const localConfig = `{
  "$schema": "../node_modules/wrangler/config-schema.json",
  "name": "luyentap-homework-local",
  "main": "../src/index.ts",
  "compatibility_date": "2026-06-24",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "preview_urls": false,
  "r2_buckets": [{ "binding": "PRIMARY_R2", "bucket_name": "local-homework-r2" }],
  "vars": {
    "FIREBASE_PROJECT_ID": "demo-luyentap-local",
    "FIREBASE_DB_URL": "http://localhost:9000?ns=demo-luyentap-local",
    "FIRESTORE_EMULATOR_HOST": "localhost:8080",
    "LOCAL_EMULATOR_AUTH": "true",
    "ADMIN_UID": "teacher",
    "BACKUP_RETENTION_COUNT": "10",
    "MEDIA_CHECKPOINT_INTERVAL": "6",
    "GOOGLE_SA_KEY": "",
    "DIAGNOSTIC_TOKEN": "local-diagnostic-token",
    "BACKUP_R2_ACCESS_KEY_ID": "local",
    "BACKUP_R2_SECRET_ACCESS_KEY": "local",
    "BACKUP_R2_BUCKET_NAME": "local",
    "BACKUP_R2_ENDPOINT": "http://localhost:8788"
  }
}`;

await mkdir(tempDir, { recursive: true });
await writeFile(configPath, localConfig, 'utf8');

const child = spawn(process.execPath, [
  path.join(repoRoot, 'scripts', 'tooling-where.mjs'),
  '--exec',
  'r2-wrangler',
  'dev',
  '--config',
  configPath,
  '--local',
  '--local-protocol',
  'http',
  '--port',
  '8788',
], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

const stop = () => child.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
