---
title: Solo Practice IELTS Student Safe Payload Runtime State
description: Dated incident record for the Solo Practice IELTS library access failure caused by missing student-safe RTDB payloads, with findings, repairs, and current state.
createdAt: '2026-03-28T12:49:20.212Z'
updatedAt: '2026-03-28T12:50:02.703Z'
tags:
  - sop
  - runtime-state
  - incident
  - firebase
  - solo-practice
  - ielts
---

# Solo Practice IELTS Student Safe Payload Runtime State

## Scope

This document records the concrete investigation, findings, repairs, current runtime state, and interaction risks for the March 28, 2026 Solo Practice IELTS library-access incident.

This is intentionally not the reusable pattern doc. It is the operational closeout for this specific repair cycle.

## Initial Report

Primary user-visible failure:

- Students could see IELTS Solo Practice tests in the Library tab.
- Clicking into practice failed instead of opening the test.
- The console ended with `Student-safe test payload not found` from the solo test loader.

## Feature State At Investigation Time

Relevant current feature behavior:

- `StudentLibraryPage` lists available materials from discovery/index data.
- `StudentPracticePage` routes by test type.
- Non-writing IELTS solo practice loads through the student-safe projection path.
- IELTS Writing loads the canonical test object directly.
- THCS solo practice loads through the THCS storage path directly.

Operational consequence:

- Discovery/listing could still succeed while the actual practice entry failed.
- The failure happened at the handoff from Library -> Solo Practice, not at Library indexing time.

## Live Findings

Concrete runtime findings in Firebase project `temp-a1437`:

- `/tests` existed and contained 15 tests.
- Only 1 current IELTS test was present in `/tests`.
- `/student_safe_tests` was empty at investigation time.
- The current local workspace code already had a fallback that could load the canonical test when the student-safe projection was missing.
- The failing runtime matched an environment where the reader still required the projection or where existing data had never been backfilled.

The current IELTS test observed in live data at investigation time:

- `test-1773107132297-p018jkl`
- title: `IELTS Reading Test - March 2026`
- type: `IELTS`
- skill: `Reading`

## Root Cause

The defect was caused by a missing derived RTDB payload, not by missing canonical test data.

Expected producer-consumer contract:

- canonical source: `/tests/{id}`
- student-facing projection: `/student_safe_tests/{id}`

The student-facing reader for non-writing IELTS solo practice depended on the projection path, but the live database had no projection rows. That created a split-brain state:

- Library/material discovery still saw the canonical test.
- Solo Practice entry failed because the student-safe copy was missing.

## Why This Was Not A Global Test Failure

The incident did not affect all test types equally:

- Non-writing IELTS solo practice was exposed because it reads the student-safe projection.
- IELTS Writing was not on this path because it reads the canonical test directly.
- THCS solo practice was not on this path because it uses THCS storage directly.

This also means the issue was not inherently "all future IELTS tests" either. The normal save flow writes both paths. The risk window is older data or any bypass/import flow that writes only the canonical test.

## Code Findings

The current save/read contract in the repo is:

- `saveTestToFirebase()` writes both `/tests/{id}` and `/student_safe_tests/{id}`.
- `updateTestInFirebase()` refreshes the student-safe projection after updates.
- `getStudentSafeTestFromFirebase()` now falls back to `/tests/{id}` if the projection is missing and can backfill the projection asynchronously.

This means the local codebase now has both:

- a preventive write path for newly created tests
- a defensive read path for older missing-projection tests

## Repairs Applied

### Code-level hardening

Applied repair in the workspace:

- the student-safe read fallback now best-effort backfills `/student_safe_tests/{id}` after serving sanitized canonical data
- regression coverage was added for the missing-projection fallback/backfill case

### Live data repair

Applied directly against project `temp-a1437`:

- generated a sanitized payload set from `/tests`
- removed answer-key fields from question payloads
- fixed UTF-8 BOM encoding on the generated JSON so Firebase CLI would accept it
- backfilled `/student_safe_tests`
- verified `/student_safe_tests/test-1773107132297-p018jkl` exists after backfill

## Current State

Current expected runtime state after the repair cycle:

- the live database now has a populated `/student_safe_tests` node
- the current IELTS Reading solo-practice test has a student-safe payload again
- newly created IELTS tests through the normal save flow should write the projection correctly
- older or externally imported tests remain a watchpoint if they bypass the canonical save path

## Interaction Risks And Cross-Feature Effects

This incident exposed several interaction risks across features:

### 1. Discovery vs delivery mismatch

A material can appear healthy in Library because discovery reads canonical metadata, while delivery fails because the student-facing projection is missing.

### 2. Type-specific load divergence

Solo Practice is not a single storage path:

- IELTS non-writing
- IELTS writing
- THCS

Each branch has different data dependencies. A fix or migration for one branch does not automatically cover the others.

### 3. Projection drift after imports or manual writes

Any import, restore, or one-off script that writes `/tests/{id}` without also producing `/student_safe_tests/{id}` can recreate the same student failure.

### 4. Hosted/runtime skew

A local workspace can appear healthy because fallback logic exists, while a hosted runtime or older deployment still fails if it relies on the projection path strictly.

### 5. Repair tooling sensitivity

Firebase CLI backfills can fail on valid-looking files if encoding includes a UTF-8 BOM. Operational repair docs should call this out explicitly.

## Reusable Lessons

Generalizable lessons extracted from this incident:

- derived RTDB projections must be treated as first-class data products, not optional caches
- when a feature reads from a projection path, all write/import/restore paths must refresh that projection
- discovery and delivery paths must be tested together, not independently
- runtime repair playbooks should include encoding validation for JSON backfills

## Follow-Up Watchpoints

If the same symptom returns, check these in order:

1. whether `/student_safe_tests/{testId}` exists for the failing IELTS test
2. whether the test is non-writing IELTS, writing IELTS, or THCS
3. whether the creation/import path called the canonical save function
4. whether the hosted runtime includes the missing-projection fallback
5. whether a restore/import operation repopulated `/tests` but skipped projection regeneration

## Related Docs

- @doc/patterns/pattern-rtdb-multi-path-write-obligation
- @doc/architecture/homework-solo-practice-architecture
- @doc/system/solo-study-homework-system
