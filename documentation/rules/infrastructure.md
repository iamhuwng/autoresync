# Infrastructure Safety Rules

> Rules for git sync, database collections, serverless workloads, and shared IDs.
> **Load this file when:** doing git pull/sync, adding RTDB nodes/Firestore collections, building serverless functions, or working with shared IDs.

---

## Rule 10 — Git Sync Safety Protocol

**Trigger:** Before ANY `git pull`, `git fetch + merge`, or automated sync operation.

**Why it exists:**
On 2026-02-23, an automated sync commit mass-reverted 118 files back to an older remote state, silently wiping out all recent work.

**The rule:**
Every git sync MUST follow a 3-step safety protocol:

### Step 1: Pre-Sync Safety Commit
```bash
git add -A
git commit -m "chore: safety checkpoint before sync"
git log -1 --format="%h %s"
```

### Step 2: Pull with Inspection
```bash
git fetch origin main
git diff --stat HEAD origin/main | tail -5
git diff --name-only HEAD origin/main | wc -l
# If >20 files changed — STOP and manually inspect
git merge origin/main
```

### Step 3: Post-Sync Verification
```bash
git diff HEAD~1 --stat | tail -5
# If 100+ files changed when you expected 5 → IMMEDIATELY revert:
git reset --hard HEAD~1
```

**Self-check:** *"Did I verify the file count before accepting this sync?"*

---

## Rule 11 — Restore Guard Middleware for Database Side-Effects

**Trigger:** Creating a service that writes to RTDB/Firestore as a side effect of data events.

**The rule:**
During restore operations, auto-triggered write services can fire and corrupt restored data. Wrap all auto-triggered write services with `withRestoreGuard()`:

```typescript
import { withRestoreGuard } from './restoreGuard';

// ❌ WRONG — fires during restore:
export async function recordActivity(studentId: string) {
  await setDoc(doc(db, 'streaks', studentId), { ... });
}

// ✅ CORRECT — blocked during restore:
export const recordActivity = withRestoreGuard(
  'Streak', defaultReturnValue
)(async function _recordActivity(studentId: string) {
  await setDoc(doc(db, 'streaks', studentId), { ... });
});
```

**Canonical reference:** `src/services/studentStreakService.ts` line 231.

---

## Rule 12 — New Collection/Node Security Checklist

**Trigger:** Adding a new RTDB node or Firestore collection.

**The rule:**
Complete ALL of the following before the commit is considered done:

1. **Identify rules file:** RTDB → `database.rules.json`, Firestore → `firestore.rules`
2. **Add rules** following the Gold Standard pattern (separate create/read/update/delete):
   ```
   match /my_collection/{docId} {
     allow read: if request.auth != null && resource.data.ownerId == request.auth.uid;
     allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
     allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
   }
   ```
3. **Validate ownership field names** — grep the service file
4. **Check for special patterns** (append-only, extension triggers, path-keyed)
5. **Verify backup coverage**
6. **Add Firestore indexes** if using composite queries
7. **Document deploy requirement** — `firebase deploy --only firestore:rules`

**Anti-patterns:**
```
// ❌ NEVER: allow read, write: if request.auth != null;  (anyone reads anyone's data)
// ❌ NEVER use resource.data on CREATE — use request.resource.data
```

**Self-check:** *"Did I add security rules for this new collection?"*

---

## Rule 13 — Client-Driven Multi-Step for Heavy Serverless Workloads

**Trigger:** Building or modifying Cloudflare Workers (R2 upload signer, backup workers, etc.) that process multiple data sources or run longer than a few seconds.

**Why it exists:**
On 2026-02-25, a backup Worker needed to read 25 RTDB nodes + 9 Firestore collections + build a ZIP. Single invocation: silently died at ~30s. Self-calling chain: died even earlier from coordination overhead.

**What worked:** Client drives the sequence with 3 separate lightweight API calls.

**The rule:**
1. Do NOT make the function call itself
2. Do NOT try to fit everything in one invocation
3. DO split into discrete steps, each saving results to storage
4. DO let the client poll and trigger continuation
5. Each step must be independently completable and idempotent

**Self-check:** *"Can this Worker complete ALL its work within the platform's time limit?"*

---

## Rule 14 — Never Regenerate Shared IDs

**Trigger:** Any code that uses an ID to coordinate between creator and consumer (client, DB, webhook).

**Why it exists:**
On 2026-02-25, a `StatusTracker` created ID `BK-123` and returned it to the client. Then `executeDataBackup()` generated a NEW ID `BK-456`. The client polled `BK-123` forever while progress was written to `BK-456`.

**The rule:**
Once an ID is shared with an external consumer, it becomes a **contract**. Never regenerate or overwrite it.

```typescript
// ❌ WRONG — overwrites the shared ID
const newId = generateBackupId();
tracker.state.id = newId;  // 💥 client polling old ID forever

// ✅ CORRECT — honor the contract
const backupId = tracker.state.id;  // use the established ID
```

**Self-check:** *"Is this ID already shared with a client, DB, or external system?"*
If yes → never overwrite. Treat as immutable from the moment it's shared.
