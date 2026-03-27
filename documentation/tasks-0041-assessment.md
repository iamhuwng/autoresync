# PRD-0041 Task List Assessment — Junior-Developer-Proof Audit

> **Date:** 2026-03-27
> **Inputs:** `tasks-0041-prd-result-visibility-ownership-governance.md`, `0041-prd-result-visibility-ownership-governance.md`, Codemap "PRD-0041: Current Implementation", and 19 source files read directly.

---

## Executive Summary

The task list is **structurally strong** — correct sequencing, hard gates between phases, and explicit forbidden-move rules. However, it has **significant gaps that would cause a junior to stall, guess, or deviate** in at least 28 specific places. The gaps fall into five categories:

1. **Missing concrete code-level instructions** — tasks say *what* to do but not *how*, leaving the junior to reverse-engineer current code patterns
2. **Missing PRD functional requirements** — 12 FRs have no explicit task mapping
3. **Codemap-revealed realities not reflected** — the task list's assumptions about existing code don't match what the code actually does
4. **Ambiguous or undefined terms** — phrases a junior will interpret differently than intended
5. **Missing test specifics** — test tasks list scenarios but not assertions, file structures, or mock strategies

---

## SECTION A: PRD Functional Requirements Without Explicit Task Coverage

These FRs from the PRD have no dedicated task or subtask. A junior will skip them.

| PRD FR | Requirement Summary | Gap in Task List |
|--------|---------------------|------------------|
| **FR-005** | Public-library/shared-template creators get no visibility unless they satisfy ownership via session/homework/course/class | Mentioned indirectly in 6.1 test scenarios but **no explicit writer-side task** says "strip original test creator from visibility path" — Task 4.3 says "public-library authorship never becomes result ownership" but doesn't tell the junior *which field* to stop copying (`testData.createdBy`) |
| **FR-024** | Historical display metadata must prefer submission-time snapshots | No task tells the junior **where** to render snapshot metadata vs current metadata. Task 5.8 mentions "display submission-time snapshot metadata" but doesn't specify which UI fields or components |
| **FR-025** | Current source names shown only as supplemental, not primary label | No task specifies the exact UI hierarchy (primary = snapshot name, secondary = current name). Junior will guess |
| **FR-028** | Teacher history list rows must NOT display a `teacher-owned` badge | No task explicitly says "do not add a teacher-owned badge". Task 5.7 covers solo-practice labeling but doesn't mention the ban on teacher-owned badges |
| **FR-029** | Must display visible `Solo Practice` tag only for solo rows | Task 5.7 covers this but doesn't specify **where in the row** (left badge? right tag? inline text?) or the exact component to create/modify |
| **FR-031** | Must NOT display `legacy/unverified` badges | No task explicitly bans this badge. Junior may add it thinking it's helpful |
| **FR-033** | Same solo-practice result visible to multiple currently assigned teachers | No task explains the implementation: does the resolver return the result for ANY teacher with active assignment, or is it indexed per-teacher? The data model implications are unaddressed |
| **FR-040** | Reassignment restores previously eligible teacher-owned results automatically | Task 5.9 mentions "immediate access-loss" but **no task covers the reassignment restoration path**. The only mention is in 6.1 test scenarios |
| **FR-041** | Reassignment restores solo-practice visibility automatically | Same gap as FR-040 — no implementation task, only a test task |
| **FR-057** | Legacy results excluded from teacher views must remain visible in student history | No task ensures student-facing history is untouched. Junior may accidentally break student views while refactoring `getStudentResults()` |
| **FR-067** | No consumer may claim complete teacher history until live quiz results are in canonical storage | No task adds a feature flag, warning, or UI indicator. This is a governance rule with no implementation anchor |
| **FR-079** | Producer/consumer changes must update arch doc, contract, checklist in same change set | Task 11.5 covers this for later phases but **no Phase 1 task** enforces it during the actual implementation |

---

## SECTION B: Codemap-Revealed Code Realities Not Reflected in Tasks

The codemap and source file reads expose specific code patterns the task list doesn't account for.

### B1. `sessionManager.js` generates a SYNTHETIC `teacherId`

```
// Line 93 of sessionManager.js
const teacherId = `teacher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

**Impact:** Task 2.5 says "session lookup from `sessionManager.js` with `createdByUserId` then `createdBy` then real-UID `teacherId`". But the actual `teacherId` field in `game_sessions` is a **random synthetic string**, not a real UID. The task list's fallback chain treats `teacherId` as potentially valid ("only then `teacherId` if it truly stores the real teacher UID") but never tells the junior:
- `session.teacherId` is ALWAYS synthetic in current code — it should NEVER be used
- The real owner field is `createdByUserId` (set from `createdBy` param, which is the Firebase Auth UID)
- `session.createdBy` does NOT exist as a field — only `createdByUserId` does

**Required fix:** Task 2.5 must explicitly state: "`session.teacherId` is a legacy synthetic tracking ID (`teacher_TIMESTAMP_RANDOM`), never a real UID. The ONLY valid owner field is `session.createdByUserId`. Do not fall back to `session.teacherId` or `session.createdBy` (which does not exist on the session record)."

### B2. `useTestSubmission.ts` line 340 already uses wrong precedence

```typescript
// Line 340
teacherId = sessionData.createdBy || sessionData.teacherId || '';
```

**Impact:** Task 4.1 says "use authoritative session-owner precedence: `createdByUserId`, then `createdBy`". But:
- `sessionData.createdBy` does NOT exist on the session record (the field is `createdByUserId`)
- `sessionData.teacherId` is the synthetic string
- The current code is therefore ALWAYS falling back to the synthetic `teacherId`

**Required fix:** Task 4.1 must give the EXACT correction: "Change `sessionData.createdBy || sessionData.teacherId` to `sessionData.createdByUserId` only. Do not fall back to `sessionData.teacherId` (it is synthetic). Do not use `sessionData.createdBy` (it does not exist)."

### B3. `saveTestResult()` takes `teacherId` as a positional parameter (position 8)

The function signature in `testResults.service.ts:135` is:
```typescript
export async function saveTestResult(
  sessionCode, testId, studentId, studentName, markingResult,
  testMetadata, timeElapsed, teacherId?, isGuest?, submissionContent?,
  academicContext?, context?, thcsData?, ieltsData?
)
```

**Impact:** Task 3.1 says "every canonical save path calls `resultOwnershipResolver` before any result row or teacher index row is written" but doesn't specify:
- Whether `saveTestResult()` signature changes (adding a `visibility` param? replacing `teacherId`?)
- Whether callers continue passing `teacherId` or pass the resolved visibility snapshot instead
- Whether the resolver runs INSIDE `saveTestResult()` or BEFORE it in each caller

A junior will not know where to insert the resolver call. **The task must specify the exact integration pattern.**

### B4. `THCSPracticeView.tsx` imports from `@mantine/core` (line 26)

```typescript
import { Container, Text, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
```

**Impact:** Per user rules, `@mantine/*` is banned (Rule 15). Task 4.3 says to refactor this file but never mentions the Mantine removal obligation. A junior will refactor ownership logic but leave banned imports.

**Required fix:** Task 4.3 must include: "Also remove `@mantine/core` and `@mantine/hooks` imports per Rule 15. Replace with native equivalents matching the pattern in `THCSTestLayout.tsx` which already uses local polyfills."

### B5. `writingSubmissionService.ts` writes teacher index from raw `teacherId` param

```typescript
// Line 203
if (teacherId) {
    updates[`test_results_by_teacher/${teacherId}/${resultId}`] = { ... };
}
```

**Impact:** Task 4.5 says "resolve ownership through writing-submission plus linked authoritative source" but doesn't tell the junior the exact integration point in `persistWritingResultRecord()` where the raw `teacherId` teacher-index write must be replaced with the resolved visibility owner.

### B6. `TeacherStudentHistoryPage.tsx` has NO teacher shell

The current page (line 348+) renders a standalone gradient full-screen page with inline styles. Task 5.3 says "rebuild under the teacher full-page shell using `TeacherHeader` and `AppShell` pattern from `TeacherStudentsPage.tsx`" but doesn't specify:
- Which import to use for `TeacherHeader`
- Which import to use for `AppShell` 
- The exact file to reference as the template
- Whether to keep the existing inline styles or replace entirely

### B7. `ResultDetailPage.tsx` renders a standalone gradient page for teachers

```typescript
// Line 77-92 — teacher/admin branch
<div style={{ minHeight: '100vh', background: 'linear-gradient(...)' }}>
    <LegacyResultDetailView ... />
</div>
```

**Impact:** Task 5.5 says "teacher/admin branch stays inside the teacher shell" but doesn't tell the junior what to replace the gradient wrapper with. The junior needs the exact shell component import and wrapping pattern.

### B8. `LegacyResultDetailView.tsx` uses `useResultOwnershipCheck(result?.studentId)`

```typescript
// Line 47
} = useResultOwnershipCheck(result?.studentId);
```

**Impact:** This check validates student-teacher assignment (outer access gate), NOT per-result visibility. Task 5.6 says "teacher/admin access is decided by the shared result-visibility verdict, not by student-only ownership checks" but doesn't tell the junior:
- Whether to KEEP `useResultOwnershipCheck` as the outer gate AND add visibility check
- Or REPLACE it entirely with the new visibility service
- What the new hook/service call looks like

### B9. `AdminReportsPage.tsx` currently has tabs: `health`, `errors`, `live`

Task 5.10 says "add unresolved-result diagnostics" but doesn't specify:
- Whether to add a new tab (e.g., `unresolved`) or a section within an existing tab
- The exact RTDB listener pattern to use (matching existing `onValue`/`onChildAdded` patterns in the file)
- The table column layout for the unresolved results view
- Whether to use the existing `AdminLayout` wrapper or a different layout

### B10. `getStudentResults()` returns ALL results — no server-side filtering

```typescript
// testResults.service.ts:401-417
const resultIds = Object.keys(indexSnapshot.val());
const results = await Promise.all(resultIds.map(resultId => getTestResult(resultId)));
```

**Impact:** Task 3.3 says "refactor `getStudentResults()` to use the shared visibility and read-time enrichment pipeline" but the function currently does ZERO filtering. The junior needs to know:
- Does this function now accept a `teacherId` parameter for visibility filtering?
- Or does it return all results and the CALLER applies visibility?
- If enrichment happens here, does it enrich ALL rows or only the ones requested by a teacher context?
- Student callers of this function must NOT get filtered results

### B11. `resultsService.ts` has its OWN `getTeacherResults()` that scans ALL sessions

```typescript
// resultsService.ts — getTeacherResults()
const matchesTeacher = !teacherId || session.teacherId === teacherId || session.createdBy === teacherId;
```

**Impact:** This is a SECOND teacher result path that reads `game_sessions` directly and uses the synthetic `session.teacherId`. Task 3.5 says "Phase 1 does not leave a second local ownership read path alive" but doesn't tell the junior:
- Whether to DELETE this function
- Or REDIRECT it to the canonical service
- Or mark it deprecated with a runtime warning
- What happens to consumers of this function (the task doesn't list them)

---

## SECTION C: Ambiguous Instructions a Junior Will Misinterpret

### C1. "Lock" terminology used without definition

Tasks 1.7, 1.8, 1.10, 2.9 use "lock" (e.g., "lock the exact required fields"). A junior will interpret this as either:
- Write it in a document (which is what's intended)
- Add runtime validation/enforcement
- Make fields readonly in TypeScript

**Fix:** Replace "lock" with "document and commit as the binding specification in [specific doc file]".

### C2. Task 2.4 — "no UI logic" is undefined

"Create `resultOwnershipResolver.ts` with only these responsibilities... and no UI logic." What counts as UI logic? A junior may think:
- React imports = UI logic (correct)
- Returning display strings = UI logic (ambiguous)
- Returning a `label` or `tagText` field = UI logic (ambiguous)

**Fix:** Specify: "This service must have zero React imports, zero DOM references, and return only data types. Display formatting belongs in components."

### C3. Task 3.6 — "legacy rows missing normalized snapshots" is undefined

How does the junior identify a legacy row? The task doesn't define the detection logic:
- Is it `!result.visibility`?
- Is it `!result.visibility?.ownershipResolved`?
- Is it a check against a version field?

**Fix:** Specify the exact condition: "A legacy row is any `test_results/{id}` record where `result.visibility` is `undefined` or `result.visibility.ownershipResolved` is not `true`."

### C4. Task 3.8 — "one-time reindex task" form factor undefined

Is this:
- A script in `/scripts/`?
- A function in the reindex service called from AdminReportsPage?
- A Firebase Cloud Function?
- A manual RTDB console operation?

**Fix:** Specify the exact form: "Create a runnable script at `scripts/reindex-teacher-results.ts` that can be executed via `npx tsx scripts/reindex-teacher-results.ts`. It must be idempotent and log progress."

### C5. Task 4.7 — `StudentQuizPageNew.jsx` canonical write is vague

"Every completed quiz attempt writes a normalized canonical result row in addition to session player-state data." But the current quiz page (`StudentQuizPageNew.jsx`) doesn't call `saveTestResult()` at all — it only writes to `game_sessions/{code}/players/{id}`. The task doesn't specify:
- WHERE in the quiz flow to add the canonical write (after final answer? after session completes?)
- HOW to get marking data (the quiz page uses `calculateScore()` from `utils/scoring`, not `autoMarking.service`)
- WHETHER the teacher sees quiz results immediately or only after session ends
- HOW to handle the quiz's question-by-question flow vs the test's all-at-once flow

This is by far the **highest-risk task** for a junior. It requires significant new code in a complex legacy JSX file.

### C6. Task 5.4 — "canonical type map" undefined

"Filter options come from the normalized and classified result set or a defined canonical type map." Neither option is defined:
- What is the canonical type map? Where is it defined?
- Does "come from the result set" mean dynamically extracted from loaded results?
- What are the exact filter options to show?

---

## SECTION D: Missing Concrete Implementation Details

### D1. No `ResultVisibilitySnapshot` field placement specification

Task 2.1 lists fields but doesn't specify:
- Is this a top-level field on `EnhancedTestResultRecord` (e.g., `result.visibility: ResultVisibilitySnapshot`)?
- Or are fields spread flat on the record (e.g., `result.contextType`, `result.sourceType`)?
- The RTDB path — does it nest under `test_results/{id}/visibility/` or at `test_results/{id}/contextType`?

**Impact:** This affects every writer and reader. If the junior guesses wrong, every downstream task breaks.

**Fix:** Add to task 2.1: "Add a single `visibility` field of type `ResultVisibilitySnapshot` to `EnhancedTestResultRecord`. In RTDB, this persists as `test_results/{id}/visibility/{fields}`. Do NOT spread visibility fields flat on the root record."

### D2. No specification for how `resultOwnershipResolver` is called

Task 2.4 creates the service. Task 3.1 says "every canonical save path calls it." But no task specifies:
- The exact function signature (input params and return type)
- Whether it's async (it must be — it does DB lookups)
- Whether it returns the full snapshot or just the resolved owner
- How errors are handled (throw? return unresolved status?)

**Fix:** Add a subtask under 2.4 with the exact primary function signature:
```typescript
export async function resolveResultOwnership(params: {
  contextType: ResultContextType;
  sessionCode?: string;
  homeworkId?: string;
  courseId?: string;
  classId?: string;
  writingSubmissionId?: string;
  producerTeacherId?: string; // raw value from caller — NOT trusted
}): Promise<ResultVisibilitySnapshot>
```

### D3. No specification for `resultVisibility.service.ts` primary function

Task 2.6 lists responsibilities but not the function signature. The junior needs:
```typescript
export function getTeacherVisibilityVerdict(
  result: EnhancedTestResultRecord,
  teacherId: string,
  assignmentState: { isAssigned: boolean }
): VisibilityVerdict
```

### D4. No RTDB rules changes specified

The task list references `/reports/result_visibility/unresolved/{resultId}` (task 2.7) but no task tells the junior to update `database.rules.json` to allow admin read/write to this path.

**Fix:** Add a subtask: "Update `database.rules.json` to add read/write rules for `/reports/result_visibility/unresolved` — super_admin only."

### D5. No specification for `test_results_by_teacher` index rebuild format

Task 3.2 says "build teacher-facing index rows only from `visibilityOwnerTeacherId`" but doesn't specify:
- Does the index key change? (Currently `test_results_by_teacher/{teacherId}/{resultId}`)
- Does it become `test_results_by_teacher/{visibilityOwnerTeacherId}/{resultId}`?
- What happens to solo-practice results? (No teacher index entry? Or a special "solo" bucket?)
- What about the existing index rows — delete them during reindex?

### D6. No specification for how solo practice appears for multiple teachers

FR-033 says the same solo result is visible to multiple assigned teachers. But the current architecture uses `test_results_by_teacher/{teacherId}/` as the teacher index. Solo practice has NO teacherId.

**The task list never resolves this architectural question.** Options:
1. Don't index solo practice in teacher indexes; resolve at read time by checking assignment
2. Index under every assigned teacher (complex, stale when assignments change)
3. Use a separate query path for solo results

A junior CANNOT make this architectural decision. **This must be specified.**

### D7. No migration strategy for existing `test_results_by_teacher` data

Task 3.8 mentions a reindex but doesn't specify:
- Whether old index entries are deleted
- Whether the reindex is additive (add new entries) or replace-all
- How to handle the transition period (old indexes coexist with new ones?)
- Whether the reindex runs before or after writer migration

---

## SECTION E: Test Task Gaps

### E1. No mock strategy specified

Tasks 2.10, 3.9, 4.8, 5.11, 6.1–6.5 all require tests but never specify:
- How to mock Firebase RTDB reads (jest mock? vitest mock? `@firebase/testing`?)
- How to mock Firestore reads for homework lookups
- Whether to use existing test utilities from `src/__tests__/mocks/`
- The test runner (vitest — but this is never stated)

### E2. No test file bootstrapping instructions

Tasks reference files like `src/services/resultOwnershipResolver.test.ts` but don't tell the junior:
- Import patterns
- Setup/teardown boilerplate
- How to structure describe blocks
- Whether to follow existing test patterns in the codebase

### E3. Test scenarios in 6.1 are listed but assertions are not

"Public-library test assigned by Teacher A but authored by Teacher C" — the junior knows the scenario but not:
- The exact expected return value
- Which function to call
- What mock data to set up
- What the assertion looks like

---

## SECTION F: Missing Cross-Cutting Concerns

### F1. No error handling strategy

No task specifies what happens when:
- Homework lookup fails (Firestore unavailable)
- Session lookup fails (RTDB timeout)
- The resolver encounters a result with no context at all
- The reporting service fails to write an unresolved report

### F2. No performance consideration

`getStudentResults()` currently fetches ALL student results. Adding read-time enrichment (task 3.6) means each result may trigger 1-3 additional DB lookups (homework, session, class). For a student with 100 results, that's potentially 300 extra reads.

No task addresses:
- Batching strategy
- Caching of source lookups
- Whether enrichment should be lazy (on-demand) or eager (all at once)

### F3. No import path specification for new services

The junior needs to know:
- `import { resolveResultOwnership } from '../services/resultOwnershipResolver'`
- But from `useTestSubmission.ts`, the relative path would be `../../services/resultOwnershipResolver`
- From `THCSPracticeView.tsx`, it would be `../../services/resultOwnershipResolver`

These vary per file. Either specify them or mandate a path alias.

### F4. No consideration of `resultsService.ts` consumer inventory

Task 3.5 says to neutralize `resultsService.ts` as a second ownership path but doesn't list its consumers. A grep reveals it's imported by multiple pages. The junior needs to know which consumers to update and which can wait for later phases.

---

## SECTION G: Recommended Structural Improvements

### G1. Add a "Current Code State" section per task

For each task that modifies existing code, add:
- **Current behavior:** [what the code does now, citing line numbers]
- **Target behavior:** [what it must do after the task]
- **Exact change:** [which lines to modify and how]

### G2. Add a "Definition of Done" per subtask

Each subtask should end with a verifiable checklist:
- [ ] File X exists/modified
- [ ] Function Y has signature Z
- [ ] Test command: `npx vitest run path/to/test`
- [ ] No Mantine imports in modified files

### G3. Add an explicit "Architectural Decisions" subtask under 2.0

Before coding, the junior must commit to:
- Visibility snapshot is a nested `visibility` field, not flat
- Solo practice is resolved at read-time, not indexed per-teacher
- Read-time enrichment uses batch lookups with a source cache
- The resolver returns the full snapshot, never partial

### G4. Add explicit "DO NOT" lists per task

Task 4.3 should say:
- DO NOT copy `testData.createdBy` into any visibility or teacher ownership field
- DO NOT import from `@mantine/core` or `@mantine/hooks`
- DO NOT call `saveTestResult()` with a raw `teacherId` parameter
- DO NOT skip the resolver call for any code path

---

## Summary Counts

| Category | Issues Found |
|----------|-------------|
| Unmapped PRD FRs | 12 |
| Code reality mismatches | 11 |
| Ambiguous instructions | 6 |
| Missing implementation details | 7 |
| Test gaps | 3 |
| Cross-cutting gaps | 4 |
| **Total junior-risk items** | **43** |

---

## Verdict

**The task list is NOT yet junior-safe.** It is an excellent strategic skeleton but operates at a senior-engineer abstraction level. A junior following it verbatim would:

1. **Stall** at ~15 points where the "how" is undefined
2. **Guess wrong** at ~10 points where code assumptions don't match reality
3. **Miss** ~12 PRD requirements that have no task mapping
4. **Break** student-facing flows by not knowing what to preserve
5. **Introduce** Mantine imports or synthetic teacherId bugs by not knowing current code pitfalls

The task list needs a revision pass that adds the concrete code-level details identified in Sections B, C, and D before handing to a junior.
