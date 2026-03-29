---
title: 'Architecture: IELTS Writing Grading Submit Compatibility Audit 2026-03-29'
description: Dated architecture audit for the IELTS Writing teacher grading-submit regression where Firestore grading succeeded but RTDB compatibility-result sync failed. Covers issue, findings, solutions, patterns, current feature state, and cross-feature interaction risks.
createdAt: '2026-03-29T08:34:07.570Z'
updatedAt: '2026-03-29T08:34:40.731Z'
tags:
  - architecture
  - ielts
  - writing
  - grading
  - results
  - firebase
  - audit
---

# Architecture: IELTS Writing Grading Submit Compatibility Audit 2026-03-29

## Scope
This audit records the March 29, 2026 IELTS Writing teacher grading-submit regression where final grading succeeded in Firestore but failed in the RTDB compatibility-result sync. It captures the architecture-level issue, findings, repairs, reusable patterns, current feature state, and cross-feature interaction risks.

## User-Visible Issue
- A teacher could score and submit IELTS Writing grading in the grading editor.
- The Firestore grading write on `writing_submissions/{submissionId}` succeeded.
- The browser still surfaced `Permission denied` and the submit flow failed from the teacher's point of view.
- The failure occurred after the canonical grading artifact was already updated.

## Findings
### 1. The failure was in the compatibility projection, not the canonical grading artifact
- Firestore `writing_submissions` remains the canonical source of truth for IELTS Writing grading.
- The failing path was the RTDB compatibility-result sync used for legacy readers, indexes, and discoverability.
- This means the workflow failed after the real grading write had already succeeded.

### 2. The canonical RTDB result row could be missing at grading time
- In the live incident, `/test_results/{submissionId}` was missing.
- Teacher final grading assumed that row already existed and was readable.
- That assumption is not safe because compatibility-row materialization can fail independently of Firestore grading.

### 3. RTDB secondary index rules depended on an already-existing canonical row
- `test_results_by_student` and `test_results_by_session` teacher writes depend on `root.test_results/{resultId}` already proving ownership and session linkage.
- A first-time teacher fan-out is therefore brittle when the canonical root row is absent.
- A single multi-path write that tries to create both the root row and secondary indexes at once can be rejected even though the root row itself would be legal.

### 4. The same persistence helper served submission-time and grading-time flows
- `autoSubmitFromRTDB()` uses the same writing-result materialization helper as teacher final grading.
- A compatibility persistence bug therefore affects both:
  - student submission-time materialization
  - teacher final grading-time materialization
- This is a shared architecture seam, not an isolated page bug.

## Root Causes
### 1. Canonical vs compatibility boundary drift
The grading workflow correctly uses Firestore as the canonical artifact, but the final submit path still treated the RTDB compatibility row as if it were a prerequisite instead of a projection.

### 2. Rule-aware RTDB fan-out ordering was wrong
RTDB result persistence attempted to create the canonical row and the dependent secondary indexes in one fan-out. The secondary index rules were written as if the canonical row already existed.

### 3. Cross-store reconstruction was missing
When the RTDB compatibility row was missing or unreadable, the grading sync did not reliably reconstruct it from the canonical Firestore submission plus session context.

## Solution Applied on 2026-03-29
### 1. Make the RTDB pre-read optional during final grading
- Teacher final grading now tolerates `Permission denied` or a missing `test_results/{submissionId}` row.
- The sync path treats that as a reconstructible compatibility failure, not a hard stop for the grading workflow.

### 2. Rebuild the compatibility result from the canonical Firestore submission
- When the RTDB row is unavailable, the system rebuilds the result record from:
  - Firestore `writing_submissions/{submissionId}`
  - session context from RTDB when present
- This preserves the canonical-first architecture.

### 3. Persist the canonical RTDB row before secondary fan-out
- The root `test_results/{resultId}` row is now written first.
- Secondary indexes are then written after the canonical row exists.
- This matches the current RTDB rule contract.

### 4. Add regression coverage for the exact failure mode
- The writing submission service test suite now covers the case where the teacher cannot read the canonical RTDB row during final submit.
- The expected behavior is: Firestore grading succeeds, the compatibility row is reconstructed, and index writes complete.

## Patterns Extracted
### Pattern 1: Canonical artifact first, compatibility projections second
If a feature has one canonical store and one compatibility/discovery projection, the projection must never become a required prerequisite for the canonical workflow.

### Pattern 2: RTDB rule-aware fan-out ordering matters
When RTDB secondary index rules validate against `root` state, persist the canonical row first and only then write dependent indexes.

### Pattern 3: Cross-store workflows must reconstruct from the canonical source
If a compatibility row can be missing or stale, the workflow must reconstruct it from the canonical artifact instead of assuming it already exists.

### Pattern 4: Shared persistence helpers create cross-surface blast radius
If submission-time and grading-time flows share the same materialization helper, a persistence defect there is architecture-level and must be documented as a shared interaction boundary.

## Current Feature State
### Teacher grading
- IELTS Writing remains a teacher-graded workflow.
- Firestore `writing_submissions` is still the source of truth for queue, detail, and grading-save behavior.
- Teacher final grading can now recover when the RTDB compatibility row is missing or unreadable.

### Submission-time materialization
- Live-session auto-submit and grading-time sync still converge on the same writing-result materialization layer.
- This remains a sensitive boundary because submission and grading both depend on compatibility projection health.

### Results and academic record
- RTDB `test_results` and indexes remain compatibility/discovery artifacts for existing readers.
- Academic record, session indexes, and teacher history still depend on those projections being present.
- The architecture now explicitly allows those projections to be reconstructed after canonical grading state exists.

### Product contract
- Pure IELTS Writing still uses the manual-grading contract.
- Student post-submit behavior remains acknowledgement-first, not instant-result-first.
- The compatibility-result fix does not change that product contract.

## Problems with Other Interactions
### Auto-submit ↔ grading submit
Because both flows share the same compatibility-result materializer, any regression in RTDB writing order or ownership resolution can hit both submission-time and teacher grading-time behavior.

### Grading submit ↔ academic record / result readers
Result readers still rely on RTDB compatibility rows and indexes. If those projections fail, the system can enter a "graded but invisible" state where canonical grading exists but discovery surfaces do not show it.

### Ownership resolution ↔ mode-specific workflows
Ownership resolution remains cross-feature:
- live session uses session ownership
- homework uses assigning teacher ownership
- solo practice uses selected teacher ownership
A regression in ownership normalization can break projections even when grading itself still succeeds.

### Local fix ↔ hosted runtime state
Hosted behavior can still diverge if the running frontend bundle or Firebase rules are stale. This feature remains sensitive to deployment-state mismatches because it spans Firestore code paths, RTDB rules, and client bundle logic.

## Operational Rule Going Forward
- Firestore `writing_submissions` remains canonical for IELTS Writing grading.
- RTDB `test_results` remains a compatibility/discovery projection.
- Teacher grading must never require a pre-existing readable RTDB compatibility row.
- Any future refactor touching writing result persistence must preserve:
  - canonical-first grading writes
  - compatibility-row reconstruction
  - root-row-first RTDB persistence ordering
  - explicit reader audits for academic record and result indexes

## Related Docs
- @doc/architecture/test-system-architecture
- @doc/architecture/results-academic-record
- @doc/architecture/scheme/ielts-writing-current-state-scheme
- @doc/architecture/firebase-infrastructure
- @doc/sop/ielts-writing-grading-permission-runtime-state
- @doc/patterns/pattern-rtdb-multi-path-write-obligation
- @doc/patterns/pattern-firestore-rules-vs-collection-queries
