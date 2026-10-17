import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = path.join(repoRoot, 'cloudflare', 'tmp');
const configPath = path.join(tempDir, 'wrangler.local.book-source.jsonc');
const entryPath = path.join(tempDir, 'worker.local.js');
const varsPath = path.join(tempDir, '.dev.vars');
const localViteOrigin = process.env.LOCAL_VITE_ORIGIN || 'http://localhost:5173';

const localEntry = `import { createUploadWorker } from '../worker.js';

const decode = (segment) => JSON.parse(atob(segment.replace(/-/gu, '+').replace(/_/gu, '/') + '==='.slice((segment.length + 3) % 4)));
const localFirebaseVerifier = {
  async verifyAuthorizationHeader(header, env) {
    if (env.LOCAL_EMULATOR_AUTH !== 'true' || env.FIREBASE_PROJECT_ID !== 'demo-luyentap-local') return { valid: false };
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return { valid: false };
    try {
      const token = header.slice(7).trim();
      const [encodedHeader, encodedPayload] = token.split('.');
      const parsedHeader = decode(encodedHeader);
      const payload = decode(encodedPayload);
      const now = Math.floor(Date.now() / 1000);
      if (parsedHeader?.alg !== 'none' || payload?.aud !== env.FIREBASE_PROJECT_ID || payload?.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID || typeof payload.sub !== 'string' || !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= now) return { valid: false };
      return { valid: true, uid: payload.sub };
    } catch { return { valid: false }; }
  },
};
const worker = createUploadWorker({ firebaseVerifier: localFirebaseVerifier });
export default { fetch(request, env, ctx) { return worker.fetch(request, { ...env, UPLOAD_RATE_LIMITER: env.BOOK_ROUTE_RATE_LIMITER }, ctx); } };
export { UploadGrantReplayLedger } from '../src/upload-worker/upload-grant-replay-ledger.js';
`;

const localConfig = `{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "luyentap-book-source-local",
  "main": "worker.local.js",
  "compatibility_date": "2026-06-24",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "preview_urls": false,
  "r2_buckets": [{ "binding": "R2_BUCKET", "bucket_name": "local-book-covers" }],
  "durable_objects": { "bindings": [{ "name": "UPLOAD_GRANT_REPLAY_LEDGER", "class_name": "UploadGrantReplayLedger" }] },
  "migrations": [{ "tag": "local-v1", "new_sqlite_classes": ["UploadGrantReplayLedger"] }],
  "ratelimits": [{ "name": "BOOK_ROUTE_RATE_LIMITER", "namespace_id": "205512", "simple": { "limit": 30, "period": 60 } }],
  "vars": {
    "FIREBASE_PROJECT_ID": "demo-luyentap-local",
    "FIREBASE_DB_URL": "http://localhost:9000?ns=demo-luyentap-local",
    "LOCAL_EMULATOR_AUTH": "true",
    "BOOK_SOURCE_UPLOAD_ACCOUNT_ID": "book_b2_primary",
    "BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY": "book-source-worker-runtime@demo-luyentap-local.iam.gserviceaccount.com",
    "BOOK_SUBMISSION_ROUTES_ENABLED": "enabled",
    "BOOK_SUBMISSION_SERVICE_IDENTITY": "book-source-worker-runtime@demo-luyentap-local.iam.gserviceaccount.com",
    "BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN": ${JSON.stringify(localViteOrigin)},
    "BOOK_SOURCE_B2_PROVIDER_STATE": "enabled",
    "BOOK_SOURCE_B2_ENDPOINT": "https://s3.us-west-004.backblazeb2.com",
    "BOOK_SOURCE_B2_REGION": "us-west-004",
    "BOOK_SOURCE_B2_STORAGE_LOCATION_ID": "b2_book_primary",
    "BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME": "bookpdf",
    "BOOK_SOURCE_B2_OBJECT_KEY_PREFIX": "book-source/prd0062-preview-20260729/"
  },
  "secrets": { "required": [
    "FIREBASE_WEB_API_KEY", "BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY",
    "BOOK_SUBMISSION_GOOGLE_SA_KEY",
    "BOOK_SOURCE_B2_PRIVATE_BUCKET_ID", "BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID",
    "BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY", "BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID",
    "BOOK_SOURCE_B2_METADATA_APPLICATION_KEY", "BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID",
    "BOOK_SOURCE_B2_READ_APPLICATION_KEY"
  ]}
}`;

await mkdir(tempDir, { recursive: true });
await writeFile(entryPath, localEntry, 'utf8');
await writeFile(configPath, localConfig, 'utf8');
try {
  await access(varsPath);
} catch {
  console.error(`Missing ${varsPath}. Copy the reviewed local B2/Firebase secrets there; never commit it.`);
  process.exit(1);
}

const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'tooling-where.mjs'), '--exec', 'cloudflare-wrangler', 'dev', '--config', configPath, '--local', '--local-protocol', 'http', '--port', '8787'], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});
const stop = () => child.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
