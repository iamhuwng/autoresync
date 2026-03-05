---
id: bwks27
title: Add diagnostics accordion to editor sidebar
status: done
priority: medium
labels:
  - from-spec
  - thcs-editor
createdAt: '2026-03-04T18:00:14.676Z'
updatedAt: '2026-03-04T18:17:26.895Z'
timeSpent: 164
assignee: '@me'
spec: specs/thcs-diagnostic-logs-consolidation
fulfills:
  - AC-5
  - AC-6
  - AC-7
  - AC-9
  - AC-11
---
# Add diagnostics accordion to editor sidebar

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the 3 debug buttons in `THCSQuestionsStep.tsx` (lines 227-282) with a collapsible "🔍 Diagnostics" accordion in the section sidebar. Collapsed by default, shows `<pre>` log and "📋 Copy Full Log" button when expanded. Uses vanilla HTML/CSS — no new Mantine imports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Remove old debug tools div (lines 227-282) from THCSQuestionsStep.tsx
- [x] #2 Add collapsible accordion below section navigator in sidebar (collapsed by default)
- [x] #3 Add diagnosticsOpen state toggled by clicking the accordion header
- [x] #4 Show <pre> block with generateDiagnosticLog() output when expanded
- [x] #5 Add Copy Full Log button with clipboard.writeText and 2s 'Copied!' feedback
- [x] #6 No new Mantine imports — use vanilla HTML/CSS only
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. **Add `metadata` prop** to `THCSQuestionsStepProps` interface (currently missing — needed for diagnostic log)
2. **Update parent** `THCSTestEditorPage.tsx` L550-561 to pass `metadata={metadata}` to `THCSQuestionsStep`
3. **Add state**: `const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)` + `const [logCopied, setLogCopied] = useState(false)`
4. **Import** `generateDiagnosticLog` from `thcs-diagnostic-log.ts` and `THCSTestMetadata` type
5. **Remove** old debug tools div (lines 227-282)
6. **Add diagnostics accordion** in the sidebar div (after section navigator, before or instead of sidebar "Add Section" button):
   - Collapsible header: "🔍 Diagnostics" with rotate-on-open ▶ arrow
   - When expanded: "📋 Copy Full Log" button + `<pre>` block
   - Copy handler: `navigator.clipboard.writeText(...)` with 2s feedback
7. Read `window.__PARSE_DEBUG` inside the component for parse-time data
8. No Mantine imports — all vanilla HTML/CSS (existing import of Alert stays for the empty-sections message)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: added metadata prop (threaded from parent THCSTestEditorPage), removed 3 old debug buttons, added collapsible diagnostics accordion in sidebar with generateDiagnosticLog() output and copy-to-clipboard with 2s feedback. All vanilla HTML/CSS, no new Mantine imports. Build verified.
<!-- SECTION:NOTES:END -->

