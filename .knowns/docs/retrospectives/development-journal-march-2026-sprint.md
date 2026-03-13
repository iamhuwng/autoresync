---
title: 'Development Journal: March 2026 Sprint'
createdAt: '2026-03-12T09:54:50.364Z'
updatedAt: '2026-03-12T09:56:48.034Z'
description: >-
  Comprehensive extraction of events, features, implementations, lessons
  learned, logic patterns, and moving-forward standards from all development
  work in March 2026
tags:
  - retrospective
  - lessons
  - patterns
  - standards
  - march-2026
---
# Development Journal: March 2026 Sprint

> **Period:** 2026-03-10 → 2026-03-12
> **Scope:** 14+ events across student practice, teacher lobby, test parsing, and platform infrastructure
> **Purpose:** Extract generalizable knowledge for future development

---

## 1. EVENTS TIMELINE

| # | Date | Event | Severity | Component |
|---|------|-------|----------|-----------|
| 1 | 03-11 | Homework timer resets on resume | 🔴 Bug | THCSPracticeView |
| 2 | 03-11 | Student enrollment not showing | 🔴 Bug | classManager |
| 3 | 03-11 | Materials not displaying (THCS titles in metadata.title) | 🟡 Bug | Admin materials view |
| 4 | 03-11 | Drafts Firestore index error | 🔴 Bug | Drafts loading |
| 5 | 03-11 | Long grade values breaking UI | 🟡 UI | ResultDetailModal |
| 6 | 03-11 | Academic record AI explanations | 🟢 Feature | Academic Record |
| 7 | 03-11 | Compact question grid in results | 🟢 Feature | ResultDetailModal |
| 8 | 03-11 | Drafts tab in Teacher Lobby | 🟢 Feature | TeacherLobbyPage |
| 9 | 03-12 | Parser detecting time as questions | 🔴 Bug | thcsDocumentParser |
| 10 | 03-12 | Teacher Lobby full refactor | 🟢 Refactor | TeacherLobbyPage |
| 11 | 03-12 | Lobby refactor bug fixes round 2 | 🟡 Fix | Lobby hooks |
| 12 | 03-12 | Clipboard image upload for THCS | 🟢 Feature | THCSQuestionsStep |
| 13 | 03-12 | Student feed score overflow | 🟡 UI | Student feed |
| 14 | 03-12 | React #310 — hooks after early returns | 🔴 Bug | THCSPracticeView |

## 2. KEY LESSONS LEARNED

1. **Incremental hook additions break Rules of Hooks** — adding state below early returns causes conditional hook calls
2. **Firestore composite indexes are hidden deps** — "query requires an index" only appears at runtime
3. **metadata.title vs title** — different test types store titles at different paths
4. **Mantine creep** — copying existing Mantine code into new components violates the project ban
5. **Network timing masks bugs** — fast connections hide hooks ordering errors
6. **useCallback stale closures** — unstable deps cause cascading re-renders

## 3. PATTERNS CODIFIED

- **Loader→Guard→Renderer** component split
- **Server-anchored timing** for resumable activities
- **Client-side sort** over Firestore composite indexes for small collections
- **Context-aware false positive filtering** for regex parsing
- **Composition layer architecture** for pages >300 lines
- **Fire-and-forget with error isolation** for non-critical side effects

## 4. MOVING FORWARD STANDARDS

1. ALL-HOOKS-FIRST — hooks before any conditional return
2. NO-MANTINE — use modern design system components
3. DATA-SHAPE-FIRST — inspect actual data before querying
4. INDEX-FREE QUERIES — client-side sort for small collections
5. SERVER-ANCHORED TIMING — server startedAt for all timed activities
6. COMPOSITION-OVER-MONOLITH — decompose pages >300 lines
7. CONTEXT-AWARE PARSING — regex matches need surrounding context checks
8. INCREMENTAL AUDIT — after any hook modification, audit ordering + deps + throttled network

Full details: See artifact `march_2026_sprint_journal.md`

Related: @doc/patterns/pattern-react-hooks-before-early-returns
