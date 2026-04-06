---
id: j3dtvv
title: Stabilize IELTS writing grading readiness and published annotation contracts
status: done
priority: high
labels:
  - ielts-writing
  - stabilization
  - architecture
  - testing
createdAt: '2026-04-06T07:40:11.164Z'
updatedAt: '2026-04-06T08:04:50.563Z'
timeSpent: 1473
---
# Stabilize IELTS writing grading readiness and published annotation contracts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the post-audit stabilization wave: unify grading readiness and publish rules, standardize fallback published annotation behavior, repair the writing test runtime, add page-level coordinator tests, and update architecture docs to freeze the current accepted live contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unify grading readiness and publish-eligibility evaluation so the Readiness block, publish button state, and publish preflight all consume the same shared rules.
- [x] #2 Preserve the current accepted live Scoring, Suggestions, and feedback-toolbar UI while updating the root IELTS writing docs to freeze that as the active contract.
- [x] #3 Standardize published fallback annotation viewing onto the same interaction/feedback selection contract as the primary published markup viewer, or clearly route fallback data through the shared read-only viewer.
- [x] #4 Repair the writing Vitest runtime so targeted writing test suites can collect and run again.
- [x] #5 Add page-level WritingGradingPage integration coverage for readiness, pending comment drafts, suggestion blocking, and publish gating.
- [x] #6 Run targeted verification and document the resulting contract/test changes in root docs and Knowns.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the shared IELTS writing stabilization wave from the audit plan. Added a shared readiness evaluator used by both WritingGradingPage and writingSubmissionService so task readiness, submission readiness, pending comment draft blocking, and publish preflight now use one contract. Added page-level WritingGradingPage integration coverage for summary meaningfulness, submission-vs-task readiness, and pending draft blocking of submit/suggestion approval. Standardized legacy published fallback annotations onto the shared feedback-selection contract by adapting fallback annotations into shared comments/corrections data, routing fallback tasks through AnnotatedEssayReadOnly when no marked content exists, and upgrading AnnotatedEssayReadOnly to use the shared portal tooltip/feedback-selection model. Repaired the local writing Vitest runtime by reinstalling node_modules so @adobe/css-tools resolved again. Updated root IELTS writing architecture docs and the matching Knowns docs to freeze the current live edit-mode scoring/suggestions/feedback-toolbar baseline and document the new readiness/published-compatibility contracts.
<!-- SECTION:NOTES:END -->

