# PRD-0033: Teacher Lobby Page Refactor

> Status note, 2026-05-12: this PRD is a historical extraction/refactor source. Its original `useTeacherTests` data-loading requirement used `queryOptimizer.getAllTests()` because the refactor preserved old behavior. That loading model is now obsolete for normal teachers. Current Teacher Lobby materials loading is governed by `documentation/architecture/teacher-materials-listing-and-diagnostics.md`: normal My Content reads indexed `ownerId` + `createdBy`, Public Library reads indexed `isPublic`, and broad `getAllTests()` is reserved for super-admin/global inspection paths.

## 1. Introduction / Overview

The `TeacherLobbyPage.jsx` has grown to **2,035 lines** across 8+ PRDs (PRD-0018, 0022, 0027, 0028, 0029, etc.). It is a single-file monolith containing 25 `useState` hooks, 5 `useEffect` blocks, 12 event handlers, 3 card renderers, 3 modals, and ~1,000 lines of deeply nested JSX. Every feature change—no matter how small—risks breaking unrelated features because all domains (tests, quizzes, drafts, sessions, audio, modals) share the same scope.

This PRD defines a **structural decomposition refactor** that extracts reusable hooks, components, and utilities from `TeacherLobbyPage.jsx` while preserving 100% functional parity. No new features are added. No dependencies are changed (Mantine replacement is deferred to a separate PRD).

**Goal:** Reduce `TeacherLobbyPage.jsx` from ~2,035 lines to ~150–200 lines of composition-only code, with all business logic and rendering in dedicated, testable modules.

---

## 2. Goals

| # | Goal | Measurable Criterion |
|---|------|---------------------|
| G1 | Reduce page file size | `TeacherLobbyPage.jsx` ≤ 200 lines after refactor |
| G2 | Eliminate state coupling | No hook has more than 6 `useState` declarations |
| G3 | Enable reuse | At least 2 extracted hooks are importable by `AdminMaterialsPage.tsx` without modification |
| G4 | Add test coverage for logic | ≥ 3 new test files for extracted hooks covering filtering, ownership, and CRUD operations |
| G5 | Remove dead code | All unused state variables and unreferenced functions are deleted |
| G6 | Deprecate quiz system cleanly | Quiz code is moved to `src/deprecated/quiz/` and no longer imported by the page |

---

## 3. User Stories

- **As a developer**, I want to modify the THCS test card without worrying about breaking the session management logic, so that I can work on isolated concerns.
- **As a developer**, I want to write unit tests for test filtering logic without rendering the entire page, so that regressions are caught early.
- **As a developer**, I want to reuse the test-loading hook on the Admin Materials page, so that I don't duplicate data-fetching logic.
- **As a teacher**, I expect **zero visual or functional changes** after the refactor — the page must behave identically.

---

## 4. Functional Requirements

### 4.1 Dead Code Removal

| # | Requirement |
|---|-------------|
| FR-DC-1 | Remove `showTestTypeModal` / `setShowTestTypeModal` state (line 63). It is declared but never read or set anywhere in the file. |
| FR-DC-2 | Identify and remove any other unreferenced state variables or handlers during refactoring. Document each removal in commit messages. |

### 4.2 Quiz System Deprecation

| # | Requirement |
|---|-------------|
| FR-QD-1 | Create directory `src/deprecated/quiz/`. |
| FR-QD-2 | Move `renderQuizCard` function (lines 577–668) into `src/deprecated/quiz/QuizCardRenderer.jsx`. Export as a named export. |
| FR-QD-3 | Move `createMockQuiz` function (lines 368–392) into `src/deprecated/quiz/QuizActions.jsx`. |
| FR-QD-4 | Move quiz-specific handlers (`handleDelete` for quizzes at line 279, `handleEditQuiz` at line 336, `handleCloseEditModal` at line 341) into `src/deprecated/quiz/QuizActions.jsx`. |
| FR-QD-5 | Remove the `QuizEditor` import (line 10) and its modal rendering (lines 1878–1884) from `TeacherLobbyPage.jsx`. |
| FR-QD-6 | Remove the `quizzes` useState, `filteredQuizzes` useMemo, and all quiz-related state variables from `TeacherLobbyPage.jsx`. |
| FR-QD-7 | Remove the `isQuizModeEnabled` constant (line 27) from `TeacherLobbyPage.jsx`. |
| FR-QD-8 | Add a comment at the top of each deprecated file: `// DEPRECATED: Quiz mode code – moved from TeacherLobbyPage.jsx on [date]. See PRD-0033.` |
| FR-QD-9 | The `currentView` state variable (line 41, value `'test'`) can be checked: if the only remaining view is `'test'`, remove this state and the conditional logic that branches on it. Verify by searching for all `currentView` references. |

### 4.3 Custom Hook Extraction

All new hooks MUST be written in **TypeScript** (`.ts` files). The page file remains `.jsx`.

#### 4.3.1 `useTeacherTests` — `src/hooks/test/useTeacherTests.ts`

| # | Requirement |
|---|-------------|
| FR-HK-1 | Extract test loading logic (lines 182–248): initial `queryOptimizer.getAllTests()` fetch + Firebase `onValue` real-time subscription. |
| FR-HK-2 | Accept options: `{ realtime?: boolean; skipCache?: boolean }`. Default: `{ realtime: true, skipCache: false }`. |
| FR-HK-3 | Implement the `skipFirstCall` pattern (line 186) internally within the hook to avoid double-loading from Firebase `onValue`. |
| FR-HK-4 | Return: `{ tests: Test[], loading: boolean, refresh: () => void }`. |
| FR-HK-5 | Implement cleanup-safe subscriber pattern with `isSubscribed` flag (same pattern as lines 185, 198, 206). |
| FR-HK-6 | Handle Firebase permission-denied errors silently when user is logged out (lines 224–228). |
| FR-HK-7 | Call `queryOptimizer.invalidate('test', 'all')` only on actual real-time updates, not on the initial snapshot (line 222). |
| FR-HK-8 | Export TypeScript interface `Test` matching the data structure: `{ id: string; title?: string; testType?: string; metadata?: { title?: string; gradeLevel?: number; examType?: string; duration?: number }; questionCount?: number; isPublic?: boolean; ownerId?: string; createdBy?: string; isComplete?: boolean; missingAnswerCount?: number; skill?: string; type?: string; duration?: number; publishedAt?: number; createdAt?: number; updatedAt?: number; sourceDraftId?: string; _changelog?: Record<string, any>; ownerName?: string }`. |

#### 4.3.2 `useTeacherDrafts` — `src/hooks/thcs/useTeacherDrafts.ts`

| # | Requirement |
|---|-------------|
| FR-HK-9 | Extract draft loading logic (lines 250–277). |
| FR-HK-10 | Accept: `{ userId: string; enabled: boolean }`. The `enabled` flag replaces the `contentFilter !== 'drafts'` guard. |
| FR-HK-11 | Extract `handleDeleteDraft` (lines 306–320) into the hook as `deleteDraft(draftId: string): Promise<boolean>`. After successful deletion, remove the draft from internal state. |
| FR-HK-12 | Return: `{ drafts: ThcsDraft[], loading: boolean, error: string | null, deleteDraft: (id: string) => Promise<boolean> }`. |
| FR-HK-13 | Export TypeScript interface `ThcsDraft` matching: `{ id: string; metadata?: { title?: string; gradeLevel?: number; examType?: string; duration?: number }; status?: string; questionCount?: number; updatedAt?: Date | number; createdAt?: Date | number }`. |

#### 4.3.3 `useTestFilters` — `src/hooks/test/useTestFilters.ts`

| # | Requirement |
|---|-------------|
| FR-HK-14 | Extract `filterByOwnership` (lines 506–528) into the hook. |
| FR-HK-15 | Extract `filteredTests` useMemo logic (lines 539–575): ownership filter → search filter → type/grade/exam filters → sort by publishedAt in public mode. |
| FR-HK-16 | Accept params: `{ tests: Test[]; userId: string; userRole: string; contentFilter: 'my' \| 'public'; searchTerm: string; testTypeFilter: string; thcsGradeFilter: string; thcsExamTypeFilter: string }`. |
| FR-HK-17 | Return: `{ filteredTests: Test[] }`. |
| FR-HK-18 | This hook MUST be a pure computation — no side effects, no state. It receives all inputs as params and returns derived data. |

#### 4.3.4 `useSessionManager` — `src/hooks/session/useSessionManager.ts`

| # | Requirement |
|---|-------------|
| FR-HK-19 | Extract session data loading effect (lines 139–179). |
| FR-HK-20 | Extract class loading effect (lines 107–137). |
| FR-HK-21 | Extract `handleStartSession` (lines 394–438) and `confirmStartSession` (lines 440–503). |
| FR-HK-22 | Manage internal state for: `sessionData`, `sessionLoading`, `sessionError`, `classes`, `showClassModal`, `pendingSession`, `selectedClassId`, `selectedAudioMode`, `lastUsedAudioMode`, `showAudioModeError`, `examMode`. |
| FR-HK-23 | Accept params: `{ sessionCode: string \| undefined; userId: string; userRole: string; tests: Test[]; navigateTo: Function }`. The `tests` array is needed to look up `test.skill === 'Listening'` for audio mode detection. |
| FR-HK-24 | Return: `{ sessionCode, sessionData, sessionLoading, sessionError, classes, showClassModal, pendingSession, selectedClassId, selectedAudioMode, lastUsedAudioMode, showAudioModeError, examMode, isSessionActive: boolean, startSession: (testId: string, mode: 'test') => void, confirmSession: () => Promise<void>, cancelSession: () => void, setSelectedClassId, setSelectedAudioMode, setShowAudioModeError, setExamMode }`. |
| FR-HK-25 | Preserve the `localStorage` read/write for `lastUsedAudioMode` (lines 90–95, 456–459). |

#### 4.3.5 `useModalManager` — `src/hooks/useModalManager.ts`

| # | Requirement |
|---|-------------|
| FR-HK-26 | Consolidate modal state using `useReducer`. Manage the following modals: edit-test, edit-THCS-test, test-creation, homework-assign, use-as-is. |
| FR-HK-27 | Dispatch actions: `OPEN_EDIT_TEST(test)`, `CLOSE_EDIT_TEST`, `OPEN_EDIT_THCS_TEST(test)`, `CLOSE_EDIT_THCS_TEST`, `OPEN_TEST_CREATION`, `CLOSE_TEST_CREATION`, `OPEN_HW_DIALOG(test)`, `CLOSE_HW_DIALOG`, `OPEN_USE_AS_IS(test)`, `CLOSE_USE_AS_IS`. |
| FR-HK-28 | Return: `{ state: ModalState, dispatch: Dispatch<ModalAction>, openEditTest(test), closeEditTest(), openEditThcsTest(test), closeEditThcsTest(), openTestCreation(), closeTestCreation(), openHwDialog(test), closeHwDialog(), openUseAsIs(test), closeUseAsIs() }`. The named helper functions are convenience wrappers over dispatch. |
| FR-HK-29 | The reducer state shape: `{ editTest: { show: boolean; test: Test | null }; editThcsTest: { show: boolean; test: Test | null }; testCreation: { show: boolean }; hwDialog: { show: boolean; test: Test | null }; useAsIs: { show: boolean; test: Test | null } }`. |

### 4.4 Component Extraction

All new components MUST be written in **JSX** (`.jsx` files) with accompanying **CSS** files, matching the existing `src/components/modern/` pattern.

#### 4.4.1 `NativeSelect` — `src/components/modern/NativeSelect.jsx` + `NativeSelect.css`

| # | Requirement |
|---|-------------|
| FR-CP-1 | Create a reusable `<NativeSelect>` component that uses a native `<select>` element styled via CSS to match the `modern-input` design system. |
| FR-CP-2 | Props: `{ options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; placeholder?: string; size?: 'sm' \| 'md' \| 'lg'; variant?: 'default' \| 'glass'; className?: string; style?: React.CSSProperties; minWidth?: string }`. |
| FR-CP-3 | CSS must use the same design tokens as `Input.css`: font-family `'Inter', sans-serif`, font-size `0.9375rem`, background `rgba(255, 255, 255, 0.8)`, border `1px solid rgba(203, 213, 225, 0.4)`, border-radius `0.5rem`, transition `all 250ms cubic-bezier(0.4, 0, 0.2, 1)`. |
| FR-CP-4 | Focus state: background `rgba(255, 255, 255, 0.95)`, border-color `#8b5cf6`, box-shadow `0 0 0 3px rgba(139, 92, 246, 0.1), 0 4px 6px -1px rgba(0, 0, 0, 0.1)`. |
| FR-CP-5 | Include custom dropdown arrow SVG via `background-image` (matching the current inline SVG on line 1371). |
| FR-CP-6 | Export from `src/components/modern/index.js` alongside existing components. |

#### 4.4.2 `TestCard` — `src/components/modern/TestCard.jsx` + `TestCard.css`

| # | Requirement |
|---|-------------|
| FR-CP-7 | Extract the IELTS test card renderer (lines 860–1032) into a standalone component. |
| FR-CP-8 | Props: `{ test: Test; index: number; canEdit: boolean; isOwner: boolean; onEdit: (test) => void; onDelete: (test) => void; onStartTest: (testId: string) => void }`. |
| FR-CP-9 | Move inline badge styles into CSS classes: `.test-card-badge`, `.test-card-badge--purple`, `.test-card-badge--gray`, `.test-card-badge--green`, `.test-card-badge--warning`. |
| FR-CP-10 | Move SVG icons into a shared constant object or utility: `ICONS.edit`, `ICONS.delete`, `ICONS.play`, `ICONS.view`. Place in `src/components/modern/icons.js`. |
| FR-CP-11 | Handle the `isIncomplete` variant styling (dashed border, grayscale filter, disabled button) via CSS classes instead of inline styles. |

#### 4.4.3 `ThcsTestCard` — `src/components/modern/ThcsTestCard.jsx` + `ThcsTestCard.css`

| # | Requirement |
|---|-------------|
| FR-CP-12 | Extract the THCS test card renderer (lines 672–858) into a standalone component. |
| FR-CP-13 | Props: `{ test: Test; index: number; canEdit: boolean; isOwner: boolean; isPublicLibrary: boolean; onEdit: (test) => void; onDelete: (test) => void; onStartTest: (testId: string) => void; onUseAsIs: (test) => void; onClone: (test) => void; onAssignHw: (test) => void }`. |
| FR-CP-14 | Reuse `.test-card-badge` CSS classes from `TestCard.css` (shared file or import). |
| FR-CP-15 | The `onClone` handler receives the test object. The component renders the "Clone & Customize" button. The actual clone logic (dynamic import of `cloneFromPublicTest`, navigation) stays in the page or a dedicated handler passed as prop — the component does NOT import `thcsDraftService` directly. |

#### 4.4.4 `DraftCard` — `src/components/modern/DraftCard.jsx` + `DraftCard.css`

| # | Requirement |
|---|-------------|
| FR-CP-16 | Extract the draft card renderer (lines 1615–1739) into a standalone component. |
| FR-CP-17 | Props: `{ draft: ThcsDraft; index: number; onResume: (draftId: string) => void; onDelete: (draft: ThcsDraft) => void }`. |
| FR-CP-18 | The `timeAgo` calculation (lines 1617–1624) moves into the component as an internal utility (not exported). |
| FR-CP-19 | Reuse `.test-card-badge` CSS classes for the badge row. |

#### 4.4.5 `SearchFilterBar` — `src/components/modern/SearchFilterBar.jsx` + `SearchFilterBar.css`

| # | Requirement |
|---|-------------|
| FR-CP-20 | Extract the search + filter row (lines 1323–1504) into a standalone component. |
| FR-CP-21 | Props: `{ searchTerm: string; onSearchChange: (value: string) => void; contentFilter: 'my' \| 'public' \| 'drafts'; testTypeFilter: string; onTestTypeFilterChange: (value: string) => void; thcsGradeFilter: string; onThcsGradeFilterChange: (value: string) => void; thcsExamTypeFilter: string; onThcsExamTypeFilterChange: (value: string) => void; onCreateNew: () => void }`. |
| FR-CP-22 | The "Create New Test" button is rendered inside this component. The `onCreateNew` callback is provided by the page, which handles opening the TestCreationModal. The component does NOT manage modal state. |
| FR-CP-23 | Replace inline styled `<select>` elements with the new `<NativeSelect>` component (FR-CP-1). |
| FR-CP-24 | The filter dropdowns are conditionally shown only when `contentFilter === 'public'` (same logic as line 1351). |
| FR-CP-25 | The component is hidden when `contentFilter === 'drafts'` — the page handles this visibility, not the component. The parent simply does not render `<SearchFilterBar>` when drafts tab is active. |

#### 4.4.6 `ContentTabs` — `src/components/modern/ContentTabs.jsx` + `ContentTabs.css`

| # | Requirement |
|---|-------------|
| FR-CP-26 | Extract the tab strip (lines 1109–1145) into a standalone component. |
| FR-CP-27 | Props: `{ activeTab: 'my' \| 'public' \| 'drafts'; onTabChange: (tab: string) => void }`. |
| FR-CP-28 | Reuse the existing `<Button variant="primary" \| "glass">` pattern for tab styling. |

#### 4.4.7 `SessionBanner` — `src/components/SessionBanner.jsx` + `SessionBanner.css`

| # | Requirement |
|---|-------------|
| FR-CP-29 | Extract the session code banner (lines 1149–1230) and the active session alert (lines 1232–1321) into a single component. |
| FR-CP-30 | Props: `{ sessionCode: string; sessionData: any; onBackToSessions: () => void; onReturnToMonitor: () => void; onReturnToQuiz: () => void }`. |
| FR-CP-31 | The component handles both the "Session Code" display and the "In Progress / Ready" action banner. |

#### 4.4.8 `ClassSelectionModal` — `src/components/ClassSelectionModal.jsx`

| # | Requirement |
|---|-------------|
| FR-CP-32 | Extract the class selection modal (lines 1748–1875) into a standalone component. |
| FR-CP-33 | Props: `{ opened: boolean; onClose: () => void; onConfirm: () => void; classes: { value: string; label: string }[]; selectedClassId: string \| null; onClassChange: (id: string) => void; isListening: boolean; selectedAudioMode: string \| null; onAudioModeChange: (mode: string) => void; lastUsedAudioMode: string \| null; showAudioModeError: boolean; examMode: boolean; onExamModeChange: (checked: boolean) => void }`. |
| FR-CP-34 | This component continues to use Mantine `Modal` and `Select` — Mantine replacement is deferred (see Non-Goals). |

#### 4.4.9 `UseAsIsModal` — `src/components/UseAsIsModal.jsx`

| # | Requirement |
|---|-------------|
| FR-CP-35 | Extract the use-as-is confirmation modal (lines 1926–2028) into a standalone component. |
| FR-CP-36 | Props: `{ test: Test \| null; opened: boolean; onClose: () => void; onStartLiveSession: (test: Test) => void; onAssignHomework: (test: Test) => void }`. |
| FR-CP-37 | The Firestore `setDoc` for `thcs_linked_tests` (lines 1967–1982 and 1998–2013) is **duplicated**. Extract into a shared helper: `saveLinkedTestReference(userId: string, test: Test): Promise<void>` inside the component file or a utility. Call this helper from both `onStartLiveSession` and `onAssignHomework` before invoking the callback. |
| FR-CP-38 | This component continues to use Mantine `Modal` — Mantine replacement is deferred (see Non-Goals). |

#### 4.4.10 `icons.js` — `src/components/modern/icons.js`

| # | Requirement |
|---|-------------|
| FR-CP-39 | Create a shared SVG icon constants file exporting React elements for: `EditIcon`, `DeleteIcon`, `PlayIcon`, `ViewIcon`, `PlusIcon`, `ClockIcon`, `SearchIcon`, `BackArrowIcon`. |
| FR-CP-40 | Each icon accepts `{ size?: number; style?: object; className?: string }` props with defaults: `size=14`. |
| FR-CP-41 | All card components and the SearchFilterBar must import icons from this file instead of embedding inline SVGs. |

### 4.5 Test Actions Extraction

| # | Requirement |
|---|-------------|
| FR-TA-1 | Extract `handleDeleteTest` (lines 286–304) into `useTeacherTests` hook as `deleteTest(test: Test): Promise<void>`. |
| FR-TA-2 | Extract `handleTogglePublic` (lines 322–334) into `useTeacherTests` hook as `togglePublic(id: string, currentIsPublic: boolean, type?: string): Promise<void>`. |
| FR-TA-3 | Extract `handleEditTest` (lines 346–355) into the page-level composition. This function decides between THCS edit modal and IELTS edit modal — it should remain in the page as it depends on `useModalManager` dispatch. |

### 4.6 Final Page Composition

| # | Requirement |
|---|-------------|
| FR-PG-1 | `TeacherLobbyPage.jsx` must import and compose all extracted hooks and components. |
| FR-PG-2 | The page file must contain ZERO inline card rendering, ZERO inline modal JSX, and ZERO data-fetching effects. |
| FR-PG-3 | The page file should contain only: (a) hook invocations, (b) handler composition (wiring hook returns to component callbacks), (c) JSX composition of extracted components, (d) the top-level layout wrapper (`AppShell`, `TeacherHeader`, page background). |
| FR-PG-4 | State variables remaining at page level: `contentFilter`, `searchTerm`, `testTypeFilter`, `thcsGradeFilter`, `thcsExamTypeFilter`. These are UI state that drives the filters displayed by `SearchFilterBar`. |
| FR-PG-5 | The `handleEditTest` decision function (THCS vs IELTS routing) stays at the page level because it dispatches to `useModalManager`. |
| FR-PG-6 | The "Clone & Customize" handler stays at the page level — it does a dynamic `import('../services/thcsDraftService')` and navigates. It's passed as a callback to `ThcsTestCard`. |

### 4.7 Test Requirements

| # | Requirement |
|---|-------------|
| FR-TS-1 | Create `src/hooks/test/useTestFilters.test.ts` with tests for: ownership filtering (own content, public content, super_admin bypass, legacy content without ownerId), search filtering (case-insensitive, THCS metadata.title fallback), type/grade/exam type filtering, public library sort order. Minimum 10 test cases. |
| FR-TS-2 | Create `src/hooks/test/useTeacherTests.test.ts` with tests for: initial load, real-time update callback, cleanup on unmount, permission-denied silent handling. Minimum 5 test cases. Mock `queryOptimizer` and Firebase `onValue`. |
| FR-TS-3 | Create `src/hooks/thcs/useTeacherDrafts.test.ts` with tests for: successful load, error handling, delete success + state update, delete failure. Minimum 4 test cases. Mock `thcsDraftService`. |
| FR-TS-4 | Create `src/hooks/useModalManager.test.ts` with tests for: each open/close action, state isolation (opening modal A does not affect modal B), initial state is all closed. Minimum 6 test cases. |

---

## 5. Non-Goals (Out of Scope)

| # | Non-Goal | Rationale |
|---|----------|-----------|
| NG-1 | **Mantine component replacement** — `AppShell`, `Modal`, `Select` imports remain as-is | Separate axis of change. Mixing structural refactoring with dependency replacement creates impossible-to-debug regressions. Schedule a follow-up PRD. |
| NG-2 | **New features** — No new functionality, no UI changes | This is a pure structural refactor. Any visible behavior change is a bug. |
| NG-3 | **AdminMaterialsPage refactor** — That page keeps its current structure | Though hooks are designed for reuse by AdminMaterialsPage, actually integrating them there is a separate task. |
| NG-4 | **Converting `TeacherLobbyPage.jsx` to TypeScript** | The refactored page is ~150 lines of composition. Converting during refactor is a second axis of change. Can be done trivially in a follow-up. |
| NG-5 | **THCS library Firestore loading** — The `thcsLibraryTests` state and loading (lines 74–75) are present but appear unused in current rendering. Investigation needed during implementation — if confirmed unused, delete it. Do not add new functionality around it. |

---

## 6. Design Considerations

### 6.1 File Structure After Refactor

```
src/
├── components/
│   ├── modern/
│   │   ├── icons.js                    ← NEW: Shared SVG icon components
│   │   ├── NativeSelect.jsx + .css     ← NEW: Styled native <select>
│   │   ├── NativeSelect.css
│   │   ├── TestCard.jsx + .css         ← NEW: IELTS test card
│   │   ├── TestCard.css
│   │   ├── ThcsTestCard.jsx + .css     ← NEW: THCS test card
│   │   ├── ThcsTestCard.css
│   │   ├── DraftCard.jsx + .css        ← NEW: Draft card
│   │   ├── DraftCard.css
│   │   ├── SearchFilterBar.jsx + .css  ← NEW: Search + filter row
│   │   ├── SearchFilterBar.css
│   │   ├── ContentTabs.jsx + .css      ← NEW: Tab strip
│   │   ├── ContentTabs.css
│   │   ├── index.js                    ← UPDATED: Export NativeSelect
│   │   └── ... (existing: Card, Button, Input, etc.)
│   ├── SessionBanner.jsx + .css        ← NEW: Session code + status banner
│   ├── SessionBanner.css
│   ├── ClassSelectionModal.jsx         ← NEW: Class + audio + exam mode modal
│   └── UseAsIsModal.jsx               ← NEW: Use-as-is confirmation modal
├── deprecated/
│   └── quiz/
│       ├── QuizCardRenderer.jsx        ← MOVED from TeacherLobbyPage
│       └── QuizActions.jsx             ← MOVED from TeacherLobbyPage
├── hooks/
│   ├── test/
│   │   ├── useTeacherTests.ts          ← NEW: Test loading + CRUD
│   │   ├── useTeacherTests.test.ts     ← NEW: Tests
│   │   ├── useTestFilters.ts           ← NEW: Pure filtering logic
│   │   ├── useTestFilters.test.ts      ← NEW: Tests
│   │   └── ... (existing hooks)
│   ├── thcs/
│   │   ├── useTeacherDrafts.ts         ← NEW: Draft loading + CRUD
│   │   ├── useTeacherDrafts.test.ts    ← NEW: Tests
│   │   └── ... (existing hooks)
│   ├── session/
│   │   └── useSessionManager.ts        ← NEW: Session lifecycle
│   ├── useModalManager.ts              ← NEW: Modal state reducer
│   └── useModalManager.test.ts         ← NEW: Tests
└── pages/
    └── TeacherLobbyPage.jsx            ← REFACTORED: ~150-200 lines
```

### 6.2 Component-Hook Dependency Diagram

```
TeacherLobbyPage.jsx (compositor)
│
├── useTeacherTests({ realtime: true })
│   └── returns: { tests, loading, refresh, deleteTest, togglePublic }
│
├── useTeacherDrafts({ userId, enabled: contentFilter === 'drafts' })
│   └── returns: { drafts, loading, error, deleteDraft }
│
├── useTestFilters(tests, { userId, userRole, contentFilter, searchTerm, ... })
│   └── returns: { filteredTests }
│
├── useSessionManager({ sessionCode, userId, userRole, tests, navigateTo })
│   └── returns: { sessionData, classes, startSession, confirmSession, ... }
│
├── useModalManager()
│   └── returns: { state, openEditTest, closeEditTest, ... }
│
├── Renders:
│   ├── <TeacherHeader />
│   ├── <SessionBanner />              ← receives session props
│   ├── <ContentTabs />                ← receives contentFilter + setter
│   ├── <SearchFilterBar />            ← receives filter state + setters
│   ├── <TestCard /> (mapped)          ← receives test + callbacks
│   ├── <ThcsTestCard /> (mapped)      ← receives test + callbacks
│   ├── <DraftCard /> (mapped)         ← receives draft + callbacks
│   ├── <ClassSelectionModal />        ← receives session manager props
│   ├── <UseAsIsModal />               ← receives modal state + callbacks
│   ├── <TestEditor />                 ← receives modal state
│   ├── <THCSTestEditorModal />        ← receives modal state
│   ├── <TestCreationModal />          ← receives modal state
│   └── <THCSHomeworkAssignDialog />   ← receives modal state
```

### 6.3 CSS Shared Tokens

The following CSS custom properties should be added to `NativeSelect.css` and `TestCard.css`, referencing the same values used in `Input.css`:

```css
/* These are the canonical design tokens — do NOT hardcode the values in multiple files */
--modern-font-family: 'Inter', sans-serif;
--modern-font-size: 0.9375rem;
--modern-bg: rgba(255, 255, 255, 0.8);
--modern-bg-focus: rgba(255, 255, 255, 0.95);
--modern-border: 1px solid rgba(203, 213, 225, 0.4);
--modern-border-focus: #8b5cf6;
--modern-radius: 0.5rem;
--modern-shadow-focus: 0 0 0 3px rgba(139, 92, 246, 0.1), 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--modern-transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 7. Technical Considerations

### 7.1 Import Registration (Integration Safety Rule 15)

- All new `.jsx` component files are NEW files → Rule 15 applies. ZERO Mantine imports are allowed in these new files.
- Exception: `ClassSelectionModal.jsx` and `UseAsIsModal.jsx` use Mantine `Modal` and `Select` because they extract existing Mantine usage from TeacherLobbyPage. These are MOVED code, not new Mantine adoption. Document this exception with a comment: `// Rule 15 Exception: Mantine Modal/Select moved from TeacherLobbyPage.jsx — see PRD-0033 NG-1`.

### 7.2 ~~WebMCP Tool Registration (Integration Safety Rule 16)~~ — RETIRED

- Rule 16 was retired on 2026-03-14. WebMCP system fully removed from codebase. No action needed.

### 7.3 Route/Path Validation (Integration Safety Rule 1)

- No new `navigate()` calls are created. Existing navigation logic is moved to hooks/components unchanged. All existing routes are preserved.

### 7.4 Producer-Consumer Contract (Integration Safety Rule 17)

- `useTeacherTests` writes to the `tests` RTDB node via `deleteTest` and `togglePublic`. These are EXISTING write operations moved from the page. No new write paths are introduced.

### 7.5 Backup Coverage (Integration Safety Rule 12)

- No new RTDB nodes or Firestore collections are created.

### 7.6 Real-time Listener Safety

- `useTeacherTests` must implement the exact same `isSubscribed` + `skipFirstCall` pattern currently in lines 184–248. Do NOT simplify or "improve" this pattern — it was developed to avoid specific Firebase `onValue` edge cases.
- The cleanup function must call `unsubscribe()` unconditionally (same as line 246).

### 7.7 Duplicated Code in UseAsIsModal

- Lines 1967–1982 and 1998–2013 contain **identical** Firestore `setDoc` calls for saving a linked test reference. The extraction MUST deduplicate this into a single `saveLinkedTestReference()` helper function called by both buttons.

### 7.8 `currentView` State Cleanup

- After quiz removal, search for ALL references to `currentView` in the file. If the only remaining value is `'test'`, remove the state variable and all conditional branches that check it. The data loading effect (lines 192, 232–234) branches on `currentView === 'test'` — if quiz is removed, this branch is always true and can be simplified.

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| `TeacherLobbyPage.jsx` line count | ≤ 200 lines |
| New test files | ≥ 4 files, ≥ 25 total test cases |
| All existing tests pass | `npm test` exits 0 |
| Development server runs without errors | `npm run dev` produces no console errors |
| Visual parity | Screenshot comparison before/after shows zero pixel differences on: My Content tab, Public Library tab (with all filters expanded), Drafts tab, Class Selection Modal, Use-as-is Modal |
| Production build succeeds | `npm run build` exits 0 with no new warnings |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-1 | `thcsLibraryTests` state (line 74) and `thcsLibraryLoading` (line 75) are declared but appear unused in the JSX render. Confirm during implementation whether these are dead code or conditionally loaded elsewhere. If dead code, delete. | ⏳ Investigate during implementation |
| OQ-2 | The `createSession` API is called differently between TeacherLobbyPage (passes an object, line 486) and AdminMaterialsPage (passes positional args, line 215). Verify which is correct and flag if there's a latent bug. Do NOT fix this as part of the refactor — just document the finding. | ⏳ Investigate during implementation |
| OQ-3 | After quiz removal, verify that the test data loading effect (line 192 `if (currentView === 'test')`) can be simplified by removing the condition entirely. | ⏳ Verify during implementation |

---

## 10. Implementation Order

This is a **big-bang PR** — all changes land in a single commit. However, the implementer should follow this order to minimize confusion:

| Step | Action | Files Created/Modified |
|------|--------|----------------------|
| 1 | **Before anything: take a full-page screenshot** of My Content, Public Library (all filters), Drafts, and Class Selection Modal for visual comparison later. | — |
| 2 | **Create `icons.js`** — foundational shared dependency. No other file needs to change yet. | `src/components/modern/icons.js` |
| 3 | **Create `NativeSelect`** — foundational UI component. Test it in isolation by temporarily rendering it on the page. | `src/components/modern/NativeSelect.jsx`, `.css` |
| 4 | **Create hooks** in this order (each depends on the prior): `useModalManager` → `useTestFilters` → `useTeacherTests` → `useTeacherDrafts` → `useSessionManager`. | 5 new `.ts` files in `src/hooks/` |
| 5 | **Create card components** in this order: `TestCard` → `ThcsTestCard` → `DraftCard`. | 3 new `.jsx` + `.css` pairs |
| 6 | **Create remaining components**: `ContentTabs` → `SearchFilterBar` → `SessionBanner` → `ClassSelectionModal` → `UseAsIsModal`. | 5 new `.jsx` (+ `.css` where specified) |
| 7 | **Move quiz code** to `src/deprecated/quiz/`. | 2 new files, imports removed from page |
| 8 | **Rewrite `TeacherLobbyPage.jsx`** to compose hooks + components. | 1 file modified (major rewrite) |
| 9 | **Write tests** for hooks. | 4 new `.test.ts` files |
| 10 | **Run full verification**: `npm run dev` (no console errors), `npm test` (all pass), `npm run build` (succeeds), visual screenshot comparison. | — |
| 11 | **Update `src/components/modern/index.js`** to export `NativeSelect`. | 1 file modified |
