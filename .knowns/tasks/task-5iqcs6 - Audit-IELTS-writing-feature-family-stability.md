---
id: 5iqcs6
title: Audit IELTS writing feature-family stability
status: done
priority: high
labels:
  - audit
  - ielts-writing
  - architecture
createdAt: '2026-04-06T07:13:57.436Z'
updatedAt: '2026-04-06T07:15:49.043Z'
timeSpent: 107
---
# Audit IELTS writing feature-family stability

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Contract-first audit of the full IELTS Writing teacher/student feature family, including authoring, grading, published readers, and data/compatibility services. Deliverable is an evidence-backed audit report and prioritized stabilization backlog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created root audit report at `documentation/architecture/ielts-writing/feature-family-stability-audit-2026-04-06.md` and mirrored the summary into Knowns doc `architecture/ielts-writing/ielts-writing-feature-family-stability-audit-2026-04-06`.

Key findings:
- `Readiness` UI in `WritingGradingPage.tsx` does not match the real publish gate or pending-comment-draft rules.
- Accepted Stitch scoring/feedback edit-mode decisions conflict with current docs and current code.
- Published fallback readers still use `AnnotatedEssayReadOnly` and bypass the shared annotation interaction model.
- `WritingGradingPage.tsx` remains a very large coordinator surface without a page-level integration test.
- Targeted Vitest runs are currently blocked before collection because `@testing-library/jest-dom` cannot resolve `@adobe/css-tools`.

Verification notes:
- Attempted targeted Vitest runs for grading components, published result surfaces, and writing authoring/service tests.
- All failed before collection because of the same missing dependency, which is recorded as an audit finding rather than silently ignored.
<!-- SECTION:NOTES:END -->

