---
title: 'Session Extraction: IELTS Test Creation Review Publish Contract and Upload Loop (2026-03-29)'
description: 'Extraction of the March 29, 2026 fixes for the IELTS test creation flow: upload-step maximum update depth loop, review/publish RTDB failure on matching-information sectionReferences, interaction analysis, and resulting patterns.'
createdAt: '2026-03-29T04:45:34.842Z'
updatedAt: '2026-03-29T06:57:42.127Z'
tags:
  - extraction
  - ielts
  - test-creation
  - publish
  - react
  - rtdb
  - drafts
  - bugfix
---

# Session Extraction: IELTS Test Creation Review Publish Contract and Upload Loop (2026-03-29)

## Overview

This session uncovered and fixed two independent defects in the IELTS test creation flow:

1. A React render loop in the upload wizard (`Maximum update depth exceeded`)
2. A publish-time RTDB write failure in the review step (`value argument contains undefined in property tests...sectionReferences.0.title`)

These bugs appeared in the same user journey, but they were caused by different layers of the system and required different fixes.

## Feature Scope

Affected feature area:
- IELTS Reading test creation modal / wizard
- Draft review page before publish
- Reading question canonicalization for `matching-information`
- RTDB publish serialization

Primary files involved:
- `src/components/test-creation/TestUploadWizard.tsx`
- `src/components/test-creation/TestCreationModal.tsx`
- `src/pages/TestReviewPage.tsx`
- `src/utils/readingQuestionContract.ts`
- `src/services/testStorage.ts`
- `src/services/draftCloudService.ts`

## Issue 1: Upload Step Render Loop

### Symptom

The console emitted repeated `Maximum update depth exceeded` errors during the test creation modal flow.

### Findings

- `TestUploadWizard` emitted `onChange(...)` from a `useEffect`
- The parent (`TestCreationModal`) passed an inline `onChange` callback from the upload step renderer
- That callback called `updateStepData()`, which updated modal state
- Parent state change caused rerender
- Rerender created a new callback identity
- Child effect saw a changed dependency and fired again
- The cycle repeated indefinitely

### Root Cause

A child effect depended on a parent callback whose identity changed every render.

This is a classic parent-child feedback loop:

```text
child useEffect -> parent state update -> new callback identity -> child useEffect again
```

### Solution

`TestUploadWizard` now reads the latest callback via `useRef` and only reruns its effect when the actual upload inputs change:

- `mode`
- `selectedFile`
- `pasteText`
- `defaultFormat`

The effect no longer keys off parent callback identity.

### Pattern Extracted

**Child effects that emit data upward must not depend on unstable parent callback identities.**

Preferred safe pattern in this codebase:
- Keep the latest callback in a ref
- Depend the effect on actual data inputs, not callback identity

## Issue 2: Publish Failure on `matching-information` Section References

### Symptom

Publishing from `TestReviewPage` failed with an RTDB validation error similar to:

```text
set failed: value argument contains undefined in property 'tests...questions.4.sectionReferences.0.title'
```

### Findings

- The failure occurred during final publish, not during draft save
- The problematic question type was `matching-information`
- Section references with label-only entries were valid in the UI and valid by type contract
- `canonicalizeReadingQuestion()` built objects like:

```ts
{ label, title: undefined, paragraph: undefined }
```

- `saveTestToFirebase()` forwarded those nested objects into RTDB
- RTDB rejects nested `undefined`
- Firestore draft saves did not fail because `deepRemoveUndefined()` in `draftCloudService` converted nested `undefined` to `null`

### Root Cause

There was a producer-consumer mismatch between three layers:

1. Review/editor state allowed label-only section references
2. Canonicalization kept optional keys present with `undefined`
3. RTDB publish required those keys to be omitted entirely

The draft pipeline masked the defect because Firestore sanitization converted `undefined` to `null`, so the issue only surfaced at publish time.

### Solution

The shared canonicalizer in `readingQuestionContract.ts` now omits empty optional fields for `matching-information` section references instead of returning object keys with `undefined` values.

Before:

```ts
{ label: 'A', title: undefined, paragraph: undefined }
```

After:

```ts
{ label: 'A' }
```

This is the correct shared-layer fix because the same canonicalization path is used by:
- review page publish
- direct creation flow
- draft normalization
- other reading-question pipelines

### Pattern Extracted

**When writing to RTDB, optional nested fields must be omitted, not left as `undefined`.**

Do not rely on Firestore sanitizers to prove the RTDB payload is safe.

## Why These Bugs Were Independent

The upload loop and publish error happened in the same workflow but were unrelated:

- The upload loop happened earlier in modal creation and parsing setup
- The publish failure happened later on the review page after draft creation, parsing, and answer-key work
- Fixing one did not fix the other

This matters because a single noisy console log can contain multiple causal chains.

## Current State of the Feature After Fix

### Upload Wizard

Current state:
- The upload step no longer re-enters a callback-driven render loop from parent rerenders
- Parent state updates still work
- File/paste content emission remains functional

Remaining concern:
- Any other child component that emits state upward from `useEffect` should be reviewed for the same callback-identity trap

### Review / Publish Flow

Current state:
- `matching-information` questions can publish with label-only section references
- Empty `title` / `paragraph` values no longer poison the RTDB payload
- The shared reading contract now matches the actual allowed data shape

Remaining concern:
- Other nested optional RTDB payloads could still hide similar issues if they are not normalized at the shared contract boundary

## Cross-Feature Interaction Problems

### Drafts vs Publish Storage

Problem:
- Firestore draft persistence (`deepRemoveUndefined`) masked a bug that RTDB later rejected

Lesson:
- A feature that saves correctly to drafts is not automatically safe to publish
- Draft success is not proof of publish safety when the storage backends differ in undefined-handling semantics

### Review UI vs Storage Contract

Problem:
- The review UI correctly treated section titles as optional
- The canonical storage contract still emitted those optional keys with invalid values for RTDB

Lesson:
- UI permissiveness and storage contract permissiveness must be aligned
- Type optionality is not enough; serialization semantics matter

### Shared Reading Canonicalization

Problem:
- One canonicalizer was used across multiple flows, so a small shape bug propagated widely

Lesson:
- Shared canonicalizers are leverage points: fix there when the issue is contractual, not screen-specific
- But also treat them as high-risk because regressions can spread broadly

## Solution Pattern Summary

### Pattern 1: Omit Empty Optional Nested Fields for RTDB

Use object construction that only spreads optional keys when populated.

Good:

```ts
{
  label,
  ...(title ? { title } : {}),
  ...(paragraph ? { paragraph } : {}),
}
```

Avoid:

```ts
{
  label,
  title: title || undefined,
  paragraph: paragraph || undefined,
}
```

### Pattern 2: Ref-Stabilized Parent Callback Consumption

When a child emits upstream data from `useEffect`, store the latest parent callback in a ref and depend on actual content inputs.

Good:
- `onChangeRef.current?.(...)`
- effect deps contain data state only

Avoid:
- effect deps that include inline parent callbacks

### Pattern 3: Treat Firestore and RTDB as Different Validation Environments

Do not assume a payload safe for one backend is safe for the other.

Checklist:
- Validate nested optionals before RTDB writes
- Confirm shared normalizers do not emit `undefined` keys
- Test the final serialized payload, not only in-memory types

## Verification Performed

Targeted tests run:
- `src/components/test-creation/TestUploadWizard.test.tsx`
- `src/utils/readingQuestionContract.test.ts`
- `src/services/testStorage.test.ts`

Encoding verification run:
- targeted `npm run check:utf8 -- ...` on touched files

## Residual Risk / Follow-up

Recommended follow-up:
1. Browser smoke test the full teacher flow: create -> parse -> add answer key -> publish
2. Review other upward-emitting wizard steps for the same callback-identity loop pattern
3. Audit RTDB serializers for other nested optional objects that may still emit `undefined`
4. Consider documenting RTDB-safe serialization as a formal codebase rule if more incidents appear

## Final State Summary

The feature is now in a healthier state:
- Upload step no longer self-loops from parent rerenders
- Review publish no longer breaks on valid label-only `matching-information` references
- Shared reading question normalization better matches actual feature behavior

The most important system lesson is that draft success and publish success are different contracts when Firestore and RTDB sanitize data differently.


## Issue 3: IELTS Writing Modal / Draft / Publish Contract Drift

### Symptom

In the March 29, 2026 teacher flow, IELTS Writing showed a cluster of linked failures:
- publish could send the teacher to the wrong post-action surface
- saved writing tests could render without usable summary data on the test card
- clicking `Edit` on a writing test card could land on a blank page
- first publish of a never-saved draft could fail with `Missing or insufficient permissions`

### Findings

The defect cluster was not a single bug. It was an interaction problem across four contracts:
- the modal-first workflow contract for Writing authoring
- the editor-entry contract used by teacher lobby actions
- the storage contract between Firestore drafts and RTDB published tests
- the rendering contract used by shared teacher cards and filters

### Root Cause

The underlying failure was contract drift:
- Writing's canonical authoring model lived in `metadata` and `tasks`
- shared teacher surfaces still assumed generic test fields at the root
- edit entry could route Writing into a generic editor that expected a different schema
- service code performed read-before-create on owner-guarded Firestore drafts, which is invalid when the document does not yet exist

### Solution

The repair combined UI-boundary restoration with storage-contract fixes:
- keep Writing inside the modal-first authoring flow for creation and edit/resume
- hydrate the modal from the linked writing draft instead of using the generic editor path
- publish compatibility fields needed by shared teacher cards and filters
- preserve explicit linkage between draft and published test
- skip Firestore pre-read for brand-new `writing_drafts` documents and go straight to create/write

### Pattern Extracted

This issue produced three reusable patterns.

#### Pattern 4: Preserve Workflow Boundaries While Repairing Data Contracts

When a defect appears in a multi-step authoring flow, do not silently move the user into a different workflow just because the alternate path is easier to make pass. Keep the original journey stable and fix the contracts underneath it.

#### Pattern 5: Never Pre-Read Owner-Guarded Firestore Docs Before First Create

If a collection's read rule depends on `resource.data`, a `getDoc()` on a non-existent document can fail even for the eventual owner. For first-create flows:
- treat `id` absence or "new draft" state as create-only
- only read existing documents when there is already a persisted identifier
- test first-save and first-publish separately from update flows

#### Pattern 6: Shared Surfaces Need Canonical Adapters for Heterogeneous Test Types

When multiple test types share cards, filters, delete flows, or edit actions, either:
- normalize each type into a shared summary contract, or
- branch explicitly on canonical type shape

Do not let a shared surface assume `questions.length` or root-level `title` when some features intentionally persist under `metadata` and `tasks`.

## Dated State Update (2026-03-29)

After the March 29, 2026 repairs:
- Writing creation and edit/resume remain modal-first
- first publish no longer depends on a forbidden Firestore pre-read
- writing cards and draft surfaces show usable summary information again
- the post-publish path remains in teacher materials rather than drifting into grading

This extends the earlier March 29 extraction: draft success, publish success, and edit success are three separate contracts, and the failures here came from crossing workflow and storage boundaries without explicit adapters.
