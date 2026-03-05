---
id: 1e45u9
title: Create shared generateDiagnosticLog() utility
status: done
priority: high
labels:
  - from-spec
  - thcs-parser
createdAt: '2026-03-04T18:00:13.114Z'
updatedAt: '2026-03-04T18:14:35.575Z'
timeSpent: 107
assignee: '@me'
spec: specs/thcs-diagnostic-logs-consolidation
fulfills:
  - AC-4
---
# Create shared generateDiagnosticLog() utility

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `src/services/test-creation/thcs-diagnostic-log.ts` exporting a pure function `generateDiagnosticLog()` that accepts parse debug data, sections, and metadata and returns a structured plain-text diagnostic log. Covers pipeline info, metadata, section/question detail, and data warnings. No DOM access, no clipboard, no side effects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create file src/services/test-creation/thcs-diagnostic-log.ts
- [x] #2 Export generateDiagnosticLog({ parseDebug, sections, metadata }) returning plain-text string
- [x] #3 Include sections: header, pipeline info, metadata, sections overview, per-Q detail, data warnings, footer
- [x] #4 Handle missing parseDebug gracefully (template-based tests with no AI parse)
- [x] #5 Verify output is ≤ 200 lines for a 50-question test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Create `src/services/test-creation/thcs-diagnostic-log.ts`
2. Define `ParseDebugData` interface matching the enriched `__PARSE_DEBUG` shape (with optional fields for graceful degradation)
3. Import `THCSSection`, `THCSTestMetadata` types
4. Implement `generateDiagnosticLog({ parseDebug, sections, metadata })`:
   - Header: `═══ THCS Test Diagnostic Log ═══` + timestamp
   - Pipeline: provider, input/cleaned length, confidence, parseDurationMs, reclassification count
   - Metadata: title, grade, duration, exam type, timer mode, school/province
   - Sections overview: total sections, questions, points
   - Per-section: name, type (confidence%), Q count, points, layout, passage word count
   - Per-question: Q#, type, intent, answer status (✓/⚠️), answer preview
   - Data warnings: missing answers, zero-point sections, empty sections
   - Footer
5. Handle `parseDebug === null/undefined` gracefully → "No parse data available" in pipeline section
6. Test mentally: 4 sections × 12-13 Qs each = ~65 lines for Q detail + ~20 lines overhead = ~85 lines (under 200 target)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created thcs-diagnostic-log.ts with generateDiagnosticLog() pure function. Handles missing parseDebug gracefully. Estimated ~84 lines output for 50Q test (under 200 limit). Build verified — no new TS errors.
<!-- SECTION:NOTES:END -->

