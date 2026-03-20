# Knowledge Extract: PRD Task List Audit & Anti-Cheat Type System

> **Session:** 2026-03-15 → 2026-03-16 | **Scope:** Auditing AI-generated task lists for junior-readiness; building anti-cheat type foundations
> **Files touched:** 2 created, 2 modified | **TypeScript errors introduced:** 0

---

## 1. Events Timeline

| Time | Event | Outcome |
|------|-------|---------|
| Session start | User requested comprehensive audit of PRD-0036 task list | Deep codebase research initiated — traced 15+ files |
| Research Phase | Grep-traced `startTest`, `correctAns`, toast system, modal patterns, results pages, `thcsShuffle` | Found 20 issues across 3 severity levels |
| Root Cause ID | Identified that AI-generated task lists contain "confident-sounding but wrong" file references | This is a systemic risk — AI hallucinates plausible function names |
| Assessment Written | Categorized all 20 issues: 7 critical, 9 important, 4 minor | User reviewed and approved fixing all |
| Full Rewrite | Rewrote entire task list (391 lines) with all fixes applied | Dependency table, exact file paths, warning formulas, import patterns all specified |
| Implementation Start | Began Task 1.1 — created `integrity.types.ts` | Clean TypeScript, all types per PRD FR-23/24/41/42 |

---

## 2. Features Implemented

### 2.1 Anti-Cheat Type System (`integrity.types.ts`)
- **What:** Complete TypeScript type system for the anti-cheating engine
- **Types created:** `AntiCheatPreset`, `AntiCheatConfig`, `IntegrityEventType` (11 variants), `IntegrityEvent`, `IntegrityReport`, `HomeworkIntegrity`, `RiskLevel`, `EMPTY_INTEGRITY_REPORT` constant
- **File:** `src/types/integrity.types.ts`
- **Design decisions:**
  - `HomeworkIntegrity` is a lightweight version of `IntegrityReport` — uses `eventCount` + `eventSummary` string instead of full `events[]` array, to keep Firestore document size small
  - `EMPTY_INTEGRITY_REPORT` constant exported for hook initialization and no-op returns — prevents each consumer from building their own empty object
  - `RiskLevel` exported as standalone type alias for reuse without importing the full `IntegrityReport`

### 2.2 Task List Audit & Rewrite (391-line comprehensive task list)
- **What:** Found and fixed 20 issues in the AI-generated task list that would cause a junior developer to fail
- **File:** `documentation/tasks/tasks-0036-prd-anti-cheating-system.md`
- **Key additions:** Explicit dependency table, exact file paths with line numbers, RTDB import patterns, toast system API reference, warning threshold formulas, cleanup requirements

---

## 3. Implementation Details & Patterns

### 3.1 Dual-Storage Architecture for Integrity Data

```
Session Context (RTDB)                 Homework Context (Firestore)
─────────────────────                  ─────────────────────────────
Hook buffers events in memory          Hook buffers events in memory
  ↓ every 5 minutes                      ↓ only at submission time
Write IntegrityReport to RTDB          Call getIntegrityReport()
  → game_sessions/{code}/                → caller passes to homeworkSubmissionService
    players/{id}/integrity/                → HomeworkIntegrity on submission doc
  (includes full events[])              (eventCount + eventSummary, no events[])
```

**Key rule:** The hook does NOT know about Firestore. For homework, it only buffers and exposes `getIntegrityReport()`. The Firestore write responsibility belongs to the submission service, not the integrity hook.

### 3.2 Grace Period Logic (FR-6 through FR-10)

```
switchCount++
isShortDuration = durationMs < 5000ms   (5-second minimum)
isFreeSwitchLeft = switchCount <= 2      (first 2 are free)
withinGrace = isShortDuration || isFreeSwitchLeft
counted = !withinGrace                   (only counted if duration ≥5s AND switchCount >2)
```

**Critical nuance:** ALL events are logged regardless of grace status. Grace only affects the `counted` flag and whether warnings trigger. Teachers see every event in the timeline — grace events are tagged green, counted events tagged amber/red.

### 3.3 Warning Escalation Chain

```
none      → violationCount === 0
toast     → 1 <= violationCount < (threshold - 1)     → non-blocking toast
escalated → violationCount === (threshold - 1)          → urgent toast
final     → violationCount >= threshold                 → blocking modal
```

Example with `autoSubmitThreshold: 5`:
- Violations 1-3: toast warnings
- Violation 4: escalated toast
- Violation 5: final blocking modal → auto-submit

### 3.4 sessionStorage Crash Recovery Pattern

```typescript
// On mount:
sessionStorage.setItem('test_in_progress', testId);
const existing = sessionStorage.getItem(`integrity_events_${testId}`);
if (existing) {
  // Crash recovery — load previous events
  eventsRef.current = JSON.parse(existing);
  addEvent({ type: 'page_reload', ... });
}

// On every event:
sessionStorage.setItem(`integrity_events_${testId}`, JSON.stringify(events));

// On unmount / submission:
sessionStorage.removeItem('test_in_progress');
sessionStorage.removeItem(`integrity_events_${testId}`);
```

---

## 4. Lessons Learned — Trials & Failures

### 4.1 AI-Generated Task Lists Are Dangerously Plausible

> **Lesson:** AI generates function names and file references that SOUND correct but DON'T EXIST. Always grep-verify before including in a task list.

**What happened:** The initial AI-generated task list referenced `handleStartTest` in `TeacherTestMonitorPage.tsx` — a function that doesn't exist. The actual function is `startTest` in `useMonitorControls.ts` (a different file entirely). The AI inferred a plausible handler name from the prop `onStartTest` but didn't verify.

**Anti-pattern:** Trusting AI to know exact function names and file locations. AI is good at architecture; bad at codebase-specific details.

**Moving-forward rule:** Every file path, function name, and line number in a task list MUST be verified with `grep_search` before inclusion.

### 4.2 "Ghost Files" — Listed But Never Created

> **Lesson:** AI will list files in a "Relevant Files" section that no task ever creates. This creates confusion — the junior sees the file name, assumes it should exist, and gets stuck.

**What happened:** `integrityService.ts` was listed in the Relevant Files section but zero sub-tasks created it. The logic was distributed across the hook (RTDB writes) and the submission service (Firestore writes), making the standalone service file unnecessary.

**Fix:** Audit the Relevant Files list against every sub-task. Every file listed must either be assigned to a specific task or removed from the list.

### 4.3 PRD ≠ Task Coverage — Count Your Events

> **Lesson:** If a PRD table has N items and your task list covers N-2 items, nobody notices until implementation. Always count.

**What happened:** PRD FR-1 lists 9 event types. The original task list only covered 7 (`devtools_resize` and `time_per_question` were missing). This wasn't a deliberate deferral — they were simply skipped during task generation.

**Moving-forward rule:** When a task list is generated from a PRD with enumerated items (event types, config fields, API endpoints), create a cross-reference table mapping each PRD item to its implementing task. Any gap is immediately visible.

### 4.4 Naming Conflicts Between PRD Sections

> **Lesson:** Different PRD sections may use different names for the same concept. The task list must pick one and explicitly document the mapping.

FR-15 called it `disableCopyPaste` (action: prevent). FR-23 called it `detectCopyPaste` (action: detect). Both are correct but from different perspectives. Without explicit mapping in the task list, a junior would search for `disableCopyPaste` in the config type, not find it, and get confused.

**Fix:** Always include a "PRD term → Code term" mapping when naming conflicts exist.

### 4.5 "Identify the specific file" = Hallucination Invitation

> **Lesson:** Never write a task that says "identify X." The whole point of a task list is that X is already identified.

Two sub-tasks said "Identify the specific results page file(s) and add the integration." This directly contradicts the requirement that juniors should never have to independently search the codebase.

**Moving-forward rule:** If a task says "identify" or "find" or "locate," it's unfinished. Replace with the exact file path.

---

## 5. Logic & Decision Rationale

### 5.1 Why `HomeworkIntegrity` Is Separate from `IntegrityReport`

Firestore has a 1MB document size limit. Integrity events for a single test could produce 50-200 events. Storing the full `events[]` array inside a `HomeworkSubmission` document would:
- Bloat every submission document unnecessarily
- Make Firestore queries slower (more bytes transferred)
- Risk hitting the limit for power-users with many violations

Solution: `HomeworkIntegrity` stores aggregate counts + `eventSummary` string instead. Full events are available via RTDB for sessions (which has no document size limit).

### 5.2 Why Not a Standalone `integrityService.ts`

Originally planned as a centralized service file. Rejected because:
- Session writes go to RTDB (real-time) — handled by the hook's internal `writeBatchToRTDB()`
- Homework writes go to Firestore (document) — handled by the existing `homeworkSubmissionService.ts`
- Creating a third file would split the write logic across 3 places with no clear owner
- Simpler: hook owns buffering + RTDB writes; submission service owns Firestore writes

### 5.3 Why `EMPTY_INTEGRITY_REPORT` Is Exported

Multiple consumers need an empty report:
- Hook returns it in no-op mode (config null or context solo)
- Components use it as initial state before data loads
- Test files need it as a baseline

Without the constant, each consumer would hand-construct `{ violationCount: 0, totalEvents: 0, ... }` — 15 fields of boilerplate, prone to divergence if a field is added.

### 5.4 Why the Task Dependency Table Uses Tasks, Not Phases

The original task list had implicit ordering (Tasks 1-10 in sequence). But:
- Tasks 3, 4, 5 can all run in parallel after Task 1
- Tasks 9, 10 have zero dependencies
- Task 8 only depends on Task 7.1 (a single sub-task), not all of Task 7

Explicit dependency table allows parallel work and prevents over-serialization.

---

## 6. Patterns

### 6.1 Task List Verification Checklist (New Standard)

Before finalizing any AI-generated task list:

| Check | How | Example Failure |
|-------|-----|-----------------|
| File paths exist | `grep_search` or `find_by_name` for every file referenced | `integrityService.ts` listed but never created |
| Function names exist | `grep_search` for exact function name in the specified file | `handleStartTest` doesn't exist in `TeacherTestMonitorPage.tsx` |
| PRD item coverage | Count items in PRD tables, verify each has a task | 9 event types in PRD, only 7 in tasks |
| Naming consistency | Check PRD for multiple names for same concept | `disableCopyPaste` vs `detectCopyPaste` |
| No "identify" tasks | Search for "identify", "find", "locate" in task descriptions | "Identify the specific results page" |
| Import patterns specified | Every task that writes Firebase includes exact import lines | Missing `ref`/`update` import pattern |
| Data flow clarified | For dual-storage systems, specify which data goes where | Session → RTDB vs Homework → Firestore |
| Dependencies explicit | Build dependency table before numbering tasks | Task 6 requires Tasks 2+3 but no dependency stated |

### 6.2 Type File Organization Pattern

For cross-cutting type systems (used by hooks, components, services, and pages):

```
src/types/
  integrity.types.ts    ← Types + constants only, zero runtime code
                           - Export types for consumers
                           - Export EMPTY_* constants for initialization
                           - NO functions, NO imports except other types
src/utils/
  antiCheatPresets.ts   ← Pure functions that operate on the types
                           - resolvePreset(), getContextDefaults()
                           - computeRiskLevel()
                           - PRESET_DEFAULTS constant
```

**Why this split:**
- Types file has zero runtime dependencies → safe to import anywhere
- Utils file has runtime logic → imported only where needed
- Prevents circular dependency: types → utils → types

---

## 7. Moving Forward Standard

### 7.1 AI Task List Generation Protocol

When generating task lists from PRDs:

1. **After generation, run the Verification Checklist** (Pattern 6.1) before presenting to user
2. **Every file path must be verified** — grep before citing
3. **Every function name must be verified** — grep for exact name in exact file
4. **Cross-reference PRD tables** — count items, ensure 1:1 mapping to tasks
5. **Include dependency table** — explicit, not implicit
6. **Specify import patterns** — for Firebase, toast, navigation, etc.
7. **No "identify" tasks** — if the file/function isn't identified, the task isn't done

### 7.2 Anti-Cheat Type System Contract

All anti-cheat components MUST use types from `src/types/integrity.types.ts`:

| Consumer | What it imports |
|----------|----------------|
| Hooks (`useTestIntegrity`, `useAntiCopyPaste`, `useFullscreenMode`) | `IntegrityEvent`, `IntegrityEventType`, `AntiCheatConfig`, `IntegrityReport`, `EMPTY_INTEGRITY_REPORT` |
| Presets utility (`antiCheatPresets.ts`) | `AntiCheatConfig`, `AntiCheatPreset`, `RiskLevel` |
| Teacher components (`IntegrityBadge`, `IntegrityDetailPanel`) | `IntegrityReport`, `RiskLevel` |
| Homework types (`homework.types.ts`) | `AntiCheatConfig` (via `import()` type — no runtime import) |
| Submission service (`homeworkSubmissionService.ts`) | `HomeworkIntegrity` |

### 7.3 Dual-Storage Contract (Session vs Homework Integrity)

| Aspect | Session | Homework |
|--------|---------|----------|
| Storage | RTDB | Firestore |
| Path | `game_sessions/{code}/players/{id}/integrity/` | Field on `HomeworkSubmission` document |
| Write timing | Batched every 5 min + final flush | Once at submission time |
| Data format | Full `IntegrityReport` (with events[]) | `HomeworkIntegrity` (counts + summary, no events) |
| Writer | `useTestIntegrity` hook (internal) | `homeworkSubmissionService` (external) |
| Reader (teacher) | `TeacherTestMonitorPage` + `TeacherTestResultsPage` | `TeacherHomeworkDetailPage` |

### 7.4 "Junior-Proof" Task List Requirements

A task list is NOT ready for juniors until it passes ALL of these:

1. ✅ Every file path is verified against the codebase
2. ✅ Every function reference is verified (name + file + approximate line number)
3. ✅ Dependency table is explicit
4. ✅ Import patterns are specified for every non-trivial import
5. ✅ Warning/threshold formulas have exact numbers, not prose descriptions
6. ✅ CSS/styling references point to a specific existing file as the pattern
7. ✅ No "identify", "find", or "locate" verbs in task descriptions
8. ✅ PRD item coverage is 100% or deferred items are explicitly noted
9. ✅ Error handling strategy is mentioned for every I/O operation
10. ✅ useEffect cleanup is explicitly required for every event listener
