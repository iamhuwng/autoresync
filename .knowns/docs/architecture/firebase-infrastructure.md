---
title: Firebase Infrastructure
createdAt: '2026-02-27T16:33:56.072Z'
updatedAt: '2026-02-27T16:34:15.887Z'
description: >-
  Firebase RTDB schema, deployment, backup/restore, error handling patterns,
  development workflows.
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
├── sessions/{sessionId}/  — Active live sessions
│   ├── participants/      — Connected students
│   └── timer/             — Timer state
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
# Build + Deploy
npm run build
firebase deploy --only hosting:kahut1

# Deploy rules only
firebase deploy --only database
```

**Live URL:** https://kahut1.web.app

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
| Deploy | `firebase deploy --only hosting:kahut1` |
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
