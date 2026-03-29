---
id: nszwf2
title: Fix IELTS Writing student routing crash
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - student
  - routing
createdAt: '2026-03-29T06:09:16.618Z'
updatedAt: '2026-03-29T07:11:51.224Z'
timeSpent: 390
---
# Fix IELTS Writing student routing crash

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate and fix live-session student crash where IELTS Writing tests route to generic StudentTestPage and crash on missing passages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed TestPageRouter to resolve skill for IELTS tests even when testType is present, so live Writing sessions route to WritingTestPage instead of generic StudentTestPage. Hardened StudentTestPage by normalizing missing passages/questions arrays and showing a graceful unsupported-format state instead of crashing. Added TestPageRouter regression test covering testType='IELTS' + skill='Writing'. Verification: targeted Vitest passed, full vite build passed, UTF-8 check passed.
📚 Extracted runtime-state and routing pattern docs: @doc/sop/ielts-writing-grading-permission-runtime-state, @doc/architecture/test-system-architecture, @doc/patterns/pattern-test-router-must-resolve-render-contract-before-fallback
<!-- SECTION:NOTES:END -->

