# PRD-0026: Backup & Disaster Recovery System

**Version:** 1.1
**Created:** 2026-02-25
**Updated:** 2026-02-25 (post-review v1.1 — incorporated junior dev review feedback)
**Author:** AI (via Socratic PRD Process — 4 rounds of clarification)
**Status:** Draft
**Priority:** High (Data Protection)

---

## 1. Introduction / Overview

The application currently has **zero backup infrastructure**. All data (tests, results, student records, homework, courses, classes) exists only in a single Firebase project (Realtime Database + Firestore) and a single Cloudflare R2 bucket. If any of these are corrupted, accidentally deleted, or compromised, **all data is permanently lost**.

This PRD defines a **comprehensive backup and disaster recovery system** accessible only to administrators. It covers:

- **Automated weekly data backups** (RTDB + Firestore → Cloudflare R2 backup bucket)
- **Manual on-demand data backups** (RTDB + Firestore when quota allows → backup R2)
- **Incremental cascading media backups** (R2 audio/images → admin's local computer)
- **Full restore with conflict resolution** (merge UI, diff preview, partial restore support)

The system is designed for the **Firebase Spark Plan** (free tier) and operates within its constraints (10 GB/month RTDB download, 50K Firestore reads/day, 256 MB per RTDB read).

---

## 2. Goals

1. **G1:** Protect against total data loss by maintaining automated weekly backups of all database content.
2. **G2:** Enable the admin to manually create on-demand backups before risky operations.
3. **G3:** Enable incremental media backups that cascade (each captures only new files since the previous backup) for bandwidth efficiency.
4. **G4:** Provide a full restore capability with a visual diff preview and per-entity conflict resolution.
5. **G5:** Operate entirely within Firebase Spark Plan limits (~4.3% of monthly bandwidth per weekly backup).
6. **G6:** Store data backups in a **separate Cloudflare R2 bucket** (in a separate Cloudflare account) for disaster isolation.
7. **G7:** Retain the last 10 backup versions with automatic cleanup of older backups.

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-1 | Super Admin | See the backup dashboard with last backup time, next scheduled backup, and backup health | I know my data is protected at a glance |
| US-2 | Super Admin | Trigger a manual data backup with one click | I can create a snapshot before making risky changes |
| US-3 | Super Admin | Have the system automatically back up all data every week at Monday 3:00 AM UTC | Data is protected without my intervention |
| US-4 | Super Admin | View a list of all previous backups with timestamps, types, sizes, and status | I can choose which backup to restore from |
| US-5 | Super Admin | Trigger an incremental media backup that downloads new audio/image files to my computer | I have a local copy of all media assets |
| US-6 | Super Admin | Restore from a backup with a preview of what will change | I don't accidentally overwrite newer data |
| US-7 | Super Admin | Choose per-entity how to handle conflicts during restore (skip, overwrite, create duplicate) | I have full control over the restoration process |
| US-8 | Super Admin | Receive in-app notifications for backup success, failure, and skipped auto-backups | I'm always aware of backup health |
| US-9 | Super Admin | Have Firestore data included in all backups when quota allows, with automatic merge fallback on restore | My homework and submission data is always protected |

---

## 4. Functional Requirements

### 4.1 System Architecture

```
┌──────────────────────┐              ┌─────────────────────────────┐
│   Admin Browser       │ ──trigger──▶│  r2-backup-worker            │
│   (React App)        │ ◀──status───│  (Cloudflare Worker)         │
│                      │              │                              │
│  ┌─────────────────┐ │              │  Handles:                   │
│  │ Backup Tab      │ │              │  - Manual data backup        │
│  │ (Admin UI)      │ │              │  - Auto weekly backup (cron) │
│  └─────────────────┘ │              │  - Media delta calculation   │
│                      │              │  - Signed URL generation     │
│  Downloads media     │              │  - Restore operations        │
│  files directly via  │              │                              │
│  signed R2 URLs      │              │  State:                      │
│                      │              │  - backup_state.json (in     │
│  Uses Screen Wake    │              │    backup R2 — quota tracker, │
│  Lock API during     │              │    media chain state, lock)  │
│  long operations     │              │                              │
└──────────────────────┘              └──────────┬────────────────────┘
                                                 │
                                      ┌──────────┼───────────────┐
                                      │          │               │
                                ┌─────▼────┐ ┌──▼─────────┐ ┌──▼──────────┐
                                │ Firebase  │ │ Firestore  │ │ Primary R2  │
                                │ RTDB      │ │            │ │ Bucket      │
                                │ (REST API)│ │ (REST API) │ │ (S3 API)    │
                                │           │ │            │ │             │
                                │ Also:     │ └────────────┘ └─────────────┘
                                │ system_   │                       │
                                │ flags/    │       ┌───────────────┘
                                │ (restore  │       │
                                │  lock)    │ ┌─────▼──────────────────────────┐
                                └──────────┘ │  Backup R2 Bucket               │
                                             │  (SEPARATE Cloudflare Account)  │
                                             │                                │
                                             │  Contains:                      │
                                             │  - Data backup ZIPs             │
                                             │  - backup_state.json            │
                                             │  - backup_history.json          │
                                             │  - pre-restore/ snapshots       │
                                             │                                │
                                             │  Access: Write+List (no delete) │
                                             └────────────────────────────────┘
```

> **Authentication:** A single Google Cloud Service Account provides OAuth2 tokens used for BOTH Firebase RTDB REST API and Firestore REST API. No legacy Database Secrets are used.

### 4.2 Backup Types

There are exactly **two** backup types. There is NO "full backup" concept.

#### 4.2.1 Data Backup (Auto + Manual)

**What it contains:**
- All Firebase RTDB root nodes (JSON) — **dynamically discovered** (see §4.16 Auto-Expansion)
- All Firestore collections (JSON) — **dynamically discovered, adaptive inclusion** (see §4.16 + Firestore Read Budget below)
- Backup manifest with metadata and entity counts
- Media manifest listing all referenced media URLs with checksums

**What it does NOT contain:**
- Audio files, images, or avatars (media files)
- Ephemeral data: `temp/` R2 folder, `parsingCache/` Firestore collection

**Trigger:**
- **Automatic:** Every Monday at 3:00 AM UTC via Cloudflare Worker Cron Trigger
- **Manual:** Admin clicks "Backup Now" in the Backup tab

**Storage destination:** Backup R2 bucket (separate Cloudflare account)

**Firestore Adaptive Inclusion (Read Budget Check):**

Firestore data is included in **ALL backups** (auto AND manual) by default, subject to a **read budget check**:

**Canonical Algorithm (single source of truth):**
1. Worker reads `backup_state.json` from backup R2 → gets `firestoreReadsToday` counter and `lastResetDate`
2. If `lastResetDate !== today (UTC)` → reset counter to 0 (daily reset at midnight UTC)
3. Worker reads `entityCounts.firestore` from the **previous backup's manifest** (stored in backup R2 — free to read, no Firestore cost). This gives the estimated document count.
4. Calculate: `projectedTotal = firestoreReadsToday + estimatedDocCount`
5. If `projectedTotal > 25,000` (leaving a **25,000-read safety buffer** for production) → **skip Firestore** for this backup
6. If Firestore is included, after reading: increment `firestoreReadsToday` by actual docs read and write back to `backup_state.json`
7. When Firestore is skipped, the manifest records `"includesFirestore": false` and `"firestoreSkipReason": "read_budget_exceeded"`
8. The admin is notified: *"⚠️ Firestore data was skipped in this backup to preserve daily read quota. [X]/50,000 reads consumed today. The closest backup WITH Firestore data is from [date]."*

> ⚠️ **Why 25,000 buffer (not 20,000):** Production app usage can spike unpredictably (e.g., a teacher bulk-assigning homework to 50 students). 25,000 remaining reads ensures production is never starved.

> ⚠️ **Why use previous manifest counts (not a live count query):** Firestore `count()` aggregation queries cost 1 read per 1,000 documents. A live count itself would consume reads. Using the previous manifest's `entityCounts` is free (read from R2).

**Rationale:** As the app scales, homework submissions (Firestore) grow rapidly. Weekly-only Firestore backup would create an unacceptable 7-day data-loss window for homework data. Adaptive inclusion ensures Firestore is backed up as often as possible while protecting production from quota exhaustion.

**Fallback for backups without Firestore:** On restore, the system auto-merges Firestore data from the closest backup that HAS Firestore data (see §4.13.3).

#### 4.2.2 Media Backup (Manual Only)

**What it contains:**
- Audio files from `audio/` folder in primary R2
- Image files from `images/` folder in primary R2
- Avatar files from `avatars/` folder in primary R2 (optional, admin can toggle)

**Cascading/Incremental strategy:**
- The **first** media backup is a full snapshot (all files)
- Every subsequent media backup captures only **files added or modified** since the previous media backup
- Every **6th** media backup is a new full snapshot (checkpoint) to prevent chain dependency failure
- Pattern: `Full(1) → Delta(2) → Delta(3) → Delta(4) → Delta(5) → Full(6) → Delta(7)...`
- The chain metadata is stored server-side in `backup_state.json` in the backup R2 bucket (NOT in browser localStorage — this ensures chain integrity across devices/browsers)
- If the Worker cannot find valid chain state → **defaults to a full backup** (safe fallback)

**Trigger:** Admin clicks "Media Backup" in the Backup tab. Admin MUST be online.

**Storage destination:** Admin's local computer (browser download). NOT stored in backup R2.

**Download mechanism (CRITICAL — no Worker-side zipping):**

> ⚠️ **Cloudflare Workers have a 128 MB memory limit and strict CPU time limits.** Zipping hundreds of megabytes in a Worker causes OOM crashes or CPU limit errors. Therefore:

1. The Worker acts as a **Delta Calculator only** — it compares the current R2 file list against the previous media backup manifest and returns a JSON file list with **signed download URLs** for each file
2. The Admin UI receives the file list and downloads files **directly from primary R2** via signed URLs (concurrent downloads, 3-5 at a time)
3. The Admin UI uses the browser's **File System Access API** (if supported) to save files directly to a local directory, OR uses a client-side library (`fflate` / `client-zip`) to create a ZIP locally
4. If a single file download fails, the admin can retry that specific file without restarting the entire backup
5. The Worker generates the media backup manifest and stores it in the backup R2 bucket for chain tracking

### 4.3 Data Backup Scope — Complete Entity Map

#### 4.3.1 Firebase Realtime Database Nodes

| # | Node Path | Tier | Include in Backup | Notes |
|---|-----------|------|-------------------|-------|
| 1 | `users/` | Critical | ✅ Always | User profiles, roles, PII |
| 2 | `tests/` | Critical | ✅ Always | All test content (reading + listening) |
| 3 | `quizzes/` | Legacy | ✅ Always | Legacy quiz data |
| 4 | `classes/` | Critical | ✅ Always | Class definitions, enrollments |
| 5 | `game_sessions/` | Volatile | ✅ Always | Session data (skip `status: 'in-progress'`) |
| 6 | `test_results/` | Critical | ✅ Always | Student test results |
| 7 | `test_results_by_session/` | Index | ✅ Always | Regenerable but included for fast restore |
| 8 | `test_results_by_student/` | Index | ✅ Always | Regenerable but included for fast restore |
| 9 | `test_results_by_teacher/` | Index | ✅ Always | Regenerable but included for fast restore |
| 10 | `test_results_by_course/` | Index | ✅ Always | Regenerable but included for fast restore |
| 11 | `test_results_by_class/` | Index | ✅ Always | Regenerable but included for fast restore |
| 12 | `courses/` | Critical | ✅ Always | Course definitions, modules |
| 13 | `course_enrollments/` | Critical | ✅ Always | Student enrollments |
| 14 | `class_course_links/` | Important | ✅ Always | Class-course relationships |
| 15 | `course_materials/` | Important | ✅ Always | Material-module links |
| 16 | `course_progress/` | Important | ✅ Always | Student progress |
| 17 | `notifications/` | Regenerable | ✅ Always | Backed up for completeness; **excluded from restore by default** (see §4.13.6) to avoid spam |
| 18 | `audit_logs/` | Important | ✅ Always | Security audit trail. ⚠️ **Growth note:** This node grows unbounded. Future versions should add truncation (e.g., backup last 90 days only). |
| 19 | `deleted_users/` | Important | ✅ Always (with flag) | Backed up in full for audit. **Filtered during restore:** `status: 'completed'` entities excluded (GDPR). |
| 20 | `guest_results/` | Nice-to-have | ✅ Always | Guest user results |
| 21 | `invitations/` | Regenerable | ✅ Always | Class invitations |
| 22 | `badges/` | Important | ✅ Always | Student earned badges |
| 23 | `course_attendance/` | Important | ✅ Always | Module attendance records |

#### 4.3.2 Firestore Collections (Adaptive — All Backups When Quota Allows)

| # | Collection | Tier | Include in Backup | Notes |
|---|------------|------|-------------------|-------|
| 24 | `drafts/` | Volatile | ✅ Adaptive | Test creation drafts |
| 25 | `homework_assignments/` | Critical | ✅ Adaptive | Homework definitions |
| 26 | `homework_submissions/` | Critical | ✅ Adaptive | Student submissions — fastest growing collection |
| 27 | `homework_templates/` | Nice-to-have | ✅ Adaptive | Reusable templates |
| 28 | `student_streaks/` | Important | ✅ Adaptive | Practice streak data |
| 29 | `student_groups/` | Nice-to-have | ✅ Adaptive | Student groupings |
| 30 | `settings/api_keys` | Critical | ✅ Adaptive | Encrypted API keys (backup as-is) |

#### 4.3.3 NEVER BACKUP

| Item | Reason |
|------|--------|
| `temp/` R2 folder | Auto-deleted after 24h; ephemeral |
| `parsingCache/` Firestore | Ephemeral parsing state; can be regenerated |
| In-progress `game_sessions/` entries (`status: 'in-progress'`) | Volatile live data; backup only "settled" sessions |

### 4.4 Backup ZIP Structure

```
backup_2026-02-25T030000Z_auto/
├── manifest.json              ← Backup metadata (see §4.5)
├── media_manifest.json        ← List of all media URLs referenced by data
├── rtdb/
│   ├── users.json
│   ├── tests.json
│   ├── quizzes.json
│   ├── classes.json
│   ├── game_sessions.json
│   ├── test_results.json
│   ├── test_results_by_session.json
│   ├── test_results_by_student.json
│   ├── test_results_by_teacher.json
│   ├── test_results_by_course.json
│   ├── test_results_by_class.json
│   ├── courses.json
│   ├── course_enrollments.json
│   ├── class_course_links.json
│   ├── course_materials.json
│   ├── course_progress.json
│   ├── notifications.json
│   ├── audit_logs.json
│   ├── deleted_users.json
│   ├── guest_results.json
│   ├── invitations.json
│   ├── badges.json
│   └── course_attendance.json
└── firestore/                 ← Present when Firestore read budget allows (see §4.2.1)
    ├── drafts.json
    ├── homework_assignments.json
    ├── homework_submissions.json
    ├── homework_templates.json
    ├── student_streaks.json
    ├── student_groups.json
    └── settings_api_keys.json
```

> ⚠️ **Clarification:** `media_manifest.json` is a **reference list** of media files that exist in the primary R2 bucket. It does NOT contain the media files themselves — it is an inventory for verifying media integrity during restore.

### 4.5 Manifest Schema

```json
{
  "version": "1.0",
  "backupId": "BK-2026-02-25-030000-auto",
  "type": "data",
  "trigger": "auto",
  "createdAt": "2026-02-25T03:00:00.000Z",
  "completedAt": "2026-02-25T03:01:45.000Z",
  "durationMs": 105000,
  "status": "complete",
  "includesFirestore": true,
  "firestoreSkipReason": null,
  "firestoreCollectionsIncluded": ["drafts", "homework_assignments", "homework_submissions", "homework_templates", "student_streaks", "student_groups", "settings_api_keys"],
  "includesMedia": false,
  "workerVersion": "1.0.0",
  "firebaseProject": "your-project-id",
  "sparkPlanUsage": {
    "rtdbBytesRead": 115343872,
    "firestoreDocsRead": 16420
  },
  "entityCounts": {
    "rtdb": {
      "users": 205,
      "tests": 2000,
      "classes": 20,
      "test_results": 4000,
      "courses": 20,
      "notifications": 10000,
      "audit_logs": 50000
    },
    "firestore": {
      "homework_assignments": 100,
      "homework_submissions": 2000,
      "student_streaks": 200
    }
  },
  "totalSizeBytes": 119537664,
  "checksums": {
    "rtdb/users.json": "sha256:abc123...",
    "rtdb/tests.json": "sha256:def456..."
  },
  "previousBackupId": "BK-2026-02-18-030000-auto",
  "encryptionKeyVersion": "mstu-kahoot-api-keys-2026"
}
```

### 4.6 Media Manifest Schema

```json
{
  "version": "1.0",
  "generatedAt": "2026-02-25T03:01:00.000Z",
  "backupId": "BK-2026-02-25-030000-auto",
  "mediaFiles": [
    {
      "url": "https://pub-xxx.r2.dev/audio/12345-section1.mp3",
      "key": "audio/12345-section1.mp3",
      "type": "audio",
      "sizeBytes": 5242880,
      "referencedBy": ["tests/test-1234567890-abc"]
    },
    {
      "url": "https://pub-xxx.r2.dev/images/passage-img-456.png",
      "key": "images/passage-img-456.png",
      "type": "image",
      "sizeBytes": 204800,
      "referencedBy": ["tests/test-9876543210-xyz"]
    }
  ],
  "totalFiles": 1200,
  "totalSizeBytes": 6442450944,
  "categories": {
    "audio": { "count": 600, "sizeBytes": 6000000000 },
    "images": { "count": 580, "sizeBytes": 432000000 },
    "avatars": { "count": 20, "sizeBytes": 10450944 }
  }
}
```

### 4.7 Media Backup Manifest Schema

```json
{
  "version": "1.0",
  "mediaBackupId": "MB-005",
  "type": "full",
  "sequenceNumber": 5,
  "createdAt": "2026-02-25T10:30:00.000Z",
  "baseBackupId": "MB-001",
  "previousBackupId": "MB-004",
  "chainLength": 5,
  "isCheckpoint": true,
  "files": [
    {
      "key": "audio/12345-section1.mp3",
      "sizeBytes": 5242880,
      "lastModified": "2026-02-20T15:30:00.000Z",
      "chunkIndex": 0
    }
  ],
  "totalFiles": 1200,
  "totalSizeBytes": 6442450944,
  "chunks": [
    { "index": 0, "filename": "media_backup_MB005_chunk_0.zip", "sizeBytes": 524288000 },
    { "index": 1, "filename": "media_backup_MB005_chunk_1.zip", "sizeBytes": 524288000 }
  ],
  "downloadUrls": [
    "https://r2-backup-worker.xxx.workers.dev/download/MB-005/chunk/0?token=signed-url-token",
    "https://r2-backup-worker.xxx.workers.dev/download/MB-005/chunk/1?token=signed-url-token"
  ]
}
```

### 4.8 Worker Authentication

#### 4.8.1 Unified OAuth2 Authentication (RTDB + Firestore)

> ⚠️ **Design Decision:** Firebase Database Secrets are deprecated (legacy). Instead, a single **Google Cloud Service Account** provides OAuth2 tokens used for BOTH Firebase RTDB REST API and Firestore REST API.

- The entire Service Account JSON key (~2.3 KB) is stored as a Cloudflare Worker secret named `GOOGLE_SA_KEY`
- Worker mints OAuth2 access tokens from the Service Account key
- Token flow: `Service Account JSON → JWT → Google OAuth2 token endpoint → Access token (1h expiry)`
- **RTDB REST API:** `https://<projectId>.firebaseio.com/<node>.json?access_token=<OAUTH2_TOKEN>`
- **Firestore REST API:** `https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/<collection>` with `Authorization: Bearer <OAUTH2_TOKEN>`
- **Token refresh:** Before starting each collection/node read, the Worker checks remaining token validity. If `< 5 minutes remaining` → refresh token before proceeding. This prevents mid-backup token expiry.

#### 4.8.2 Backup R2 Access (Separate Account)
- Generate an **R2 S3-compatible API token** in the backup Cloudflare account
- Token must have permissions: `Object Read & Write` + `List` — **NO Delete permission**
- Store as Worker secrets: `BACKUP_R2_ACCESS_KEY_ID` and `BACKUP_R2_SECRET_ACCESS_KEY`
- Endpoint: `https://<backup-account-id>.r2.cloudflarestorage.com`
- Bucket name stored as Worker secret: `BACKUP_R2_BUCKET_NAME`

> ⚠️ **How retention cleanup works without delete permission:** Old backups and expired pre-restore snapshots are NOT deleted by the Worker. Instead, **R2 Object Lifecycle Rules** (configured in the backup Cloudflare account dashboard) automatically expire and delete objects based on their age. This means the Worker token truly never needs delete permission — lifecycle rules operate at the bucket level, independent of API tokens. See §4.11 for details and §11 for setup instructions.

#### 4.8.3 Primary R2 Access (For Media Backup)
- The Worker runs in the same Cloudflare account as the primary R2 bucket
- Use **R2 bucket binding** in `wrangler.toml` for direct access (no API token needed)

### 4.9 Backup Lock Mechanism

To prevent concurrent backups:

1. Before starting any backup, the Worker checks for `backup_lock.json` in the backup R2 bucket
2. If the lock exists and its `createdAt` is < 30 minutes old → **reject** with error "Another backup is in progress"
3. If the lock exists but is > 30 minutes old → **stale lock**, delete it and proceed
4. The Worker creates `backup_lock.json` with `{ backupId, createdAt, type }` before starting
5. The Worker deletes `backup_lock.json` after completion (success or failure)

### 4.10 Auto-Backup Retry Logic

When the weekly auto-backup fails:

1. **First failure:** Log error, wait 15 minutes, retry
2. **Second failure:** Log error, wait 15 minutes, retry
3. **Third failure:** Log error, mark backup as `failed`, send admin notification, **stop retrying**
4. The retry counter resets on the next scheduled backup (next Monday)
5. Each retry starts **from scratch** — partial uploads from previous attempts are overwritten. (Resuming mid-upload across Worker invocations is non-trivial and adds complexity without proportional benefit.)

### 4.11 Backup Retention Policy

> ⚠️ **Design Decision:** The Worker's R2 API token has **NO delete permission** (security — see §4.8.2). All object expiration is handled by **R2 Object Lifecycle Rules** configured in the backup Cloudflare account dashboard. The Worker never deletes anything.

**Lifecycle-based retention model:**

- **Data backups** (prefix `backups/`): R2 lifecycle rule auto-deletes objects **older than 77 days** (~11 weeks). With weekly auto-backups, this retains approximately the last 10–11 backups. Manual backups within this window are also retained.
- **Pre-restore snapshots** (prefix `pre-restore/`): R2 lifecycle rule auto-deletes objects **older than 14 days** (2 weeks). These are NOT counted toward the backup retention limit.
- **System state files** (`backup_state.json`, `backup_history.json`, `backup_lock.json`): No lifecycle rule — these are overwritten in place and never accumulate.
- **Media backups** (on admin's local machine): NOT managed by the system — admin is responsible for their own retention.
- The system maintains `backup_history.json` in the backup R2 bucket listing all data backups. When a backup's objects are expired by the lifecycle rule, the Worker's next backup run **prunes stale entries** from `backup_history.json` (entries whose backup files no longer exist in R2).

**Why 77 days (not exactly 70)?** 10 weekly backups = 70 days. Adding a 7-day buffer ensures the 10th backup isn't deleted before the 11th is fully written. Manual backups don't extend this — they simply coexist within the same window.

> ⚠️ **Admin responsibility:** If the admin triggers many manual backups (e.g., 5 in one week), older auto-backups may be pushed past the 77-day window and expire. This is acceptable — manual backups are more recent and more valuable.

### 4.12 Data Backup Bandwidth Budget

Based on estimated scale (2,000 tests, 205 users, 4,000 results):

| Resource | Spark Limit | Per Backup | Monthly (4 auto + ~2 manual) | % Used |
|----------|-------------|------------|------|--------|
| RTDB Download | 10 GB/month | ~110 MB | ~660 MB | 6.4% |
| Firestore Reads | 50,000/day | ~16,000 (when included) | Up to 16,000 × 6 = 96,000/mo | Max 32% on any backup day |
| RTDB Single Read | 256 MB max | Max node ~55 MB | N/A | Safe |

**Worst-case daily spike:** If 3 manual backups run on the same day AND all include Firestore: 3 × 16,000 = 48,000 reads. With the 25,000-read buffer, the adaptive algorithm would allow the first backup (16K), allow the second (32K < 50K - 25K = no, 32K < 25K? No, 32K > 25K → skip). **In practice, only the first manual backup of the day includes Firestore.** The algorithm self-regulates.

**Firestore optimization:** Batch reads 100 documents at a time with 500ms delay between batches to avoid spikes. Total Firestore backup adds ~80 seconds to duration.

**Adaptive budget example:** If app usage has consumed 35,000 Firestore reads by the time a manual backup triggers at 2 PM, the Worker estimates needing 16,000 reads → 35,000 + 16,000 = 51,000 > 50,000 limit → Firestore is **skipped** for this backup. The manifest records `includesFirestore: false`. At 3 AM Monday (low traffic, ~2,000 reads used), the auto-backup safely includes Firestore.

---

### 4.13 Restore System

#### 4.13.1 Restore Source

Admin can restore from:
- Any data backup in the backup R2 bucket (last 10)
- Upload a previously downloaded backup file from local storage

#### 4.13.2 Restore Scope

Admin selects which data categories to restore:
- Individual RTDB nodes (e.g., restore only `tests/` and `test_results/`)
- Individual Firestore collections (if available in backup or merged from weekly)
- "Restore All" option restores everything

#### 4.13.3 Firestore Merge for Backups Without Firestore

When restoring from a backup where Firestore was skipped (due to read budget):

1. System checks the backup's manifest for `includesFirestore: false`
2. System searches the backup history for the **closest backup** (by timestamp, any type) that has `includesFirestore: true`
3. System displays: *"This backup does not include Firestore data (skipped due to read quota). The closest backup WITH Firestore data is from [date], [X hours/days older]. Would you like to merge Firestore data from that backup?"*
4. If admin confirms → system loads Firestore data from the closest backup and includes it in the restore
5. The merge always treats the primary backup's RTDB data as authoritative. Firestore data from the merged backup is supplementary.
6. If no backup exists with Firestore data → system warns: *"No Firestore backup available. Homework assignments, submissions, and streaks will NOT be restored."*

**Note:** With adaptive inclusion, most backups WILL include Firestore (especially auto-backups at 3 AM). The merge fallback is a safety net for edge cases where quota was tight.

#### 4.13.4 Restore Preview (Diff)

Before restore executes, the system shows:

```
╔══════════════════════════════════════════════════╗
║  Restore Preview — Backup from Feb 25, 2026     ║
╠══════════════════════════════════════════════════╣
║  Category        │ Backup │ Current │ Status     ║
║  ─────────────────┼────────┼─────────┼────────── ║
║  Tests           │  2,000 │  2,050  │ 50 missing ║
║  Users           │    205 │    210  │  5 missing ║
║  Test Results    │  4,000 │  4,200  │ 200 missing║
║  Classes         │     20 │     20  │ Match      ║
║  Courses         │     20 │     22  │  2 missing ║
║  Homework (FS)   │    100 │    105  │  5 missing ║
║                  │        │         │ (merged)   ║
╠══════════════════════════════════════════════════╣
║  ⚠️ Warning: This backup is 3 days old.         ║
║  200 test results created since this backup      ║
║  will NOT be affected (skip mode).               ║
╠══════════════════════════════════════════════════╣
║  Default mode: SKIP existing entities            ║
║  [Switch to Per-Entity Mode] button              ║
╚══════════════════════════════════════════════════╝
```

**Default behavior:** Smart auto — skip existing entities, restore only missing ones. Show summary.

**Per-Entity Mode** (accessible via button): For each entity with conflicts, admin chooses:
- **Skip** — keep current data
- **Overwrite** — replace with backup data
- **Create Duplicate** — restore as new entity with new ID

#### 4.13.5 Restore Execution

1. **Pre-restore safety:** The system automatically creates a **snapshot** of the current RTDB state before restoring (saved in `pre-restore/` prefix in backup R2). **Pre-restore snapshots explicitly EXCLUDE Firestore** to avoid consuming Firestore reads during a time-sensitive restore operation. This is a conscious trade-off: the safety net protects RTDB (the larger data set) without risking Firestore quota.
2. **Restore order:** RTDB nodes first (in dependency order: users → tests → classes → results → indexes), then Firestore collections
3. **Progress tracking:** Each entity write is tracked. If restore fails midway:
   - Mark restore as `partial`
   - Show what was restored vs. what remains
   - Admin can retry the remaining entities without re-doing completed ones
4. **Post-restore validation:** After restore, system checks:
   - Entity count matches expect count from backup manifest
   - Index consistency (do all index entries point to existing entities?)
   - Media reference integrity (are all audio/image URLs accessible?)

#### 4.13.6 Restore Safety — Side Effect Prevention

During restore, the following side effects are **DISABLED**:

| Normal Behavior | Disabled During Restore | Reason |
|----------------|------------------------|--------|
| `createNotification()` on test result save | Disabled | Would spam students with old notifications |
| `checkAndAwardBadges()` on result save | Disabled | Would re-award badges incorrectly |
| `recordActivity()` for streak service | Disabled | Would inflate streak data |
| `sendHomeworkAssignedNotification()` | Disabled | Would send stale homework notifications |

**Implementation — Server-side RTDB flag (NOT a window global):**

> ⚠️ `window.__RESTORE_IN_PROGRESS` is an anti-pattern: it's fragile, doesn't survive tab closes, and cannot prevent server-side/Cloud Function triggers. Instead:

1. The Worker writes `system_flags/restore_in_progress: true` to RTDB **before** restore begins
2. All notification/badge/streak services check this RTDB flag before executing side effects: `if (await get(ref(database, 'system_flags/restore_in_progress'))) return;`
3. The Worker clears the flag (`set(ref, null)`) after restore completes (including on failure)
4. The Admin UI also reads this flag to show a "Restore in progress" banner
5. **Future-proof:** If Cloud Functions are added later (Blaze Plan), they also check this same flag
6. **Safety net:** If the Worker crashes mid-restore and never clears the flag, a stale flag (> 2 hours old) is auto-cleared by the next Worker invocation (similar to backup lock logic)

**Implementation — `withRestoreGuard()` Middleware Pattern:**

> ⚠️ **Design Decision (v1.1):** Instead of manually adding `isRestoreInProgress()` checks to each service individually, ALL restore-guarded services use a centralized middleware wrapper. This ensures new services automatically follow the pattern.

```typescript
// src/utils/restoreGuard.ts
export function withRestoreGuard<T>(serviceName: string, fallbackValue: T) {
  return function(originalFn: (...args: any[]) => Promise<T>) {
    return async function(...args: any[]): Promise<T> {
      if (await isRestoreInProgress()) {
        console.log(`[${serviceName}] Skipped — restore in progress`);
        return fallbackValue;
      }
      return originalFn(...args);
    };
  };
}

// Usage in any service:
export const createNotification = withRestoreGuard('Notification', { success: true, notificationId: undefined })(
  async (data: NotificationCreate) => { /* original implementation */ }
);
```

Any future service that triggers side effects during data writes MUST use this wrapper. See Integration Safety Rule #11.

#### 4.13.7 GDPR Protection During Restore

- Entities in `deleted_users/` where `status === 'completed'` are **automatically excluded** from restore
- The restore preview flags these: *"3 deleted user accounts excluded from restore (GDPR compliance)"*
- Admin cannot override this exclusion

---

### 4.14 Admin UI — Backup Tab

The Backup Tab is accessible via a new tab in the **Admin right sidebar**.

#### 4.14.1 Layout Structure

```
┌───────────────────────────────────────────────────────┐
│ 🛡️ Backup & Recovery                                  │
├───────────────────────────────────────────────────────┤
│                                                       │
│  ┌─ Dashboard Card ─────────────────────────────────┐ │
│  │ Last Backup: Feb 25, 2026 at 3:00 AM (auto)      │ │
│  │ Next Scheduled: Mar 4, 2026 at 3:00 AM           │ │
│  │ Status: ✅ Healthy — All backups succeeded        │ │
│  │ Storage: 4 of 10 backup slots used               │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Actions ────────────────────────────────────────┐ │
│  │ [📦 Backup Now]  [🖼️ Media Backup]  [♻️ Restore] │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Backup History ─────────────────────────────────┐ │
│  │ # │ Date & Time          │ Type   │ Size  │ Stat │ │
│  │ 1 │ Feb 25, 3:00 AM      │ Auto   │ 114MB │ ✅   │ │
│  │ 2 │ Feb 24, 10:30 AM     │ Manual │  98MB │ ✅   │ │
│  │ 3 │ Feb 18, 3:00 AM      │ Auto   │ 112MB │ ✅   │ │
│  │ 4 │ Feb 17, 2:15 PM      │ Manual │  97MB │ ✅   │ │
│  │                                                   │ │
│  │ Each row has: [Download] [Restore] [Details]      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Media Backup Status ────────────────────────────┐ │
│  │ Last Media Backup: Feb 20, 2026 (Delta #3)       │ │
│  │ Chain: Full(1) → Delta(2) → Delta(3)             │ │
│  │ Next checkpoint (full): Backup #6                 │ │
│  │ New files since last: 42 files (~210 MB)          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Settings ───────────────────────────────────────┐ │
│  │ Auto-Backup: ✅ Enabled (read-only)               │ │
│  │ Schedule: Every Monday at 3:00 AM UTC             │ │
│  │ ℹ️ Schedule change requires Worker redeployment    │ │
│  │ Retention: Keep last 10 backups                   │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

> ⚠️ **UX Note:** The admin UI implements the **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) during backup, restore, and media download operations to prevent browser/OS from suspending the tab. The lock is released on completion. A persistent banner reads: *"Please do not close this tab or put your computer to sleep until the process completes."*

#### 4.14.2 Backup Now Flow

1. Admin clicks "📦 Backup Now"
2. Worker performs **Firestore read budget check** silently
3. Confirmation dialog shows one of two messages:
   - If Firestore will be included: *"Create a manual data backup? This will back up all RTDB + Firestore data. Estimated size: ~114 MB."*
   - If Firestore will be skipped: *"Create a manual data backup? RTDB data will be backed up. ⚠️ Firestore data will be SKIPPED (daily read quota too low — [X]/50,000 reads used today). Firestore data from the last backup ([date]) can be merged during restore."*
4. Admin confirms → Worker starts backup
5. Progress bar shows: "Reading users... Reading tests... Reading results... Reading Firestore (if included)... Uploading to backup storage..."
6. On success: Toast notification "✅ Backup complete. [X] MB saved. Firestore: [included/skipped]."
7. On failure: Error toast with retry option

#### 4.14.3 Media Backup Flow

1. Admin clicks "🖼️ Media Backup"
2. Worker calculates delta: compares current R2 file list against last media manifest in backup R2
3. Info dialog: *"42 new media files found since last backup (Feb 20). Total download: ~210 MB. This is Delta backup #4 in the current chain."*
4. Admin confirms → Worker returns a JSON file list with **signed download URLs** for each new file
5. Admin UI prompts: "Choose a local folder to save files" (File System Access API) or "Download as ZIP" (client-side zipping via `fflate`)
6. Admin UI downloads files directly from R2 via signed URLs (3-5 concurrent downloads, with per-file progress)
7. If any file fails → admin can retry that specific file via a "Retry failed" button
8. Worker stores the updated media chain manifest in backup R2 (`backup_state.json`)
9. Toast: *"⚠️ This media backup is stored ONLY on your computer. Consider copying it to an external drive."*
10. ⚠️ **Chain integrity warning** (shown once per session): *"Media backup chain state is stored server-side. If chain becomes inconsistent, the system will default to a full media backup."*

#### 4.14.4 Restore Flow

1. Admin clicks "♻️ Restore" or clicks "Restore" on a specific backup row
2. System downloads and parses the backup manifest
3. If backup lacks Firestore data (`includesFirestore: false`) → offer Firestore merge from closest backup that has it
4. Show restore preview (§4.13.4)
5. Admin reviews and selects mode (Smart auto / Per-entity)
6. Confirmation with warning: *"⚠️ A pre-restore safety snapshot will be created first. This action will modify your live database."*
7. Pre-restore snapshot created automatically
8. Restore executes with progress bar
9. Post-restore validation runs
10. Summary: "✅ Restore complete. 1,950 tests restored, 50 skipped (already exist), 4,000 results restored."

### 4.15 Notifications

| Event | Notification Type | Message |
|-------|------------------|---------|
| Auto-backup succeeded | In-app (admin only) | "✅ Weekly backup completed successfully. 114 MB backed up." |
| Auto-backup failed (after 3 retries) | In-app (admin only) | "❌ Weekly backup failed after 3 attempts. Please check backup settings." |
| Auto-backup skipped (lock conflict) | In-app (admin only) | "⚠️ Weekly backup skipped — another backup is in progress." |
| Manual backup succeeded | In-app (admin only) | "✅ Manual backup completed. 98 MB backed up." |
| Restore completed | In-app (admin only) | "✅ Restore from [backup date] completed. [X] entities restored." |
| Restore failed | In-app (admin only) | "❌ Restore failed. [X/Y] entities restored. You can retry remaining." |

### 4.16 Auto-Expansion Design (Dynamic Discovery)

> ⚠️ **Design Decision (v1.1):** The backup system MUST automatically incorporate new RTDB nodes and Firestore collections as the app grows. **Failure mode of a static list is silent data loss** — nobody knows a new node isn't backed up until disaster strikes.

#### 4.16.1 Dynamic RTDB Discovery

Instead of hardcoding the 23 RTDB node names, the Worker **discovers** all top-level nodes at runtime:

1. `GET https://<projectId>.firebaseio.com/.json?shallow=true&access_token=<token>` → returns `{ "users": true, "tests": true, "newNode": true, ... }`
2. `Object.keys(response)` → gives ALL top-level node names
3. Filter out the **exclusion list**: `system_flags` (internal restore flag, not user data)
4. Read each remaining node individually

**Exclusion list (NOT inclusion list):**
```typescript
const RTDB_EXCLUDE = ['system_flags'];  // Internal flags, not user data
```

**Safety valve:** Before reading each node, check its size with `?shallow=true`. If the shallow response contains > 500,000 top-level keys, warn in the manifest but still back it up (it may just be a large legitimate node like `test_results`).

**Special handling (still hardcoded):**
- `game_sessions`: After reading, filter OUT entries where `status === 'in-progress'` (ephemeral live data)
- These special-case handlers are maintained in a `SPECIAL_HANDLERS` map in the backup code

#### 4.16.2 Dynamic Firestore Discovery

Instead of hardcoding the 7 Firestore collection names, the Worker discovers all collections:

1. Use Firestore REST API to list root collections: `GET https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents:listCollectionIds` with `Authorization: Bearer <token>` and body `{}`
2. Filter out the **exclusion list**: `parsingCache` (ephemeral, see §4.3.3)
3. Read each remaining collection (subject to adaptive read budget from §4.2.1)

**Exclusion list:**
```typescript
const FIRESTORE_EXCLUDE = ['parsingCache'];  // Ephemeral parsing state
```

#### 4.16.3 Restore Order for Unknown Nodes

The restore system maintains a **known dependency order** for existing nodes. New/unknown nodes discovered in the backup are restored **LAST**, after all known dependencies:

```typescript
const RTDB_RESTORE_ORDER = [
  // Known dependency order (existing nodes)
  'users', 'tests', 'quizzes', 'classes', 'courses',
  'course_enrollments', 'class_course_links', 'course_materials', 'course_progress',
  'test_results', 'game_sessions', 'deleted_users', 'guest_results',
  'invitations', 'badges', 'course_attendance', 'audit_logs',
  // Index nodes
  'test_results_by_session', 'test_results_by_student', 'test_results_by_teacher',
  'test_results_by_course', 'test_results_by_class',
];

const RTDB_SKIP_ON_RESTORE = ['notifications'];  // Excluded by default to prevent spam

// Any node in the backup that is NOT in RTDB_RESTORE_ORDER and NOT in RTDB_SKIP_ON_RESTORE
// is appended to the end and restored LAST.
```

This ensures:
- Existing nodes follow the correct dependency order
- New nodes (added by future features) are automatically included in backups AND restored (just not in a specific dependency position)
- The restore preview UI shows unknown nodes with a note: "(new — not in original restore plan)"

#### 4.16.4 Side-Effect Auto-Expansion

New services that trigger side effects during data writes MUST use the `withRestoreGuard()` middleware (see §4.13.6). This is enforced by **Integration Safety Rule #11** — see `documentation/integration-safety-rules.md`.

#### 4.16.5 Media Prefix Auto-Discovery

Media backup already uses `env.PRIMARY_R2.list({ prefix })` for `audio/`, `images/`, `avatars/`. If new media prefixes are added (e.g., `videos/`), the Worker should be updated to list the new prefix. However, since media prefixes change very rarely (unlike RTDB nodes), a static list is acceptable here. Add new prefixes to the `MEDIA_PREFIXES` constant:

```typescript
const MEDIA_PREFIXES = ['audio/', 'images/', 'avatars/'];  // Add new prefixes here
```

---

## 5. Non-Goals (Out of Scope)

1. **NOT in scope:** Real-time continuous backup (CDC / change data capture)
2. **NOT in scope:** Point-in-time recovery (restore to any arbitrary past moment)
3. **NOT in scope:** Cross-project migration (backup from one Firebase project, restore to another)
4. **NOT in scope:** Teacher or student-facing backup features (admin-only)
5. **NOT in scope:** Backup data encryption at rest — backup data is stored **unencrypted** in the private backup R2 bucket, protected by access control (API token). API keys within the backup are already encrypted at the application level. PII (student names, emails) is present in the backup but protected by the bucket's private access policy. Full encryption at rest can be added in a future version if needed.
6. **NOT in scope:** Automated media backup (media backup is always manual, admin must be online)
7. **NOT in scope:** Media file versioning (if a file is overwritten in R2, only the latest version is backed up)
8. **NOT in scope:** Backup scheduling configuration via UI (schedule is fixed at deploy time in `wrangler.toml`)

---

## 6. Design Considerations

### 6.1 UI Location
- Backup Tab added to the **Admin right sidebar** (same pattern as existing admin tabs)
- Only visible to users with `role === 'super_admin'`
- Use existing admin design patterns (no new design system needed)

### 6.2 Progress Indicators
- Use a **progress bar** that updates every 2 seconds during backup/restore
- Worker sends progress updates via polling (admin UI polls `GET /api/backup/status/{backupId}` every 2 seconds)

### 6.3 Color Coding
- ✅ Green: Successful backup
- ❌ Red: Failed backup
- 🟡 Yellow: In-progress or warnings
- 🔵 Blue: Information / media backup

---

## 7. Technical Considerations

### 7.1 Cloudflare Worker — `r2-backup-worker`

A **new Cloudflare Worker** project needs to be created and deployed. This is separate from the existing `r2-upload-signer` Worker.

#### 7.1.1 `wrangler.toml` Configuration

```toml
name = "r2-backup-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Cron trigger for weekly auto-backup
[triggers]
crons = ["0 3 * * 1"]  # Every Monday at 3:00 AM UTC

# Bind primary R2 bucket for media backup reads
[[r2_buckets]]
binding = "PRIMARY_R2"
bucket_name = "kahoot-media"  # Your actual bucket name

# Environment variables (non-secret)
[vars]
FIREBASE_PROJECT_ID = "your-project-id"
FIREBASE_DB_URL = "https://your-project-id.firebaseio.com"
BACKUP_RETENTION_COUNT = 10
MEDIA_CHECKPOINT_INTERVAL = 6

# Secrets (set via `wrangler secret put`)
# GOOGLE_SA_KEY          (Service Account JSON for RTDB + Firestore)
# BACKUP_R2_ACCESS_KEY_ID
# BACKUP_R2_SECRET_ACCESS_KEY
# BACKUP_R2_BUCKET_NAME
# BACKUP_R2_ENDPOINT
```

#### 7.1.2 Worker Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/backup/trigger` | Admin token | Trigger manual data backup. **Returns immediately** with `{ backupId }`. Actual work runs async via `waitUntil()`. |
| POST | `/api/backup/media/delta` | Admin token | Calculate media delta and return signed download URLs for new files |
| GET | `/api/backup/status/{backupId}` | Admin token | Get backup progress/status (polled by admin UI every 2s) |
| GET | `/api/backup/history` | Admin token | List all backups from `backup_history.json` in backup R2 |
| GET | `/api/backup/download/{backupId}` | Admin token | Download a data backup ZIP |
| POST | `/api/restore/preview` | Admin token | Generate restore preview diff |
| POST | `/api/restore/execute` | Admin token | Execute restore. Returns immediately with `{ restoreId }`. Async via `waitUntil()`. |
| GET | `/api/restore/status/{restoreId}` | Admin token | Get restore progress (polled by admin UI) |
| GET | `/api/backup/health` | Admin token | System health: R2 connectivity, Firebase connectivity, quota status |
| `scheduled` | (cron) | N/A | Auto weekly backup |

> ⚠️ **Worker Async Pattern:** HTTP-triggered Workers have a 30-second CPU time limit. However, I/O operations (waiting for Firebase/R2 responses) do NOT count against CPU time. For a backup that is ~90% I/O, 30 seconds of CPU is sufficient. The `POST /trigger` and `POST /restore/execute` endpoints use `ctx.waitUntil(backupPromise)` to return a response immediately while the work continues in the background. The admin UI polls the status endpoint.

#### 7.1.3 Admin Authentication for Worker

The Worker verifies admin requests using:
1. Admin sends their Firebase ID token in the `Authorization: Bearer <idToken>` header
2. Worker verifies the ID token using Firebase Auth REST API (signature + expiry check)
3. Worker reads the `role` **custom claim** directly from the decoded ID token payload (no separate RTDB lookup needed — custom claims are embedded in the JWT by your auth setup)
4. Worker checks that `role === 'super_admin'`
5. If verification fails → 403 Forbidden

### 7.2 Frontend Integration

#### 7.2.1 New Service File
Create `src/services/backupService.ts` that wraps all Worker API calls.

#### 7.2.2 New Admin Page Component
Create `src/pages/AdminBackupPage.tsx` with the Backup Tab UI.

#### 7.2.3 Route Addition
Add route `/admin/backup` to `App.jsx` — admin-only.

### 7.3 Dependencies

- **No new npm packages** required in the main app
- Worker project uses: `wrangler`, `@aws-sdk/client-s3` (for R2 S3-compatible API to backup account)
- Worker project is a **separate codebase** from the main app

### 7.4 Spark Plan Safety

- The Worker must log bandwidth usage per backup in the manifest
- If RTDB download for a single backup exceeds 500 MB → abort and warn admin
- A health check endpoint allows the admin UI to display estimated monthly bandwidth usage

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Auto-backup success rate | ≥ 95% (48 out of 52 weekly backups per year) |
| Backup duration | < 5 minutes for data backup |
| Restore accuracy | 100% entity restoration for selected categories |
| Spark Plan bandwidth usage | < 10% of monthly limit for auto-backups |
| Media backup frequency | Worker logs a `media_backup_requested` event per request; target ≥ 1/month |
| Recovery time objective (RTO) | < 30 minutes from decision to restore to completion |
| RTDB data loss window | Maximum 7 days (weekly auto-backup) |
| Firestore data loss window (worst case) | Up to 14 days if Firestore quota prevents inclusion for 2 consecutive weeks — acknowledged and accepted as a Spark Plan constraint |

---

## 9. Convolutions, Irregularities & Preventions

This section documents all identified risks, edge cases, and their mitigations. It was compiled across 4 rounds of Socratic questioning.

| # | Scenario | Problem | Prevention/Solution |
|---|----------|---------|---------------------|
| 1 | **Dual database (RTDB + Firestore)** | Two read strategies, two export formats | Single OAuth2 token for both. Export separately into `rtdb/` and `firestore/` folders. |
| 2 | **Spark Plan RTDB 256 MB per-read limit** | Cannot read entire database in one call | Read each root node separately (max node ~55 MB, well under limit). |
| 3 | **Spark Plan 10 GB/month download** | Backups consume production bandwidth | Budget: ~660 MB/month for 6 backups = 6.4% of limit. Safe. |
| 4 | **Spark Plan 50K Firestore reads/day** | Backup day Firestore reads compete with production | Adaptive read budget check (see §4.2.1). Batch 100 docs with 500ms delay. 25K safety buffer. |
| 5 | **Worker 128 MB memory limit** | Cannot buffer entire database or ZIP media in memory | Data: Stream read each node → write to R2 immediately. Media: Worker is delta calculator only; client downloads files directly via signed URLs. |
| 6 | **Worker CPU time (30 sec HTTP, 15 min cron)** | HTTP-triggered backup might timeout | HTTP endpoints return immediately via `ctx.waitUntil()`. Actual work is async. Admin polls `/status` endpoint. Note: I/O time (waiting for Firebase/R2) does NOT count against CPU limit. |
| 7 | **Concurrent backup conflict** | Two backups running simultaneously | Backup lock file in R2 with 30-minute timeout. Both auto-→manual and manual→auto lock conflicts emit notifications. |
| 8 | **Auto-backup retry storm** | Firebase down → unlimited retries → bandwidth waste | Max 3 retries, 15 min apart. Each retry from scratch. After 3 failures → mark as failed → notify admin. |
| 9 | **Restore GDPR-deleted users** | `deleted_users/` with `status: completed` restored → violates GDPR | Auto-exclude from restore. Admin cannot override. |
| 10 | **Restore version conflict** | Old backup overwrites newer data | Restore preview shows entity age diff + count of newer modifications. |
| 11 | **Partial restore failure** | Network drops mid-restore | Track progress per-entity. Mark as `partial`. Admin retries remaining. |
| 12 | **Notification spam on restore** | Old test results trigger "Test Complete" notifications | RTDB flag `system_flags/restore_in_progress` disables all side effects. Stale flags (>2h) auto-cleared. Future-proof for Cloud Functions on Blaze. |
| 13 | **Index consistency on restore** | Restoring `test_results/` without indexes → orphan references | Always restore data + indexes together. Include index regeneration utility as fallback. |
| 14 | **Encrypted API keys** | If code-level encryption key changes, old backups can't decrypt | Store `encryptionKeyVersion` in manifest. Validate on restore. |
| 15 | **Backup R2 deletion by compromised primary account** | Attacker uses Worker's stored R2 credentials to delete backups | R2 API token has **write + list only, NO delete**. Old backups are expired by R2 Object Lifecycle Rules (configured in the backup account dashboard, not accessible via API token). Attacker can overwrite objects but cannot delete them or change lifecycle rules without backup account login. |
| 16 | **Backup lacks Firestore (quota skip)** | Backup created when Firestore daily quota was too low | Adaptive inclusion with 25K safety buffer. Auto-merge from closest backup that has Firestore on restore. |
| 17 | **Cascading media backup chain break** | Lost delta → can't reconstruct files from that period | Every 6th media backup is a full checkpoint. Chain state stored server-side in backup R2. If chain state lost/inconsistent → default to full backup. |
| 18 | **Media backup local-only storage** | Admin's hard drive fails → media backup lost permanently | Warning toast after download. System cannot enforce external storage. |
| 19 | **Large media backup via browser** | Full base backup could be 12+ GB | Client downloads files directly via signed URLs (no Worker zipping). Per-file retry. File System Access API for direct folder save. Screen Wake Lock prevents browser sleep. |
| 20 | **Admin browser sleep during long operations** | Browser suspends tab → operations break | Screen Wake Lock API (`navigator.wakeLock.request('screen')`) acquired during backup/restore/media download. Released on completion. |
| 21 | **Stale backup lock** | Worker crashes → lock never released → future backups blocked | Locks older than 30 minutes are considered stale and auto-deleted. |
| 22 | **In-progress game sessions in backup** | Backup captures mid-test session data → inconsistent state | Skip `game_sessions/` entries where `status === 'in-progress'`. After restore, client must handle missing sessions gracefully (show "Session Expired" instead of crashing). |
| 23 | **Restore while students are active** | Restore writes conflict with live student submissions | Pre-restore warning + `system_flags/restore_in_progress` RTDB flag shows maintenance banner to students. |
| 24 | **Media backup Worker zipping** | (Eliminated) Worker no longer zips media | Worker is delta calculator only. Client downloads directly via signed URLs. |
| 25 | **Firestore read quota estimation inaccuracy** | Firebase doesn't expose exact quota usage | Worker tracks its own daily reads in `backup_state.json` (in backup R2) with midnight UTC reset. Conservative 25K safety buffer ensures production is never starved. |
| 26 | **Worker timeout during restore** | Restore writes could take longer than Worker limits allow | Restore uses same `ctx.waitUntil()` async pattern. Admin polls `/restore/status`. If restore takes >15 min (unlikely for ~110 MB), it is chunked across multiple Worker invocations. |
| 27 | **Backup R2 bucket capacity** | 10 backups × ~114 MB = ~1.14 GB + pre-restore snapshots | Well within R2 free tier (10 GB). Monitor: if total exceeds 8 GB, warn admin in dashboard. |
| 28 | **Pre-restore snapshot Firestore exclusion** | Pre-restore snapshot skips Firestore to preserve quota | Explicit design choice. Documented in §4.13.5. RTDB (the larger dataset) is always protected by the pre-restore snapshot. |
| 29 | **New RTDB node/Firestore collection not backed up** | Feature adds new data node, backup code doesn't know about it | Dynamic discovery (§4.16): Worker reads all top-level RTDB keys and all Firestore collections at runtime, using an exclusion list instead of an inclusion list. New data is automatically included. |
| 30 | **New side-effect service fires during restore** | Future service writes to RTDB on data events, not guarded | `withRestoreGuard()` middleware pattern (§4.13.6) + Integration Safety Rule #11. All guarded services use the same wrapper, enforced by code review rule. |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | What is the exact Cloudflare R2 bucket name for the primary bucket? | ❓ Needs from admin |
| 2 | Does the admin have access to Firebase Console → Project Settings → Service Accounts? | ❓ Needs verification |
| 3 | Should the backup Worker be hosted under a custom domain or use the default `workers.dev` domain? | 🟢 **Recommendation:** Use `workers.dev` subdomain for now. Custom domain can be added later without code changes. |
| 4 | What is the admin's timezone for display purposes? (UTC+7 based on conversation) | Assumed UTC+7 |

---

## 11. Cloudflare R2 Backup Account Setup Guide

> ⚠️ **Why a separate account?** If your primary Cloudflare account is compromised (credential leak, session hijack), an attacker could delete your production R2 bucket AND any backups stored in the same account. A **separate account** ensures backups survive even a full primary account compromise. The backup account has its own login, its own 2FA, and its own billing — completely isolated.

### Step-by-step instructions for the admin:

#### Phase 1: Account & Bucket Creation

1. **Create a new Cloudflare account:**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Click "Sign Up" → use a **different email** than your primary account
   - Verify email
   - ⚠️ **Strongly recommended:** Enable **2FA** (Two-Factor Authentication) on this account immediately (Account → My Profile → Authentication → Two-Factor Authentication). This is your last line of defense for backups.

2. **Enable R2 in the backup account:**
   - In the new account dashboard → R2 Object Storage → "Get started"
   - No credit card needed for free tier (10 GB storage, 1M Class A operations/month, 10M Class B operations/month)
   - ⚠️ **Free tier is sufficient:** 10 backups × ~114 MB = ~1.14 GB + pre-restore snapshots ≈ 2 GB max. Well within the 10 GB free limit.

3. **Create the backup bucket:**
   - R2 → Create Bucket → Name: `kahoot-backups`
   - Location: Auto (or choose same region as primary for speed)
   - **Do NOT enable public access** — this bucket must be private

#### Phase 2: Object Lifecycle Rules (Critical for Automatic Retention)

> ⚠️ **Why this matters:** The backup Worker's API token intentionally has **NO delete permission** (security measure — see §4.8.2). Without lifecycle rules, old backups would accumulate forever and eventually exceed the 10 GB free tier. Lifecycle rules handle automatic cleanup at the bucket level, without requiring any API token permissions.

4. **Configure lifecycle rule for data backups:**
   - In the backup account dashboard → R2 → `kahoot-backups` bucket → Settings tab
   - Under "Object lifecycle rules" → "Add rule"
   - **Rule 1 — Data Backup Retention:**
     - Rule name: `auto-expire-old-backups`
     - Prefix filter: `backups/`
     - Action: **Delete objects** after **77 days**
     - Click "Save"
   - ⚠️ **Why 77 days:** Weekly auto-backups × 10 = 70 days of retention. The extra 7 days is a safety buffer so the 10th backup isn't deleted before the 11th is fully uploaded.

5. **Configure lifecycle rule for pre-restore snapshots:**
   - Add another lifecycle rule:
   - **Rule 2 — Pre-Restore Snapshot Cleanup:**
     - Rule name: `auto-expire-pre-restore-snapshots`
     - Prefix filter: `pre-restore/`
     - Action: **Delete objects** after **14 days**
     - Click "Save"
   - ⚠️ **Why 14 days:** Pre-restore snapshots are safety nets created before a restore operation. If you haven't needed to roll back within 2 weeks, the snapshot is no longer useful.

6. **Verify lifecycle rules are active:**
   - After saving, the Settings tab should show:
     ```
     Object lifecycle rules:
     ✅ auto-expire-old-backups     | Prefix: backups/      | Delete after 77 days
     ✅ auto-expire-pre-restore-snapshots | Prefix: pre-restore/ | Delete after 14 days
     ```
   - ⚠️ **No rule needed for system files:** `backup_state.json`, `backup_history.json`, and `backup_lock.json` are stored at the bucket root (no prefix). They are overwritten in place by the Worker and never accumulate — no lifecycle rule needed.

#### Phase 3: API Token Creation

7. **Create an API token for the backup Worker:**
   - R2 → Manage R2 API Tokens → Create API Token
   - Name: `backup-worker-write`
   - Permissions: **Object Read & Write**
   - Bucket scope: `kahoot-backups` only
   - ⚠️ **DO NOT grant "Delete" permission** — old backups are handled by lifecycle rules (configured above). The Worker should never be able to delete backups, even if the Worker's credentials are compromised.
   - Copy the **Access Key ID** and **Secret Access Key** — store them securely (password manager recommended). You will need them in Phase 4.
   - Also note the **Account ID** (visible in the URL: `dash.cloudflare.com/<account-id>/...`)

#### Phase 4: Connect Worker to Backup Bucket

8. **Store credentials in the primary account's Worker:**
   ```bash
   # In the r2-backup-worker project directory:
   wrangler secret put BACKUP_R2_ACCESS_KEY_ID
   # Paste the Access Key ID from Step 7
   
   wrangler secret put BACKUP_R2_SECRET_ACCESS_KEY
   # Paste the Secret Access Key from Step 7
   
   wrangler secret put BACKUP_R2_BUCKET_NAME
   # Type: kahoot-backups
   
   wrangler secret put BACKUP_R2_ENDPOINT
   # Type: https://<backup-account-id>.r2.cloudflarestorage.com
   # Replace <backup-account-id> with the Account ID noted in Step 7
   ```

#### Phase 5: Verification

9. **Deploy and verify:**
   - Deploy the Worker: `wrangler deploy`
   - Visit `https://r2-backup-worker.<your-subdomain>.workers.dev/api/backup/health`
   - Should return: `{ "status": "ok", "primaryR2": true, "backupR2": true, "firebase": true }`
   - If `backupR2` is `false` → double-check the Account ID in the endpoint URL, and verify the API token has `Object Read & Write` + `List` permissions.

10. **Test the full cycle (recommended):**
    - Trigger a manual backup from the Admin UI → verify a backup ZIP appears in the `backups/` prefix of the `kahoot-backups` bucket
    - Check that the backup appears in the Admin UI's Backup History
    - Wait 1 minute, then trigger another → verify backup lock mechanism works (should succeed since first backup is likely complete)

#### Checklist Summary

| Step | Item | Status |
|------|------|--------|
| 1 | New Cloudflare account created (separate email) | ☐ |
| 1 | 2FA enabled on backup account | ☐ |
| 2 | R2 enabled in backup account | ☐ |
| 3 | `kahoot-backups` bucket created (private) | ☐ |
| 4 | Lifecycle rule: `backups/` → 77 days | ☐ |
| 5 | Lifecycle rule: `pre-restore/` → 14 days | ☐ |
| 7 | API token created (Read+Write+List, NO Delete) | ☐ |
| 8 | 4 Worker secrets set (`BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `BACKUP_R2_BUCKET_NAME`, `BACKUP_R2_ENDPOINT`) | ☐ |
| 9 | Health endpoint returns all `true` | ☐ |
| 10 | Manual backup test succeeded | ☐ |

---

## 12. Google Cloud Service Account Setup Guide

The backup Worker uses a Google Cloud Service Account for both RTDB and Firestore REST API authentication.

### Step-by-step:

1. **Open Google Cloud Console:**
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - Select the project linked to your Firebase project (same project ID)

2. **Navigate to Service Accounts:**
   - IAM & Admin → Service Accounts
   - Click "+ CREATE SERVICE ACCOUNT"

3. **Configure the Service Account:**
   - Name: `backup-worker`
   - ID: `backup-worker` (auto-generated)
   - Description: "Used by r2-backup-worker Cloudflare Worker for backup/restore operations"
   - Click "CREATE AND CONTINUE"

4. **Grant Roles:**
   - Role 1: `Firebase Realtime Database Viewer` (for RTDB reads)
   - Role 2: `Cloud Datastore User` (for Firestore reads)
   - For restore, also add: `Firebase Realtime Database Admin` and `Cloud Datastore Owner`
   - Click "DONE"

5. **Create JSON Key:**
   - Click on the newly created service account
   - Keys tab → Add Key → Create New Key → JSON
   - Download the JSON file (~2.3 KB)
   - ⚠️ **Keep this file secure. Do not commit to git.**

6. **Store in Worker:**
   ```bash
   # In the r2-backup-worker project directory:
   # Paste the ENTIRE JSON content when prompted:
   wrangler secret put GOOGLE_SA_KEY
   ```

7. **Verify:** The Worker's `/api/backup/health` endpoint will confirm Firebase connectivity.

---

## 13. Forward-Looking: Blaze Plan Migration Strategy

> 📡 **Strategic Context:** This backup system is designed for the **Spark Plan** (free tier). Several design decisions — particularly the Firestore adaptive read budget and the 25,000-read safety buffer — exist solely because of Spark Plan constraints.

**When you upgrade to Blaze Plan (pay-as-you-go), the following changes become possible:**

| Current Limitation | Blaze Plan Unlock | PRD Impact |
|---|---|---|
| 50K Firestore reads/day | Unlimited (pay per read: $0.06/100K) | Remove adaptive budget check. Include Firestore in ALL backups unconditionally. |
| No Cloud Functions | Cloud Functions available | Can add server-side backup triggers (e.g., auto-backup before account deletion), and the `system_flags/restore_in_progress` RTDB flag becomes even more critical for Cloud Function side-effect prevention. |
| 10 GB/month RTDB download | Unlimited (pay per GB: $1/GB) | Remove 500 MB abort threshold. Allow larger databases. |
| No Firebase Admin SDK server-side | Firebase Admin SDK available | Can use `database.export()` for atomic RTDB exports instead of per-node REST reads. |

**Migration action items for Blaze upgrade:**
1. Remove Firestore adaptive budget logic from Worker
2. Set `FIRESTORE_ALWAYS_INCLUDE = true` in Worker config
3. Remove 25K safety buffer code paths
4. Consider increasing auto-backup frequency from weekly to daily
5. Consider adding Cloud Function triggers for event-driven backups

> This context is included so that a future maintainer understands WHY the design is the way it is, and what to change when constraints are lifted.

---
