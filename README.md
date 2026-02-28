# Kahoot — Interactive Learning & Assessment Platform

A full-featured, real-time educational platform built with **React 19**, **Firebase**, and **Vite**. Supports IELTS and THCS (Vietnamese middle-school) test creation, live classroom sessions, AI-powered content extraction, course management, and comprehensive academic tracking — all in a single SPA.

> **Codebase at a glance** (from CodeGraphContext):
> **894 files** · **3,079 functions** · **53 classes** · **850 modules** · **3 user roles** (Admin, Teacher, Student)

---

## Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
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
| **IELTS Listening** | Audio-synced test sessions with section-based playback control, Google Drive audio streaming |
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
- **Smart Chunking** — Adaptive text chunking for large documents
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
| Zustand over Redux | Simpler state management for this scale |
| Role-prefixed pages | Easy file-to-feature mapping by user role |
| Feature-sliced skills modules | `src/skills/listening/` and `src/skills/reading/` as target pattern |

---

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
| Cloud Functions | Firebase Cloud Functions |
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
| Custom Vite Plugin | No-Mantine enforcement |

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

   # Cloudflare R2 (optional, for file uploads)
   VITE_R2_WORKER_URL=
   VITE_R2_ACCESS_KEY_ID=
   VITE_R2_SECRET_ACCESS_KEY=
   VITE_R2_BUCKET_NAME=

   # Google Drive (optional, for audio streaming)
   VITE_GOOGLE_DRIVE_CLIENT_ID=
   VITE_GOOGLE_API_KEY=
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
| `npm run build` | Production build |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run lint` | ESLint check |
| `npm run enforce` | Pre-commit rule enforcement |
| `npm run enforce:check` | Dry-run enforcement check |

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
├── functions/                   # Firebase Cloud Functions
├── cloudflare/                  # R2 upload Worker
├── conductor/                   # Orchestration tooling
├── e2e/                         # Playwright E2E tests
├── scripts/                     # Build & utility scripts
├── documentation/               # Project documentation
│   └── .knowns/                 # 178 structured docs
├── .agent/                      # AI agent configuration
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
- **No Mantine** — All new UI must use vanilla HTML/CSS. Existing Mantine imports remain temporarily.
- **No Tailwind** — Not used in this project.
- CSS Modules or inline styles; custom design tokens in `src/styles/`

---

## 🛡️ Coding Safety Rules

16 rules derived from real production bugs. Full reference: [`documentation/integration-safety-rules.md`](./documentation/integration-safety-rules.md)

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
| 16 | Creating ANY new user-facing feature | WebMCP Tool Registration |

---

## 📚 Documentation

This project maintains **178 structured documents** via [Knowns](https://github.com/nicholasgriffintn/knowns), organized as:

### Architecture Docs (18 docs)
| Document | Description |
|----------|-------------|
| `architecture` | System overview, layer diagram, data flow |
| `architecture/test-system-architecture` | Complete test lifecycle: creation → sessions → grading → results |
| `architecture/database-schema-reference` | Full RTDB schema, TypeScript types, security rules |
| `architecture/routing-navigation` | Route map, PrivateRoute, useNavigation hook |
| `architecture/auth-rbac-architecture` | Auth flow, role-based access, route protection |
| `architecture/session-test-modes` | Live/offline/solo/homework modes, timer sync |
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