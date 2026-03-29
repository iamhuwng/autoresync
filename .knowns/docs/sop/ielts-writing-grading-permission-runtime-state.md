---
title: IELTS Writing Grading Permission Runtime State
description: Dated runtime-state record for March 2026 IELTS Writing incidents across grading, authoring, publish, and edit flows, including root causes, live repairs, and current feature state.
createdAt: '2026-03-28T09:17:18.010Z'
updatedAt: '2026-03-29T07:11:36.740Z'
tags:
  - sop
  - runtime-state
  - incident
  - ielts
  - writing
  - firebase
---

# IELTS Writing Grading Permission Runtime State

## Scope

This document records the concrete issue trail, live repairs, and current runtime state for the March 2026 IELTS Writing grading permission incident.

This is intentionally feature-specific. The reusable lesson lives in @doc/patterns/pattern-firestore-rules-vs-collection-queries.

## Feature Surfaces

Affected feature surfaces:
- Teacher `Grading` -> `IELTS Writing` queue
- Writing grading detail page
- Writing grading save path
- Firestore collection `writing_submissions`

Primary files/services involved:
- `src/pages/TeacherGradingPage.tsx`
- `src/pages/WritingGradingPage.tsx`
- `src/services/writingSubmissionService.ts`
- `firestore.rules`

## User-Visible Issue

Reported symptom:
- Teacher opens `Grading` and clicks `IELTS Writing`
- Page shows `Missing or insufficient permissions` and a retry state

Observed console signal:
- `writingSubmissionService.getPendingSubmissions()` failed with Firestore `Missing or insufficient permissions`

## Root Causes

### 1. Query/rule mismatch

The queue used a single Firestore query on `writing_submissions` with `where('markingStatus', '==', 'pending-review')` and then filtered teacher ownership in the client.

The deployed Firestore rule only allowed reads when one of these matched the signed-in user:
- `studentId`
- `context.assigningTeacherId`
- `context.selectedTeacherId`

That rule/query mismatch caused Firestore to reject the entire queue query.

### 2. Live-session submissions lacked teacher ownership metadata

`autoSubmitFromRTDB()` created live-session submissions with:
- `context.type = 'live-session'`
- `context.sessionCode = ...`

but no `assigningTeacherId`.

That made the ownership-based read rule especially brittle for live-session writing submissions.

### 3. Hosted project still had stale Firestore rules deployed

Even after the local repository contained the right rule fix, the running Firebase project `temp-a1437` still served the older `writing_submissions` rule block.

This kept the live teacher queue broken until rules were explicitly deployed.

## Repairs Applied

### Local source repairs

Implemented in source:
- broadened `writing_submissions` read access to match the queue design
- tightened the open-ended update rule to require student ownership or teacher-linked grading metadata
- updated live-session writing auto-submit to persist `context.assigningTeacherId` for new submissions
- added targeted service and security test coverage around the repaired surfaces

Relevant files:
- `firestore.rules`
- `src/services/writingSubmissionService.ts`
- `src/services/writingSubmissionService.test.ts`
- `src/__tests__/security/prd0040-security.emulator.test.ts`

### Live operational repair

Applied directly to the active Firebase project:
1. Confirmed active runtime project `temp-a1437`
2. Fetched remote Firestore rules and verified the old `writing_submissions` block was still deployed
3. Deployed local `firestore.rules` to the live project
4. Re-fetched the remote rules and confirmed the new block was live

Deploy command used:

```bash
firebase deploy --only firestore:rules
```

## Verification Status

Verified:
- `src/services/writingSubmissionService.test.ts` passed locally after the repair
- remote Firestore rules for `temp-a1437` were re-read after deployment and showed the updated `writing_submissions` rule block

Not fully verified in this session:
- end-to-end Firebase emulator security suite required Java-backed emulators and could not run in this environment
- hosted browser re-test was not captured in this document after the live rules deploy

## Current Feature State

As of 2026-03-28:
- live project `temp-a1437` has the updated `writing_submissions` Firestore rules deployed
- teacher queue reads should no longer be blocked by the old per-document read rule
- writing detail page and grading-save pre-read are unblocked by the same deployed read change
- source code now includes `assigningTeacherId` on new live-session submissions, but that code-path improvement only affects whichever runtime is serving the updated frontend/service bundle

## Follow-Up Watchpoints

If the same symptom returns, check these in order:
1. active Firebase project ID at runtime
2. currently deployed remote Firestore rules for `writing_submissions`
3. queue read path in `getPendingSubmissions()`
4. detail read path in `getSubmission()`
5. pre-update read inside `updateGrading()`
6. whether the runtime bundle includes the latest `autoSubmitFromRTDB()` metadata write

## Related Docs

- @doc/patterns/pattern-firestore-rules-vs-collection-queries
- @doc/architecture/firebase-infrastructure


## 2026-03-29 Addendum: Writing Authoring / Publish / Edit Runtime State

### Scope Extension

This addendum records the March 29, 2026 issue cluster on the IELTS Writing authoring flow. It sits next to the March 28, 2026 grading-permission incident because the failures touched the same feature family and exposed shared contract weaknesses across Firestore, RTDB, and teacher-facing workflow surfaces.

Affected feature surfaces:
- Teacher `Materials` / lobby test cards for IELTS Writing
- `TestCreationModal` writing flow
- Writing draft persistence in Firestore `writing_drafts`
- Published writing tests in RTDB `tests`
- Teacher edit / resume flow for saved and published writing tests

Primary files/services involved:
- `src/components/test-creation/TestCreationModal.tsx`
- `src/pages/TeacherLobbyPage.jsx`
- `src/services/writingTestService.ts`
- `src/components/modern/TestCard.jsx`
- `src/components/modern/DraftCard.jsx`
- `src/hooks/test/useTestFilters.ts`
- `src/hooks/thcs/useTeacherDrafts.ts`
- `src/hooks/test/useTeacherTests.ts`
- `firestore.rules`

### User-Visible Issue Trail

Reported on 2026-03-29:
- after publishing an IELTS Writing test, the teacher could land on a grading surface instead of remaining in the materials workflow
- saved writing tests could render with missing information on the test card
- clicking `Edit` on a writing test card could lead to a blank page
- first publish could fail with `Failed to publish: Missing or insufficient permissions`

Observed runtime signals:
- R2 temp image upload completed successfully before the publish failure, which ruled out media upload as the blocker
- Firestore returned `Missing or insufficient permissions` during the publish path for a brand-new writing draft
- earlier repair attempts also exposed that breaking the modal-first authoring boundary created UX regression even when data issues were otherwise repaired

### Findings and Root Causes

#### 1. Workflow boundary drift

IELTS Writing is contractually modal-first for its beginning steps. A repair that pushed Writing creation or edit into a standalone builder page fixed some downstream symptoms but violated the existing workflow boundary.

That meant the UI could appear "repaired" at the data layer while still being wrong at the teacher journey level.

#### 2. Shared teacher surfaces assumed the wrong data shape

Teacher cards, search, and edit entry points were still biased toward generic question-based tests with root-level fields such as `title`, `duration`, and `questions.length`.

IELTS Writing persisted its canonical authoring shape under `metadata` and `tasks`, which made cards render blank or incomplete unless a compatibility adapter was applied.

#### 3. Edit / resume entry used the wrong editor contract

The teacher lobby edit path could send IELTS Writing into a generic editor path that expected a different test schema.

When the stored writing entity did not satisfy that editor's assumptions, the result was a blank edit page instead of re-opening the writing draft flow.

#### 4. First-create publish violated Firestore rule semantics

The publish/save service attempted `getDoc()` against `writing_drafts/{draftId}` even when the draft had never been created.

The deployed `writing_drafts` rule allows reads only when `resource.data.userId == request.auth.uid`. For a non-existent document, that read is denied, so first publish failed before the create/write step.

#### 5. Cross-store contract was under-specified

The writing system spans:
- Firestore draft documents for authoring state
- RTDB test documents for published teacher materials
- shared teacher lobby components that read heterogeneous test types

Without explicit linkage and compatibility fields, each surface could appear locally correct while still breaking when crossing store boundaries.

### Repairs Applied on 2026-03-29

Implemented repairs:
- restored the modal-first IELTS Writing creation flow in `TestCreationModal`
- restored modal-based edit / resume by hydrating the writing modal from the linked draft instead of routing into a generic editor page
- kept publish navigation inside the teacher materials workflow instead of landing in grading
- wrote compatibility fields on published writing tests so shared teacher cards and filters can render stable summary information
- preserved draft/test linkage through `sourceDraftId` and `publishedTestId`
- updated writing cards, drafts, filters, and delete flow to understand the writing-specific `metadata` / `tasks` shape
- removed forbidden first-read behavior for brand-new writing drafts so create/save/publish paths no longer fail under owner-only Firestore rules

### Current Feature State

As of 2026-03-29:
- IELTS Writing creation begins inside the modal flow again
- IELTS Writing edit / resume also re-opens the modal with hydrated draft state
- publish no longer redirects the teacher into grading as part of the normal authoring flow
- writing test cards can display title, duration, and task count again
- first publish works without requiring a prior manual save of the draft
- published writing tests retain a stable link back to their editable source draft
- deleting a published IELTS Writing test can also clean up its linked draft to avoid orphan state

### Cross-Feature Interaction Problems to Watch

If this feature regresses again, check these interaction boundaries in order:
1. modal workflow contract in `TestCreationModal`
2. teacher lobby edit / resume entry point for writing tests
3. Firestore `writing_drafts` rules versus any read-before-create logic
4. RTDB published test payload shape versus shared card/filter consumers
5. draft/test linkage fields (`sourceDraftId`, `publishedTestId`)
6. whether runtime logs point to R2 upload, Firestore draft access, or RTDB publish writes

Important interaction note:
- the 2026-03-28 grading-permission incident and the 2026-03-29 authoring/publish incident were adjacent in the same feature family but had different root causes
- 2026-03-28 was primarily a Firestore query/rule mismatch on `writing_submissions`
- 2026-03-29 was primarily a workflow-contract and draft/test storage-contract failure on `writing_drafts` plus shared teacher surfaces

### Related Docs

- @doc/extractions/session-extraction-ielts-test-creation-review-publish-contract-and-upload-loop-2026-03-29
- @doc/prd/prd-test-creation-modal
- @doc/patterns/pattern-dynamic-step-order-wizard
- @doc/architecture/test-system-architecture
- @doc/architecture/firebase-infrastructure


## 2026-03-29 Addendum: Live Session Student Routing Runtime State

### Scope

This addendum records the March 29, 2026 live-session student crash that affected IELTS Writing delivery after the teacher started a test.

### User-Visible Issue

- Students could move from the waiting room into the live test flow.
- The test page then crashed in `StudentTestPage.tsx` on `testData.passages.find(...)`.
- The session payload existed. The failure was not "test missing"; it was the wrong page consuming a valid Writing payload.

### Findings and Root Causes

#### 1. Router logic stopped too early at `testType`

`TestPageRouter` treated `testType` as the dominant discriminator. For non-THCS tests, the presence of `testType` caused a fallback to the generic IELTS page instead of continuing to resolve `skill`.

#### 2. The published Writing payload was valid, but the router consumed only part of the contract

IELTS Writing publish flows write a valid Writing test contract with:

- `testType: 'IELTS'`
- `skill: 'Writing'`
- Writing payload shape based on `tasks`

The bug was at the interaction boundary between publish output and route selection, not in Writing test publishing itself.

#### 3. The generic IELTS page assumed the reading/listening render contract unconditionally

`StudentTestPage` expected reading/listening-style `passages` and `questions`. Once the router sent a Writing payload there, the page escalated the routing mistake into a hard runtime crash instead of a controlled unsupported state.

### Repairs Applied on 2026-03-29

- Fixed `TestPageRouter` to resolve `skill` for IELTS tests even when `testType` is present.
- Routed `skill === 'Writing'` sessions to `WritingTestPage` and loaded the Writing payload through the correct branch.
- Added a regression test for the exact discriminator combination `testType: 'IELTS'` plus `skill: 'Writing'`.
- Hardened `StudentTestPage` so missing `passages` or `questions` degrade to a safe unsupported-format state instead of throwing.

### Verification Status

Verification completed on 2026-03-29:

- targeted Vitest regression passed
- full Vite build passed
- UTF-8 guard passed for touched files

### Current Feature State

Current expected live-session behavior:

- `testType` now selects the test family boundary first (`THCS-THPT` vs IELTS family).
- For IELTS family routes, `skill` now selects the concrete student page.
- IELTS Writing live sessions now reach `WritingTestPage` instead of the generic reader page.
- If a future boundary regression sends the wrong payload to `StudentTestPage`, the page should fail safely instead of crashing immediately.

### Cross-Feature Interaction Problems to Watch

#### 1. Any entry surface that treats `testType` as sufficient for all IELTS delivery pages

Resume flows, deep links, waiting-room transitions, or new router layers can recreate the same defect if they stop at the family discriminator and never resolve `skill`.

#### 2. Any generic fallback page that assumes payload shape without guarding required arrays

A generic page should not turn an upstream routing mistake into a student-visible crash.

#### 3. Any new skill-specific IELTS page added without discriminator regression coverage

If multiple skills share the same top-level `testType`, route tests must cover the exact `testType + skill` combination that reaches each page.

### Related Docs

- @doc/architecture/test-system-architecture
- @doc/patterns/pattern-test-router-must-resolve-render-contract-before-fallback
- @task-nszwf2
