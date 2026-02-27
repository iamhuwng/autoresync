# Interactive Learning Environment (Kahoot-Style)

A modern, real-time quiz platform built with React, Firebase, and Mantine UI. Create engaging quizzes with multiple question types, real-time student participation, and comprehensive teacher controls.

## ✨ Latest Updates (November 11, 2025)

### Major Features
- **Multi-Draft Management** - Save, load, and manage multiple quiz drafts with progress tracking
- **Google Drive Image Upload** - OAuth2-based cloud storage for passage images
- **Groq AI Fallback** - 99.5% uptime with Llama 3.1 70B fallback provider
- **Streamlined Workflow** - Quiz creation optimized from 5 steps to 4 steps
- **Manual Answer Editing** - Direct answer table when AI parsing fails

### Bug Fixes
- **Image Upload System** - Fixed tracking prevention blocking, display issues, and passage preservation
- **Answer Key Parsing** - Zero answer validation, count mismatch detection, prompt preservation
- **Caching Issues** - Resolved JavaScript syntax errors from stale browser cache

See [SOP-0023](./documentation/SOP/0023-november-11-2025-comprehensive-session.md) for complete session details.

## 🎯 Features

### Quiz Creation & Editing
- **Multi-Draft Management** - Save and manage unlimited quiz drafts with metadata
- **AI-Powered Quiz Creation** - 4-step wizard with AI parsing and multi-provider fallback (Gemini + Groq)
- **Google Drive Integration** - OAuth2-based image upload for passage materials
- **Inline Question Editing** - Edit questions without leaving the main interface
- **Dual-Mode Editor** - Switch between question and passage editing modes
- **Manual Answer Editing** - Fallback table for direct answer entry when AI fails
- **Skip Passages Option** - Create quizzes without reading material
- **Auto-save** - Automatic draft saving every 30 seconds

### Question Types (7 Supported)
- **Multiple Choice** - Single correct answer from options
- **Multiple Select** - Multiple correct answers
- **Completion** - Fill in the blank questions with structured context support
- **Matching** - Both grouped and individual IELTS formats
- **True/False/Not Given** - IELTS-style three-option questions
- **Yes/No/Not Given** - IELTS-style three-option questions
- **Diagram Labeling** - Label parts of diagrams or images

### Teacher Features
- **Real-time Quiz Sessions** - Live student participation with answer tracking
- **Quiz Editor** - Comprehensive editing with validation and error handling
- **Passage Display** - Collapsible panel with highlighter tools and font size controls
- **Timer Management** - Configurable time limits per question with pause/resume
- **Student Management** - Kick players, ban/unban, view live answers
- **Leaderboard** - Real-time scoring and rankings

### Student Features
- **Activity Stream Dashboard** - Twitter/X-style 3-column social feed layout
- **Real-time Notifications** - Paginated activity feed with per-user Firebase paths
- **Clean Interface** - Flat gray background, Inter typography, SVG icons
- **Responsive Design** - Off-canvas mobile sidebars with mutual exclusion
- **Touch-Optimized** - Full support for mobile devices

## 🎨 Design Standards

### Student View Design Standard (v1.0)
All student-facing pages follow the **Social Feed** paradigm. See [`documentation/design/student-view-design-standard.md`](./documentation/design/student-view-design-standard.md) for the full specification.

**Key principles:**
- 3-column layout: Left sidebar (256px) | Center feed (600px) | Right panel (320px)
- Flat gray (`#f3f4f6`) backgrounds, no gradients or glassmorphism
- Inter font, SVG icons, pill-shaped buttons
- Reference implementation: `src/pages/StudentDashboardPage.jsx`

## 🛡️ Coding Safety Rules

12 rules derived from real production bugs. Full details in [`documentation/integration-safety-rules.md`](./documentation/integration-safety-rules.md):

| # | Situation | Rule |
|---|-----------|------|
| 1 | Writing any `navigate()` or stored link | [Route Registry Validation](./documentation/integration-safety-rules.md#rule-1) |
| 2 | Navigating to `/student-test/*` or `/student-wait/*` | [Session Entry Handshake](./documentation/integration-safety-rules.md#rule-2) |
| 3 | Writing a new handler or session entry point | [Pattern-First Research](./documentation/integration-safety-rules.md#rule-3) |
| 4 | Causing layout shift during dnd-kit drag | [Force Re-measurement](./documentation/integration-safety-rules.md#rule-4) |
| 5 | Adding custom pointer handlers on draggables | [No setPointerCapture](./documentation/integration-safety-rules.md#rule-5) |
| 6 | Writing `useEffect` with `setInterval` + state deps | [Hot Values → Refs](./documentation/integration-safety-rules.md#rule-6) |
| 7 | Creating state as `'pending'` or `'loading'` | [Guaranteed Resolution](./documentation/integration-safety-rules.md#rule-7) |
| 8 | Creating a new component for another page | [Verify Integration E2E](./documentation/integration-safety-rules.md#rule-8) |
| 9 | PRD says "replace ALL" or "every" | [Grep Audit](./documentation/integration-safety-rules.md#rule-9) |
| 10 | Before any `git pull` or sync operation | [Git Sync Safety Protocol](./documentation/integration-safety-rules.md#rule-10) |
| 11 | Creating a service with DB write side effects | [Restore Guard Middleware](./documentation/integration-safety-rules.md#rule-11) |
| 12 | Adding a new RTDB node or Firestore collection | [Backup Coverage Check](./documentation/integration-safety-rules.md#rule-12) |

---


## 🛠 Tech Stack

- **Frontend**: React 18, Vite
- **UI Library**: Mantine v7 (utility hooks + Badge/Loader only for student views)
- **Backend**: Firebase (Realtime Database, Authentication, Hosting)
- **AI Integration**: Google Gemini 2.5 Flash + Groq Llama 3.1 70B (fallback)
- **Cloud Storage**: Google Drive API (OAuth2)
- **Styling**: Inline styles + CSS Modules (student views use custom design system)
- **Icons**: Tabler Icons (teacher), Inline SVGs (student)
- **Testing**: Playwright (E2E), Vitest (Unit)

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- Firebase account and project
- Google Gemini API key (for AI parsing features)

### Installation

1. Clone the repository
   ```bash
   git clone [repository-url]
   cd kahoot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Create a `.env` file with your credentials:
     ```
     # Firebase Configuration
     VITE_FIREBASE_API_KEY=your_api_key
     VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
     VITE_FIREBASE_DATABASE_URL=your_database_url
     VITE_FIREBASE_PROJECT_ID=your_project_id
     VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     VITE_FIREBASE_APP_ID=your_app_id
     
     # AI APIs
     VITE_GEMINI_API_KEY=your_gemini_api_key
     
     # Google Drive (for image upload)
     VITE_GOOGLE_DRIVE_CLIENT_ID=your_client_id.apps.googleusercontent.com
     VITE_GOOGLE_API_KEY=your_google_api_key
     ```
   - See [GOOGLE_DRIVE_SETUP.md](./documentation/GOOGLE_DRIVE_SETUP.md) for OAuth2 setup

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to `http://localhost:5173`

## 📁 Project Structure

### Storage Overview (as of Jan 21, 2026)

| Folder | Size | Purpose | Status |
|--------|------|---------|--------|
| `node_modules/` | 444 MB | NPM dependencies | ✅ Required |
| `functions/node_modules/` | 104 MB | Firebase Functions deps | ✅ Required |
| `documentation/` | 11 MB | Project docs | ⚠️ Contains bloat |
| `dist/` | 7 MB | Build output | 🗑️ Can delete |
| `src/` | 3 MB | Source code | ✅ Required |
| Root `.md` files | 0.5 MB | 65 files | ⚠️ Needs cleanup |

### Full Directory Structure

```
kahoot/                          # Root (577 MB total, 73,747 files)
│
├── src/                         # Source code (3 MB, 329 files)
│   ├── components/              # UI Components (924 KB, 98 files)
│   │   ├── questions/           # Question renderers (MCQ, Completion, etc.)
│   │   ├── quiz-creation/       # Quiz wizard steps
│   │   ├── modals/              # Dialog components
│   │   ├── modern/              # Modern UI (Card, Button)
│   │   ├── glass/               # Glassmorphic components
│   │   ├── wizard/              # Wizard section components
│   │   └── test/                # Test-related components
│   │
│   ├── services/                # External services (634 KB, 60 files)
│   │   ├── firebase.js          # Firebase config
│   │   ├── testStorage.ts       # Test CRUD operations
│   │   ├── listeningTestStorage.ts
│   │   ├── r2Storage.ts         # Cloudflare R2
│   │   ├── sessionService.ts    # Session management
│   │   └── navigation.service.ts
│   │
│   ├── pages/                   # Page components (540 KB, 38 files)
│   │   ├── StudentTestPage.tsx  # Student test interface
│   │   ├── TeacherQuizPage.jsx  # Teacher quiz control
│   │   ├── TeacherLobbyPage.jsx # Session lobby
│   │   ├── CreateQuizPage.jsx   # Quiz creation
│   │   ├── CreateTestPage.tsx   # Test creation
│   │   └── TestBuilderRouter.tsx
│   │
│   ├── skills/                  # Skill-specific modules (322 KB)
│   │   ├── reading/             # Reading test components
│   │   └── listening/           # Listening test components
│   │
│   ├── utils/                   # Utilities (206 KB, 28 files)
│   │   └── parsers/             # AI & text parsers
│   │
│   ├── hooks/                   # Custom hooks (121 KB, 22 files)
│   │   ├── test/                # Test-related hooks
│   │   └── useNavigation.ts
│   │
│   ├── drawing/                 # Drawing/annotation system (95 KB)
│   │   ├── core/                # Canvas engine
│   │   ├── tools/               # Drawing tools
│   │   └── components/          # Drawing UI
│   │
│   ├── types/                   # TypeScript definitions (23 KB)
│   ├── styles/                  # Design system (21 KB)
│   ├── store/                   # Zustand stores (19 KB)
│   ├── constants/               # Route constants (18 KB)
│   ├── config/                  # App configuration (15 KB)
│   ├── context/                 # React contexts (10 KB)
│   ├── core/                    # Core abstractions (8 KB)
│   └── __tests__/               # Unit tests (123 KB)
│
├── documentation/               # Project documentation (11 MB)
│   ├── SOP/                     # Standard Operating Procedures (33 files)
│   ├── tasks/                   # Task lists (30 files)
│   ├── architecture/            # Architecture docs (14 files)
│   ├── system/                  # System documentation (14 files)
│   ├── implementation/          # Implementation guides (7 files)
│   ├── backup/                  # Code backups (25 files)
│   ├── Screenshoot/             # Debug screenshots (15 files)
│   └── Listening demo_files/    # ⚠️ UNNECESSARY (5 MB)
│
├── functions/                   # Firebase Cloud Functions (104 MB)
│   ├── src/                     # Function source code
│   ├── lib/                     # Compiled output
│   └── node_modules/            # Function dependencies
│
├── tests/                       # E2E tests (Playwright)
├── scripts/                     # Utility scripts
├── public/                      # Static assets
├── cloudflare/                  # Cloudflare worker
│
├── dist/                        # 🗑️ Build output (can delete)
├── playwright-report/           # 🗑️ Test reports (can delete)
├── test-results/                # 🗑️ Test results (can delete)
│
└── [65 root .md files]          # ⚠️ Should move to documentation/
```

### Key Source Files

| File | Size | Purpose |
|------|------|---------|
| `src/pages/StudentTestPage.tsx` | 20 KB | Student test interface |
| `src/pages/TeacherQuizPage.jsx` | 38 KB | Teacher quiz control |
| `src/components/QuizEditor.jsx` | 28 KB | Quiz editing interface |
| `src/services/testStorage.ts` | 16 KB | Test CRUD operations |
| `src/utils/parsers/aiParser.js` | 15 KB | AI quiz parsing |

### 🗑️ Storage Cleanup Guide

**Estimated Savings: 25-30 MB** (excluding node_modules)

#### Safe to Delete Immediately:

| Item | Size | Reason |
|------|------|--------|
| `dist/` | 7 MB | Build output (regenerates on `npm run build`) |
| `playwright-report/` | 0.5 MB | Test reports (regenerates on test run) |
| `test-results/` | 0.01 MB | Test artifacts |
| `documentation/Listening demo_files/` | 5.3 MB | Downloaded demo files, not needed |
| `gemini-conversation-*.json` | 5.9 MB | AI conversation logs |
| `documentation/Screenshoot/debug*.txt` | 0.9 MB | Debug logs |
| `src/pages/StudentTestPage_backup.tsx` | 43 KB | Old backup file |

#### Root .md Files to Move to documentation/:

64 `.md` files at root (excluding README.md) should be moved to `documentation/archive/` or deleted:
- Session summaries: `SESSION-COMPLETE.md`, `FINAL-SESSION-SUMMARY.md`, etc.
- Debug files: `DEBUG_*.md`, `CRITICAL_*.md`
- Implementation notes: `*_SUMMARY.md`, `*_FIX*.md`

#### Cleanup Commands:

```powershell
# 1. Remove build artifacts
Remove-Item -Path .\dist -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path .\playwright-report -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path .\test-results -Recurse -Force -ErrorAction SilentlyContinue

# 2. Remove unnecessary documentation files
Remove-Item -Path ".\documentation\Listening demo_files" -Recurse -Force
Remove-Item -Path ".\documentation\Screenshoot\debug*.txt" -Force

# 3. Remove large JSON logs
Remove-Item -Path ".\gemini-conversation-*.json" -Force

# 4. Remove backup files
Remove-Item -Path ".\src\pages\StudentTestPage_backup.tsx" -Force

# 5. Move root .md files to archive (optional)
New-Item -ItemType Directory -Path ".\documentation\archive" -Force
Move-Item -Path ".\*.md" -Destination ".\documentation\archive\" -Exclude "README.md","CLAUDE.md"
```

## 📚 Documentation

Comprehensive documentation is available in the `/documentation` folder:

### System Documentation
- **[0010-multi-draft-and-image-systems.md](./documentation/system/0010-multi-draft-and-image-systems.md)** - Multi-draft management, Google Drive OAuth2, Groq AI fallback
- **[0009-quiz-editor-and-creation-system.md](./documentation/system/0009-quiz-editor-and-creation-system.md)** - Quiz editor and creation architecture
- **[0008-validation-and-question-rendering.md](./documentation/system/0008-validation-and-question-rendering.md)** - Validation and rendering system
- **[0001-system-overview.md](./documentation/system/0001-system-overview.md)** - Overall system architecture

### Standard Operating Procedures (SOPs)
- **[0023-november-11-2025-comprehensive-session.md](./documentation/SOP/0023-november-11-2025-comprehensive-session.md)** - Complete development session (Nov 11, 2025)
- **[0021-ui-enhancements-and-quiz-creation-improvements-nov-7-2025.md](./documentation/SOP/0021-ui-enhancements-and-quiz-creation-improvements-nov-7-2025.md)** - UI improvements (Nov 7, 2025)
- **[0020-matching-questions-answer-key-and-validation-fixes-nov-7-2025.md](./documentation/SOP/0020-matching-questions-answer-key-and-validation-fixes-nov-7-2025.md)** - Matching question fixes
- **[0019-ielts-matching-questions-and-display-fixes-nov-6-2025.md](./documentation/SOP/0019-ielts-matching-questions-and-display-fixes-nov-6-2025.md)** - IELTS question support

### Feature Documentation
- **[GOOGLE_DRIVE_SETUP.md](./documentation/GOOGLE_DRIVE_SETUP.md)** - Google Drive OAuth2 setup guide
- **[NEW_FEATURES_MULTI_DRAFT_AND_IMAGE_UPLOAD.md](./documentation/NEW_FEATURES_MULTI_DRAFT_AND_IMAGE_UPLOAD.md)** - Multi-draft and image upload features

## 🧪 Testing

Run tests with:

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# All tests
npm run test:all
Contributions are welcome! Please open an issue to discuss any proposed changes before submitting a pull request.