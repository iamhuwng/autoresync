# Kahoot — Interactive Learning & Assessment Platform

A full-featured, real-time educational platform built with **React 19**, **Firebase**, and **Vite**. Supports IELTS and THCS (Vietnamese middle-school) test creation, live classroom sessions, AI-powered content extraction, course management, and comprehensive academic tracking — all in a single SPA.

> **Codebase at a glance** (from CodeGraphContext):
> **894 files** · **3,079 functions** · **53 classes** · **850 modules** · **3 user roles** (Admin, Teacher, Student)

---

## Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Result Architecture Reassessment](#result-architecture-reassessment-prd-0040)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Key Services](#-key-services)
- [Custom Hooks](#-custom-hooks)
- [Testing](#-testing)
- [Design Standards](#-design-standards)
- [Coding Safety Rules](#-coding-safety-rules)
- [Documentation](#-documentation)

---

## ✨ Features

### Test Systems

| System | Description |
|--------|-------------|
| **IELTS Reading** | Multi-passage tests with 7 question types: MCQ, Multiple Select, Completion, Matching (grouped & individual), True/False/Not Given, Yes/No/Not Given, Diagram Labeling |
| **IELTS Listening** | Audio-synced test sessions with section-based playback control and Cloudflare R2 audio storage |
| **IELTS Writing** | Task 1 & Task 2 with rich-text editor (TipTap), band-score grading, annotation system |
| **THCS Tests** | Vietnamese middle-school format with AI document extraction, auto-marking, regex parsing |

### Test Delivery Modes

- **Live Session** — Real-time teacher-controlled test with lobby, timer sync, and leaderboard
- **Solo Practice** — Self-paced with auto-save, resume capability, and immediate results
- **Homework** — Teacher-assigned with deadlines, auto-transition, and submission tracking
- **Offline** — Asynchronous completion without real-time connection

### Teacher Features

- **Test Creation** — 4-step wizard with AI-powered content extraction (Gemini + Groq fallback)
- **Test Editor** — THCS modal editor, IELTS quiz editor with dual-mode (question/passage)
- **Live Monitor** — Real-time student progress, answer peeking, session controls
- **Class & Course Management** — Create classes, manage enrollments, assign homework
- **Grading** — IELTS band scoring, THCS point scoring, Writing annotation & manual grading
- **Results & Analytics** — Per-student history, class reports, PDF export with `jspdf`
- **Material Library** — Upload and link materials to courses with Cloudflare R2 storage

### Student Features

- **Activity Stream Dashboard** — Twitter/X-style 3-column social feed layout
- **Real-time Notifications** — Paginated activity feed with per-user Firebase paths
- **Academic Record** — Consolidated results across all test types and skills
- **Course Discovery** — Browse catalog, request enrollment, track progress
- **Homework Management** — View assignments, track deadlines, submit & review
- **Practice Mode** — Self-study with auto-save and resume

### Admin Features

- **User Management** — RBAC, account creation, ban/unban, role assignment
- **Dashboard** — System-wide analytics and monitoring
- **Backup & Restore** — Firebase RTDB backup with restore guard middleware
- **Session Management** — View and manage active test sessions
- **Migration Tools** — Data migration utilities for schema changes

### AI Integration

- **Dual Provider** — Google Gemini 2.5 Flash (primary) + Groq Llama 3.1 70B (fallback)
- **Document Extraction** — PDF, DOCX, and image parsing via `pdfjs-dist` and `mammoth`
- **AI-First Reading Parsing** — Staged Gemini/Groq extraction for teacher reading creation; legacy chunking utilities are isolated from the live env contract
- **Type Classification** — Automatic IELTS question type detection
- **THCS Regex Parser** — Pattern-based extraction for Vietnamese test formats

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│                  Pages (89 files)                │
│     Role-prefixed: Admin*, Teacher*, Student*    │
├─────────────────────────────────────────────────┤
│              Components (365 files)              │
│   Feature folders: admin/, course/, test/,       │
│   writing/, listening/, results/, navigation/    │
├──────────────┬───────────────┬───────────────────┤
│  Hooks (67)  │ Services (145)│    Contexts       │
│  admin/      │ classManager  │    AuthContext     │
│  test/       │ courseManager  │    NavContext      │
│  monitor/    │ testStorage   │                   │
├──────────────┴───────────────┴───────────────────┤
│               Firebase SDK + Zustand             │
│   Auth │ Realtime DB │ Storage │ Hosting         │
├─────────────────────────────────────────────────┤
│            Cloudflare R2 Workers                 │
│          File upload/download proxy              │
└─────────────────────────────────────────────────┘
```

### Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Firebase RTDB over Firestore | Real-time sync critical for live test sessions |
| Cloudflare R2 over Firebase Storage | Cost-effective file storage with Workers proxy |
| Vanilla CSS over Mantine/Tailwind | Bundle size control; Mantine is **banned** in new code |
| Derived session lifecycle | Session expiry comes from `game_sessions.expiresAt` plus RTDB server `now`; no browser cleanup, Firebase scheduled Function, or Cloudflare lifecycle cron |
| Class lifecycle authority | Class deletion is owned by `classes/{classId}.status`; `student_classes` cleanup is best-effort and class-backed `game_sessions/{classId}` rows are legacy shadows |
| Zustand over Redux | Simpler state management for this scale |
| Role-prefixed pages | Easy file-to-feature mapping by user role |
| Feature-sliced skills modules | `src/skills/listening/` and `src/skills/reading/` as target pattern |

---

## Result Architecture Reassessment (PRD-0040)

The current result-view architecture is being governed by [PRD-0040](./documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md), which was reassessed against the live codebase on 2026-03-24. This is the current source of truth for what counts as a saved-result shell, what stays outside phase-1 unification, and which working flows must be preserved instead of flattened into placeholders.

Related docs that materially shape this area:
- [PRD-0039](./documentation/tasks/0039-prd-test-results-slide-panel.md) for the student saved-result shell
- [PRD-0016 RBAC hardening](./documentation/tasks/0016-prd-rbac-security-hardening.md) for ownership/security expectations
- [PRD-0030 writing system](./documentation/tasks/0030-prd-ielts-writing-test-system.md) for writing-domain background
- [PRD-0019 end flow](./documentation/tasks/0019-prd-test-duration-end-flow.md) for post-submission/session transitions
- [PRD-0028 THCS phase 2](./documentation/tasks/0028-prd-thcs-thpt-test-system-phase2.md) for THCS grading context
- [Result View Map](./documentation/architecture/result-view-map.md) for current surface classification
- [Result View Permission Matrix](./documentation/architecture/result-view-permission-matrix.md) for route/app/backend access truth
- [Result View Reuse Rule](./documentation/rules/result-view-reuse.md) for future task discipline
- [PRD-0040 FR Closure Matrix](./documentation/architecture/result-view-fr-closure-matrix.md) for current proof status against the PRD

### Verified Domain Highlights

Representative highlights only. The authoritative surface inventory, domain taxonomy, coverage status, and unwired/demo triage live in [Result View Map](./documentation/architecture/result-view-map.md) and [PRD-0040 FR Closure Matrix](./documentation/architecture/result-view-fr-closure-matrix.md).

| Domain | Verified current contract | Key files / routes | Representative anchors |
|--------|---------------------------|--------------------|------------------------|
| Saved-result | There are three active saved-result shells only: `ResultSlidePanel`, `ResultDetailModal`, and `LegacyResultDetailView`. `ResultDetailPage` is a wrapper, not a fourth shell, and existing parent-owned entry pages are part of the contract. | `src/components/results/ResultSlidePanel.tsx`, `src/components/results/ResultDetailModal.tsx`, `src/components/results/LegacyResultDetailView.tsx`, `src/pages/ResultDetailPage.tsx`, `src/pages/AcademicRecordPage.tsx`, `src/pages/StudentDashboardPage.jsx`, `src/pages/TeacherStudentHistoryPage.tsx` | `ResultDetailPage.test.tsx`, `AcademicRecordPage.test.tsx`, `TeacherStudentHistoryPage.test.tsx` |
| Session / post-test | Session review remains distinct from saved-result work. `StudentWaitingRoomPage`, `TestResultsModal`, `StudentTestResultsPage`, `TeacherTestResultsPage`, `TeacherResultsPage`, `StudentResultsPage`, `TeacherResultsDashboard`, and feedback pages are not thin `resultId` wrappers. | `src/pages/StudentWaitingRoomPage.jsx`, `src/components/test/TestResultsModal.tsx`, `src/pages/StudentTestResultsPage.tsx`, `src/pages/TeacherTestResultsPage.tsx`, `src/pages/TeacherResultsPage.jsx`, `src/pages/TeacherResultsDashboard.jsx`, `src/pages/StudentResultsPage.jsx`, `src/pages/TeacherFeedbackPage.jsx`, `src/pages/StudentFeedbackPage.jsx` | `StudentTestResultsPage.test.tsx`, `TeacherTestResultsPage.test.tsx`, `resultsService.test.ts` |
| Guest-result/claim | Guest lookup and claim are active adjacent-domain flows. Claims now promote guest rows into canonical `test_results/{resultId}` records and standard fan-out indexes; the public guest route vs auth-required backend read mismatch remains documented as accepted current behavior. | `src/pages/GuestResultsPage.tsx`, `src/pages/ProfileCompletionPage.tsx`, `src/components/guest/ClaimResultsModal.tsx`, `src/services/guestResultsService.ts` | `GuestResultsPage.test.tsx`, `ClaimResultsModal.test.tsx`, `guestResultsService.test.ts` |
| Writing | Writing is a lifecycle spanning draft, monitor, queue, editor, result, and THCS inline grading. `SubmissionCompletePage` is an active bridge into result review, not a disposable confirmation screen. | `src/components/writing-student/*`, `src/components/writing-monitor/*`, `src/pages/TeacherGradingPage.tsx`, `src/pages/WritingGradingPage.tsx`, `src/pages/SubmissionCompletePage.tsx`, `src/components/writing-results/*`, `src/services/writingSubmissionService.ts`, `src/components/thcs-grading/InlineWritingGrader.tsx` | `WritingMonitorCard.test.tsx`, `thcsWritingGrading.service.test.ts`, static audit docs |
| Live-monitoring | Teacher monitor flows remain their own domain and own release-adjacent operations, peek/reopen behavior, and THCS inline writing grading. | `src/pages/TeacherTestMonitorPage.tsx`, `src/components/writing-monitor/WritingMonitorCard.tsx`, `src/components/writing-monitor/WritingPeekModal.tsx`, `src/components/test/StudentDetailModal.tsx` | static audit docs |
| Unwired/demo | Dormant writing redesign surfaces and historical public demo routes are explicitly classified rather than silently treated as active architecture. Demo pages were removed from runtime on 2026-03-25; remaining mentions are audit history. | `WritingGradingModal`, `StudentResultOverview`, `StudentDetailedMarkup`, historical `FeedbackComponentsDemo`, `FeedbackDemoPage`, `AcademicRecordDemoPage`, `DemoIndexPage` | `result-view-map.md`, static audit docs |

### Active High-Risk Findings

- The student ownership path for `/result/:resultId` is not fully preserved today. The route is marked like an ownership-protected path in `src/config/routeSecurity.ts`, but student redirects and query-param openers can still bypass that intended contract if phase-1 work assumes route protection alone is sufficient.
- `ResultSlidePanel` and `ResultDetailModal` still read `test_results/{resultId}` directly. Unlike `LegacyResultDetailView`, they do not visibly apply ownership validation themselves, so their safety currently depends on caller discipline and backend rules.
- Live-session student review is currently more permissive than the phase-2 target. Any phase-2 restriction is a deliberate behavior change over existing `StudentTestResultsPage` / `TestResultsModal` behavior, not a brand-new capability.
- Historical note retired: the old non-canonical guest-claim write path is obsolete. Current `claimGuestResults()` writes canonical `test_results/{resultId}` records, rebuilds standard saved-result indexes, and retains `migrateLegacyClaimedGuestResults()` only for privileged/manual legacy cleanup.
- `GuestResultsPage.tsx` CTA routing has been corrected to `/`; older `/login` and `/register` route-risk notes are historical audit residue.
- Writing still has active lifecycle defects and toolchain splits. Those are preserved in Appendix A of [PRD-0040](./documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md#appendix-a-preserved-writing-toolchain-findings) and should not be normalized away by generic result-view refactors.
- Historical note retired: the public feedback demo pages and stale demo route/config/script residue were removed from runtime on 2026-03-25. Historical docs may still mention them for auditability only.

### Additional Verified Deltas

- The 2026-03-24 exhaustive static audit confirmed that `src/__tests__/security/routeAccess.test.ts` is a hand-maintained route model, not a trustworthy source of actual route truth. It still assumes `/login`, so passing it does not prove the live app routes are aligned.
- `TeacherResultsDashboard.jsx` is an active teacher result dashboard at `/teacher/results`, not a dead leftover.
- `SubmissionCompletePage.tsx` is an active writing/result-adjacent bridge at `/submission-complete`, not just a cosmetic screen.
- `StudentResultOverview.tsx` and `StudentDetailedMarkup.tsx` are currently unwired in runtime: no imports, no routes, and no test references were found in `src`.
- `WritingGradingModal.tsx` is not runtime-reachable today. It is better classified as an `alternate/dormant` writing toolchain than as an active grading surface.
- Historical note retired: `DemoIndexPage.tsx` and the public demo result pages are no longer runtime-reachable.
- `StudentClassDetailPage.jsx` now repairs missing class-assignment `resultId` values from existing student results before opening canonical `/result/:resultId`; the old config-only `/student/results/history` residue has been removed.
- A focused Vitest slice passed on 2026-03-24 for `ResultDetailPage`, `TeacherStudentHistoryPage`, `StudentTestResultsPage`, `TeacherTestResultsPage`, and `routeAccess.test.ts`, which confirms several current contracts but does not replace runtime ownership verification.

### Exhaustiveness Status

An exhaustive static audit has now been completed across six tacks: saved-result contracts, security/ownership, session/post-test flows, guest/adjacent/demo surfaces, writing lifecycle, and dormant/unwired reachability. It is still not runtime-foolproof.

What is verified:
- the active saved-result shell set and its parent entry owners
- the current split between advisory route security metadata and runtime ownership enforcement
- the backend RTDB and Firestore rule reality for saved results, guest claim, session visibility, writing submissions, and demo writes
- the session/post-test boundary and waiting-room-first post-test behavior
- the guest/claim adjacency, canonical claim promotion, and historical public demo removal
- the corrected guest CTA route and the stale hand-maintained route-access test model
- the teacher aggregate results dashboard and submission-complete bridge classification
- the writing lifecycle boundary, grading queue/editor/result split, and THCS inline-writing separation
- the major dormant/demo classifications, including unreachable writing redesign files, publicly mounted demo pages, and non-`src` backup/docs-only references
- stale route/config producers that should not be mistaken for live surface inventory
- the producer-to-consumer chains for route links, notification metadata, query-param opens, legacy result redirects, and guest claim entry points
- a focused regression-test slice for the highest-signal route/owner/session pages
- a prepared emulator-backed runtime rules test at `src/__tests__/security/prd0040-security.emulator.test.ts`
- the living-doc pack required by PRD-0040: map, permission matrix, reuse rule, and FR closure matrix

What still needs explicit closure before calling this area foolproof:
- running the prepared emulator-backed runtime verification against backend security rules on a Java-capable machine or CI runner that can host RTDB + Firestore emulators
- targeted tampering verification for query-param, notification, and legacy direct-read entry points

What is now explicit rather than implied:
- RTDB currently allows broader teacher and authenticated access than the PRD ownership/release-state language implies.
- `GuestResultsPage` is publicly routed but backend guest-result reads still require `auth != null`; claim promotion now writes canonical saved-result records through `claimGuestResults()`.
- `WritingGradingModal`, `StudentResultOverview`, and `StudentDetailedMarkup` are not active runtime surfaces even though they are heavily represented in `.knowns` history and design material.
- Emulator-backed rules verification requires Java 21. Current CI session-lifecycle proof installs Temurin 21 before running Firebase emulators; local runners must provide equivalent Java before `firebase emulators:exec`.

When working on anything result-related, start with [PRD-0040](./documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md) and treat its domain boundaries as hard constraints.

## 🛠 Tech Stack

### Core

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.1 |
| Build Tool | Vite | 7.1 |
| Language | TypeScript | 5.9 |
| Routing | React Router DOM | 7.9 |
| State | Zustand | 5.0 |
| Validation | Zod | 4.1 |

### Backend & Infrastructure

| Service | Technology |
|---------|-----------|
| Authentication | Firebase Auth |
| Database | Firebase Realtime Database |
| Hosting | Firebase Hosting |
| File Storage | Cloudflare R2 (via Workers) |
| Trusted Backend | Cloudflare Workers: `r2-upload-signer` for upload/Listening calls and `r2-backup-worker` for backup/trusted Reading V2 submit; Firebase Functions wrappers are deprecated/off-limit for new Reading V2 work |
| Session Lifecycle | Direct Firebase RTDB/Auth/Rules only; no lifecycle Worker cron or scheduled Function |
| AI Primary | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| AI Fallback | Groq Llama 3.1 70B (`groq-sdk`) |

### UI & Rendering

| Purpose | Library |
|---------|---------|
| Rich Text | TipTap (`@tiptap/react`, `@tiptap/starter-kit`) |
| Drag & Drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Charts | Recharts |
| PDF Generation | jsPDF |
| PDF Reading | pdfjs-dist |
| DOCX Parsing | Mammoth |
| Drawing | perfect-freehand (custom canvas engine) |
| Icons | Tabler Icons React |
| Panels | react-resizable-panels |

### Testing & Quality

| Tool | Purpose |
|------|---------|
| Vitest | Unit testing |
| Playwright | E2E testing |
| React Testing Library | Component testing |
| ESLint | Linting |
| Mantine boundary script + CI | No-Mantine enforcement |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm
- Firebase project with Realtime Database & Auth enabled
- Google Gemini API key (for AI extraction)
- *(Optional)* Cloudflare R2 account (for file storage)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd kahoot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment — copy `env.example.txt` to `.env` and fill in:
   ```env
   # Firebase
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_DATABASE_URL=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=

   # AI (required for test extraction)
   VITE_GEMINI_API_KEY=

   # Cloudflare R2 / Listening Worker endpoints
   # Use the deployed Worker URL for local dev and production builds.
   VITE_R2_UPLOAD_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
   VITE_LISTENING_AUTHORING_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
   VITE_LISTENING_UPLOAD_SESSION_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
   VITE_LISTENING_LIVE_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
   VITE_LISTENING_SOLO_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev
   VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL=https://r2-upload-signer.iamhuwng.workers.dev

   ```

4. Start development server:
   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Direct Vite production build plus bundle-budget check |
| `npm run deploy:hosting` | Run `npm run build`, then deploy Hosting target `kahut1` |
| `npm test` | Run app Vitest unit tests with memory-safe worker settings |
| `npm run test:scripts` | Run script tests in Node and Vitest |
| `npm run test:r2` | Run `r2-backup-worker` tests |
| `npm run test:all` | Run app, script, and R2 test suites sequentially |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run lint` | ESLint check |
| `npm run lint:mantine` | Check changed source for banned `@mantine/*` imports |
| `npm run enforce` | Pre-commit rule enforcement |
| `npm run enforce:check` | Dry-run enforcement check |

Deployment note:
- `npm run build` now uses the direct Vite build path and then runs `scripts/check-bundle-budget.mjs`
- `npm run deploy:hosting` builds once and uploads the resulting `dist` with `firebase deploy --only hosting:kahut1`
- if Windows file locking breaks the build, set `TMPDIR`, `TEMP`, and `TMP` to a writable temp folder in that shell before rerunning the command

---

## 📁 Project Structure

```
kahoot/
├── src/                         # Application source (822 files)
│   ├── pages/                   # Page components (89 files)
│   │   ├── Admin*.tsx           # Admin pages (10)
│   │   ├── Teacher*.tsx/.jsx    # Teacher pages (18)
│   │   ├── Student*.tsx/.jsx    # Student pages (14)
│   │   ├── *TestPage.tsx        # Test-taking pages
│   │   ├── *GradingPage.tsx     # Grading pages
│   │   └── *ResultsPage.tsx     # Results pages
│   │
│   ├── components/              # UI components (365 files)
│   │   ├── admin/               # Admin UI (layout, modals)
│   │   ├── course/              # Course cards, enrollment
│   │   ├── test/                # Test editors, question renderers
│   │   ├── writing*/            # Writing test components (6 dirs)
│   │   ├── thcs-student/        # THCS student components
│   │   ├── navigation/          # Sidebars, menus, breadcrumbs
│   │   ├── modals/              # Dialog components
│   │   ├── quiz-creation/       # Quiz wizard steps
│   │   └── results/             # Result cards, tables
│   │
│   ├── services/                # Backend services (145 files)
│   │   ├── ai/                  # AI providers & extractors
│   │   ├── parser/              # Document parsers
│   │   ├── migrations/          # Data migration scripts
│   │   ├── firebase.js          # Firebase initialization
│   │   ├── *Manager.ts          # CRUD services
│   │   └── *Service.ts          # Utility services
│   │
│   ├── hooks/                   # Custom React hooks (67 files)
│   │   ├── admin/               # Admin-specific hooks
│   │   ├── test/                # Test session, timer, submission
│   │   └── monitor/             # Live session monitoring
│   │
│   ├── skills/                  # Feature-sliced modules
│   │   ├── reading/             # Reading test module
│   │   └── listening/           # Listening test module
│   │
│   ├── utils/                   # Utilities (43 files)
│   ├── types/                   # TypeScript definitions (26 files)
│   ├── drawing/                 # Canvas drawing engine (14 files)
│   ├── config/                  # Route security, scoring (7 files)
│   ├── store/                   # Zustand stores
│   ├── context/                 # React contexts (Auth, Nav)
│   ├── constants/               # Route constants
│   ├── styles/                  # Design system tokens
│   └── __tests__/               # Integration tests
│
├── functions/                   # Deprecated Firebase Functions wrappers; do not expand for new Reading V2 work
├── r2-backup-worker/            # Cloudflare Worker for backup and Reading V2 trusted submit
├── cloudflare/                  # R2 upload Worker
├── conductor/                   # Orchestration tooling
├── e2e/                         # Playwright E2E tests
├── scripts/                     # Build & utility scripts
├── documentation/               # Project documentation
├── .agent/                      # AI agent configuration
├── .knowns/                     # Structured Known docs mirror
└── public/                      # Static assets
```

---

## 🔌 Key Services

| Service | File | Purpose |
|---------|------|---------|
| `classManager.ts` | Class CRUD, student assignment | Core |
| `courseManager.ts` | Course lifecycle, enrollment | Core |
| `testStorage.ts` | IELTS test CRUD operations | Core |
| `thcsTestStorage.ts` | THCS test CRUD operations | Core |
| `listeningTestStorage.ts` | Listening test storage | Core |
| `sessionService.ts` | Live session management | Real-time |
| `sessionLifecycle.ts` | Derived session status and expiry helpers | Real-time |
| `sessionOwnerIndex.ts` | Owner-scoped active-session discovery rows | Real-time |
| `sessionQuery.ts` | Teacher active-session subscriptions | Real-time |
| `notificationService.ts` | In-app notifications | Real-time |
| `resultsService.ts` | Test results & scoring | Core |
| `homeworkManager.ts` | Assignment lifecycle | Core |
| `enrollmentManager.ts` | Course enrollment flow | Core |
| `r2Storage.ts` | Cloudflare R2 file ops | Storage |
| `backupService.ts` | RTDB backup & restore | Admin |
| `restoreGuard.ts` | Write-protection middleware | Safety |
| `ai.service.ts` | AI provider orchestration | AI |
| `gemini.provider.ts` | Google Gemini integration | AI |
| `groq.provider.ts` | Groq fallback integration | AI |
| `writingTestService.ts` | Writing test operations | Writing |
| `writingSubmissionService.ts` | Writing submission flow | Writing |
| `thcsAutoMarking.service.ts` | THCS auto-grading | Grading |

---

## 🪝 Custom Hooks

| Hook | Purpose |
|------|---------|
| `useAuth` | Authentication state & role |
| `useNavigation` | Centralized routing |
| `useTestSession` | Test session lifecycle |
| `useTestSubmission` | Answer submission flow |
| `useTestTimer` | Timer sync & expiry |
| `useSoloAutoSave` | Solo practice auto-save |
| `useSoloResume` | Resume interrupted tests |
| `useMonitorSession` | Teacher live monitoring |
| `useMonitorControls` | Session control actions |
| `useHomeworkSubmission` | Homework submit flow |
| `useHomeworkList` | Assignment listing & filters |
| `useClassSession` | Class session management |
| `useAssignments` | Assignment data hooks |
| `useActiveTimeTracking` | Student time tracking |
| `useBeforeUnloadWarning` | Prevent accidental navigation |
| `useWritingAutoSave` | Writing test auto-save |

---

## 🧪 Testing

```bash
# Unit tests (Vitest + React Testing Library)
npm test

# Node-only script tests
npm run test:scripts

# Worker tests
npm run test:r2

# All test suites, sequential to avoid local OOM
npm run test:all

# App test memory knobs: set VITEST_MAX_WORKERS=1 or VITEST_FILE_PARALLELISM=false
# before npm test on very memory-constrained machines.

# E2E tests (Playwright)
npm run test:e2e

# Security tests
npm run test:security

# Pre-commit enforcement
npm run enforce:check
```

---

## 🎨 Design Standards

### Teacher View
- **Glassmorphism** aesthetic with blur effects and gradients
- Tabler Icons for iconography
- Modal-heavy workflows (test creation, editing, grading)

### Student View — [Social Feed Paradigm](./documentation/design/student-view-design-standard.md)
- 3-column layout: Left sidebar (256px) · Center feed (600px) · Right panel (320px)
- Flat gray (`#f3f4f6`) backgrounds — no gradients, no glassmorphism
- Inter font family, SVG icons, pill-shaped buttons
- Off-canvas mobile sidebars with mutual exclusion

### Critical UI Rules
- **No Mantine** — All new UI must use vanilla HTML/CSS. Existing Mantine imports remain transitional residue.
- **Rule 15 enforcement** — `npm run lint:mantine` and `.github/workflows/mantine-boundary.yml` block changed source that imports `@mantine/*`; old runtime console warnings are obsolete enforcement.
- **No Tailwind** — Not used in this project.
- CSS Modules or inline styles; custom design tokens in `src/styles/`

---

## 🛡️ Coding Safety Rules

Integration safety rules are category-indexed production bug guardrails. Full reference: [`documentation/integration-safety-rules.md`](./documentation/integration-safety-rules.md)

| # | Trigger Condition | Rule |
|---|-------------------|------|
| 1 | Writing `navigate()`, links, redirects | Route/Path Registry Validation |
| 2 | Navigating to page needing prerequisite state | Page-Entry Prerequisite Handshake |
| 3 | New nav handler, auth flow, or session entry | Pattern-First Research |
| 4 | Layout shift during dnd-kit drag | Force Re-measurement After Paint |
| 5 | Custom pointer handlers on draggables | No setPointerCapture on Draggables |
| 6 | `useEffect` with `setInterval` + state deps | Hot Values → Refs in Intervals |
| 7 | State initialized as `'pending'`/`'loading'` | Guaranteed Resolution for All Branches |
| 8 | New component intended for use in another page | Component Exists ≠ Component Integrated |
| 9 | PRD says "replace ALL" or "every" | Codebase-Wide Grep Audit |
| 10 | Before any `git pull` or sync operation | Git Sync Safety Protocol |
| 11 | Service writing to DB as side effect | Restore Guard Middleware |
| 12 | Adding a new RTDB node or Firestore collection | Backup Coverage Check |
| 13 | Serverless function with heavy workloads | Client-Driven Multi-Step |
| 14 | Shared ID between creator and consumer | Never Regenerate Shared IDs |
| 15 | Writing ANY `import` or `npm install` | No Mantine — Absolute Import Ban |
| 16 | WebMCP tool registration | Retired; WebMCP removed 2026-03-14 |

---

## 📚 Documentation

This project maintains structured documents via [Knowns](https://github.com/nicholasgriffintn/knowns), organized as:

### Architecture Docs
| Document | Description |
|----------|-------------|
| `architecture` | System overview, layer diagram, data flow |
| `architecture/test-system-architecture` | Complete test lifecycle: creation → sessions → grading → results |
| `architecture/database-schema-reference` | Full RTDB schema, TypeScript types, security rules |
| `architecture/routing-navigation` | Route map, PrivateRoute, useNavigation hook |
| `architecture/auth-rbac-architecture` | Auth flow, role-based access, route protection |
| `architecture/session-test-modes` | Live/offline/solo/homework modes, timer sync |
| `architecture/session-lifecycle-authority` | Current no-cron session expiry authority, owner index, Spark/Workers-Free boundary |
| `architecture/teacher-class-management-lifecycle` | Current class delete boundary, projection cleanup, and legacy `game_sessions` shadow rules |
| `architecture/student-experience-architecture` | 20 student pages, design standard, UX patterns |
| `architecture/ui-design-standards` | Teacher & student design systems, CSS enforcement |
| `architecture/firebase-infrastructure` | RTDB schema, deployment, backup/restore |
| `architecture/media-storage-architecture` | R2 storage strategy, upload patterns |
| `architecture/ai-parsing-extraction` | Dual AI provider, extraction pipeline |
| `architecture/notification-system` | In-app & email notifications |
| `architecture/webmcp-architecture` | Dev-only AI agent tool system |

### Guides
- `guides/cloudflare-setup-guide` — R2 storage & Workers setup
- `guides/firebase-storage-rules` — Security rules documentation
- `guides/ai-test-extraction-prompt` — AI prompt templates

### Design
- `design/student-view-design-standard` — Student UI specification
- `design/design-thcs-edit-test-modal-metadata-panel-step-1` — THCS editor UI spec

### Other
- `conventions` — Naming patterns, critical rules, code style
- `integration-safety-rules` — 16 production bug-derived safety rules
- `logs/` — 30+ development session logs (historical context)

---

## 📄 License

Private project. All rights reserved.
