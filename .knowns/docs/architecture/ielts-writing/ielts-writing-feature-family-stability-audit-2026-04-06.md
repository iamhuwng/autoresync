---
title: IELTS Writing Feature-Family Stability Audit 2026-04-06
description: Contract-first audit of the full IELTS Writing feature family, including authoring, grading, published readers, and service/verification stability.
createdAt: '2026-04-06T07:15:21.335Z'
updatedAt: '2026-04-06T08:01:07.422Z'
tags:
  - audit
  - ielts-writing
  - architecture
  - stability
---

# IELTS Writing Feature-Family Stability Audit 2026-04-06

## Scope
Full IELTS Writing feature family audit covering authoring, grading, published readers, services, and automated verification.

## Source Of Truth
1. Root IELTS Writing architecture docs
2. Accepted Stitch decisions in `.stitch/Verifying Current Development Branch.md`
3. Current code and tests

## Highest-Risk Findings

### 1. Readiness UI diverges from the real publish contract
- `WritingGradingPage.tsx` blocks publish for any non-voided task missing scores or a meaningful summary.
- `Submit Grading` also blocks when pending comment drafts exist.
- The visible `Readiness` block uses different rules: raw summary truthiness, saved active comments only, and active-task-only scope.
- Result: the page exposes two different readiness systems.

### 2. Scoring and feedback edit-mode contract is unresolved
- Accepted Stitch history records whole-band scoring (`4 5 6 7 8 9`), no extra scoring/feedback wrappers, and no persistent feedback toolbar.
- Current docs and code document and implement decimal scoring (`0.5`) plus a restored feedback toolbar.
- Result: there is no single authoritative contract for future work.

### 3. Published fallback readers still bypass the shared annotation model
- Primary published readers use `WritingPublishedMarkupViewer` and `PublishedFeedbackPanel`.
- Fallback annotation readers still route through `AnnotatedEssayReadOnly` with a separate tooltip system.
- Result: published interaction varies by artifact shape, not just by viewer mode.

### 4. The grading page remains a large integration surface without page-level tests
- `WritingGradingPage.tsx` is 2502 lines and owns locks, drafts, suggestions, readiness, and publish orchestration.
- There is no `WritingGradingPage.test.tsx`.
- Result: leaf-component tests do not prove page-level contract integrity.

### 5. Current writing test runs are blocked
- Targeted Vitest runs fail before collection because `@testing-library/jest-dom` cannot resolve `@adobe/css-tools`.
- Result: the intended regression safety net is currently unavailable.

## Positive Foundations
- `publishGrading()` still enforces score completeness and meaningful summaries at the canonical service layer.
- Primary published readers are already standardized on `WritingPublishedMarkupViewer` plus `PublishedFeedbackPanel`.

## Priority Backlog
1. Resolve the scoring/feedback contract conflict and freeze one approved edit-mode contract.
2. Extract one shared readiness evaluator and make both UI and publish gates consume it.
3. Standardize fallback published annotation readers or explicitly document them as compatibility-only.
4. Repair the broken Vitest/test-runtime dependency path.
5. Add page-level `WritingGradingPage` integration coverage for readiness, pending drafts, suggestion approval blocking, and publish gating.

## Implementation Follow-up

- Implemented the first stabilization wave after the audit.
- Shared grading readiness and publish gating now use one evaluator.
- The service publish path now blocks pending comment drafts in the same way as the page UI.
- Legacy published fallback annotations now project into the shared feedback rail data shape and use the shared feedback-selection callback contract.
- Page-level grading coordinator tests were added, and the previously blocked writing Vitest runs now collect again after repairing the local dependency install.
