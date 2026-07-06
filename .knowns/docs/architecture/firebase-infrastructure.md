---
title: Firebase Infrastructure
description: Firebase RTDB schema, deployment, backup/restore, error handling patterns, development workflows.
createdAt: '2026-02-27T16:33:56.072Z'
updatedAt: '2026-04-05T14:27:51.551Z'
tags:
  - architecture
  - firebase
  - infrastructure
  - deployment
  - core
---

# Firebase Infrastructure & Operations

## Overview

Firebase Realtime Database is the primary backend. The application uses Firebase Auth, RTDB, and Hosting in production, with Cloudflare R2 Workers for file storage.

Session lifecycle uses Firebase Spark-compatible direct RTDB/Auth/Rules only.
Expiration is derived from canonical `game_sessions/{sessionCode}.expiresAt`
and RTDB server `now`. There is no Firebase scheduled Function, Cloudflare
lifecycle cron, browser cleanup loop, or `r2-backup-worker` lifecycle scan.

## Firebase Services

| Service | Usage | Config |
|---------|-------|--------|
| **Auth** | Email/password login, user management | `src/services/firebase.js` |
| **Realtime Database** | Primary data store (tests, sessions, results, users) | Rules in `database.rules.json` |
| **Hosting** | Production web hosting | `firebase.json`, deploys to `kahut1.web.app` |

## RTDB Schema (Key Paths)

```
/ (root)
├── users/{uid}/           — User profiles + roles
├── tests/{testId}/        — Test definitions (questions, passages, metadata)
├── game_sessions/{sessionCode}/  — Canonical live sessions
│   ├── players/           — Connected students
│   ├── expiresAt          — Expiry boundary enforced by rules
│   └── timer/             — Timer state
├── owner_session_index/{ownerId}/{sessionCode}/  — Active-list discovery
├── owner_session_migrations/{ownerId}/  — Legacy index cursors
├── classes/{classId}/     — Class definitions
├── courses/{courseId}/    — Course definitions
├── results/
│   ├── test_results/{id}  — Individual test results
│   ├── test_results_by_session/{sessionId}/  — Session → results index
│   ├── test_results_by_student/{studentId}/  — Student → results index
│   └── guest_results/{id} — Guest user results
├── homework_assignments/{id}/  — Homework definitions
├── homework_submissions/{id}/  — Student homework submissions
├── solo_sessions/{id}/    — Solo practice sessions
├── student_groups/{id}/   — Saved student groups
├── system_flags/          — System state (restore_in_progress, etc.)
└── backups/               — Backup metadata
```

## Deployment

```bash
# Build only
npm run build

# Recommended direct hosting release
npm run deploy:hosting

# Upload an already-built dist without rebuilding
firebase deploy --only hosting:kahut1

# Deploy rules only
firebase deploy --only database
```

`npm run build` now runs the direct Vite production build and then `scripts/check-bundle-budget.mjs`.

`npm run deploy:hosting` is the canonical light hosting release path. It runs `npm run build` and then uploads the resulting `dist` to Hosting target `kahut1`.

Use raw `firebase deploy --only hosting:kahut1` only when you already have a verified `dist` and want an upload-only step.

**Live URL:** https://kahut1.web.app

### Session Lifecycle Deploy Note

Deploy the client code that reads `owner_session_index` together with the RTDB
rules that deny unbounded owner scans of `game_sessions`. A rules-only deploy
can break an older deployed client that still queries active sessions directly.
See @doc/architecture/session-lifecycle-authority.

## Backup & Restore System

- Backup metadata stored in RTDB `/backups/`
- `system_flags/restore_in_progress` controls RestoreBanner component
- See @doc/prd/prd-backup-disaster-recovery

### Integration Safety Rule #11 (Restore Guard)
When writing services that modify RTDB as side effects, check:
```typescript
const restoreFlag = await get(ref(db, 'system_flags/restore_in_progress'));
if (restoreFlag.val() === true) return; // Skip during restore
```

### Integration Safety Rule #12 (Backup Coverage)
When adding new RTDB nodes, ensure they're included in backup scripts.
See @doc/conventions for full rules.

## Error Handling Patterns

### AI API Errors (Gemini/Groq)
- **503 overload**: Show user-friendly message, suggest retry in 2-3 min
- **DNS/network errors**: Detect and show specific troubleshooting steps
- **Partial failures**: If some passages parse but others fail, show partial results
- Dual-provider with fallback: Gemini primary → Groq fallback
- See @doc/sop/network-error-handling-fix, @doc/sop/groq-fallback-fix

### Firebase Errors
- Connection errors → WebSocket reconnect (automatic)
- Permission denied → Check RTDB security rules
- See @doc/guides/firebase-storage-rules

## Development Workflows

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (Vite) |
| Unit tests | `npm test` (Vitest) |
| E2E tests | `npm run test:e2e` (Playwright) |
| Build | `npm run build` |
| Deploy | `npm run deploy:hosting` |
| Lint | `npm run lint` |

### Debugging
- **Unit test: MantineProvider missing** → Wrap in `<MantineProvider>`
- **`window.matchMedia` not a function** → Add mock in test setup
- **Playwright timeout** → Check browser connection, run `npx playwright install`
- See @doc/sop/debugging-guide

## Related Docs
- @doc/sop/development-workflows — Development workflow SOP
- @doc/sop/debugging-guide — Debugging common issues
- @doc/sop/network-error-handling-fix — Network error handling
- @doc/sop/groq-fallback-fix — AI provider fallback
- @doc/prd/prd-backup-disaster-recovery — Backup PRD
- @doc/guides/firebase-storage-rules — Firebase rules guide
- @doc/guides/cloudflare-setup-guide — Cloudflare Worker setup
- @doc/conventions — Integration safety rules
- @doc/architecture/auth-rbac-architecture — Auth system (cross-ref)

## Firestore Rules Deployment Verification

This project uses both RTDB and Firestore. A local Firestore rules change is not live until it is deployed to the active Firebase project.

Use this workflow for Firestore permission incidents:

```bash
# Deploy Firestore rules only
firebase deploy --only firestore:rules
```

Verification protocol:

1. Confirm the active project ID from runtime config or Firebase CLI environment.
2. Deploy the rules to that exact project.
3. Read back the remote Firestore rules, or otherwise verify that the live project now contains the updated rule block.
4. Only after remote verification, retest the browser flow that was failing.

Operational lesson:

- If the browser still throws the exact same Firestore permission error after a local fix, suspect undeployed rules before assuming the code path is still wrong.
- Hosted verification should distinguish between frontend deploy requirements and rules-only deploy requirements. A Firestore permission fix can require no hosting deploy if the failing surface is purely rules-gated.

Related incident: @doc/sop/ielts-writing-grading-permission-runtime-state

## 2026-03-29 Amendment — RTDB Result Fan-Out Ordering for Teacher Materialization

When RTDB secondary result indexes validate against `root.test_results/{resultId}`, a teacher-triggered first-write fan-out cannot safely create the canonical row and dependent indexes in the same assumption-blind step.

### Current rule
- Persist `test_results/{resultId}` first.
- Only after the canonical row exists, fan out `test_results_by_student`, `test_results_by_session`, `test_results_by_teacher`, and any scoped indexes.
- If the canonical row is missing or unreadable during a grading workflow, rebuild it from the canonical Firestore submission artifact instead of failing the workflow.

### Why this matters
- RTDB result projection is still required for discovery and compatibility readers.
- Teacher grading should not fail just because the compatibility row is absent.
- This is a cross-store architecture rule, not just an IELTS Writing implementation detail.

### Related docs
- @doc/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29
- @doc/patterns/pattern-rtdb-multi-path-write-obligation
- @doc/architecture/test-system-architecture
