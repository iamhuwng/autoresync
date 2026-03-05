---
id: grtpiz
title: Enrich __PARSE_DEBUG with pipeline metadata
status: done
priority: high
labels:
  - from-spec
  - thcs-parser
createdAt: '2026-03-04T18:00:11.587Z'
updatedAt: '2026-03-04T18:12:40.689Z'
timeSpent: 269
assignee: '@me'
spec: specs/thcs-diagnostic-logs-consolidation
fulfills:
  - AC-1
  - AC-2
  - AC-3
---
# Enrich __PARSE_DEBUG with pipeline metadata

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add `provider`, `parseDurationMs`, and `reclassifications` fields to the `window.__PARSE_DEBUG` object in `thcsDocumentParser.service.ts`. Track which AI provider was used (groq/gemini/regex-fallback), measure wall-clock parse time, and collect type reclassification events from the classifier.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add `const parseStart = Date.now()` at top of `parseThcsText()` and compute `parseDurationMs` before setting __PARSE_DEBUG
- [x] #2 Track `usedProvider` variable through `attemptAIParse()` calls — set to 'groq'/'gemini' on success, 'regex-fallback' if both fail
- [x] #3 Collect reclassification events from `reclassifyByContent()` in thcs-type-classifier.ts — return array of { questionNumber, from, to, reason }
- [x] #4 Add provider, parseDurationMs, reclassifications to the __PARSE_DEBUG object assignment (L574-586)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Add `const parseStart = Date.now()` at L415 (top of try block in `parseThcsText()`)
2. Add `let usedProvider: 'groq' | 'gemini' | 'regex-fallback' = 'regex-fallback'` variable after warnings
3. Set `usedProvider = 'groq'` on L441-443 (groq success) and `usedProvider = 'gemini'` on L447-449 (gemini success)
4. In `reclassifyByContent()` (thcs-type-classifier.ts): change return type to `{ questionNumber, from, to, reason }[]`, collect reclassification events in an array instead of just console.log, return the array
5. Capture return value: `const reclassifications = reclassifyByContent(...)` in validateAIResult or wherever it's called
6. Thread `reclassifications` to the __PARSE_DEBUG block (L574-586), add `provider`, `parseDurationMs: Date.now() - parseStart`
7. Verify build: `npx tsc --noEmit`

**Key decision:** `reclassifyByContent` currently returns `void` and mutates sections in-place + logs to console. Change to also return an events array while keeping the mutation behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: parseStart timing, usedProvider tracking (groq/gemini/regex-fallback), ReclassificationEvent type + return array from reclassifyByContent, module-level _lastReclassifications capture. All 3 fields added to __PARSE_DEBUG. Build verified — no new TS errors.
<!-- SECTION:NOTES:END -->

