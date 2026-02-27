# Tasks: PRD-0026 — Backup & Disaster Recovery System

> **PRD:** `documentation/tasks/0026-prd-backup-disaster-recovery-system.md`
> **Generated:** 2026-02-25

---

## Relevant Files

### Worker Project (NEW — separate codebase inside `kahoot/` at project root level, NOT inside `src/`)
- `r2-backup-worker/wrangler.toml` — Worker config: cron trigger, R2 binding, env vars, secrets
- `r2-backup-worker/package.json` — Dependencies: `wrangler`, `@aws-sdk/client-s3`, `jose`
- `r2-backup-worker/tsconfig.json` — TypeScript config for Worker
- `r2-backup-worker/src/index.ts` — Entry point: HTTP router + `scheduled()` cron handler
- `r2-backup-worker/src/auth/firebase-auth.ts` — Firebase ID token verification + `super_admin` claim check
- `r2-backup-worker/src/auth/google-oauth.ts` — Service Account JSON → JWT → OAuth2 access token minting
- `r2-backup-worker/src/backup/data-backup.ts` — Core: read RTDB nodes + Firestore → build ZIP → upload to backup R2
- `r2-backup-worker/src/backup/firestore-budget.ts` — Adaptive read budget check (§4.2.1 algorithm)
- `r2-backup-worker/src/backup/media-delta.ts` — Compare R2 file list vs last media manifest → Worker-proxied download URLs
- `r2-backup-worker/src/backup/backup-lock.ts` — Create/check/release `backup_lock.json` in backup R2
- `r2-backup-worker/src/backup/retention.ts` — Prune stale entries from `backup_history.json`
- `r2-backup-worker/src/restore/restore-preview.ts` — Generate diff: backup entities vs live entities
- `r2-backup-worker/src/restore/restore-execute.ts` — Ordered writes, pre-restore snapshot, progress tracking
- `r2-backup-worker/src/restore/firestore-merge.ts` — Find closest backup with Firestore, merge data
- `r2-backup-worker/src/restore/gdpr-filter.ts` — Exclude `deleted_users/` where `status === 'completed'`
- `r2-backup-worker/src/utils/r2-client.ts` — S3-compatible client for backup R2 bucket
- `r2-backup-worker/src/utils/zip.ts` — Streaming ZIP builder (memory-efficient)
- `r2-backup-worker/src/utils/manifest.ts` — Build manifest.json and media_manifest.json
- `r2-backup-worker/src/types.ts` — All TS types: manifest, media manifest, backup state, etc.

### Main App (modifications)
- `src/services/backupService.ts` — **NEW** — Wraps all Worker API calls
- `src/pages/AdminBackupPage.tsx` — **NEW** — Full backup UI page
- `src/pages/AdminBackupPage.css` — **NEW** — Styles
- `src/components/navigation/AdminSidebar.tsx` — **MODIFY** — Add "Backup" nav item
- `src/App.jsx` — **MODIFY** — Add `/admin/backup` route
- `src/services/notificationService.ts` — **MODIFY** — Add restore flag check
- `src/services/badgeService.ts` — **MODIFY** — Add restore flag check
- `src/services/studentStreakService.ts` — **MODIFY** — Add restore flag check
- `src/services/homeworkManager.ts` — **MODIFY** — Add restore flag check
- `src/hooks/useNavigation.ts` — **MODIFY** — Add `ADMIN_BACKUP` route mapping
- `src/config/routeSecurity.ts` — **CREATE** — Route security config (this file does NOT exist yet — must be created from scratch)

### Notes
- Worker project is a **separate codebase** inside the `kahoot/` repository root at `kahoot/r2-backup-worker/`, NOT inside `src/`. It has its own `package.json`, `tsconfig.json`, and `wrangler.toml`.
- Main app needs **zero new npm packages** — `backupService.ts` uses only `fetch()` + existing Firebase auth. Media downloads use native browser APIs (File System Access or `<a download>` tags).
- Worker uses `npx wrangler dev` locally and `npx wrangler deploy` for production.

---

## Tasks

- [x] 1.0 Infrastructure Setup: Worker Project Scaffolding, Types, and Authentication
  - [x] 1.1 Create the `r2-backup-worker/` directory **inside the `kahoot/` project root** (i.e., at `kahoot/r2-backup-worker/`, a sibling to `kahoot/src/` and `kahoot/package.json`). Run `cd r2-backup-worker && npm init -y` inside it. Install dependencies: `npm install wrangler @aws-sdk/client-s3 @aws-sdk/s3-request-presigner jose fflate typescript @cloudflare/workers-types --save-dev`. Create a `tsconfig.json` with `"target": "ES2022"`, `"module": "ES2022"`, `"moduleResolution": "bundler"`, `"types": ["@cloudflare/workers-types"]`, `"strict": true`. Add `r2-backup-worker/node_modules/` to the root `.gitignore` if not already covered by a global pattern.
  - [x] 1.2 Create `wrangler.toml` exactly as specified in PRD §7.1.1. Copy the full content including: `name = "r2-backup-worker"`, `main = "src/index.ts"`, `compatibility_date = "2024-01-01"`, cron trigger `[triggers] crons = ["0 3 * * 1"]`, R2 bucket binding `[[r2_buckets]] binding = "PRIMARY_R2" bucket_name = "kahoot-media"`, and all `[vars]` entries (`FIREBASE_PROJECT_ID`, `FIREBASE_DB_URL`, `BACKUP_RETENTION_COUNT = 10`, `MEDIA_CHECKPOINT_INTERVAL = 6`). Add comments listing the 5 secrets to be set via `wrangler secret put`.
  - [x] 1.3 Create `src/types.ts` with ALL TypeScript interfaces from the PRD. This file is the single source of truth for all data shapes. Define ALL of the following with exact fields:
    - `BackupManifest`: `version: string`, `backupId: string`, `type: 'data'`, `trigger: 'auto' | 'manual'`, `createdAt: string`, `completedAt: string`, `durationMs: number`, `status: 'complete' | 'partial' | 'failed'`, `includesFirestore: boolean`, `firestoreSkipReason: string | null`, `firestoreCollectionsIncluded: string[]`, `includesMedia: false` (always false for data backups), `workerVersion: string`, `firebaseProject: string`, `sparkPlanUsage: { rtdbBytesRead: number, firestoreDocsRead: number }`, `entityCounts: { rtdb: Record<string,number>, firestore: Record<string,number> }`, `totalSizeBytes: number`, `checksums: Record<string,string>`, `previousBackupId: string | null`, `encryptionKeyVersion: string | null`
    - `MediaManifest` (§4.6): `version: string`, `generatedAt: string`, `backupId: string`, `mediaFiles: MediaFileEntry[]`, `totalFiles: number`, `totalSizeBytes: number`, `categories: { audio: { count: number, sizeBytes: number }, images: { count: number, sizeBytes: number }, avatars: { count: number, sizeBytes: number } }`
    - `MediaFileEntry`: `url: string`, `key: string`, `type: 'audio' | 'image' | 'avatar'`, `sizeBytes: number`, `referencedBy: string[]`
    - `MediaBackupManifest` (§4.7): `version: string`, `mediaBackupId: string`, `type: 'full' | 'delta'`, `sequenceNumber: number`, `createdAt: string`, `baseBackupId: string`, `previousBackupId: string | null`, `chainLength: number`, `isCheckpoint: boolean`, `files: MediaBackupFileEntry[]`, `totalFiles: number`, `totalSizeBytes: number`
    - `MediaBackupFileEntry`: `key: string`, `sizeBytes: number`, `lastModified: string`, `downloadUrl?: string`
    - `BackupState`: `firestoreReadsToday: number`, `lastResetDate: string`, `mediaChain: { lastBackupId: string | null, sequenceNumber: number, baseBackupId: string | null, chainLength: number }`, `lastBackupTimestamp: string | null`
    - `BackupHistoryEntry`: `backupId: string`, `type: 'data'`, `trigger: 'auto' | 'manual'`, `createdAt: string`, `status: 'complete' | 'partial' | 'failed'`, `includesFirestore: boolean`, `totalSizeBytes: number`, `entityCounts: { rtdb: Record<string,number>, firestore: Record<string,number> }`, `firestoreSkipReason: string | null`
    - `BackupLock`: `backupId: string`, `createdAt: string`, `type: string`, `released?: boolean`, `releasedAt?: string`
    - `RestoreProgress`: `restoreId: string`, `backupId: string`, `phase: 'snapshot' | 'reading' | 'restoring_rtdb' | 'restoring_firestore' | 'validating' | 'complete' | 'failed'`, `progress: number` (0-100), `currentEntity: string`, `entitiesRestored: number`, `entitiesSkipped: number`, `entitiesFailed: number`, `totalEntities: number`, `startedAt: string`, `completedAt?: string`, `error?: string`
    - `RestorePreview`: `backupId: string`, `backupDate: string`, `categories: RestorePreviewCategory[]`, `includesFirestore: boolean`, `firestoreMergeAvailable: { available: boolean, fromBackupId?: string, fromDate?: string }`, `gdprExcludedCount: number`, `warnings: string[]`
    - `RestorePreviewCategory`: `name: string`, `backupCount: number`, `currentCount: number`, `difference: number`, `status: 'match' | 'missing' | 'extra' | 'merged'`
    - `WorkerEnv`: `PRIMARY_R2: R2Bucket`, `FIREBASE_PROJECT_ID: string`, `FIREBASE_DB_URL: string`, `BACKUP_RETENTION_COUNT: string`, `MEDIA_CHECKPOINT_INTERVAL: string`, `GOOGLE_SA_KEY: string`, `BACKUP_R2_ACCESS_KEY_ID: string`, `BACKUP_R2_SECRET_ACCESS_KEY: string`, `BACKUP_R2_BUCKET_NAME: string`, `BACKUP_R2_ENDPOINT: string`, `ADMIN_UID: string`
  - [x] 1.4 Create `src/auth/google-oauth.ts`. This module exports `async function getFirebaseAccessToken(saKeyJson: string): Promise<string>`. Implementation: (1) Parse the SA JSON to extract `client_email` and `private_key`. (2) Create a JWT with claims `iss: client_email`, `sub: client_email`, `aud: "https://oauth2.googleapis.com/token"`, `iat: now`, `exp: now + 3600`, `scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/datastore"`. (3) Sign the JWT using `jose` library's `SignJWT` with RS256 and the private key imported via `importPKCS8`. (4) POST the signed JWT to `https://oauth2.googleapis.com/token` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<JWT>`. (5) Return the `access_token` from the response. Also export a `TokenCache` class that caches the token and refreshes if remaining validity < 5 minutes (PRD §4.8.1). The `TokenCache` implementation: store the token string and its `expiresAt` timestamp (Unix ms) as module-level variables. `getToken()` method checks `if (Date.now() > expiresAt - 5 * 60 * 1000)` → call `getFirebaseAccessToken()` to mint a fresh token, update `cachedToken` and `expiresAt = Date.now() + 3600 * 1000`. Otherwise return `cachedToken`. The `expiresAt` is derived from the OAuth2 response's `expires_in` field (seconds): `expiresAt = Date.now() + response.expires_in * 1000`.
  - [x] 1.5 Create `src/auth/firebase-auth.ts`. This module exports `async function verifyAdminToken(authHeader: string | null, env: WorkerEnv): Promise<{ valid: boolean; uid?: string; error?: string }>`. Implementation: (1) Extract Bearer token from the `Authorization` header (strip `Bearer ` prefix). If missing or empty, return `{ valid: false, error: 'Missing Authorization header' }`. (2) Create a JWK key set using **`jose.createRemoteJWKSet()`** — this is dramatically simpler than manually parsing x509 certificates. Use the **JWK endpoint** (NOT the x509 endpoint): `const JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))`. **⚠️ DO NOT use** the x509 cert endpoint (`/metadata/x509/...`) — parsing x509 to CryptoKey in a Worker is extremely complex. The JWK endpoint returns keys in a format `jose` understands natively. (3) Verify the JWT: `const { payload } = await jose.jwtVerify(token, JWKS, { issuer: \`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}\`, audience: env.FIREBASE_PROJECT_ID })`. This single call handles signature verification, `kid` matching, `iss`, `aud`, and `exp` checks automatically. (4) Read the `role` custom claim from `payload` — Firebase custom claims are at the top level of the JWT payload, so access `payload.role`. (5) If `payload.role !== 'super_admin'` → return `{ valid: false, error: 'Forbidden: super_admin required' }`. (6) Return `{ valid: true, uid: payload.sub }`. Wrap entire function in try-catch — any `jose` verification error (expired, bad signature, etc.) should return `{ valid: false, error: err.message }`.
  - [x] 1.6 Create `src/utils/r2-client.ts`. This module exports a class `BackupR2Client` that wraps `@aws-sdk/client-s3`. Constructor takes `accessKeyId`, `secretAccessKey`, `endpoint`, `bucketName` from env. Methods: `putObject(key: string, body: Uint8Array | string, contentType?: string)`, `getObject(key: string): Promise<Uint8Array | null>`, `getObjectAsJson<T>(key: string): Promise<T | null>`, `listObjects(prefix: string): Promise<{ key: string, size: number, lastModified: Date }[]>`, `headObject(key: string): Promise<{ exists: boolean, size?: number }>`. NOTE: This client has NO `deleteObject` method — deletion is handled by R2 lifecycle rules (PRD §4.8.2, §4.11).
  - [x] 1.7 Create `src/index.ts` — the Worker entry point. Export a `default` object with `fetch(request, env, ctx)` and `scheduled(event, env, ctx)` handlers. The `fetch` handler: (1) Parse URL pathname. (2) For all `/api/*` routes, call `verifyAdminToken()` first — return 403 if invalid. (3) Route to handlers based on PRD §7.1.2 endpoint table (10 routes). (4) For POST `/api/backup/trigger` and POST `/api/restore/execute`, return `{ backupId }` / `{ restoreId }` immediately and use `ctx.waitUntil()` for async work. The `scheduled` handler: call the auto-backup function directly (same logic as manual trigger but with `trigger: "auto"`). Add a comment block at the top listing all 10 routes from PRD §7.1.2.

- [x] 2.0 Data Backup System: RTDB + Firestore Reading, ZIP, Upload, Lock, Retry, Retention
  - [x] 2.1 Create `src/backup/backup-lock.ts`. Export three functions: (1) `async acquireLock(r2: BackupR2Client, backupId: string, type: string): Promise<{ acquired: boolean; reason?: string }>` — reads `backup_lock.json` from R2; if exists and `createdAt` < 30 min ago → return `{ acquired: false, reason: "Another backup in progress" }`; if exists but > 30 min → stale, proceed; write new lock `{ backupId, createdAt: new Date().toISOString(), type }` → return acquired. (2) `async releaseLock(r2: BackupR2Client)` — overwrite `backup_lock.json` with empty/null or write an expired marker. Since the R2 token has no delete permission, overwrite the lock file with `{ released: true, releasedAt: ... }` and the `acquireLock` function should treat this as "no lock". (3) `async checkStaleLock(r2: BackupR2Client): Promise<boolean>` — returns true if lock is > 30 min old.
  - [x] 2.2 Create `src/backup/firestore-budget.ts`. Export `async function checkFirestoreBudget(r2: BackupR2Client, backupHistory: BackupHistoryEntry[]): Promise<{ include: boolean; firestoreReadsToday: number; estimatedDocCount: number; reason?: string }>`. Implementation follows PRD §4.2.1 algorithm exactly: (1) Read `backup_state.json` from backup R2. (2) If `lastResetDate !== today (UTC)` → reset `firestoreReadsToday` to 0. (3) Find the previous backup manifest from backup history, read its `entityCounts.firestore` to get estimated doc count. **If no previous manifest exists (first backup), set `estimatedDocCount = 0` and always include Firestore.** (4) Calculate `projectedTotal = firestoreReadsToday + estimatedDocCount`. (5) If `projectedTotal > 25000` → return `{ include: false, reason: "read_budget_exceeded" }`. (6) Otherwise return `{ include: true }`. Also export `async function updateFirestoreReads(r2: BackupR2Client, actualDocsRead: number)` to increment the counter after a successful Firestore read.
  - [x] 2.3 Create `src/utils/manifest.ts`. Export functions: (1) `buildBackupManifest(params): BackupManifest` — takes all fields from PRD §4.5 schema and returns a complete manifest object. (2) `buildMediaManifest(files, backupId): MediaManifest` — builds the media reference list per PRD §4.6. (3) `generateBackupId(trigger: 'auto' | 'manual'): string` — format: `BK-YYYY-MM-DD-HHmmss-{trigger}`.
  - [x] 2.4 Create `src/utils/zip.ts`. Import `fflate` (already installed in task 1.1). **⚠️ CRITICAL: Do NOT use `fflate.zipSync()`** — `zipSync` accumulates the entire ZIP buffer synchronously in RAM. With a 128 MB Cloudflare Worker memory limit and up to ~110 MB payload, this WILL cause an Out-Of-Memory crash. Instead, use **`fflate`'s streaming `Zip` class** which processes files incrementally:
    ```typescript
    import { Zip, ZipPassThrough } from 'fflate';
    
    export async function createBackupZip(...): Promise<Uint8Array> {
      const chunks: Uint8Array[] = [];
      const zip = new Zip((err, chunk, final) => {
        if (err) throw err;
        chunks.push(chunk);
      });
      
      // For each file (e.g., 'rtdb/users.json'):
      const entry = new ZipPassThrough('rtdb/users.json');
      zip.push(entry);
      const jsonBytes = new TextEncoder().encode(JSON.stringify(data.users, null, 2));
      entry.push(jsonBytes, true); // true = this is the final chunk for this entry
      
      // ... repeat for all 23 RTDB + 7 Firestore + manifest + media_manifest files
      
      zip.end(); // Finalize the archive
      // Concatenate all chunks into final Uint8Array
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    }
    ```
    This processes each file entry one at a time through the ZIP compressor, keeping only the current entry + compressed output in memory (peak ~10-15 MB instead of ~110 MB). Create ZIP with the folder structure from PRD §4.4: `rtdb/` folder with one `.json` file per RTDB node (23 files), `firestore/` folder (if Firestore included) with one `.json` file per collection (7 files), `manifest.json` at root, `media_manifest.json` at root. Each JSON file should be `JSON.stringify(data, null, 2)`. Before adding each file to ZIP, calculate SHA-256 checksum using Web Crypto API (`await crypto.subtle.digest('SHA-256', jsonBytes)`) and store hex string in the manifest's `checksums` field. Also export `async function extractBackupZip(zipData: Uint8Array): Promise<{ rtdb: Record<string, any>, firestore: Record<string, any> | null, manifest: BackupManifest, mediaManifest: MediaManifest }>` — for extraction, `fflate.unzipSync()` IS safe to use since the compressed ZIP is much smaller than the raw data (~15-30 MB compressed).
  - [x] 2.5 Create `src/backup/data-backup.ts`. This is the core module. Export `async function executeDataBackup(env: WorkerEnv, r2: BackupR2Client, trigger: 'auto' | 'manual', statusTracker: StatusTracker): Promise<BackupManifest>`. Implementation steps:
    **(1)** Call `acquireLock()`. If not acquired → throw `new Error('Another backup is in progress')`.
    **(2)** Get OAuth2 token via `getFirebaseAccessToken(env.GOOGLE_SA_KEY)`.
    **(3)** **Dynamically discover RTDB nodes** (PRD §4.16.1) — instead of hardcoding node names, discover all top-level nodes at runtime:
      - `GET https://<projectId>.firebaseio.com/.json?shallow=true&access_token=<token>` → returns `{ "users": true, "tests": true, ... }`
      - `const allNodes = Object.keys(response)`
      - Filter out exclusion list: `const RTDB_EXCLUDE = ['system_flags'];`
      - `const nodesToBackup = allNodes.filter(n => !RTDB_EXCLUDE.includes(n));`
      - Read each remaining node via `GET https://<projectId>.firebaseio.com/<node>.json?access_token=<token>`
    Store each result in `rtdbData: Record<string, any>`. Before each request, check token remaining validity (< 5 min → refresh via `TokenCache`). Update `statusTracker` with current node name (e.g., `"Reading users... (3/25)"`). **Special handling** (maintained in a `SPECIAL_HANDLERS` map): For `game_sessions`, after reading, filter OUT entries where `status === 'in-progress'` (PRD §4.3.3). Track `rtdbBytesRead` (sum of response Content-Length headers or JSON string lengths). **Safety valve:** Log a warning in the manifest if any node has > 500,000 top-level keys.
    **(4)** Call `checkFirestoreBudget()`. If `include === true`: **dynamically discover Firestore collections** (PRD §4.16.2):
      - `POST https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents:listCollectionIds` with `Authorization: Bearer <token>` and body `{}`
      - Returns `{ "collectionIds": ["drafts", "homework_assignments", ...] }`
      - Filter out exclusion list: `const FIRESTORE_EXCLUDE = ['parsingCache'];`
      - Read each remaining collection
    Each via REST API `GET https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents/<collection>?pageSize=100` with `Authorization: Bearer <token>`. Handle pagination via `nextPageToken`. Add 500ms delay between each batch of 100 docs. Update `firestoreReadsToday` after reading. For `settings/api_keys` — note the path uses a `/` which maps to a subcollection in Firestore REST API.
    **(5)** Build media manifest by listing primary R2 `audio/`, `images/`, `avatars/` prefixes via `env.PRIMARY_R2.list({ prefix })`. For each file, record key, size, type. Finding `referencedBy`: iterate over all entries in `rtdbData.tests`. For each test object, recursively search through all string values in the test's JSON tree (including nested `sections[].questions[].audioUrl`, `sections[].questions[].imageUrl`, `sections[].passage.imageUrl`, `sections[].audioUrl`, etc.). If any string value contains the media file's R2 key (e.g., `audio/12345-section1.mp3`), add the test's path (e.g., `tests/<testId>`) to the file's `referencedBy` array. **Simplified approach if recursive scanning is too complex:** just set `referencedBy: []` (empty array) for all files — this field is informational metadata only and does NOT affect backup/restore functionality. The media manifest's primary purpose is listing files for delta comparison, not tracking references.
    **(6)** Build backup manifest via `buildBackupManifest()` with all entity counts.
    **(7)** Create ZIP via `createBackupZip()`.
    **(8)** Upload ZIP to backup R2 at key `backups/<backupId>.zip`.
    **(9)** Update `backup_history.json` — read existing, append new `BackupHistoryEntry`, call `pruneBackupHistory()`, write back.
    **(10)** Release lock via `releaseLock()`.
    **(11)** Return manifest.
  - [x] 2.6 Implement the `scheduled()` handler auto-backup retry logic in `src/index.ts`. When `scheduled()` fires: (1) Attempt `executeDataBackup()` with `trigger: 'auto'`. (2) On failure → wait 15 min (use `setTimeout` wrapped in a Promise inside `ctx.waitUntil`), retry. (3) After 3 total failures → write failure entry to `backup_history.json` with `status: 'failed'`. (4) Each retry starts from scratch (PRD §4.10). (5) Write admin notification to RTDB via REST API PUT to `https://<projectId>.firebaseio.com/notifications/<ADMIN_UID>/<notifId>.json?access_token=<token>`. The `ADMIN_UID` is stored as a Worker environment variable (add `ADMIN_UID` to `wrangler.toml` `[vars]`). Notification format follows the existing `Notification` type: `{ type: 'system', title: '...', message: '...', read: false, createdAt: Date.now() }`. Use the exact messages from PRD §4.15 table (e.g., success: `"✅ Weekly backup completed successfully. [X] MB backed up."`, failure: `"❌ Weekly backup failed after 3 attempts. Please check backup settings."`).
  - [x] 2.7 Create `src/backup/retention.ts`. Export `async function pruneBackupHistory(r2: BackupR2Client): Promise<void>`. This function reads `backup_history.json`, checks each entry's backup file existence in R2 using `headObject()`. If the file no longer exists (expired by lifecycle rule), remove the entry from `backup_history.json` and write back. This keeps the history consistent with actual R2 contents (PRD §4.11).
  - [x] 2.8 Implement the GET `/api/backup/status/{backupId}` endpoint. Create a `StatusTracker` class that stores in-memory progress: `{ backupId, phase: string, progress: number, currentNode: string, startedAt, error?: string, completedAt? }`. The `executeDataBackup` function updates this tracker as it progresses. The status endpoint reads from this tracker and returns the current state. Note: since Workers are stateless across requests, store progress in a `backup_status_<backupId>.json` file in backup R2, updated every ~5 seconds during backup.
  - [x] 2.9 Implement the GET `/api/backup/history` endpoint. Read `backup_history.json` from backup R2 and return it as JSON. Implement the GET `/api/backup/download/{backupId}` endpoint — read the ZIP from backup R2 at `backups/<backupId>.zip` and return it as a streaming response with `Content-Type: application/zip` and `Content-Disposition: attachment; filename="<backupId>.zip"`.
  - [x] 2.10 Implement the GET `/api/backup/health` endpoint (PRD §7.1.2). Check: (1) Primary R2 connectivity — try `PRIMARY_R2.list({ limit: 1 })`. (2) Backup R2 connectivity — try `r2.listObjects('backups/')`. (3) Firebase connectivity — try GET `https://<projectId>.firebaseio.com/.json?shallow=true&access_token=<token>`. Return `{ status: "ok"|"error", primaryR2: boolean, backupR2: boolean, firebase: boolean, quotaStatus: { firestoreReadsToday, rtdbBytesThisMonth } }`.

- [x] 3.0 Media Backup System: Delta Calculator, Worker-Proxied Downloads, Chain Management
  - [x] 3.1 Create `src/backup/media-delta.ts`. Export `async function calculateMediaDelta(env: WorkerEnv, r2: BackupR2Client): Promise<{ type: 'full' | 'delta', sequenceNumber: number, files: MediaBackupFileEntry[], totalSizeBytes: number, chainInfo: string }>`. Implementation: (1) Read `backup_state.json` from backup R2 to get media chain state (`lastBackupId`, `sequenceNumber`, `baseBackupId`). (2) If no chain state exists OR `sequenceNumber % MEDIA_CHECKPOINT_INTERVAL === 0` (every 6th) → return all files as `type: 'full'`. (3) Otherwise, read the previous media backup manifest from backup R2 at `media_manifests/<lastBackupId>.json`. (4) List all current files in primary R2 `audio/`, `images/`, `avatars/` folders using `env.PRIMARY_R2.list({ prefix: 'audio/' })` etc. (5) Compare: find files that are NEW (key not in previous manifest) or have a different `lastModified` date vs the previous manifest. (6) Return only the delta files with their R2 keys and sizes. **Note:** This function does NOT generate signed URLs — the primary R2 bucket uses a Worker binding which does not support pre-signed URLs. Instead, the admin UI downloads files via the Worker proxy endpoint (see task 3.2).
  - [x] 3.2 Implement download URL generation in `media-delta.ts`. **⚠️ IMPORTANT: The primary R2 bucket uses a Worker binding (`PRIMARY_R2`), NOT an S3 API client. R2 bucket bindings do NOT support pre-signed URLs.** Instead, generate **Worker-proxied download URLs** — the Worker acts as a proxy. For each file in the delta list: the admin UI calls `GET /api/backup/media/download?key=<fileKey>` → the Worker reads the file from `env.PRIMARY_R2.get(key)` → streams it back with appropriate `Content-Type` and `Content-Disposition` headers. Add this `/api/backup/media/download` endpoint to the router in `src/index.ts`. To support concurrent downloads (3-5 at a time), each request is independent. Set a per-download timeout of 5 minutes. The Worker returns the file content as a streaming `Response` body.
  - [x] 3.3 Implement the POST `/api/backup/media/delta` endpoint in `src/index.ts`. Call `calculateMediaDelta()`, then: (1) For each file in the delta list, set `downloadUrl` to the Worker proxy endpoint path: `/api/backup/media/download?key=${encodeURIComponent(file.key)}` (the admin UI will prepend the Worker base URL). **Do NOT generate signed URLs** — the primary R2 uses a Worker binding which doesn't support them. (2) Build a `MediaBackupManifest` (PRD §4.7 schema). (3) Store the manifest in backup R2 at `media_manifests/<mediaBackupId>.json`. (4) Update `backup_state.json` with new chain state (increment `sequenceNumber`, update `lastBackupId`). (5) Return the file list with Worker-proxied download URLs to the admin UI.
  - [x] 3.4 Handle chain integrity edge cases: If `backup_state.json` media chain data is missing, corrupted, or `chainLength > MEDIA_CHECKPOINT_INTERVAL` → default to full backup and reset chain (PRD §4.2.2 safe fallback). Log a warning in the response so the admin UI can show the chain integrity warning.

- [x] 4.0 Restore System: Preview, Execution, Firestore Merge, GDPR, Progress
  - [x] 4.1 Create `src/restore/restore-preview.ts`. Export `async function generateRestorePreview(env: WorkerEnv, backupId: string, r2: BackupR2Client): Promise<RestorePreview>`. Implementation: (1) Download the backup ZIP from R2 at `backups/<backupId>.zip` and parse it using `extractBackupZip()` from `zip.ts`. (2) Read the manifest to get backup entity counts for each RTDB node and Firestore collection. (3) Read **live RTDB entity counts** by fetching each of the 23 RTDB nodes with `?shallow=true&access_token=<token>` — `?shallow=true` returns only top-level keys without values, and `Object.keys(result).length` gives the count. (4) Read **live Firestore entity counts** ONLY IF the backup includes Firestore (`includesFirestore: true`). Use Firestore REST API with `?pageSize=0` and read the response metadata, or use a count aggregation query: `POST https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents:runAggregationQuery` with `{ structuredAggregationQuery: { aggregations: [{ alias: 'count', count: {} }], structuredQuery: { from: [{ collectionId: '<collection>' }] } } }`. This costs 1 read per 1,000 docs. (5) For each category, build a `RestorePreviewCategory` with `backupCount`, `currentCount`, `difference = currentCount - backupCount`, and `status`. (6) If `includesFirestore === false`, call `findClosestFirestoreBackup()` and populate `firestoreMergeAvailable`. (7) Check `deleted_users/` data in the backup for GDPR-excluded entities (count entries where `status === 'completed'`). (8) Generate warnings: e.g., if backup is > 3 days old, warn about data created since. (9) Return the complete `RestorePreview` object.
  - [x] 4.2 Create `src/restore/gdpr-filter.ts`. Export `function filterGdprEntities(deletedUsersData: Record<string, any>): { filtered: Record<string, any>; excludedCount: number }`. Iterate over all entries in `deleted_users/`; remove any where `status === 'completed'`. Return the filtered data and the count of excluded entities. This function is called during both preview (for count) and execution (for actual filtering).
  - [x] 4.3 Create `src/restore/firestore-merge.ts`. Export `async function findClosestFirestoreBackup(r2: BackupR2Client, currentBackupTimestamp: string): Promise<{ backupId: string; timestamp: string; firestoreData: Record<string, any> } | null>`. Read `backup_history.json`, find all entries where `includesFirestore === true`, sort by timestamp, find the closest one to `currentBackupTimestamp`. If found, download that backup's ZIP, extract the `firestore/` folder data, and return it. If none found, return null.
  - [x] 4.4 Create `src/restore/restore-execute.ts`. Export `async function executeRestore(...)`. Full signature: `async function executeRestore(env: WorkerEnv, r2: BackupR2Client, backupId: string, options: { scope: string[], mode: 'smart_auto' | 'per_entity', perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>, mergeFirestoreFromBackupId?: string }, statusTracker: StatusTracker): Promise<RestoreResult>`. The `scope` array contains node/collection names the admin selected to restore (e.g., `['users', 'tests', 'test_results']` or `['all']` for everything). Implementation — follow PRD §4.13.5 exactly:
    **(1) Set RTDB flag** — PUT `system_flags/restore_in_progress` to RTDB via REST API with value `{ active: true, startedAt: <unix_ms>, backupId: '<backupId>' }`. URL: `https://<projectId>.firebaseio.com/system_flags/restore_in_progress.json?access_token=<token>`.
    **(2) Pre-restore snapshot** — read all 23 RTDB nodes (same as backup read in task 2.5), save as ZIP in backup R2 at `pre-restore/<ISO_timestamp>.zip`. Explicitly EXCLUDE Firestore to avoid consuming reads (PRD §4.13.5).
    **(3) Parse backup** — download and extract data from the backup ZIP using `extractBackupZip()`. If `options.mergeFirestoreFromBackupId` is set, also download and extract that backup's Firestore data.
    **(4) Apply GDPR filter** — call `filterGdprEntities()` on `deleted_users/` data from the backup. Remove excluded entities.
    **(5) Restore RTDB** using the **known dependency order + unknown-last** pattern (PRD §4.16.3):
    ```typescript
    const RTDB_RESTORE_ORDER = [
      'users', 'tests', 'quizzes', 'classes', 'courses',
      'course_enrollments', 'class_course_links', 'course_materials', 'course_progress',
      'test_results', 'game_sessions', 'deleted_users', 'guest_results',
      'invitations', 'badges', 'course_attendance', 'audit_logs',
      'test_results_by_session', 'test_results_by_student', 'test_results_by_teacher',
      'test_results_by_course', 'test_results_by_class',
    ];
    const RTDB_SKIP_ON_RESTORE = ['notifications'];  // Excluded by default (prevent spam)
    
    // Build final restore list:
    const allBackupNodes = Object.keys(backupData.rtdb);
    const knownNodes = RTDB_RESTORE_ORDER.filter(n => allBackupNodes.includes(n));
    const unknownNodes = allBackupNodes.filter(n => !RTDB_RESTORE_ORDER.includes(n) && !RTDB_SKIP_ON_RESTORE.includes(n));
    const finalRestoreOrder = [...knownNodes, ...unknownNodes]; // known first, unknown last
    ```
    For each node in `scope` (intersect with `finalRestoreOrder`): use Firebase REST API **PATCH** (not PUT) to `https://<projectId>.firebaseio.com/<node>.json?access_token=<token>` — PATCH merges data at the top level without deleting existing keys. **Smart auto mode entity existence check — ⚠️ CRITICAL: Do NOT make individual HTTP requests per entity key.** With 4,000+ test results, that would be 4,000 sequential HTTP requests which will timeout the Worker and hit Firebase rate limits. Instead, for each RTDB node being restored: (a) Fetch the ENTIRE node's top-level keys in ONE request: `GET https://<projectId>.firebaseio.com/<node>.json?shallow=true&access_token=<token>` — this returns `{ "key1": true, "key2": true, ... }` (keys only, no values, very lightweight even for 50,000+ keys). (b) Store the result as `const liveKeys: Record<string, boolean> = await response.json() || {}`. (c) For each entity key in the backup data, check existence **in memory**: `if (liveKeys[entityKey]) { skip++ } else { /* restore this entity */ }`. (d) For entities that need restoring, batch them into a single PATCH request per node: `PATCH https://<projectId>.firebaseio.com/<node>.json` with body `{ "missingKey1": entityData1, "missingKey2": entityData2, ... }`. This reduces thousands of requests to exactly 2 per node (1 shallow read + 1 batch write). **Per-entity mode:** Use the `perEntityDecisions` map — for 'skip': do nothing; for 'overwrite': PUT the individual entity at `/<node>/<entityKey>.json` (replaces entirely); for 'duplicate': generate a new key via `push()` equivalent and write the entity with the new key. Track progress per-entity via `statusTracker`.
    **(6) Restore Firestore** — if Firestore collections are in scope AND data is available (from backup or merged). For each document, use Firestore REST API: `PATCH https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents/<collection>/<docId>?updateMask.fieldPaths=*` with `Authorization: Bearer <token>`. This creates or overwrites the document.
    **(7) Post-restore validation** — re-read entity counts from RTDB (shallow queries) and compare against expected counts from the backup manifest. Log any mismatches.
    **(8) Clear RTDB flag** — PUT `system_flags/restore_in_progress` to `null` via REST API (effectively deleting it). **This must happen in a `finally` block** to ensure the flag is cleared even on failure.
    **(9)** Return `RestoreResult: { status: 'complete' | 'partial' | 'failed', entitiesRestored: number, entitiesSkipped: number, entitiesFailed: number, notificationsSkipped: true, details: Record<string, { restored: number, skipped: number, failed: number }> }`.
  - [x] 4.5 Implement the POST `/api/restore/preview` endpoint. Accept `{ backupId }` in body, call `generateRestorePreview()`, return the preview JSON. Implement the POST `/api/restore/execute` endpoint. Accept `{ backupId, scope, mode, perEntityDecisions, mergeFirestoreFromBackupId }` in body, return `{ restoreId }` immediately, use `ctx.waitUntil()` for async execution. Implement GET `/api/restore/status/{restoreId}` — read progress from R2 status file.
  - [x] 4.6 Add stale restore flag cleanup: In the Worker's `scheduled()` handler (or at the start of any request handler), check `system_flags/restore_in_progress` in RTDB. If the flag exists and `startedAt` is > 2 hours ago → clear it (PRD §4.13.6 safety net). This prevents a crashed restore from permanently blocking side effects.

- [x] 5.0 Admin UI — Backup Page: Dashboard, History, Actions, Media Status, Settings
  - [x] 5.1 Create `src/pages/AdminBackupPage.css`. Define styles for: `.backup-page` container, `.backup-dashboard-card` (glass morphism card with status indicators), `.backup-actions` (button row), `.backup-history-table` (responsive table with row actions), `.backup-media-status` (chain visualization), `.backup-settings` (read-only settings display), `.backup-progress-bar` (animated progress), `.backup-toast` (notification toasts), `.restore-preview-modal` (wide modal for diff view), `.per-entity-mode` (entity list with radio buttons). Follow existing admin page styling patterns from `AdminDashboardPage.tsx` — use glass morphism (`rgba(255,255,255,0.8)`, `backdrop-filter: blur(12px)`), rounded corners (`border-radius: 16px`), gradient accents. Use color coding from PRD §6.3: green (#10b981) for success, red (#ef4444) for failed, amber (#f59e0b) for in-progress, blue (#3b82f6) for info.
  - [x] 5.2 Create `src/pages/AdminBackupPage.tsx`. This is the main page component. Structure it identically to `AdminDashboardPage.tsx` pattern: import `useAuth`, `useNavigation`, `AdminLayout`; check `profile?.role === 'super_admin'`; render inside `<AdminLayout>` with `currentPage="backup"`, `pageTitle="Backup & Recovery"`. The page renders 5 sections from PRD §4.14.1 layout: Dashboard Card, Actions, Backup History, Media Backup Status, Settings. Each section is a separate sub-component rendered inline (or extracted to separate files if too large). Use `useState` for: `backups` (history list), `backupInProgress` (boolean + progress), `restoreInProgress` (boolean + progress), `mediaStatus` (chain info), `selectedBackup` (for restore preview). Use `useEffect` on mount to call `backupService.getHistory()` and `backupService.getHealth()`.
  - [x] 5.3 Implement the **Dashboard Card** section in `AdminBackupPage.tsx`. Display: (1) "Last Backup" — date/time of most recent entry from backup history, with type label (auto/manual). (2) "Next Scheduled" — calculate next Monday 3:00 AM UTC from current time. (3) "Status" — green checkmark if last backup succeeded, red X if failed, yellow if in-progress. (4) "Storage" — count of backups in history + " of 10 backup slots used". (5) "Firestore Quota" — show `firestoreReadsToday / 50,000` from health endpoint. Use the `Card` component from `../components/modern` with `variant="glass"`.
  - [x] 5.4 Implement the **Actions** section. Three buttons: (1) "📦 Backup Now" — on click: call `backupService.checkFirestoreBudget()` first (hits the health endpoint), then show confirmation dialog with Firestore inclusion status (PRD §4.14.2 step 3 — two message variants). On confirm: call `backupService.triggerBackup()`, receive `backupId`, start polling `backupService.getStatus(backupId)` every 2 seconds. Show progress bar with phase text (PRD §4.14.2 step 5). On complete: show success toast, refresh history. On error: show error toast with retry button. (2) "🖼️ Media Backup" — triggers media backup flow (task 5.6). (3) "♻️ Restore" — opens a modal to select a backup from history, then triggers restore flow (task 5.7). Disable all three buttons while any operation is in progress.
  - [x] 5.5 Implement the **Backup History** table. Render a responsive table with columns: `#`, `Date & Time`, `Type` (Auto/Manual badge), `Size` (formatted MB), `Firestore` (✅/⚠️ icon), `Status` (✅/❌/🟡). Each row has action buttons: `[Download]` — calls `backupService.downloadBackup(backupId)` which opens the ZIP download via a new tab or anchor click. `[Restore]` — selects this backup and opens restore preview modal. `[Details]` — expands row to show manifest details (entity counts, checksums, Firestore skip reason if applicable). Sort by date descending. If history is empty, show empty state: "No backups yet. Click 'Backup Now' to create your first backup."
  - [x] 5.6 Implement the **Media Backup Flow** (triggered from Actions section). Steps matching PRD §4.14.3:
    **(1)** Call `backupService.getMediaDelta()` — hits POST `/api/backup/media/delta`. Returns the file list with download endpoints.
    **(2)** Show info dialog with: file count, total size (formatted: e.g., "1.2 GB"), delta/full type, chain position (e.g., "Delta #3 of 6").
    **(3a) If browser supports File System Access API** (`'showDirectoryPicker' in window`): prompt user to select local folder. Use the **exact** File System Access API sequence — do NOT hallucinate Node.js `fs` methods:
    ```typescript
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    for (const file of deltaFiles) {
      const blob = await backupService.downloadMediaFile(file.key);
      const fileHandle = await dirHandle.getFileHandle(file.key.split('/').pop()!, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    }
    ```
    Download files 3-5 at a time using a concurrency pool (`Promise.all` on batches of 3-5).
    **(3b) If File System Access API is NOT supported** (Firefox, older browsers): **⚠️ Do NOT attempt to create a ZIP client-side** — zipping gigabytes of media files in browser RAM will crash the tab (browser OOM). Instead, download each file individually using hidden `<a>` tags with the `download` attribute:
    ```typescript
    for (const file of deltaFiles) {
      const blob = await backupService.downloadMediaFile(file.key);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.key.split('/').pop()!;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await new Promise(r => setTimeout(r, 500)); // Small delay between downloads to avoid browser throttling
    }
    ```
    Show a note to the user: `"Your browser doesn't support folder selection. Files will be downloaded individually to your Downloads folder."`
    **(4)** Show per-file progress (file name + percentage). If any single file fails, mark it red and show a "Retry" button for that specific file only.
    **(5)** On complete: show warning toast: `"⚠️ This media backup is stored ONLY on your computer. Consider copying it to an external drive."` (PRD §4.14.3 step 9).
    **(6)** Acquire Screen Wake Lock during the entire download process (see task 5.9).
  - [x] 5.7 Implement the **Restore Flow** (triggered from history table or Actions). Steps matching PRD §4.14.4:
    **(1)** Call `backupService.getRestorePreview(backupId)` — hits POST `/api/restore/preview`.
    **(2)** If backup has `includesFirestore: false` → show merge offer dialog: `"This backup does not include Firestore data (skipped due to read quota). The closest backup WITH Firestore data is from [date], [X days older]. Would you like to merge Firestore data from that backup?"` (PRD §4.13.3). Show [Yes, merge] and [No, skip Firestore] buttons.
    **(3) Scope Selection** (PRD §4.13.2) — before showing the diff, display a checklist of all available data categories (all 23 RTDB nodes + Firestore collections). Each has a checkbox, all checked by default. Admin can uncheck nodes they don't want to restore. Provide a "Select All" / "Deselect All" toggle. Group into sections: "Critical" (users, tests, classes, results, courses), "Index" (test_results_by_*), "Firestore" (homework, streaks, etc.), "Other" (remaining). Note: `notifications` should be **unchecked by default** with a tooltip: `"Notifications are excluded by default to prevent spamming students with old notifications."`
    **(4)** Display **Restore Preview Modal** — render the diff table (PRD §4.13.4) ONLY for the selected scope. Columns: Category name, Backup Count, Current Live Count, Difference, Status. Color-code rows: green for entities that will be added, gray for matches/skips, amber for conflicts.
    **(5)** Mode selector: radio buttons for "Smart Auto (recommended)" (default) and "Per-Entity Manual". Explain each: Smart Auto = "Skip entities that already exist, restore only missing ones." Per-Entity = "Choose what to do with each conflicting entity."
    **(6)** If per-entity mode selected: render an expandable list of conflicting entities grouped by category, each with 3-option radio: Skip / Overwrite / Create Duplicate. Add "Select All: Skip" / "Select All: Overwrite" bulk action buttons at the top.
    **(7)** Final confirmation with warning: `"⚠️ A pre-restore safety snapshot will be created first. This action will modify your live database."` (PRD §4.14.4 step 6). Show [Cancel] and [Confirm Restore] buttons.
    **(8)** On confirm: call `backupService.executeRestore({ backupId, scope: selectedNodes, mode, perEntityDecisions, mergeFirestoreFromBackupId })`, start polling restore status every 2 seconds. Show progress bar with entity-level detail.
    **(9)** On complete: show summary toast: `"✅ Restore complete. [X] tests restored, [Y] skipped (already exist), [Z] results restored."` (PRD §4.14.4 step 10).
  - [x] 5.8 Implement the **Media Backup Status** section. Display: (1) Last media backup date and delta number. (2) Visual chain representation: `Full(1) → Delta(2) → Delta(3) → ...` as a horizontal pill sequence. (3) "Next checkpoint (full): Backup #N". (4) "New files since last: X files (~Y MB)" — fetched from health/media endpoint. This data comes from `backup_state.json` via the health endpoint.
  - [x] 5.9 Implement the **Screen Wake Lock** hook. Create a custom hook `useWakeLock()` that: (1) Calls `navigator.wakeLock.request('screen')` when activated. (2) Returns a `release()` function to release the lock. (3) Handles the `visibilitychange` event to re-acquire the lock if the user navigates away and comes back. (4) Shows a persistent warning banner when active: "⚠️ Please do not close this tab or put your computer to sleep until the process completes." (5) Auto-releases on component unmount. (6) Gracefully handles browsers that don't support the Wake Lock API (just log a warning, don't crash). Use this hook in the Backup, Restore, and Media Download flows (PRD §4.14 UX note).
  - [x] 5.10 Implement the **Settings** section (read-only). Display: (1) "Auto-Backup: ✅ Enabled" (always enabled, read-only, non-interactive). (2) "Schedule: Every Monday at 3:00 AM UTC". (3) Info text: "ℹ️ Schedule change requires Worker redeployment (wrangler.toml edit)". (4) "Retention: Objects older than 77 days auto-expire via R2 lifecycle rules". All fields are read-only per PRD §4.14.1.
  - [x] 5.11 Implement the **Notifications** display. The page should poll or subscribe to RTDB `notifications/<adminUid>` for backup-related notifications (PRD §4.15). Show toast notifications for: auto-backup success/failure, Firestore quota warnings, restore completion. Use the existing notification toast pattern from the app. Match the notification messages exactly from the PRD §4.15 table.

- [x] 6.0 Side-Effect Prevention: `withRestoreGuard()` Middleware + Modify Existing Services
  - [x] 6.1 Create **two** utility files:
    **(A) `src/utils/restoreFlag.ts`** — the core flag checker. Export `async function isRestoreInProgress(): Promise<boolean>`. This function: (1) Imports `ref`, `get` from `firebase/database` and `database` from `../services/firebase`. (2) Reads `system_flags/restore_in_progress` from RTDB. (3) Returns `true` if the value exists and `active === true`. (4) Returns `false` if the value is null/undefined or `active !== true`. Caches the result for 10 seconds (in a module-level variable with timestamp) to avoid excessive RTDB reads during rapid service calls.
    **(B) `src/utils/restoreGuard.ts`** — the centralized middleware wrapper (PRD §4.13.6, §4.16.4). Export `function withRestoreGuard<T>(serviceName: string, fallbackValue: T)`. Full implementation:
    ```typescript
    import { isRestoreInProgress } from './restoreFlag';
    
    export function withRestoreGuard<T>(serviceName: string, fallbackValue: T) {
      return function(originalFn: (...args: any[]) => Promise<T>): (...args: any[]) => Promise<T> {
        return async function(...args: any[]): Promise<T> {
          if (await isRestoreInProgress()) {
            console.log(`[${serviceName}] Skipped — restore in progress`);
            return fallbackValue;
          }
          return originalFn(...args);
        };
      };
    }
    ```
    This middleware wraps any async function, checking the restore flag before execution. If restore is active, it returns the fallback value without calling the original function. **⚠️ Integration Safety Rule #11:** All future services that write to RTDB/Firestore as a side effect MUST use this wrapper.
  - [x] 6.2 Modify `src/services/notificationService.ts`. Import `withRestoreGuard` from `../utils/restoreGuard`. Wrap EACH of these 8 exported functions with `withRestoreGuard()`. Two patterns depending on how the function is exported:
    **Pattern A — for functions exported as `export async function`:** Rename the original function to `_originalName`, then export the wrapped version:
    ```typescript
    // Before:
    export async function createNotification(data: NotificationCreate) { ... }
    // After:
    async function _createNotification(data: NotificationCreate) { ... }
    export const createNotification = withRestoreGuard(
      'Notification', { success: true, notificationId: undefined }
    )(_createNotification);
    ```
    Apply to all 8 functions:
    - `createNotification()` → fallback: `{ success: true, notificationId: undefined }`
    - `createBulkNotifications()` → fallback: `{ success: true, notificationIds: [] }`
    - `sendFeedbackNotification()` → fallback: `{ success: true, notificationId: undefined }`
    - `sendReviewedNotification()` → fallback: `{ success: true, notificationId: undefined }`
    - `sendHomeworkAssignedNotification()` → fallback: `{ success: true, notificationIds: [] }`
    - `sendHomeworkDueSoonNotification()` → fallback: `{ success: true, notificationId: undefined }`
    - `sendHomeworkSubmittedNotification()` → fallback: `{ success: true, notificationId: undefined }`
    - `sendHomeworkGradedNotification()` → fallback: `{ success: true, notificationId: undefined }`
  - [x] 6.3 Modify `src/services/badgeService.ts`. Import `withRestoreGuard` from `../utils/restoreGuard`. Wrap `checkAndAwardBadges` (exported at line 21, signature: `async function checkAndAwardBadges(context: BadgeEarningContext): Promise<Badge[]>`). Rename to `_checkAndAwardBadges`, export wrapped version with fallback `[]` (empty badge array). It is called from `src/hooks/test/useTestSubmission.ts` (line 405).
  - [x] 6.4 Modify `src/services/studentStreakService.ts`. Import `withRestoreGuard` from `../utils/restoreGuard`. The function `recordActivity` (exported at line 234, signature: `async function recordActivity(studentId: string): Promise<StreakData>`) cannot use the simple `withRestoreGuard` pattern because its fallback requires calling another async function (`getStreakData`). **Instead, use the manual pattern:** At the TOP of `recordActivity`, add: `if (await isRestoreInProgress()) { console.log('[Streak] recordActivity skipped — restore in progress'); return (await getStreakData(studentId)) || await initializeStreakData(studentId); }`. Import `isRestoreInProgress` from `../utils/restoreFlag`.
  - [x] 6.5 Modify `src/services/homeworkManager.ts`. Import `withRestoreGuard` from `../utils/restoreGuard`. The function `createHomework` (line 63) needs to THROW on restore (not silently return). **Use the manual pattern:** At the TOP of `createHomework()`, add: `if (await isRestoreInProgress()) { console.log('[Homework] createHomework blocked — restore in progress'); throw new Error('Cannot create homework during system restore'); }`. Import `isRestoreInProgress` from `../utils/restoreFlag`. Note: This throws instead of returning a fallback because homework creation failing silently would be confusing to the admin — an explicit error is better.
  - [x] 6.6 Add a "Restore in progress" maintenance banner. **Exact placement:** In `src/App.jsx`, inside the `<BrowserRouter>` wrapper and ABOVE the `<Routes>` component, add a new `<RestoreBanner />` component. Create this component inline in `App.jsx` or as a new file `src/components/RestoreBanner.tsx`. The component uses `onValue(ref(database, 'system_flags/restore_in_progress'), ...)` to subscribe in real-time. If the value exists and `active === true`, render a fixed-position yellow warning banner at `position: fixed; top: 0; left: 0; right: 0; z-index: 9999` with text: "⚠️ System restore in progress. Some features may be temporarily unavailable." This banner is visible to ALL users (admins and students). Students see it as a simple maintenance notice. The `onValue` real-time listener ensures the banner appears/disappears automatically when the flag is set/cleared. Import `ref`, `onValue` from `firebase/database` and `database` from `./services/firebase`. Clean up the listener in `useEffect` cleanup: `return () => off(flagRef)`.

- [x] 7.0 Integration, Routing & Navigation: Connect Admin UI to Worker
  - [x] 7.1 Create `src/services/backupService.ts`. This service wraps all Worker API calls. Import `auth` from `./firebase`. Define the Worker URL: `const BACKUP_WORKER_URL = import.meta.env.VITE_BACKUP_WORKER_URL || 'https://r2-backup-worker.iamhuwng.workers.dev'`. Create a helper: `async function getAuthHeaders(): Promise<Record<string, string>> { const token = await auth.currentUser?.getIdToken(); if (!token) throw new Error('Not authenticated'); return { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' }; }`. Export these functions:
    - `triggerBackup(): Promise<{ backupId: string }>` — `POST ${BACKUP_WORKER_URL}/api/backup/trigger` with `getAuthHeaders()`
    - `getBackupStatus(backupId: string): Promise<RestoreProgress>` — `GET ${BACKUP_WORKER_URL}/api/backup/status/${backupId}` with `getAuthHeaders()`
    - `getHistory(): Promise<BackupHistoryEntry[]>` — `GET ${BACKUP_WORKER_URL}/api/backup/history` with `getAuthHeaders()`
    - `downloadBackup(backupId: string): Promise<void>` — use `fetch` with `getAuthHeaders()` to GET the ZIP, then create a Blob URL and trigger download via a temporary `<a>` element with `download` attribute. **Do NOT put the auth token in a URL query param** (security risk — tokens in URLs are logged in server access logs and browser history). Instead, fetch the blob programmatically and trigger a client-side download.
    - `getRestorePreview(backupId: string): Promise<RestorePreview>` — `POST ${BACKUP_WORKER_URL}/api/restore/preview` with body `{ backupId }`
    - `executeRestore(params: { backupId: string, scope: string[], mode: string, perEntityDecisions?: Record<string, string>, mergeFirestoreFromBackupId?: string }): Promise<{ restoreId: string }>` — `POST ${BACKUP_WORKER_URL}/api/restore/execute`
    - `getRestoreStatus(restoreId: string): Promise<RestoreProgress>` — `GET ${BACKUP_WORKER_URL}/api/restore/status/${restoreId}`
    - `getMediaDelta(): Promise<{ type: string, sequenceNumber: number, files: any[], totalSizeBytes: number, chainInfo: string }>` — `POST ${BACKUP_WORKER_URL}/api/backup/media/delta`
    - `downloadMediaFile(key: string): Promise<Blob>` — `GET ${BACKUP_WORKER_URL}/api/backup/media/download?key=${encodeURIComponent(key)}` — returns the file blob for client-side saving
    - `getHealth(): Promise<{ status: string, primaryR2: boolean, backupR2: boolean, firebase: boolean, quotaStatus: any }>` — `GET ${BACKUP_WORKER_URL}/api/backup/health`
    Each function: `const res = await fetch(url, { headers: await getAuthHeaders(), ... }); if (!res.ok) { const errorText = await res.text(); throw new Error(errorText); } return res.json();`
  - [x] 7.2 Modify `src/components/navigation/AdminSidebar.tsx`. Add a "Backup" nav item to the existing `navSections` array. Add it to the "System" section (the last section, line ~60-64), alongside the existing "Settings" item. The new entry: `{ id: 'backup', label: 'Backup', icon: '🛡️' }`. This renders in the sidebar below "Settings". When clicked, `onNavigate('backup')` is called.
  - [x] 7.3 **First, add the route constant.** Open `src/constants/routes.ts`. In the `ROUTES` object, under the `// Admin Routes (Super Admin Only)` section (after `ADMIN_SETTINGS: '/admin/settings'`), add: `ADMIN_BACKUP: '/admin/backup',`. This is the **single source of truth** for the backup route path — **NEVER hardcode the string `'/admin/backup'` anywhere else** in the codebase. Always import `ROUTES` from `@/constants/routes` and use `ROUTES.ADMIN_BACKUP`.
  - [x] 7.4 Modify the `handleSidebarNavigate` function in ALL admin pages that use `AdminLayout` AND have the `handleSidebarNavigate` function. Add `backup: 'ADMIN_BACKUP'` to the `pageRoutes` map. The **7 affected pages** are (verified to contain `handleSidebarNavigate`): `AdminDashboardPage.tsx` (line 99), `AdminMaterialsPage.tsx` (line 182), `AdminClassesPage.tsx` (line 63), `AdminCoursesPage.tsx` (line 28), `AdminSessionsPage.tsx` (line 66), `AdminSettingsPage.tsx` (line 440), `AdminUserManagementPage.jsx` (line 120). **⚠️ `AdminAccountDeletionPage.tsx` does NOT have a `handleSidebarNavigate` function — DO NOT modify it.** In EACH of the 7 files listed above, find the `handleSidebarNavigate` function's `pageRoutes` Record and add `backup: 'ADMIN_BACKUP'` as a new entry. Example (from `AdminDashboardPage.tsx` lines 99-114):
    ```typescript
    const pageRoutes: Record<string, string> = {
        dashboard: 'ADMIN_DASHBOARD',
        materials: 'ADMIN_MATERIALS',
        users: 'ADMIN_USERS',
        courses: 'ADMIN_COURSES',
        classes: 'ADMIN_CLASSES',
        sessions: 'ADMIN_SESSIONS',
        settings: 'ADMIN_SETTINGS',
        backup: 'ADMIN_BACKUP',  // ← ADD THIS LINE
    };
    ```
    **⚠️ Integration Safety Rule #1:** The route key `'ADMIN_BACKUP'` was added to `ROUTES` in task 7.3 — verify it exists before proceeding.
  - [x] 7.5 Modify `src/hooks/useNavigation.ts` (or the navigation config file). Add the `ADMIN_BACKUP` route mapping. Import `ROUTES` from `../constants/routes` and use `ROUTES.ADMIN_BACKUP` as the path value (do NOT hardcode `'/admin/backup'`). Follow the exact same pattern used for `ADMIN_DASHBOARD`, `ADMIN_MATERIALS`, `ADMIN_SETTINGS`, etc.
  - [x] 7.6 Modify `src/App.jsx`. Add a new route for the backup page. Import `ROUTES` from `./constants/routes`. Use: `<Route path={ROUTES.ADMIN_BACKUP} element={<PrivateRoute requiredRole="super_admin"><AdminBackupPage /></PrivateRoute>} />`. Import `AdminBackupPage` from `./pages/AdminBackupPage`. **⚠️ Integration Safety Rule #1:** The path uses `ROUTES.ADMIN_BACKUP` constant — verify it matches the value added in task 7.3.
  - [x] 7.7 **CREATE** `src/config/routeSecurity.ts` — this file does NOT exist yet and must be created from scratch. This file exports a route security configuration map that the app can use for role-based access checks. Create the file with the following content:
    ```typescript
    import { ROUTES } from '../constants/routes';
    
    interface RouteSecurityConfig {
      allowedRoles: string[];
      label: string;
    }
    
    export const routeSecurity: Record<string, RouteSecurityConfig> = {
      [ROUTES.ADMIN_DASHBOARD]: { allowedRoles: ['super_admin'], label: 'Admin Dashboard' },
      [ROUTES.ADMIN_MATERIALS]: { allowedRoles: ['super_admin'], label: 'Materials Management' },
      [ROUTES.ADMIN_USERS]: { allowedRoles: ['super_admin'], label: 'User Management' },
      [ROUTES.ADMIN_COURSES]: { allowedRoles: ['super_admin'], label: 'Course Management' },
      [ROUTES.ADMIN_CLASSES]: { allowedRoles: ['super_admin'], label: 'Class Management' },
      [ROUTES.ADMIN_SESSIONS]: { allowedRoles: ['super_admin'], label: 'Session Management' },
      [ROUTES.ADMIN_SETTINGS]: { allowedRoles: ['super_admin'], label: 'Settings' },
      [ROUTES.ADMIN_BACKUP]: { allowedRoles: ['super_admin'], label: 'Backup & Recovery' },
    };
    ```
    **Note:** This file is being created for future use. Currently, route security is enforced by `<PrivateRoute requiredRole="super_admin">` wrappers in `App.jsx`. This config file provides a centralized, queryable registry of route permissions. If the app does not currently import or use `routeSecurity` anywhere, creating the file is still correct — it establishes the pattern for future route guards.
  - [ ] 7.8 Add the environment variable for the Worker URL. To find your actual Cloudflare workers.dev subdomain: (a) Run `npx wrangler whoami` in the `r2-backup-worker/` directory — it prints your account info. (b) Or deploy first with `npx wrangler deploy` — the output will print the full URL like `https://r2-backup-worker.your-actual-subdomain.workers.dev`. (c) Or check Cloudflare Dashboard → Workers & Pages → your worker → the URL is shown at the top. Once you have the actual URL, add it to `.env` in the **main kahoot project** (NOT in the worker): `VITE_BACKUP_WORKER_URL=https://r2-backup-worker.your-actual-subdomain.workers.dev`. ⚠️ **Do NOT push a placeholder like `<your-subdomain>` to production** — use the real URL. Also add to `.env.example` with a comment: `# Get this URL after deploying the worker (npx wrangler deploy)`.
  - [ ] 7.9 End-to-end smoke test checklist (manual): (1) Deploy the Worker via `npx wrangler deploy` in the `r2-backup-worker/` directory. (2) Verify health endpoint returns all green. (3) Navigate to Admin Dashboard → click "Backup" in sidebar → verify page loads. (4) Click "Backup Now" → verify confirmation dialog shows Firestore status → confirm → verify progress bar runs → verify success toast → verify history table updates. (5) Click "Download" on a backup → verify ZIP downloads. (6) Click "Restore" → verify preview loads with entity counts → confirm → verify progress → verify success. (7) Verify `system_flags/restore_in_progress` is set during restore and cleared after. (8) Verify notification/badge/streak services are blocked during restore (check console logs for "Skipped — restore in progress"). (9) Click "Media Backup" → verify delta calculation → verify file download. (10) Wait for next Monday 3 AM UTC → verify auto-backup triggers.
