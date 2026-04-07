---
title: README
description: Project overview, tech stack, key domains, and critical rules. The primary entry point for understanding this project.
createdAt: '2026-02-27T15:56:46.139Z'
updatedAt: '2026-04-05T14:27:03.306Z'
tags:
  - core
  - overview
  - entry-point
---

# Kahoot — Interactive Learning Platform

## What This Is

A **web-based educational platform** for English language teaching (IELTS + THCS/THPT Vietnamese curriculum). Teachers create tests, run live sessions, assign homework. Students take tests, practice solo, track progress.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript |
| **Build** | Vite 7 |
| **Routing** | React Router DOM 7 |
| **State** | Zustand 5 |
| **Backend** | Firebase (Auth, Realtime Database, Hosting) |
| **File Storage** | Cloudflare R2 (via Workers) |
| **AI** | Google Generative AI, Groq SDK |
| **Testing** | Vitest + Playwright |
| **UI** | Vanilla CSS + Bootstrap 5 (migrating away from Mantine) |
| **DnD** | @dnd-kit |
| **Charts** | Recharts |

## Key Domains

1. **Test System** — IELTS Reading/Listening + THCS/THPT multi-choice tests
   - Create → Edit → Live Session → Monitor → Grade → Results
   - Solo practice + Homework modes
   - See @doc/prd/prd-thcs-phase-1, @doc/prd/prd-thcs-phase-2, @doc/prd/prd-thcs-phase-3

2. **User System** — Role-based (Admin, Teacher, Student)
   - Class enrollment, course management
   - See @doc/prd/prd-login-system, @doc/prd/prd-rbac-security

3. **Student Experience** — Dashboard, academic record, solo practice
   - See @doc/prd/prd-student-dashboard, @doc/prd/prd-academic-record

4. **Audio/Media** — Listening test audio, file uploads via R2
   - See @doc/prd/prd-unified-audio-architecture

## Project Structure

```
src/
├── pages/           76 files, role-prefixed (Admin*, Teacher*, Student*)
├── components/      221 files, feature folders + loose files
├── services/        104 files, domain-based
├── hooks/           36 files, role/feature folders
├── types/           16 files, domain-based
├── skills/          Listening + Reading modules (exemplary structure)
├── config/          Route security, scoring, env
├── constants/       Route definitions
└── contexts/        React contexts (auth, navigation)
```

See @doc/architecture for detailed architecture breakdown.

## Critical Rules

- **NO MANTINE** — See @doc/system/no-mantine-rule
- **Integration Safety** — See @doc/integration-safety-rules (12 rules from production bugs)
- **Student View Design** — See @doc/design/student-view-design-standard

## Firebase Structure

- **Auth** — Email/password, role stored in RTDB `/users/{uid}/role`
- **Realtime Database** — Primary data store (tests, classes, sessions, results)
- **Hosting** — Production deployment
- **R2 Workers** — File upload proxy to Cloudflare R2

## Development

```bash
npm run dev      # Vite dev server
npm test         # Vitest
npm run build    # Raw Vite production build + bundle-budget check
npm run deploy:hosting    # Build, then deploy Hosting target kahut1
```

If you want an upload-only step after inspecting `dist/`, run `firebase deploy --only hosting:kahut1`.

On Windows, if raw Vite hits the esbuild temp-file lock issue, follow @doc/troubleshooting/troubleshooting-vite-esbuild-file-lock-on-windows to set `TMPDIR`, `TEMP`, and `TMP` manually for the current shell session before rebuilding.
