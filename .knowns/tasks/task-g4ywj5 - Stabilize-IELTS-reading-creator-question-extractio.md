---
id: g4ywj5
title: Stabilize IELTS reading creator question extraction retries and markdown fallback
status: in-progress
priority: high
labels:
  - bugfix
  - ielts-reading
  - test-creation
  - ai-parser
createdAt: '2026-04-09T18:15:12.197Z'
updatedAt: '2026-04-10T08:35:06.403Z'
timeSpent: 0
---
# Stabilize IELTS reading creator question extraction retries and markdown fallback

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Harden the teacher IELTS Reading creation flow so transient Gemini high-demand failures retry, Groq oversized question parsing retries with smaller budgets instead of key benching, and offline fallback parses markdown-numbered IELTS questions. Update architecture docs, verify with targeted tests/build, and deploy if requested.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gemini reading question extraction retries across remaining Gemini keys on transient 503/high-demand failures before falling back to Groq.
- [ ] #2 Groq reading question extraction treats 413/request-too-large as a prompt-budget failure and retries with smaller output budgets without benching the key.
- [ ] #3 Offline reading fallback parses markdown-numbered IELTS questions and the change is covered by targeted tests and architecture notes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented stage-local resilience for teacher IELTS Reading creation. Gemini now treats 503/high-demand responses as transient availability failures in the relevant reading extraction paths and rotates/retries before provider fallback. Groq now separates request-too-large handling from exhausted-key handling and retries question extraction with smaller max_tokens budgets. Offline parser regex now recognizes markdown-numbered IELTS questions such as **35.** and Question 35. Added focused regression tests for Gemini retry, Groq reduced-budget retry, and markdown-numbered offline parsing. Repo docs updated in documentation/architecture/teacher-test-creation-parsing-and-review.md, documentation/ai-system-research-report.md, and documentation/tasks/0020-prd-automated-ielts-reading-test-creation.md; Knowns architecture docs updated to match. Verification: focused Vitest pass, targeted UTF-8 checks, production build.
<!-- SECTION:NOTES:END -->

