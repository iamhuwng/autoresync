# Integration Safety Rules

> Derived from real production bugs discovered on **2026-02-22**.
> Updated **2026-02-25** with backup system rules (Rules 11-14).
> These rules apply to ALL navigation, notification, session-entry, data-service, and **serverless Worker** code in this project.
> **Load this file when:** you are writing or reviewing any `navigate()` call, stored link value, new entry point into a session/test page, **new RTDB/Firestore node**, **new service with write side-effects**, **serverless function with heavy workloads**, or **code that shares IDs between creator and consumer**.

---

## Rule 1 — Route Registry Validation

**Trigger:** Writing any navigation path, redirect URL, notification link, or `navigate()` call.

**Why it exists:**  
On 2026-02-22, a notification stored `link: '/student/join?code=XXXXXX'`. That path was never registered in React Router. Clicking "Start Now" in the student feed opened a blank page with no error or console warning — React Router renders nothing for unregistered paths, silently.

**The rule:**  
Before writing any path string, verify it exists in `src/constants/routes.ts`.  
Use `buildRoute(routeName, params)` for parameterized routes — never compose paths with string concatenation.

```js
// ❌ WRONG — blank page, no error
link: `/student/join?code=${sessionCode}`
navigate('/student/session/' + code)

// ✅ CORRECT — derived from the ROUTES registry
link: sessionMode === 'test'
  ? buildRoute('STUDENT_TEST', { sessionCode })       // → /student-test/:sessionCode
  : buildRoute('STUDENT_WAITING', { gameSessionId: sessionCode }) // → /student-wait/:gameSessionId
```

**Self-check before every `navigate()` or stored link:**  
*"Is this exact path string in `src/constants/routes.ts`?"*  
If you are not sure → open the file and check before writing the code.

---

## Rule 2 — Page-Entry Prerequisite Handshake

**Trigger:** Any code that navigates a student to `/student-test/*` or `/student-wait/*`.

**Why it exists:**  
On 2026-02-22, the student dashboard's "Start Now" button called `navigate('/student-test/CODE')` directly from the notification handler. `StudentTestPage` reads crucial player identity data from `sessionStorage` (set by `sessionService.setPlayerData`) to identify the student and enforce class membership. Without this data being set first, the page could not identify the player — failing silently.

The existing join flow in `StudentClassDetailPage.jsx` already did it correctly, but the new notification handler did not follow that established pattern.

**The rule:**  
Every code path that navigates into a student test or waiting room MUST call `sessionService.setPlayerData()` first, in that same code path, before `navigate()`.

```js
// ✅ CORRECT — set player identity BEFORE routing
sessionService.setPlayerData(
  user.uid,
  user.displayName || user.email || 'Student',
  sessionCode
);
navigate(`/student-test/${sessionCode}`);

// ❌ WRONG — navigating without setting player data
navigate(`/student-test/${sessionCode}`);  // StudentTestPage cannot identify the player
```

**Canonical reference implementation:**  
`src/pages/StudentClassDetailPage.jsx` lines 308–316 — this is the established pattern, copy it exactly.

**Self-check:**  
*"Did I call `sessionService.setPlayerData()` in this same code path before this `navigate()` call?"*  
If no → add it first.

**Applies to all entry points:**  
- Class detail page "Join Session" button ✅ (already implemented)
- Student dashboard feed notification click handler ✅ (fixed 2026-02-22)
- Any future deep link handler, push notification handler, or URL-based redirect

---

## Rule 3 — Pattern-First Research Before New Integration Code

**Trigger:** Implementing any new: navigation handler, notification click handler, auth flow, session entry point, or permission check.

**Why it exists:**  
On 2026-02-22, a new notification click handler was written from scratch. The `sessionService.setPlayerData` handshake was missed because the developer (AI) did not first search for how the same thing was already done in the codebase — `StudentClassDetailPage.jsx` had the complete, correct implementation.

**The rule:**  
Before writing any new integration code, GREP the codebase for existing implementations of the same pattern. Read what exists. Copy the established pattern. Only diverge with an explicit code comment explaining why.

```bash
# Run these before implementing any new navigation or session entry point:
grep -r "navigate.*student-test" src/
grep -r "navigate.*student-wait" src/
grep -r "setPlayerData" src/
grep -r "markNotificationAsRead" src/
```

**Protocol:**
1. Search — find all existing implementations
2. Read — understand how they handle edge cases (auth state, loading, permissions)
3. Copy — replicate the exact pattern
4. Diverge only with a code comment explaining the technical reason

**Self-check:**  
*"Have I searched the codebase for how this is already solved?"*  
If no → run a grep search before writing any code.

---

## Rule 6 — React: Never Put Hot Values in Interval Effect Dependencies

**Trigger:** Writing a `useEffect` that contains `setInterval`, `setTimeout`, or any periodic callback that reads frequently-changing state.

**Why it exists:**  
On 2026-02-24, `useSoloAutoSave` had `answers`, `currentQuestion`, and `timeElapsed` in its `useEffect` deps. Every keystroke changed `answers`, tearing down and recreating the 30-second auto-save interval — effectively making it never fire. The fix was to use refs for hot values so the interval only sets up once.

**The rule:**  
For periodic effects (auto-save, polling, heartbeat), use `useRef` for values that change frequently. Only put stable identifiers in the dependency array.

```tsx
// ❌ WRONG — interval torn down on every keystroke
useEffect(() => {
    const id = setInterval(() => {
        save(answers, currentQuestion);  // reads from closure
    }, 30000);
    return () => clearInterval(id);
}, [answers, currentQuestion]);  // 💥 changes on every keystroke

// ✅ CORRECT — refs for hot values, stable deps
const answersRef = useRef(answers);
answersRef.current = answers;  // sync ref on every render

useEffect(() => {
    const id = setInterval(() => {
        save(answersRef.current);  // reads from ref
    }, 30000);
    return () => clearInterval(id);
}, [materialId, studentId, enabled]);  // only stable identifiers
```

**Self-check:**  
*"Do any of my `useEffect` deps change on every user interaction (keystroke, click, scroll)?"*  
If yes AND the effect creates an interval/timer → extract those values to refs.

**Canonical reference implementation:**  
`src/hooks/solo/useSoloAutoSave.ts` — uses `answersRef`, `currentQuestionRef`, `timeElapsedRef`.

---

## Rule 7 — State Machines: Every 'Pending' State Must Have a Guaranteed Resolution Path

**Trigger:** Creating any state variable that starts as `'pending'`, `'loading'`, `'initializing'`, or similar intermediate states that other code depends on.

**Why it exists:**  
On 2026-02-24, `StudentPracticePage.tsx` initialized `resumeDecision = 'pending'`. The auto-save hook was gated by `enabled: resumeDecision !== 'pending'`. When there was NO saved progress, nothing ever changed `resumeDecision` from `'pending'` to `'fresh'` — the happy-path code only resolved it when `savedProgress !== null`. Result: auto-save was **permanently disabled** for all new sessions.

**The rule:**  
Every intermediate/pending state must have resolution paths for ALL branches — including the "nothing happened" case:

```tsx
// ❌ WRONG — no resolution for the null case
const [decision, setDecision] = useState<'pending' | 'resume' | 'fresh'>('pending');
// Only resolves to 'resume' when savedProgress exists → 'fresh' never reached

// ✅ CORRECT — guaranteed resolution for all branches
useEffect(() => {
    if (!checking && savedProgress === null) {
        setDecision('fresh');  // resolve the "nothing to resume" case
    }
}, [checking, savedProgress]);
```

**Self-check:**  
*"If I set this state to 'pending', what happens when the condition I'm waiting for NEVER arrives?"*  
If the answer is "it stays pending forever" → add a fallback resolution.

**Canonical reference implementation:**  
`src/pages/StudentPracticePage.tsx` — `resumeDecision` auto-resolves to `'fresh'` when checking is complete and no saved progress exists.

---

## Rule 8 — Component Exists ≠ Component Integrated

**Trigger:** When a task list says "Create component X" and "Wire component X into page Y" as separate subtasks, OR during code review of a new feature.

**Why it exists:**  
On 2026-02-24, the PRD-0025 audit revealed that:
- `TestHeader.tsx` had working `mode="solo"` code with a badge and hamburger icon — but `StudentPracticePage` never passed `mode="solo"` or `onSettingsClick` props
- `SoloSettingsModal.tsx` existed with full UI — but was never imported or rendered in the practice page
- Both components passed their own unit tests and code reviews. The gap was invisible until E2E testing.

**The rule:**  
After creating any component, immediately verify that:
1. It is **imported** in the target page
2. It is **rendered** in the JSX
3. All required **props** are passed (not default/undefined)
4. The **user action** that triggers it actually works end-to-end

```bash
# Verification grep — run after creating AND after wiring
grep -r "import.*MyComponent" src/pages/    # Is it imported?
grep -r "<MyComponent" src/pages/           # Is it rendered?
# Then test the trigger action in browser
```

**Self-check:**  
*"Have I actually OPENED the page in a browser and triggered the new component?"*  
If no → the component might be a dead import.

---

## Rule 9 — PRD "Replace ALL" Requires Codebase-Wide Grep Audit

**Trigger:** When a PRD or task description says "replace ALL", "every", "all instances", or "this replaces existing".

**Why it exists:**  
On 2026-02-24, PRD-0025 US-11 stated: *"This replaces ALL existing result click handlers."* The `AcademicRecordPage.tsx` was correctly updated to use inline `ResultDetailModal`. But two other pages (`StudentDashboardPage.jsx` and `StudentHomeworkListPage.tsx`) still navigated to the old `/result/:id` route. The word "ALL" in the PRD was easy to miss — developers only updated the one page they were directly working on.

**The rule:**  
When a PRD says "all" or "every", run a codebase-wide search for the pattern being replaced BEFORE considering the task complete:

```bash
# Example: PRD says "replace ALL result click handlers"
grep -r "navigate.*\/result\/" src/ --include="*.tsx" --include="*.jsx"
grep -r "\/result\/" src/ --include="*.tsx" --include="*.jsx"
```

**Protocol:**
1. Identify the OLD pattern (e.g., `navigate('/result/${id}')`)
2. Grep the ENTIRE `src/` for that pattern
3. Fix ALL matches, not just the one file mentioned in the task
4. Grep again to confirm zero remaining instances

**Self-check:**  
*"Does this PRD/task use the words 'all', 'every', 'replace existing', or 'replaces'?"*  
If yes → grep the codebase for the old pattern. Don't assume only one file needs updating.

---

## Rule 10 — Git Sync Safety Protocol (Pre-Pull & Post-Pull Verification)

**Trigger:** Before ANY `git pull`, `git fetch + merge`, or automated sync operation.

**Why it exists:**  
On 2026-02-23, an automated sync commit (`7b068f1 — Sync: 2026-02-23T13:55:09.039Z`) mass-reverted **118 files** back to an older remote state, silently wiping out all Student View Design Standard migrations and PRD-0025 implementation work that existed in the local commit `566b4b7`. The sync created a commit on top of the local work with the older remote content — destroying hours of work without any warning. Recovery required a manual revert and lost several days of implementation effort.

**The rule:**  
Every git sync operation MUST follow this 3-step safety protocol:

### Step 1: Pre-Sync Safety Commit
```bash
# Before pulling, commit or stash ALL local changes
git add -A
git commit -m "chore: safety checkpoint before sync"
# Note the commit hash — this is your recovery point
git log -1 --format="%h %s"
```

### Step 2: Pull with Inspection (Never Blind Push)
```bash
# Fetch first, inspect BEFORE merging
git fetch origin main

# Check how many files differ
git diff --stat HEAD origin/main | tail -5

# If >20 files changed — STOP and manually inspect
git diff --name-only HEAD origin/main | wc -l

# Only then merge
git merge origin/main
```

### Step 3: Post-Sync Verification
```bash
# After merge, verify critical files weren't silently reverted
# Check for known markers of your latest work:
git diff HEAD~1 --stat | tail -5

# If total changes look wrong (e.g., 100+ files changed
# when you expected 5), IMMEDIATELY revert:
git reset --hard HEAD~1
```

**Red flags that indicate a bad sync:**
- `git diff --stat` shows 50+ files changed in a "sync" commit
- Recently created files are suddenly deleted
- Files you haven't touched are showing as modified
- Console shows merge conflicts in files you own

**Self-check:**  
*"Did I verify the file count and diff before accepting this sync?"*  
If no → `git fetch` + inspect before merging.

**Recovery (if bad sync already happened):**
```bash
# Find your pre-sync safety commit
git reflog | head -10
# Restore non-documentation files from that commit
git checkout <safety-hash> -- . 
git checkout HEAD -- documentation/
```

---

## Rule 13 — Serverless: Client-Driven Multi-Step for Heavy Workloads

**Trigger:** Building any feature on Cloudflare Workers (or similar serverless platforms like Lambda, Edge Functions) that processes multiple data sources, calls external APIs, or runs longer than a few seconds.

**Why it exists:**  
On 2026-02-25, the backup Worker needed to read 25 RTDB nodes + 9 Firestore collections + build a ZIP + upload to R2. Multiple approaches failed:

1. **Single invocation** — Worker silently died at ~30s wall-clock. No error thrown, no catch block triggered. Status frozen at last persisted state.
2. **Self-calling Worker chain** (Worker fetches its own URL to trigger next phase) — Added massive overhead: extra R2 writes for phase data, crypto operations for phase tokens, larger code bundle. The coordination overhead exceeded the actual work savings. Worker died even earlier (at lock acquisition, 2% progress).
3. **Single invocation with parallel reads** — Parallelization helped RTDB (5x faster) but combined RTDB + Firestore still exceeded the limit.

**What finally worked:** The **client** drives the sequence. User clicks once. Client makes 3 separate API calls, each a lightweight Worker invocation:

```
POST /api/backup/trigger    → Step 1: RTDB only (~5s)  → status: "rtdb_complete"
POST /api/backup/continue/X → Step 2: Firestore (~5s)  → status: "firestore_complete"  
POST /api/backup/continue/X → Step 3: Finalize (~3s)   → status: "complete"
```

The client polls for step completion and auto-triggers the next step. No self-calls, no phase tokens, no extra auth.

```typescript
// ✅ Client-side auto-continuation (in backupService.ts)
export async function getBackupStatus(backupId: string) {
    const status = await workerFetch(`/api/backup/status/${backupId}`);
    
    // Auto-trigger next step when current step completes
    if (status.phase === 'rtdb_complete' || status.phase === 'firestore_complete') {
        const key = `${backupId}_${status.phase}`;
        if (!continuationTriggered.has(key)) {
            continuationTriggered.add(key);
            continueBackup(backupId);  // fire-and-forget
        }
    }
    return status;
}
```

**The rule:**  
When a serverless function needs to do more work than fits in one invocation:
1. **Do NOT** make the function call itself (overhead kills it)
2. **Do NOT** try to fit everything in one invocation with "optimizations"
3. **DO** split into discrete steps, each saving results to storage (R2, S3, KV)
4. **DO** let the client poll and trigger continuation
5. Each step must be independently completable and idempotent

**Self-check:**  
*"Can this Worker invocation complete ALL its work within the platform's time limit (30s for CF free, 15min for CF paid)?"*  
If no → split into client-driven steps. If unsure → measure first, then split.

**Key insight:**  
On constrained platforms, coordination overhead > actual work savings. Every extra R2 write, every crypto operation, every additional import adds up. Keep each invocation as simple as the working version — don't add meta-machinery.

---

## Rule 14 — Shared Identity Contract: Never Regenerate IDs Mid-Execution

**Trigger:** Any code that uses an ID (backup ID, session ID, transaction ID) to coordinate between the thing that creates the operation and the thing that monitors/completes it.

**Why it exists:**  
On 2026-02-25, the backup trigger handler created a `StatusTracker` with ID `BK-123` and returned it to the client for polling. Then `executeDataBackup()` called `generateBackupId()` which created a NEW ID `BK-456` and overwrote `tracker.state.id`. The client polled for `BK-123` forever, while progress was written to `BK-456`. The backup appeared frozen.

**The rule:**  
Once an ID is shared with an external consumer (client, webhook, database reference), it becomes a **contract**. Never regenerate or overwrite it downstream.

```typescript
// ❌ WRONG — overwrites the shared ID
async function handleTrigger() {
    const tracker = new StatusTracker();  // creates ID: "BK-123"
    respond({ backupId: tracker.state.id });  // shares "BK-123" with client
    
    // Later, in the async execution:
    const newId = generateBackupId();   // creates "BK-456"
    tracker.state.id = newId;           // 💥 client is polling "BK-123" forever
}

// ✅ CORRECT — downstream uses the established ID
async function handleTrigger() {
    const tracker = new StatusTracker();  // creates ID: "BK-123"
    respond({ backupId: tracker.state.id });  // shares "BK-123"
    
    // Downstream uses the same ID
    const backupId = tracker.state.id;  // "BK-123" — honor the contract
}
```

**Self-check:**  
*"Is this ID already shared with a client, stored in a database, or referenced by another component?"*  
If yes → never overwrite it. Treat it as immutable from the moment it's shared.

---

## Rule 11 — Restore Guard Middleware for Database Side-Effects

> **Added:** 2026-02-25 | **Trigger:** Creating a service that writes to RTDB/Firestore as a side effect of data events

**Why it exists:**  
During restore operations, write-trigger services (e.g., "on data change, update stats") can fire and corrupt restored data. Any service that writes to the database as a side-effect of reading/observing data MUST check whether a restore operation is in progress before writing.

**The rule:**  
Wrap all auto-triggered write services with `withRestoreGuard()`:

```typescript
import { withRestoreGuard } from './restoreGuard';

// WRONG — fires during restore and corrupts data:
export async function recordActivity(studentId: string) {
  await setDoc(doc(db, 'streaks', studentId), { ... });
}

// CORRECT — blocked during restore:
export const recordActivity = withRestoreGuard(
  'Streak',
  defaultReturnValue
)(async function _recordActivity(studentId: string) {
  await setDoc(doc(db, 'streaks', studentId), { ... });
});
```

**Self-check:**  
*"Does this service write to the database in response to reading/observing data from the database?"*  
If yes → wrap with `withRestoreGuard()`. Check `src/services/restoreGuard.ts` for the existing pattern.

**Canonical reference:** `src/services/studentStreakService.ts` (line 231 — `recordActivity = withRestoreGuard(...)`)

---

## Rule 12 — New Collection/Node Security Checklist

> **Added:** 2026-02-25 | **Full body added:** 2026-02-27  
> **Trigger:** Adding a new RTDB node or Firestore collection

**Why it exists:**  
On 2026-02-27, a security audit of `firestore.rules` revealed that **9 Firestore collections** created by PRD-0016 (Solo Study & Homework System) had **NO security rules at all**. Firestore's default-deny model silently blocked all client operations. The root causes were:

1. This rule existed only as a one-liner in the Quick Reference Card with no actionable body.
2. The PRD task list had 72 sub-tasks across 438 lines but zero mentions of `firestore.rules`.
3. The RBAC hardening (PRD-0016) Task 4.0 only hardened `database.rules.json`, not `firestore.rules`.

**The rule:**  
When adding a new RTDB node or Firestore collection, you MUST complete ALL of the following before the PR/commit is considered done:

### Security Rules Checklist

1. **Identify the correct rules file:**
   - RTDB → `database.rules.json`
   - Firestore → `firestore.rules`

2. **Add rules following the Gold Standard pattern** (separate create/read/update/delete):
   ```
   // Firestore Gold Standard (from thcs_templates):
   match /my_collection/{docId} {
     allow read: if request.auth != null
       && resource.data.ownerId == request.auth.uid;
     allow create: if request.auth != null
       && request.resource.data.ownerId == request.auth.uid;  // ← incoming data
     allow update, delete: if request.auth != null
       && resource.data.ownerId == request.auth.uid;           // ← existing data
   }
   ```

3. **Validate ownership field names** — grep the service file to confirm the exact field name used for ownership (`ownerId`, `userId`, `createdBy`, `teacherId`, `studentId`, etc.):
   ```bash
   grep -n "ownerId\|userId\|createdBy\|teacherId" src/services/myNewService.ts
   ```

4. **Check for special patterns:**
   - Append-only collections → `allow update, delete: if false`
   - Extension trigger queues (e.g., `mail`) → `allow create` only
   - Path-keyed by userId → match path variable (`request.auth.uid == userId`)
   - Public read → separate `allow read: if request.auth != null` from write rules

5. **Verify backup coverage** — ensure the backup system discovers the new collection (check `0026-prd-backup-disaster-recovery-system.md`)

6. **Add Firestore indexes** if the service uses composite queries (e.g., `where` + `orderBy`)

7. **Note deploy requirement** — local rules ≠ deployed rules. Document that `firebase deploy --only firestore:rules` or `firebase deploy --only database` is needed.

### Anti-patterns

```
// ❌ NEVER DO THIS — any authenticated user can read/write anyone's data:
allow read, write: if request.auth != null;

// ❌ NEVER USE resource.data ON CREATE — resource.data is null for new documents:
allow create: if resource.data.ownerId == request.auth.uid;

// ✅ CORRECT — use request.resource.data for create:
allow create: if request.resource.data.ownerId == request.auth.uid;
```

**Self-check:**  
*"Did I add security rules for this new collection/node to the appropriate rules file?"*  
If no → **STOP coding and add them first**. No feature is complete without its security rules.

**Canonical reference:**
- Firestore Gold Standard: `firestore.rules` → `thcs_templates` rule block
- RTDB Gold Standard: `database.rules.json` → `academic_records` rule block

---

## Rule 15 — No Mantine: Absolute Import Ban (Enforced 2026-02-27)

**Trigger:** Writing ANY `import` statement or suggesting ANY `npm install` for a `@mantine/*` package.

**Why it exists:**
The project is migrating away from Mantine to reduce bundle size, eliminate dependency lock-in, and gain full control over component styling. Existing Mantine usage will be gradually replaced. No new Mantine code may be introduced.

**The rule:**
DO NOT import, use, or recommend ANY `@mantine/*` package in new code.

```tsx
// ❌ BANNED — will reject PR
import { Button, Modal, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { DateTimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';

// ✅ CORRECT — use native HTML + CSS
<button className="btn-primary" onClick={handleClick}>Submit</button>
<dialog ref={dialogRef} className="modal">...</dialog>
<input type="text" className="input" />
<input type="datetime-local" className="input" />
```

**What to use instead:**
| Mantine Component | Native Replacement |
|---|---|
| `Button` | `<button>` with CSS classes |
| `Modal` | `<dialog>` element or custom portal |
| `TextInput` / `Textarea` | `<input>` / `<textarea>` |
| `Select` | `<select>` or custom searchable dropdown |
| `Stack` / `Group` | `<div>` with flexbox CSS |
| `Text` / `Title` | `<p>` / `<h1>`..`<h6>` / `<span>` |
| `Checkbox` / `Radio` | `<input type="checkbox">` / `<input type="radio">` |
| `useMediaQuery` | `window.matchMedia()` or `@media` CSS |
| `DateTimePicker` | Native `<input type="datetime-local">` + custom calendar UI |
| `notifications` | Custom toast system |

**Scope:**
- **New files:** ❌ ZERO Mantine imports
- **New components in existing files:** ❌ ZERO new Mantine imports
- **Modifying existing files:** ⚠️ Do NOT add new Mantine imports. Existing usage may remain temporarily.
- **Full rewrites/refactors:** ❌ Replace Mantine with native alternatives

**Self-check:**
*"Am I about to write `import { ... } from '@mantine/...'`?"*
If yes → **STOP.** Use a native HTML/CSS alternative instead. See `documentation/system/NO-MANTINE-RULE.md` for full details.

---

## Rule 16 — WebMCP Tool Registration for New Features (Enforced 2026-02-27)

**Trigger:** Creating ANY new user-facing feature: page, modal, form, button action, or interactive flow.

**Why it exists:**
The project uses AI agents for testing and validation. Traditional screen-scraping (reading DOM, clicking selectors) is fragile, token-heavy (~20K tokens per 10-step flow), and non-deterministic. WebMCP provides structured tool contracts that reduce testing tokens by ~90% and make AI interactions reliable.

**The rule:**
Every new user-facing feature MUST register WebMCP tools for its key interactions. These tools are **dev-only** (gated behind `import.meta.env.DEV`) and have zero production impact.

**Scope:**
- ✅ **New pages** — register page-level tools (navigation, state inspection)
- ✅ **New modals/dialogs** — register open/close/submit tools
- ✅ **New forms** — register form submission tool
- ✅ **New user actions** — register action tools (create, delete, toggle)
- ❌ **Bug fixes** to existing pages — exempt unless adding new interactions
- 🟡 **Existing features** — backfill only when explicitly needed for testing

**How to comply:**

1. **Create tool file:** `src/webmcp/tools/{feature-name}.tools.ts`
2. **Define tools** with name, description, inputSchema, execute function
3. **Register in route map:** `src/webmcp/registry.ts`

```typescript
// ✅ CORRECT — new feature includes WebMCP tools
// src/webmcp/tools/my-new-feature.tools.ts
import type { WebMCPTool } from '../types';

export const myNewFeatureTools: WebMCPTool[] = [
  {
    name: "create_thing",
    description: "Create a new thing with the given parameters",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the thing" },
        type: { type: "string", enum: ["typeA", "typeB"] }
      },
      required: ["name"]
    },
    execute: async ({ name, type }) => {
      // Call existing service — do NOT duplicate business logic
      const result = await createThing(name, type);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  }
];

// ❌ WRONG — new feature with NO WebMCP tools
// (Just creating the page/component without tool definitions)
```

**Tool naming convention:** `{verb}_{noun}` — e.g., `create_homework`, `open_test_editor`, `submit_writing_test`

**Checklist before feature PR is complete:**
- [ ] Interactions listed
- [ ] Tool file created in `src/webmcp/tools/`
- [ ] Tools have clear descriptions and typed schemas
- [ ] Tools registered in route map
- [ ] All gated behind `import.meta.env.DEV`

**Self-check:**
*"Am I creating a new user-facing feature? Did I add WebMCP tools for its key interactions?"*
If no → create `src/webmcp/tools/{feature}.tools.ts` before considering the feature done.

**Canonical reference:** `src/webmcp/` module, `.gemini/antigravity/skills/webmcp-enforcement/SKILL.md`

---

## Quick Reference Card

| Situation | Rule | Action |
|-----------|------|--------|
| Writing a `navigate()` call | Rule 1 | Check `src/constants/routes.ts` first |
| Writing a stored link value | Rule 1 | Use `buildRoute()`, not a string literal |
| Navigating to `/student-test/*` | Rule 2 | Call `sessionService.setPlayerData()` first |
| Navigating to `/student-wait/*` | Rule 2 | Call `sessionService.setPlayerData()` first |
| Writing a new click/nav handler | Rule 3 | Grep for existing pattern first |
| Adding a new session entry point | Rules 2 + 3 | Search existing pattern, then apply handshake |
| Writing notification links | Rules 1 + 3 | Check routes registry + search existing notif links |
| **Layout changes during dnd-kit drag** | **Rule 4** | **Call `measureDroppableContainers()` after paint** |
| **Custom pointer handlers on draggables** | **Rule 5** | **Never `setPointerCapture`, use window listeners** |
| **`useEffect` with `setInterval` + state deps** | **Rule 6** | **Hot values → refs; stable IDs only in deps** |
| **State initialized as 'pending'** | **Rule 7** | **Ensure ALL branches resolve, including "nothing happened"** |
| **New component created** | **Rule 8** | **Verify import + render + props + browser trigger** |
| **PRD says "replace ALL" or "every"** | **Rule 9** | **Grep codebase for old pattern; fix ALL matches** |
| **Before git pull/sync** | **Rule 10** | **Safety commit → fetch + inspect → verify post-merge** |
| **New service writes to DB on data events** | **Rule 11** | **Wrap with `withRestoreGuard()` — check existing pattern** |
| **Adding new RTDB node / Firestore collection** | **Rule 12** | **Check: ephemeral? dependencies? side-effects?** |
| **Heavy work on serverless (CF Workers, Lambda)** | **Rule 13** | **Client-driven multi-step; never self-call; measure first** |
| **ID shared with client/DB/external system** | **Rule 14** | **Never regenerate; treat as immutable contract** |
| **Writing ANY import statement** | **Rule 15** | **NO `@mantine/*` imports. Use native HTML/CSS.** |
| **Creating new user-facing feature** | **Rule 16** | **Add WebMCP tools in `src/webmcp/tools/`. See skill doc.** |
