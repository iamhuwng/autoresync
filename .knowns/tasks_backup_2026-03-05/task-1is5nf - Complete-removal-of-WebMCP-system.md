---
id: 1is5nf
title: Complete removal of WebMCP system
status: done
priority: high
labels:
  - cleanup
  - removal
createdAt: '2026-03-01T04:28:33.889Z'
updatedAt: '2026-03-01T05:29:11.009Z'
timeSpent: 1949
assignee: me
---
# Complete removal of WebMCP system

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the entire WebMCP AI agent tool system from the codebase. This includes the src/webmcp/ directory, all references in main.jsx, documentation, knowns docs, safety rules, enforcement skills, and pre-commit scripts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/webmcp/ directory completely removed
- [x] #2 main.jsx has no webmcp import
- [x] #3 Rule 16 removed from integration-safety-rules.md
- [x] #4 webmcp-enforcement skill deleted
- [x] #5 Pre-commit script Rule 16 check removed
- [x] #6 Knowns docs cleaned (webmcp-architecture deleted, README/CONVENTIONS updated)
- [x] #7 npm run build succeeds with zero webmcp references
- [x] #8 Backup exists in documentation/archive/
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Step 1: Backup src/webmcp/ to documentation/archive/webmcp-backup/. Step 2: Delete entire src/webmcp/ directory (9 files). Step 3: Remove lines 19-22 from src/main.jsx (initWebMCP bootstrap). Step 4: Remove Rule 16 from documentation/integration-safety-rules.md and user_global trigger table. Step 5: Delete knowns doc architecture/webmcp-architecture, clean README and CONVENTIONS refs. Step 6: Delete webmcp-enforcement skill. Step 7: Remove Rule 16 check from scripts/pre-commit-enforcement.js and vite-rule-enforcement.js. Step 8: Delete documentation/samples/WebMCP Early Preview.md, clean PRD task docs. Step 9: Clean knowns tasks - remove WebMCP requirements from task-6emz0n, task-mehsel, task-zrnpte so future implementation doesnt try to create WebMCP tools. Step 10: npm run build to verify clean compilation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed all removal steps. AC-5 (user_global memory) requires manual user action.
<!-- SECTION:NOTES:END -->

