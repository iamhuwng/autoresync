---
title: ARCHITECTURE
createdAt: '2026-02-27T15:56:50.657Z'
updatedAt: '2026-07-08T00:00:00.000Z'
description: >-
  System architecture overview: layers, data flow, tech decisions. Synthesized
  from architecture assessment.
tags:
  - core
  - architecture
  - system
---
# System Architecture

## Overview

A React 19 SPA with Firebase backend. 3 user roles (Admin, Teacher, Student) with route-level RBAC.

Current session lifecycle authority lives in
@doc/architecture/session-lifecycle-authority. Session expiry is derived from
canonical `game_sessions/{sessionCode}` plus RTDB server `now`; active teacher
lists use `owner_session_index/{ownerId}/{sessionCode}` for owner-scoped
discovery only. Browser cleanup, Firebase scheduled Functions, Cloudflare
lifecycle cron, and `r2-backup-worker` lifecycle scans are obsolete.

Teacher Materials listing authority lives in
@doc/architecture/universal-material-summary-integration and
@doc/architecture/teacher-materials-listing-and-diagnostics. My Content and
Public Library read universal MaterialSummary indexes; `/tests` is runtime and
legacy compatibility storage only. Selected-material actions are governed by
@doc/architecture/teacher-materials-bulk-selection-actions.

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│                   Pages (76)                │
│        Role-prefixed: Admin*, Teacher*,     │
│               Student*, Shared              │
├─────────────────────────────────────────────┤
│              Components (221)               │
│    Feature folders: admin/, course/,        │
│    test/, results/, navigation/             │
├──────────────┬──────────────┬───────────────┤
│  Hooks (36)  │ Services(104)│  Contexts     │
│  admin/      │ classManager │  AuthContext   │
│  test/       │ courseManager │  NavContext    │
│  monitor/    │ testStorage  │               │
├──────────────┴──────────────┴───────────────┤
│              Firebase SDK                    │
│   Auth │ Realtime DB │ Storage │ Hosting    │
├─────────────────────────────────────────────┤
│          Cloudflare R2 Workers              │
│         File upload/download proxy          │
└─────────────────────────────────────────────┘
```

## Layer Details

### Pages Layer
- **76 files** in `src/pages/`, flat structure with role prefixes
- Pattern: `{Role}{Feature}Page.tsx` (e.g., `TeacherClassesPage.tsx`)
- Route security enforced via `routeSecurity.ts` config matrix
- See @doc/system/navigation-ux-guide for navigation patterns

### Components Layer
- **221 files** across 23 feature folders + 52 loose root files
- Well-organized: `admin/`, `course/`, `results/`, `test/`, `navigation/`
- Loose files need cleanup (e.g., `QuizEditor.jsx` → should be in `test-builder/`)

### Services Layer
- **104 files**, domain-based flat structure
- Core: `firebase.js`, `userService.ts`, `profileService.ts`
- Feature: `classManager.ts`, `courseManager.ts`, `enrollmentManager.ts`
- Subfolders: `ai/` (11 files), `parser/` (15 files), `migrations/`
- Naming convention: `*Manager.ts` for CRUD, `*Service.ts` for utilities

### Hooks Layer
- **36 files** in role/feature folders (best organized layer)
- `hooks/admin/` — Admin modal/user management hooks
- `hooks/test/` — Test session, submission, timer hooks
- `hooks/monitor/` — Live session monitoring hooks

### Skills Module (Exemplary Pattern)
- `src/skills/listening/` and `src/skills/reading/`
- **Feature-sliced**: local components/, services/, types/, index.ts
- **This is the target pattern** for future feature modules

### Config
- `routeSecurity.ts` — Comprehensive role-route permission matrix
- `roleHierarchy.ts` — Role permission inheritance
- `scoring.config.ts` — Test scoring rules
- `routes.ts` — Central route path constants

## Data Flow

### Test Lifecycle
```
Teacher creates test → Stored in RTDB /tests/{id}
Teacher starts session → Session created at /game_sessions/{code}
Students join → Status tracked at /game_sessions/{code}/players
Teacher active list → Discovered via /owner_session_index/{ownerId}/{code}
Timer runs → Synced via RTDB real-time listeners
Student submits → Results at /results/{id} → Scores computed
```

### Authentication Flow
```
Login → Firebase Auth → Check /users/{uid}/role
      → RouteGuard checks routeSecurity.ts
      → Role-specific dashboard rendered
```

### File Upload Flow
```
User selects file → Upload to Cloudflare R2 via Worker proxy
                   → R2 returns URL → Stored in RTDB metadata
```

## Architecture Score: 78/100

| Layer | Score | Notes |
|-------|-------|-------|
| Pages | 60% | Flat 76-file folder needs grouping |
| Components | 75% | Feature folders good, 52 loose files |
| Services | 85% | Clean domain separation |
| Hooks | 90% | Excellent feature-first pattern |
| Types | 95% | Clean, no changes needed |
| Skills | 100% | Perfect feature-slice, target pattern |

Source: @doc/system/architecture-assessment-2026-02

## Key Architecture Decisions

1. **Firebase RTDB over Firestore** — Chosen for real-time sync in live test sessions
2. **Cloudflare R2 over Firebase Storage** — Cost-effective file storage with Workers proxy
3. **Derived session lifecycle** — Expiry is enforced by RTDB rules using server `now`; no lifecycle cron or browser cleanup loop
4. **No Mantine** — Migrating to vanilla CSS/HTML for bundle size and control (@doc/system/no-mantine-rule)
5. **Zustand over Redux** — Simpler state management for this scale
6. **Role-prefixed pages** — Trade-off: easy to find by role, hard to navigate at scale
