# Infrastructure Safety Rules

> Rules for git sync, database collections/rules, serverless workloads, remote-state proof, verification harnesses, and shared IDs.
> **Load this file when:** doing git pull/sync, adding RTDB nodes/Firestore collections, changing Firebase rules, building/testing/debugging Cloudflare Workers or R2 flows, making deployed/current-state claims, classifying test/build/emulator failures, or working with shared IDs.

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

### Reading V2 Audit Node

For Reading V2 PRD-0054 audit work, use the dedicated RTDB path defined in `documentation/architecture/changelog/reading-v2-audit-trail.md`:

```text
reading_v2/audit_events/{eventId}
```

This node is append-only. Do not reuse legacy `audit_logs` for PRD-0054 Reading V2 archive, restore, repair, or duplicate-decision audit events. Rule tests must prove create is allowed only for valid authenticated state-changing events, update/delete are denied, reads are super-admin only, and unsafe payload fields are denied.

### Class Management Coupled Paths

Class lifecycle changes must review these RTDB paths together:

```text
classes/{classId}
student_classes/{studentId}/{classId}
game_sessions/{classId}
```

Rules:
- `classes/{classId}` is class lifecycle authority
- `student_classes` is a student-shell projection and may be cleaned up
  best-effort after canonical lifecycle writes
- class-backed `game_sessions/{classId}` rows are legacy compatibility shadows,
  not class lifecycle authority
- do not place optional projection cleanup or legacy shadow cleanup in the same
  must-succeed write as the canonical class lifecycle update when rules differ
- focused class-management tests must cover source-of-truth success plus
  projection-cleanup failure

Canonical doc: `documentation/architecture/teacher-class-management-lifecycle.md`

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

### Session Lifecycle Boundary

Session expiration correctness must not depend on a Worker cron, Firebase
scheduled Function, browser cleanup loop, or full active-session scan. The
approved Spark/Workers-Free design derives effective status from
`game_sessions/{sessionCode}.expiresAt` plus RTDB server-time rules, and uses
`owner_session_index/{ownerId}/{sessionCode}` only for owner-scoped discovery.

Do not add session lifecycle work to `r2-backup-worker`. That Worker remains a
backup/trusted-storage boundary. If a future paid reconciler is approved, it
must materialize status only; it must not change the domain policy that server
rules enforce expiry at write time.

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

---

## Rule 15 — RTDB Ancestor Rule Boundary

**Trigger:** Adding or modifying Firebase RTDB rules, nested write restrictions, or protected descendants under an allowed ancestor path.

**Why it exists:**
During PRD-0055/0056A work, a protected child path was treated as safe because a descendant rule denied writes. RTDB ancestor permissions can still allow a browser client to write through the ancestor boundary. The correct fix was to test and narrow the actual write boundary, not assume child denial revoked ancestor access.

**The rule:**
Do not assume a child `.write: false` revokes an allowed ancestor `.write`.

Before claiming an RTDB descendant is protected:

1. Inspect ancestor `.write` and `.validate` rules on every parent path a browser client can write through.
2. Identify the exact client-write boundary, not only the intended service path.
3. Add emulator negative tests for malicious writes through the real browser-accessible ancestor path.
4. Narrow the ancestor rule or add validation at the actual allowed boundary when descendants must be protected.
5. Prove update/delete denial separately from create denial when the path has lifecycle-sensitive state.

**Anti-patterns:**
```jsonc
// ❌ WRONG — assuming this child denial protects the path while an ancestor allows writes
"protected_child": {
  ".write": false
}

// ❌ WRONG — testing only a direct child write when the browser can write a larger parent payload
set(ref(db, "parent/protected_child"), value)

// ✅ BETTER — test the ancestor payload shape a browser could actually submit
update(ref(db, "parent"), { protected_child: maliciousValue })
```

**Self-check:** *"Did the emulator kill the same ancestor-shaped malicious write a browser client could use?"*

---

## Rule 16 — Cloudflare / Wrangler / workerd Runtime Proof

**Trigger:** Building, testing, deploying, dry-running, or debugging Cloudflare Workers, Wrangler, workerd, R2 uploads, signed URLs, Worker bindings, or backup Workers.

**Why it exists:**
During PRD-0055 follow-up work, Worker proof was delayed by Windows runtime/toolchain failures. Codex initially risked diagnosing application code before verifying Node architecture, workerd startup, and Wrangler runtime state.

**The rule:**
Classify Cloudflare/Worker failures by runtime surface before changing product code.

When Wrangler, workerd, Miniflare, Worker tests, R2 upload flows, or dry-runs fail with platform, native binary, spawn, architecture, binding, or workerd-startup symptoms:

1. Record the failing command and working directory.
2. Record Node architecture and executable path:
   ```bash
   node -p "process.arch + ' ' + process.execPath"
   ```
3. Verify whether the repo requires a specific Windows/x64 Node path or wrapper before editing Worker code.
4. Verify Worker bindings, environment, and config file actually used by the command.
5. Separate local Worker test proof from Wrangler dry-run proof and deployed/current Worker proof.
6. If proving R2 behavior, record bucket/object/key evidence or dry-run/deployed output that directly supports the claim.

**Remote/current Worker claims require direct evidence**, such as Worker active version, bindings, routes, R2 bucket/object evidence, Wrangler dry-run/deploy output, Cloudflare REST output, or live URL proof where applicable.

**Anti-patterns:**
```text
❌ Changing Worker implementation before verifying workerd can start.
❌ Treating local Worker tests as proof of deployed Worker version/bindings.
❌ Claiming signed URL/R2 behavior without bucket/object or dry-run/deployed evidence.
```

**Self-check:** *"Is this a Worker product failure, or a Node/workerd/Wrangler/binding proof failure?"*

---

## Rule 17 — Harness Failure Classification

**Trigger:** Reporting a test, build, emulator, Worker, or verification failure as product behavior.

**Why it exists:**
PRD-0055/0056A work repeatedly required separating real product failures from harness failures: wrong working directory, wrong runner/config, skipped tests, zero-test execution, stale generated output, missing Java, failed workerd startup, shell quoting issues, or emulator setup failure.

**The rule:**
Before reporting a command failure as product behavior, prove the intended harness actually ran.

Record:

1. command;
2. working directory;
3. runner/config;
4. exit code;
5. files/tests in scope;
6. tests discovered and actually executed;
7. skipped tests or skipped emulator branches;
8. runtime dependencies involved, such as Java, Node, workerd, Firebase emulator, Wrangler, or Cloudflare bindings;
9. whether the failure is product failure or harness failure.

Wrong root, wrong runner, wrong config, zero-test execution, skipped emulator branch, missing Java, failed workerd startup, stale generated output, shell quoting failure, or command-runner mismatch is harness failure until proven otherwise.

**Anti-patterns:**
```text
❌ "Tests failed, so the feature is broken" without checking test discovery/execution.
❌ "Security proof passed" when the emulator branch was skipped.
❌ "Build proves runtime behavior" when no browser/runtime flow was exercised.
```

**Self-check:** *"Did the intended proof execute, or did the harness fail before proving product behavior?"*

---

## Rule 18 — Remote-State Evidence

**Trigger:** Making deployed/current-state claims for Firebase, Hosting, Cloudflare Workers, Wrangler, R2, or remote data.

**Why it exists:**
PRD-0055 closure repeatedly blurred local readiness, dry-run proof, deployed/current proof, and rollback/recovery proof. Local implementation proof is valuable, but it cannot prove remote state.

**The rule:**
Do not close deployed/current-state claims from local tests, source inspection, local builds, or screenshots.

Classify proof as:

- local implementation proof;
- local integration proof;
- emulator proof;
- dry-run proof;
- deployed/current proof;
- rollback/recovery proof.

Remote/current claims require direct evidence from the relevant remote surface, such as:

- Firebase project/app/rules/hosting state;
- Cloudflare Worker active version, bindings, routes, and environment;
- R2 bucket/object evidence;
- Wrangler dry-run or deploy output;
- Cloudflare REST output;
- production URL/browser evidence when the claim is about live behavior.

If remote mutation or inspection is not authorized, report the remote proof as `BLOCKED` or `CLOSURE_BLOCKED` instead of substituting local proof.

**Anti-patterns:**
```text
❌ Local tests passed, therefore the deployed Worker is current.
❌ Source code has the binding, therefore Cloudflare has the binding.
❌ Browser localhost works, therefore Hosting production works.
❌ Dry-run passed, therefore rollback/recovery is proven.
```

**Self-check:** *"Which proof class am I claiming, and did I inspect that actual surface?"*
