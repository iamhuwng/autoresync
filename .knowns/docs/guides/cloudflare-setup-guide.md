---
title: Cloudflare Setup Guide
createdAt: '2026-02-27T15:25:19.321Z'
updatedAt: '2026-02-27T15:25:20.577Z'
description: Guide for setting up Cloudflare R2 storage and workers for file uploads
tags:
  - cloudflare
  - r2
  - storage
  - setup
---
# Cloudflare Setup Guide — Backup Worker (PRD-0026)

> **Purpose:** Step-by-step guide to set up the Cloudflare infrastructure needed before deploying the `r2-backup-worker`. This covers the **backup Cloudflare account**, **Google Cloud Service Account**, and **Worker deployment**.
>
> **Prereqs:** You must have access to `iamhuwng` Cloudflare account (primary) and the `temp-a1437` Firebase project.

---

## Quick Reference — What Needs to Be Set Up

| Item | Where | Status |
|------|-------|--------|
| Backup Cloudflare account | New account (separate email) | ☐ |
| Backup R2 bucket `kahoot-backups` | Backup account | ☐ |
| R2 lifecycle rules (2 rules) | Backup account → bucket settings | ☐ |
| R2 API token (Read+Write, NO Delete) | Backup account | ☐ |
| Google Cloud Service Account | `temp-a1437` project | ☐ |
| 5 Worker secrets | Primary account → Worker | ☐ |
| 1 Worker env var (`ADMIN_UID`) | `wrangler.toml` | ☐ |
| 1 Main app env var (`VITE_BACKUP_WORKER_URL`) | Main project `.env` | ☐ |
| Worker deployment | Primary account | ☐ |
| Health check verification | Browser | ☐ |

---

## Phase 1: Create Backup Cloudflare Account (Separate from Primary)

> ⚠️ **Why separate?** If your `iamhuwng` account is compromised, an attacker could delete production R2 AND any backups stored in the same account. A separate account means backups survive even a total primary account compromise.

1. **Go to [dash.cloudflare.com](https://dash.cloudflare.com)**
2. Click **"Sign Up"** → use a **different email** than your primary `iamhuwng` account
3. Verify your email
4. **Enable 2FA immediately:**
   - Account → My Profile → Authentication → Two-Factor Authentication
   - This is your last line of defense for backups

---

## Phase 2: Create Backup R2 Bucket

1. In the **backup account** dashboard → **R2 Object Storage** → "Get started"
   - No credit card needed for free tier (10 GB storage, sufficient for ~2 GB of backups)
2. Click **Create Bucket**:
   - **Name:** `kahoot-backups`
   - **Location:** Auto (or same region as primary for speed)
   - ⚠️ **Do NOT enable public access** — bucket must be private
3. Verify: You should see `kahoot-backups` in your R2 dashboard

---

## Phase 3: Configure R2 Lifecycle Rules (Critical!)

> ⚠️ Without these rules, old backups accumulate forever and exceed the 10 GB free tier. The Worker intentionally has NO delete permission — lifecycle rules handle cleanup.

1. Go to **R2** → `kahoot-backups` bucket → **Settings** tab
2. Under **"Object lifecycle rules"** → **"Add rule"**

### Rule 1 — Data Backup Retention:
| Field | Value |
|-------|-------|
| Rule name | `auto-expire-old-backups` |
| Prefix filter | `backups/` |
| Action | **Delete objects** after **77 days** |

> 77 days = 10 weekly backups (70 days) + 7-day buffer so the oldest isn't deleted before the newest finishes uploading.

### Rule 2 — Pre-Restore Snapshot Cleanup:
| Field | Value |
|-------|-------|
| Rule name | `auto-expire-pre-restore-snapshots` |
| Prefix filter | `pre-restore/` |
| Action | **Delete objects** after **14 days** |

> Pre-restore snapshots are safety nets. If unused within 2 weeks, they're no longer valuable.

3. **Verify** — Settings tab should show:
```
Object lifecycle rules:
✅ auto-expire-old-backups           | Prefix: backups/      | Delete after 77 days
✅ auto-expire-pre-restore-snapshots | Prefix: pre-restore/  | Delete after 14 days
```

> No rule needed for `backup_state.json`, `backup_history.json`, `backup_lock.json` — these are overwritten in place and never accumulate.

---

## Phase 4: Create R2 API Token (Backup Account)

1. In the **backup account**: **R2** → **Manage R2 API Tokens** → **Create API Token**
2. Configure:
   | Field | Value |
   |-------|-------|
   | Token name | `backup-worker-write` |
   | Permissions | **Object Read & Write** |
   | Bucket scope | `kahoot-backups` only |

   > ⚠️ **DO NOT grant "Delete" permission.** Old backups are handled by lifecycle rules. The Worker should never be able to delete backups, even if credentials are compromised.

3. Click **Create** → You'll see:
   - **Access Key ID** (starts with something like `a1b2c3d4...`) — copy and save securely
   - **Secret Access Key** (shown only once) — copy and save securely
4. Also note the **Account ID** — visible in the URL: `dash.cloudflare.com/<account-id>/...`
   - You need this for the R2 endpoint URL

**Save these 3 values:**
```
Access Key ID:     ________________________________
Secret Access Key: ________________________________
Account ID:        ________________________________
```

The endpoint URL you'll need later is: `https://<account-id>.r2.cloudflarestorage.com`

---

## Phase 5: Create Google Cloud Service Account

> This single Service Account provides OAuth2 tokens for BOTH Firebase RTDB and Firestore REST API access.

1. **Go to [console.cloud.google.com](https://console.cloud.google.com)**
2. Select project: **`temp-a1437`** (your Firebase project)
3. Navigate: **IAM & Admin** → **Service Accounts** → **"+ CREATE SERVICE ACCOUNT"**
4. Configure:
   | Field | Value |
   |-------|-------|
   | Name | `backup-worker` |
   | ID | `backup-worker` (auto-generated) |
   | Description | `Used by r2-backup-worker for backup/restore operations` |
5. Click **"CREATE AND CONTINUE"**
6. **Grant roles** (add all 4):
   | Role | Purpose |
   |------|---------|
   | `Firebase Realtime Database Viewer` | Read RTDB for backups |
   | `Firebase Realtime Database Admin` | Write RTDB for restores + system flags |
   | `Cloud Datastore User` | Read Firestore for backups |
   | `Cloud Datastore Owner` | Write Firestore for restores |
7. Click **"DONE"**
8. **Create JSON key:**
   - Click on the `backup-worker` service account
   - **Keys** tab → **Add Key** → **Create New Key** → **JSON**
   - Download the JSON file (~2.3 KB)
   - ⚠️ **Keep this file secure. Do NOT commit to git.**

**Save this file — you'll paste its entire contents as a Worker secret in the next phase.**

---

## Phase 6: Set Worker Secrets & Environment Variables

### 6a. Find Your Admin UID

Your Firebase UID for the `super_admin` account. You can find it in:
- Firebase Console → Authentication → Users → copy the UID of your admin account
- Or check the browser DevTools while logged in as admin: `firebase.auth().currentUser.uid`

### 6b. Update `wrangler.toml`

Open `r2-backup-worker/wrangler.toml` and set your admin UID:

```toml
ADMIN_UID = "<your-firebase-admin-uid>"  # Replace with actual UID
```

The other `[vars]` are already set correctly:
- `FIREBASE_PROJECT_ID = "temp-a1437"` ✅
- `FIREBASE_DB_URL = "https://temp-a1437-default-rtdb.firebaseio.com"` ✅
- `BACKUP_RETENTION_COUNT = "10"` ✅
- `MEDIA_CHECKPOINT_INTERVAL = "6"` ✅

### 6c. Set Worker Secrets (5 secrets)

Run these commands **from the `r2-backup-worker/` directory**:

```powershell
# 1. Google Service Account — paste the ENTIRE JSON content when prompted
npx wrangler secret put GOOGLE_SA_KEY
# When prompted, paste the entire contents of the JSON key file you downloaded in Phase 5

# 2. Backup R2 Access Key ID — from Phase 4
npx wrangler secret put BACKUP_R2_ACCESS_KEY_ID
# Paste: the Access Key ID from Phase 4

# 3. Backup R2 Secret Access Key — from Phase 4
npx wrangler secret put BACKUP_R2_SECRET_ACCESS_KEY
# Paste: the Secret Access Key from Phase 4

# 4. Backup R2 Bucket Name
npx wrangler secret put BACKUP_R2_BUCKET_NAME
# Type: kahoot-backups

# 5. Backup R2 Endpoint — from Phase 4 (use your backup account ID)
npx wrangler secret put BACKUP_R2_ENDPOINT
# Type: https://<backup-account-id>.r2.cloudflarestorage.com
# Replace <backup-account-id> with the Account ID from Phase 4
```

> ⚠️ You must be logged into wrangler with your **primary** (`iamhuwng`) Cloudflare account, since the Worker runs there. The secrets connect the Worker to the backup account's R2 bucket.

---

## Phase 7: Deploy the Worker

```powershell
cd r2-backup-worker
npx wrangler deploy
```

The output will show the Worker URL, something like:
```
Published r2-backup-worker (X.XX sec)
  https://r2-backup-worker.iamhuwng.workers.dev
```

**Copy this URL** — you need it for the next step.

---

## Phase 8: Configure Main App

Create or update the `.env` file in the **main kahoot project root** (NOT in the worker):

```env
VITE_BACKUP_WORKER_URL=https://r2-backup-worker.iamhuwng.workers.dev
```

> The `backupService.ts` reads this from `import.meta.env.VITE_BACKUP_WORKER_URL`.

After adding this, restart the dev server (`npm run dev`) to pick up the new env var.

---

## Phase 9: Verify Health

### Quick health check via browser or curl:

You can't hit the health endpoint directly (it requires an admin auth token). Instead:

1. Start the app: `npm run dev`
2. Log in as super_admin
3. Navigate to **Admin Dashboard** → click **"Backup"** (🛡️) in the sidebar
4. The page should load and show the Dashboard Card
5. If the health check passes, you'll see green status indicators

### If health check fails:

| Error | Fix |
|-------|-----|
| `backupR2: false` | Check Account ID in endpoint URL, verify API token has Read+Write+List for `kahoot-backups` |
| `firebase: false` | Check Service Account roles, verify project ID matches `temp-a1437` |
| `primaryR2: false` | Check that `kahoot-media` bucket exists and the Worker binding in `wrangler.toml` is correct |

---

## Phase 10: Manual Smoke Test

| # | Test | Expected |
|---|------|----------|
| 1 | Click **"📦 Backup Now"** | Confirmation dialog → Progress bar → Success toast |
| 2 | Check backup history table | New entry appears with size and ✅ status |
| 3 | Click **"Download"** on a backup | ZIP file downloads |
| 4 | Click **"♻️ Restore"** on a backup | Preview modal shows entity counts |
| 5 | Click **"🖼️ Media Backup"** | Delta calculation → file download prompts |
| 6 | Check `kahoot-backups` bucket | `backups/BK-*.zip`, `backup_history.json`, `backup_state.json` should exist |
| 7 | Wait for Monday 3 AM UTC | Auto-backup triggers, notification appears |

---

## Architecture Summary

```
┌─────────────────────────────────┐
│  PRIMARY Cloudflare Account     │
│  (iamhuwng)                     │
│                                 │
│  ┌───────────────────────────┐  │
│  │ r2-backup-worker          │  │
│  │ (Cloudflare Worker)       │  │
│  │                           │  │
│  │ Bindings:                 │  │
│  │ • PRIMARY_R2 → kahoot-media│ │
│  │                           │  │
│  │ Secrets:                  │  │
│  │ • GOOGLE_SA_KEY           │  │
│  │ • BACKUP_R2_ACCESS_KEY_ID │  │
│  │ • BACKUP_R2_SECRET_ACCESS_│  │
│  │ • BACKUP_R2_BUCKET_NAME   │  │
│  │ • BACKUP_R2_ENDPOINT      │  │
│  └────────┬──────────────────┘  │
│           │                     │
│  ┌────────▼──────────────────┐  │
│  │ kahoot-media (R2 bucket)  │  │
│  │ Audio, images, avatars    │  │
│  └───────────────────────────┘  │
└────────────┬────────────────────┘
             │ reads data / writes backups
             ▼
┌─────────────────────────────────┐
│  BACKUP Cloudflare Account      │
│  (separate email, separate 2FA) │
│                                 │
│  ┌───────────────────────────┐  │
│  │ kahoot-backups (R2 bucket)│  │
│  │                           │  │
│  │ Contents:                 │  │
│  │ • backups/BK-*.zip        │  │
│  │ • backup_state.json       │  │
│  │ • backup_history.json     │  │
│  │ • backup_lock.json        │  │
│  │ • media_manifests/*.json  │  │
│  │ • pre-restore/*.zip       │  │
│  │                           │  │
│  │ Lifecycle rules:          │  │
│  │ • backups/ → 77 days      │  │
│  │ • pre-restore/ → 14 days  │  │
│  │                           │  │
│  │ API token:                │  │
│  │ • Read + Write + List     │  │
│  │ • NO Delete               │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Firebase (temp-a1437)          │
│                                 │
│  • RTDB (23+ nodes)             │
│  • Firestore (7+ collections)   │
│  • Auth (token verification)    │
└─────────────────────────────────┘
```

---

## Checklist Summary

| # | Item | Status |
|---|------|--------|
| 1 | New Cloudflare account created (separate email) | ☐ |
| 2 | 2FA enabled on backup account | ☐ |
| 3 | R2 enabled in backup account | ☐ |
| 4 | `kahoot-backups` bucket created (private) | ☐ |
| 5 | Lifecycle rule: `backups/` → 77 days | ☐ |
| 6 | Lifecycle rule: `pre-restore/` → 14 days | ☐ |
| 7 | R2 API token created (Read+Write+List, NO Delete) | ☐ |
| 8 | Google Cloud SA created with 4 roles | ☐ |
| 9 | SA JSON key downloaded | ☐ |
| 10 | `ADMIN_UID` set in `wrangler.toml` | ☐ |
| 11 | All 5 Worker secrets set | ☐ |
| 12 | Worker deployed (`npx wrangler deploy`) | ☐ |
| 13 | `VITE_BACKUP_WORKER_URL` set in main `.env` | ☐ |
| 14 | Health endpoint returns all green | ☐ |
| 15 | Manual backup test succeeded | ☐ |
