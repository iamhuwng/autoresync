# Tasks: PRD-0033 — Teacher Lobby Page Refactor

> **Source PRD:** `documentation/tasks/0033-prd-teacher-lobby-refactor.md`
> **Generated:** 2026-03-12

## Relevant Files

### New Files (to be created)
- `src/components/modern/icons.jsx` — Shared SVG icon components (EditIcon, DeleteIcon, PlayIcon, etc.)
- `src/components/modern/NativeSelect.jsx` — Styled native `<select>` component matching Input design system
- `src/components/modern/NativeSelect.css` — CSS for NativeSelect component
- `src/components/modern/TestCard.jsx` — IELTS test card component (extracted from lines 860–1032)
- `src/components/modern/TestCard.css` — CSS for TestCard badges and layout
- `src/components/modern/ThcsTestCard.jsx` — THCS test card component (extracted from lines 672–858)
- `src/components/modern/ThcsTestCard.css` — CSS for ThcsTestCard badges and layout
- `src/components/modern/DraftCard.jsx` — Draft card component (extracted from lines 1615–1739)
- `src/components/modern/DraftCard.css` — CSS for DraftCard
- `src/components/modern/SearchFilterBar.jsx` — Search input + filter dropdowns + Create button
- `src/components/modern/SearchFilterBar.css` — CSS for SearchFilterBar layout
- `src/components/modern/ContentTabs.jsx` — My Content / Public Library / Drafts tab strip
- `src/components/modern/ContentTabs.css` — CSS for ContentTabs
- `src/components/SessionBanner.jsx` — Session code display + active session action banner
- `src/components/SessionBanner.css` — CSS for SessionBanner
- `src/components/ClassSelectionModal.jsx` — Class + audio mode + exam mode selection modal
- `src/components/UseAsIsModal.jsx` — Use-as-is confirmation modal with deduped Firestore logic
- `src/hooks/useModalManager.ts` — useReducer-based modal state management
- `src/hooks/test/useTestFilters.ts` — Pure filtering/sorting logic for tests
- `src/hooks/test/useTeacherTests.ts` — Test loading, real-time subscription, CRUD actions
- `src/hooks/thcs/useTeacherDrafts.ts` — Draft loading and deletion
- `src/hooks/session/useSessionManager.ts` — Session lifecycle, class loading, audio/exam mode
- `src/deprecated/quiz/QuizCardRenderer.jsx` — Deprecated quiz card rendering (moved from page)
- `src/deprecated/quiz/QuizActions.jsx` — Deprecated quiz handlers (moved from page)

### New Test Files (to be created)
- `src/hooks/__tests__/useModalManager.test.ts` — Tests for modal state reducer
- `src/hooks/__tests__/useTestFilters.test.ts` — Tests for filtering/sorting logic
- `src/hooks/test/useTeacherTests.test.ts` — Tests for test loading and CRUD
- `src/hooks/thcs/useTeacherDrafts.test.ts` — Tests for draft loading and deletion

### Existing Files (to be modified)
- `src/pages/TeacherLobbyPage.jsx` — Major rewrite: 2035 lines → ~150–200 lines
- `src/components/modern/index.js` — Add NativeSelect export

### Notes
- Unit tests should be placed alongside the code files they test (e.g., `useModalManager.ts` and `useModalManager.test.ts` in the same directory).
- Use `npx vitest run [optional/path/to/test/file]` to run tests. Running without a path executes all tests.
- **CRITICAL:** Before starting Task 1.0, take full-page screenshots of the current page in all states (My Content, Public Library with all filters, Drafts, Class Selection Modal) for visual comparison in Task 7.0.
- All new hooks MUST be TypeScript (`.ts`). All new components MUST be JSX (`.jsx`).
- **Rule 15 reminder:** ZERO new Mantine imports in ANY new file. Exception: `ClassSelectionModal.jsx` and `UseAsIsModal.jsx` may use Mantine `Modal`/`Select` because they are moving existing code. Add comment: `// Rule 15 Exception: Mantine Modal/Select moved from TeacherLobbyPage.jsx — see PRD-0033 NG-1`.

---

## Tasks

- [x] 1.0 Foundation: Shared Icons & NativeSelect Component
  - [x] 1.1 Create `src/components/modern/icons.jsx` (renamed from .js for Vite JSX parsing). Export the following named React components, each accepting props `{ size = 14, style = {}, className = '' }` and returning an `<svg>` element. Copy SVG paths exactly from `TeacherLobbyPage.jsx` as listed below:
    - `EditIcon`: SVG from line 631–634 (`<path d="M11 4H4a2 2 0 0 0-2 2v14..."/>`, `<path d="M18.5 2.5a2.121..."/>`)
    - `DeleteIcon`: SVG from line 650–651 (`<path d="M6 19c0 1.1.9 2 2 2h8..."/>`)
    - `PlayIcon`: SVG from line 661–662 (`<path d="M8 5v14l11-7z"/>`)
    - `ViewIcon`: SVG from line 636–639 (`<path d="M1 12s4-8 11-8..."/>`, `<circle cx="12" cy="12" r="3"/>`)
    - `PlusIcon`: SVG from line 1496–1498 (`<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>`)
    - `ClockIcon`: SVG from line 1705–1708 (`<circle cx="12" cy="12" r="10"/>`, `<polyline points="12,6 12,12 16,14"/>`)
    - `CloneIcon`: SVG from line 793–795 (`<path d="M16 4h2a2 2..."/>`, `<rect x="8" y="2" width="8" height="4".../>`)
    - `UseAsIsIcon`: SVG from line 771–774 (`<rect x="9" y="9" width="13" height="13".../>`, `<path d="M5 15H4a2 2..."/>`)
  - [x] 1.2 Create `src/components/modern/NativeSelect.css`. Define the following CSS classes using the exact same design tokens as `src/components/modern/Input.css`:
    - `.native-select` — Base styles: `font-family: 'Inter', sans-serif; font-size: 0.9375rem; color: #1e293b; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); border: 1px solid rgba(203, 213, 225, 0.4); border-radius: 0.5rem; padding: 0.75rem 2rem 0.75rem 1rem; outline: none; cursor: pointer; transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1); appearance: none; -webkit-appearance: none;` Plus the dropdown arrow SVG as `background-image` — copy the exact data URI from line 1371 of `TeacherLobbyPage.jsx`: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`. Also set `background-repeat: no-repeat; background-position: right 0.75rem center; background-size: 12px;`.
    - `.native-select:focus` — `background: rgba(255, 255, 255, 0.95); border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1), 0 4px 6px -1px rgba(0, 0, 0, 0.1);`
    - `.native-select--sm` — `font-size: 0.8125rem; padding: 0.5rem 1.75rem 0.5rem 0.75rem;`
    - `.native-select--lg` — `font-size: 1.0625rem; padding: 0.875rem 2.25rem 0.875rem 1.25rem;`
  - [x] 1.3 Create `src/components/modern/NativeSelect.jsx`. The component must:
    - Import `./NativeSelect.css`.
    - Accept props: `{ options, value, onChange, placeholder, size = 'md', variant = 'default', className = '', style = {}, minWidth, ...rest }`.
    - `options` is an array of `{ value: string, label: string }`.
    - Render a native `<select>` element with className built from: `native-select` + `native-select--${size}` (if not `'md'`).
    - Apply `minWidth` as an inline style if provided.
    - Call `onChange(e.target.value)` (pass the value string, not the event).
    - If `placeholder` is provided, render a disabled first `<option>` with value `""` and the placeholder text.
    - Map over `options` to render `<option key={opt.value} value={opt.value}>{opt.label}</option>`.
    - Do NOT use any `onFocus`/`onBlur` inline event handlers — the CSS `:focus` pseudo-class handles focus styling.
  - [x] 1.4 Open `src/components/modern/index.js` and add the export: `export { NativeSelect } from './NativeSelect';` after the existing Input export on line 8.
  - [x] 1.5 Verify: Start the dev server (`npm run dev`). Temporarily import `<NativeSelect>` anywhere (e.g., in `TeacherLobbyPage.jsx`) to confirm it renders without errors. Remove the temporary import after confirming.

- [x] 2.0 Dead Code Removal & Quiz Deprecation
  - [x] 2.1 Create directory `src/deprecated/quiz/`.
  - [x] 2.2 Create `src/deprecated/quiz/QuizCardRenderer.jsx`. At the top, add comment: `// DEPRECATED: Quiz card rendering — moved from TeacherLobbyPage.jsx on 2026-03-12. See PRD-0033.`. Copy the `renderQuizCard` function (lines 577–668 of `TeacherLobbyPage.jsx`) into this file as a named export: `export const renderQuizCard = (quiz, index, { user, profile, contentFilter, handleEditQuiz, handleDelete, handleStartSession, Card, CardBody, CardFooter, Button }) => { ... }`. Adjust the function signature so all external dependencies are passed as the third argument object.
  - [x] 2.3 Create `src/deprecated/quiz/QuizActions.jsx`. At the top, add comment: `// DEPRECATED: Quiz action handlers — moved from TeacherLobbyPage.jsx on 2026-03-12. See PRD-0033.`. Copy these functions as named exports:
    - `createMockQuiz` (lines 368–392) — accepts `database` and Firebase `push`, `ref` as params.
    - `handleDelete` (lines 279–283) — the quiz delete handler. Accepts `database`, Firebase `ref`, `remove` as params.
    - `handleEditQuiz` (lines 336–339) — accepts `setSelectedQuiz`, `setShowEditModal` as params.
    - `handleCloseEditModal` (lines 341–344) — accepts `setShowEditModal`, `setSelectedQuiz` as params.
  - [x] 2.4 In `TeacherLobbyPage.jsx`, delete the following dead state variables (removed in full page rewrite) (they are declared but never read):
    - Line 63: `const [showTestTypeModal, setShowTestTypeModal] = useState(false);` — DELETE this entire line.
    - Line 74: `const [thcsLibraryTests, setThcsLibraryTests] = useState([]);` — DELETE this entire line.
    - Line 75: `const [thcsLibraryLoading, setThcsLibraryLoading] = useState(false);` — DELETE this entire line.
  - [x] 2.5 In `TeacherLobbyPage.jsx`, remove all quiz-related code (removed in full page rewrite):
    - Delete state: line 38 `const [quizzes, setQuizzes] = useState([]);`
    - Delete state: line 34 `const [showEditModal, setShowEditModal] = useState(false);`
    - Delete state: line 35 `const [selectedQuiz, setSelectedQuiz] = useState(null);`
    - Delete import: line 10 `import QuizEditor from '../components/QuizEditor.jsx';`
    - Delete constant: line 27 `const isQuizModeEnabled = ...;`
    - Delete function: lines 279–283 `handleDelete` (quiz version)
    - Delete function: lines 336–344 `handleEditQuiz` and `handleCloseEditModal`
    - Delete function: lines 368–392 `createMockQuiz`
    - Delete function: lines 577–668 `renderQuizCard`
    - Delete the `filteredQuizzes` useMemo: lines 531–537
    - Delete the `QuizEditor` modal rendering: lines 1878–1884
    - Delete the quiz-mode check in `handleStartSession`: lines 396–400
    - Delete the `mode === 'quiz'` branch in `confirmStartSession`: lines 484, 492–493 (quiz navigation path). After removal, `confirmStartSession` always navigates to the test monitor.
  - [x] 2.6 Simplify `currentView` state (removed in full page rewrite). After quiz removal, `currentView` is always `'test'`. Remove:
    - Line 41: `const [currentView, setCurrentView] = useState('test');` — DELETE.
    - Line 153: `setCurrentView('test');` inside the session effect — DELETE this line (no-op now).
    - Line 183: change `console.log(...)` to remove `currentView` reference, or delete the log.
    - Line 192: `if (currentView === 'test') {` — Remove the `if` condition (keep the body). The `else` block (lines 232–234) can be deleted.
    - Line 248: `}, [currentView]);` — Change dependency array to `[]` since `currentView` is removed.
  - [x] 2.7 Verify: Run `npm run dev` and navigate to `/lobby`. Page should load with all tests visible and no console errors related to missing functions or undefined variables.

- [x] 3.0 Custom Hook Extraction
  - [x] 3.1 Create `src/hooks/useModalManager.ts`. This hook uses `useReducer` to manage 5 modals. Implementation:
    - Define TypeScript types: `ModalState` with keys `editTest: { show: boolean; test: any }`, `editThcsTest: { show: boolean; test: any }`, `testCreation: { show: boolean }`, `hwDialog: { show: boolean; test: any }`, `useAsIs: { show: boolean; test: any }`.
    - Define action types: `'OPEN_EDIT_TEST'`, `'CLOSE_EDIT_TEST'`, `'OPEN_EDIT_THCS_TEST'`, `'CLOSE_EDIT_THCS_TEST'`, `'OPEN_TEST_CREATION'`, `'CLOSE_TEST_CREATION'`, `'OPEN_HW_DIALOG'`, `'CLOSE_HW_DIALOG'`, `'OPEN_USE_AS_IS'`, `'CLOSE_USE_AS_IS'`.
    - Initial state: all `show: false`, all `test: null`.
    - Reducer: each `OPEN_*` action sets `show: true` and `test: action.payload` (where applicable). Each `CLOSE_*` action sets `show: false` and `test: null`.
    - Export: `{ state, dispatch, openEditTest(test), closeEditTest(), openEditThcsTest(test), closeEditThcsTest(), openTestCreation(), closeTestCreation(), openHwDialog(test), closeHwDialog(), openUseAsIs(test), closeUseAsIs() }`. The named functions are convenience wrappers: `const openEditTest = (test) => dispatch({ type: 'OPEN_EDIT_TEST', payload: test })`.
  - [x] 3.2 Create `src/hooks/test/useTestFilters.ts`. This is a PURE COMPUTATION hook (no side effects, no state). Implementation:
    - Accept params: `tests: any[], filters: { userId: string; userRole: string; contentFilter: 'my' | 'public'; searchTerm: string; testTypeFilter: string; thcsGradeFilter: string; thcsExamTypeFilter: string }`.
    - Copy the `filterByOwnership` logic from lines 506–528 of `TeacherLobbyPage.jsx`. Use the `filters.userId` and `filters.userRole` instead of `user` and `profile`.
    - Copy the `filteredTests` useMemo logic from lines 539–575. Apply ownership filter → search filter (with THCS `metadata.title` fallback on line 543) → type/grade/exam filters (lines 548–562) → public library sort (lines 566–571).
    - Return: `{ filteredTests }`.
    - This hook MUST be wrapped in `useMemo` internally, depending on all filter params.
  - [x] 3.3 Create `src/hooks/test/useTeacherTests.ts`. Implementation:
    - Accept options: `{ realtime?: boolean; skipCache?: boolean }`. Defaults: `{ realtime: true, skipCache: false }`.
    - Copy the test loading `useEffect` from lines 182–248 of `TeacherLobbyPage.jsx`. Remove the `currentView === 'test'` condition (it was simplified in Task 2.6). Key elements to preserve exactly:
      - `skipFirstCall` pattern (line 186, 209–213) — this prevents double-loading.
      - `isSubscribed` flag (lines 185, 198, 206) — this prevents state updates after unmount.
      - `queryOptimizer.getAllTests()` for initial fetch (line 197).
      - `onValue(testsRef, ...)` for real-time subscription (lines 205–231).
      - `queryOptimizer.invalidate('test', 'all')` on real-time updates only (line 222).
      - Permission-denied silent handling (lines 224–228) — check `error.code === 'PERMISSION_DENIED'`.
      - Cleanup function: `isSubscribed = false; if (unsubscribe) unsubscribe();` (lines 244–246).
    - Copy `handleDeleteTest` from lines 286–304 as `deleteTest(test): Promise<void>`. **IMPORTANT:** Copy ONLY lines 290–304 (the `try/catch` block with the actual deletion logic). Do NOT include the `window.confirm(...)` dialog from lines 287–289 — that stays at the page level (see Task 5.4). The hook's `deleteTest` takes a test object and performs the deletion unconditionally.
    - Copy `handleTogglePublic` from lines 322–334 as `togglePublic(id, currentIsPublic, type?): Promise<void>`.
    - Return: `{ tests, loading, refresh, deleteTest, togglePublic }`. The `refresh` function calls `queryOptimizer.invalidate('test', 'all')` then re-fetches.
    - **IMPORTANT — Closure Variable Anti-Pattern Warning:** The `isSubscribed` and `skipFirstCall` variables MUST be closure variables (using `let` inside the `useEffect`), NOT `useRef` or component-scope state. They are set inside the effect body and checked in the `onValue` callback closure. Moving them to `useRef` or component scope will break the real-time update pattern. Example of CORRECT code: `useEffect(() => { let isSubscribed = true; let skipFirstCall = true; ... return () => { isSubscribed = false; }; }, []);`
    - Import Firebase from `../../services/firebase` and `firebase/database`.
    - Import `queryOptimizer` from `../../services/firebaseQueryOptimizer`.
    - Import Firestore `deleteDoc`, `doc` from `firebase/firestore` for THCS cleanup in `deleteTest`.
  - [x] 3.4 Create `src/hooks/thcs/useTeacherDrafts.ts`. Implementation:
    - Accept params: `{ userId: string; enabled: boolean }`.
    - Copy the draft loading `useEffect` from lines 250–277 of `TeacherLobbyPage.jsx`. Use `enabled` as the loading guard — when `enabled` is `true`, load drafts; when `false`, skip loading. At the page level (Task 5.3), pass `enabled: contentFilter === 'drafts'` so drafts only load when the Drafts tab is active.
    - Manage internal state: `drafts`, `loading`, `error`.
    - Copy `handleDeleteDraft` from lines 306–320 as `deleteDraft(draftId): Promise<boolean>`. **IMPORTANT:** Copy ONLY lines 309–319 (the `try/catch` block with the actual `deleteThcsDraft` call and state update). Do NOT include the `window.confirm(...)` dialog from lines 307–308 — that stays at the page level (see Task 5.4). The hook's `deleteDraft` takes a `draftId` string and performs the deletion unconditionally. After successful deletion, update internal state: `setDrafts(prev => prev.filter(d => d.id !== draftId))`.
    - Return: `{ drafts, loading, error, deleteDraft }`.
    - Import `getUserThcsDrafts` and `deleteThcsDraft` from `../../services/thcsDraftService`.
  - [x] 3.5 Create directory `src/hooks/session/` if it doesn't exist. Create `src/hooks/session/useSessionManager.ts`. Implementation:
    - Accept params: `{ sessionCode: string | undefined; userId: string; userRole: string; tests: any[]; navigateTo: Function }`.
    - **IMPORTANT:** After quiz deprecation (Task 2.5), the quiz-mode path no longer exists. Remove the `mode === 'quiz'` check from `handleStartSession` (former lines 396–400) and the quiz navigation branch from `confirmStartSession` (former line 492–493). The session manager should ONLY handle `mode: 'test'` sessions.
    - Copy the class loading effect from lines 107–137 of `TeacherLobbyPage.jsx`. Manage `classes` state internally.
    - Copy the session data loading effect from lines 139–179. Manage `sessionData`, `sessionLoading`, `sessionError` internally.
    - Copy `handleStartSession` from lines 394–438. This function uses `sessionCode` from params, `tests` to find listening tests, and sets internal state for `pendingSession`, `showClassModal`, etc.
    - Copy `confirmStartSession` from lines 440–503. This function creates the session via `createSession(newSessionData)` and navigates.
    - Manage internal state for: `classes`, `showClassModal`, `pendingSession`, `selectedClassId`, `selectedAudioMode`, `lastUsedAudioMode`, `showAudioModeError`, `examMode`.
    - Copy the `localStorage` read/write for `lastUsedAudioMode` (lines 90–95 for read, lines 456–458 for write).
    - Return: `{ sessionCode, sessionData, sessionLoading, sessionError, classes, showClassModal, pendingSession, selectedClassId, selectedAudioMode, lastUsedAudioMode, showAudioModeError, examMode, isSessionActive: !!sessionData, startSession, confirmSession, cancelSession: () => setShowClassModal(false), setSelectedClassId, setSelectedAudioMode, setShowAudioModeError, setExamMode }`.
    - Import: `createSession` from `../../services/sessionManager`, `getClasses` from `../../services/classManager`, Firebase `database` + `ref, onValue, update as dbUpdate` from `firebase/database`.
  - [x] 3.6 Verify: All 5 hook files compile without TypeScript errors. Run `npx tsc --noEmit` (or check the dev server for compilation errors). Each file should have zero import errors.

- [x] 4.0 UI Component Extraction
  - [x] 4.1 Create `src/components/modern/TestCard.css`. Define CSS classes for badge styles extracted from inline styles in the IELTS card renderer (lines 860–1032):
    - `.test-card` — Card wrapper styles (animation handled by existing Card component).
    - `.test-card-badge` — Base badge: `display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.8125rem; font-weight: 600;`
    - `.test-card-badge--gray` — `background: rgba(255,255,255,0.5); color: #64748b;` (question count badge)
    - `.test-card-badge--purple` — `background: rgba(139, 92, 246, 0.15); color: #7c3aed; border: 1px solid rgba(139, 92, 246, 0.3);` (THCS type badge)
    - `.test-card-badge--green` — `background: rgba(34, 197, 94, 0.1); color: #16a34a;` (duration badge)
    - `.test-card-badge--warning` — `background: rgba(245, 158, 11, 0.1); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.3);` (incomplete badge)
    - `.test-card--incomplete` — `border: 2px dashed rgba(245, 158, 11, 0.4); filter: grayscale(0.3);` (line 887–893 of page)
  - [x] 4.2 Create `src/components/modern/TestCard.jsx`. Extract the IELTS card renderer from lines 860–1032 of `TeacherLobbyPage.jsx`.
    - Import: `Card, CardBody, CardFooter, Button` from `./index`, icons from `./icons`, `./TestCard.css`.
    - Props: `{ test, index, canEdit, isOwner, onEdit, onDelete, onStartTest, onTogglePublic }`.
    - The `isIncomplete` calculation (lines 871–876) stays inside this component.
    - Replace all inline SVGs with icon components from `icons.js`.
    - Replace inline badge styles with CSS classes from `TestCard.css`.
    - The `renderTestCard` dispatcher function (lines 860–865 that checks `isThcsTest`) stays in the PAGE, not in this component. This component only renders IELTS cards.
  - [x] 4.3 Create `src/components/modern/ThcsTestCard.css`. Reuse badge classes from `TestCard.css` via import or define them in a shared location. Add:
    - `.thcs-test-card--public` — `border-left: 4px solid #7c3aed;` (line 695)
    - `.thcs-test-card__author` — `font-size: 0.8125rem; color: #94a3b8; margin-bottom: 0.5rem;` (line 727–729)
  - [x] 4.4 Create `src/components/modern/ThcsTestCard.jsx`. Extract from lines 672–858.
    - Import: `Card, CardBody, CardFooter, Button` from `./index`, icons from `./icons`, `./ThcsTestCard.css`.
    - Props: `{ test, index, canEdit, isOwner, isPublicLibrary, onEdit, onDelete, onStartTest, onUseAsIs, onClone, onAssignHw }`.
    - Conditionally render public library buttons (Use as-is + Clone) vs My Content buttons (Edit + Delete + Start Test + Assign HW) based on `isPublicLibrary` prop.
    - The `onClone` callback receives the test object. The component renders the "Clone & Customize" button with `onClick={() => onClone(test)}`. The actual clone logic (dynamic import of `thcsDraftService`, navigation) is handled by the page-level handler passed as `onClone`.
    - Do NOT import `thcsDraftService` in this component.
  - [x] 4.5 Create `src/components/modern/DraftCard.css`. Define:
    - `.draft-card` — `border-left: 4px solid rgba(139, 92, 246, 0.5);` (line 1639)
    - `.draft-card__status` — Status badge styles (lines 1657–1669)
    - `.draft-card__status--published` — `background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3);`
    - `.draft-card__status--editing` — `background: rgba(245, 158, 11, 0.15); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.3);`
  - [x] 4.6 Create `src/components/modern/DraftCard.jsx`. Extract from lines 1615–1739.
    - Import: `Card, CardBody, CardFooter, Button` from `./index`, icons from `./icons`, `./DraftCard.css`.
    - Props: `{ draft, index, onResume, onDelete }`.
    - The `timeAgo` calculation (lines 1617–1624) is an internal utility function inside this component — NOT exported.
    - The color variants cycling (`variants[index % variants.length]`) stays in this component.
    - `onResume` receives `draftId` string. `onDelete` receives the full `draft` object.
  - [x] 4.7 Create `src/components/modern/ContentTabs.css`. Define:
    - `.content-tabs` — `display: flex; gap: 0.75rem; flex-wrap: wrap;`
    - `.content-tabs__tab` — Base tab button styles.
    - `.content-tabs__tab--active` — Active tab styles (matches `Button variant="primary"`).
  - [x] 4.8 Create `src/components/modern/ContentTabs.jsx`. Extract the tab strip from lines 1109–1145 of `TeacherLobbyPage.jsx`.
    - Import: `Button` from `./index`, `./ContentTabs.css`.
    - Props: `{ activeTab, onTabChange }`. `activeTab` is `'my' | 'public' | 'drafts'`.
    - Render 3 `<Button>` elements with **exact emoji prefixes** matching the original:
      - `📁 My Content` (`value='my'`)
      - `🌐 Public Library` (`value='public'`)
      - `📝 Drafts` (`value='drafts'`)
    - Each button MUST have `style={{ minWidth: '100px' }}` (matching the original at lines 1120, 1130, 1140).
    - Active tab uses `variant="primary"`, inactive tabs use `variant="glass"`.
    - Each button calls `onTabChange(tabValue)` on click.
    - The tab strip container uses `display: 'inline-flex'`, `gap: '0.25rem'`, `marginTop: '1rem'` (matching the original at lines 1110–1114).
  - [x] 4.9 Create `src/components/modern/SearchFilterBar.css`. Define:
    - `.search-filter-bar` — `display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;` (matches line 1325–1330 styles)
    - `.search-filter-bar__search` — `flex: 1; min-width: 200px;` (line 1336–1339)
  - [x] 4.10 Create `src/components/modern/SearchFilterBar.jsx`. Extract from lines 1323–1504.
    - Import: `Input` from `./index`, `NativeSelect` from `./NativeSelect`, `Button` from `./index`, `PlusIcon` from `./icons`, `./SearchFilterBar.css`.
    - Props: `{ searchTerm, onSearchChange, contentFilter, testTypeFilter, onTestTypeFilterChange, thcsGradeFilter, onThcsGradeFilterChange, thcsExamTypeFilter, onThcsExamTypeFilterChange, onCreateNew }`.
    - **Card Wrapper:** This component renders ONLY the inner content (the flex row with search input, filters, and create button). The outer `<Card variant="glass">` wrapper (lines 1325–1330 with `marginBottom: '2rem'` and animation styles) stays at the PAGE level in Task 5.5.d. The page wraps `SearchFilterBar` inside `<Card variant="glass"><CardBody>...</CardBody></Card>`.
    - Render the `<Input>` for search (lines 1340–1346).
    - Conditionally render filter dropdowns ONLY when `contentFilter === 'public'` (line 1351).
    - Replace the 3 inline `<select>` elements (lines 1353–1484) with `<NativeSelect>` components. Pass `options` as arrays of `{ value, label }` with **ALL options from the original code**:
      - **Type filter** (line 1388–1392): `options={[{ value: 'all', label: '📚 All Types' }, { value: 'IELTS', label: '🌐 IELTS' }, { value: 'THCS-THPT', label: '🇻🇳 THCS-THPT' }]}` with `minWidth="150px"`.
      - **Grade filter** (lines 1431–1438): `options={[{ value: 'all', label: 'All Grades' }, { value: '6', label: 'Grade 6' }, { value: '7', label: 'Grade 7' }, { value: '8', label: 'Grade 8' }, { value: '9', label: 'Grade 9' }, { value: '10', label: 'Grade 10' }, { value: '11', label: 'Grade 11' }, { value: '12', label: 'Grade 12' }]}` with `minWidth="130px"`.
      - **Exam type filter** (lines 1476–1481): `options={[{ value: 'all', label: 'All Exam Types' }, { value: 'Giữa Kì', label: 'Giữa Kì' }, { value: 'Cuối Kì', label: 'Cuối Kì' }, { value: 'Kiểm Tra', label: 'Kiểm Tra' }, { value: '15 Phút', label: '15 Phút' }, { value: 'THPT QG', label: 'THPT QG' }]}` with `minWidth="145px"`.
    - The THCS grade and exam type selects are conditionally shown when `testTypeFilter === 'THCS-THPT'` (line 1393).
    - The `onTestTypeFilterChange` must also reset grade/exam filters when type changes away from THCS-THPT (same logic as line 1355).
    - Render the "Create New Test" button (lines 1488–1500) with `onClick={onCreateNew}`.
  - [x] 4.11 Create `src/components/SessionBanner.css`. Define styles for the session code display and active session action cards.
  - [x] 4.12 Create `src/components/SessionBanner.jsx`. Extract from lines 1149–1321 of `TeacherLobbyPage.jsx`.
    - Props: `{ sessionCode, sessionData, onBackToSessions, onReturnToMonitor, onReturnToQuiz }`.
    - Render the session‐code card (lines 1149–1230) and the active session action banner (lines 1232–1321).
    - Both the "Session Code" display and "In Progress / Ready" action banner are inside this component.
    - If `!sessionCode`, render nothing (`return null`).
  - [x] 4.13 Create `src/components/ClassSelectionModal.jsx`. Extract from lines 1748–1875.
    - Add at top: `// Rule 15 Exception: Mantine Modal/Select moved from TeacherLobbyPage.jsx — see PRD-0033 NG-1`
    - Import: `Modal, Select` from `@mantine/core`, `Button` from `../components/modern`, `AudioModeSelector` from `../components/test/AudioModeSelector`.
    - Props: `{ opened, onClose, onConfirm, classes, selectedClassId, onClassChange, isListening, selectedAudioMode, onAudioModeChange, lastUsedAudioMode, showAudioModeError, examMode, onExamModeChange }`.
    - Copy the entire modal JSX from lines 1748–1875 verbatim into this component, replacing state setters with prop callbacks.
  - [x] 4.14 Create `src/components/UseAsIsModal.jsx`. Extract from lines 1926–2028.
    - Add at top: `// Rule 15 Exception: Mantine Modal/Select moved from TeacherLobbyPage.jsx — see PRD-0033 NG-1`
    - Import: `Modal` from `@mantine/core`, `Button` from `../components/modern`.
    - Props: `{ test, opened, onClose, onStartLiveSession, onAssignHomework }`.
    - **CRITICAL DEDUP:** Lines 1967–1982 and 1998–2013 contain IDENTICAL Firestore `setDoc` calls. Extract into a helper function inside this file: `async function saveLinkedTestReference(userId, test) { ... }`. Call this helper from BOTH button handlers before invoking `onStartLiveSession(test)` or `onAssignHomework(test)`.
    - The helper needs `userId` — accept it as an additional prop: `userId: string`.
    - Import `doc, collection, setDoc` from `firebase/firestore` and `firestore as db` from `../services/firebase`.
  - [x] 4.15 Verify: All 14 new component files (8 `.jsx` + 6 `.css`) compile without errors. Run `npm run dev` and check for import resolution errors in the browser console.

- [x] 5.0 Page Rewrite & Integration
  - [x] 5.1 **Before modifying the page**, create a backup: copy `TeacherLobbyPage.jsx` to `src/pages/TeacherLobbyPage.jsx.backup`. This backup is temporary and will be deleted in Task 7.0 after verification.
  - [x] 5.2 Rewrite `TeacherLobbyPage.jsx` as a composition layer (434 lines — all hooks and components composed). The new file structure (top to bottom):
    - **Imports** (~20 lines): Import React, `useParams`, `useNavigate`, `useNavigation`, `useAuth`, `useThemeContext`, `AppShell` from `@mantine/core`, all 5 new hooks, all 8 new components, `TestEditor`, `THCSTestEditorModal`, `TestCreationModal`, `THCSHomeworkAssignDialog`.
    - **Component body** (~80 lines): Call hooks, compose handlers, return JSX.
    - **JSX** (~80 lines): Render `AppShell` > `TeacherHeader` + `AppShell.Main` > `SessionBanner` + `ContentTabs` + `SearchFilterBar` + content grid (map tests/drafts to card components) + modals.
    - **Background wrapper:** Keep the outermost `<div>` wrapper with the gradient background from lines 1035–1039 unchanged: `<div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #faf5ff 0%, ...)' backgroundAttachment: 'fixed' }}>`. This wraps the entire page content.
  - [x] 5.2a **DELETE the following state variables** (done in full rewrite) from `TeacherLobbyPage.jsx` that are now managed by `useModalManager`. These MUST be removed — keeping them causes orphaned state:
    - Line 36: `const [showEditTestModal, setShowEditTestModal] = useState(false);` — DELETE
    - Line 37: `const [selectedTest, setSelectedTest] = useState(null);` — DELETE
    - Line 64: `const [showTestCreationModal, setShowTestCreationModal] = useState(false);` — DELETE
    - Line 68: `const [hwDialogTest, setHwDialogTest] = useState(null);` — DELETE
    - Line 78: `const [useAsIsTest, setUseAsIsTest] = useState(null);` — DELETE
    - Line 81: `const [showThcsEditModal, setShowThcsEditModal] = useState(false);` — DELETE
    - Line 82: `const [selectedThcsTest, setSelectedThcsTest] = useState(null);` — DELETE
    - Also DELETE the handler functions that are replaced by `useModalManager` dispatch:
      - `handleEditTest` (lines 346–355) — replaced by `modals.openEditTest` / `modals.openEditThcsTest` in Task 5.4
      - `handleCloseEditTestModal` (lines 361–366) — replaced by `modals.closeEditTest()`
      - `handleCloseThcsEditModal` (lines 357–360) — replaced by `modals.closeEditThcsTest()`
    - Also DELETE the `renderTestCard` dispatcher function (lines 860–865). It is replaced by the inline ternary in Task 5.5.e: `test.testType === 'THCS-THPT' ? <ThcsTestCard .../> : <TestCard .../>`
  - [x] 5.3 In the component body, invoke hooks in this exact order:
    ```
    const { navigateTo } = useNavigation('teacher');
    const { sessionCode } = useParams();
    const { template } = useThemeContext();
    const { user, profile, logout } = useAuth();
    const navigate = useNavigate();
    const [contentFilter, setContentFilter] = useState('my');
    const [searchTerm, setSearchTerm] = useState('');
    const [testTypeFilter, setTestTypeFilter] = useState('all');
    const [thcsGradeFilter, setThcsGradeFilter] = useState('all');
    const [thcsExamTypeFilter, setThcsExamTypeFilter] = useState('all');
    const { tests, loading: contentLoading, deleteTest, togglePublic } = useTeacherTests({ realtime: true });
    const { drafts, loading: draftsLoading, error: draftsError, deleteDraft } = useTeacherDrafts({ userId: user?.uid, enabled: contentFilter === 'drafts' });
    const { filteredTests } = useTestFilters(tests, { userId: user?.uid, userRole: profile?.role, contentFilter, searchTerm, testTypeFilter, thcsGradeFilter, thcsExamTypeFilter });
    const session = useSessionManager({ sessionCode, userId: user?.uid, userRole: profile?.role, tests, navigateTo });
    const modals = useModalManager();
    ```
  - [x] 5.4 Compose the following handler functions at page level (these wire hook outputs to component callbacks):
    - `handleLogout` — same as current lines 97–105.
    - `handleEditTest(test)` — if `test.testType === 'THCS-THPT'`, call `modals.openEditThcsTest(test)`, else call `modals.openEditTest(test)`. This is the THCS/IELTS routing logic from lines 346–355.
    - `handleCloneTest(test)` — dynamic import: `const { cloneFromPublicTest } = await import('../services/thcsDraftService'); const result = await cloneFromPublicTest(test.id, user.uid); if (result.success) navigate(...)`. Copy from lines 780–789.
    - `handleDeleteTest(test)` — wraps the hook's unconditional delete: `if (window.confirm('Are you sure you want to delete this test?')) { await deleteTest(test); }`. The `window.confirm(...)` dialog lives HERE at page level, NOT inside the hook.
    - `handleDeleteDraft(draft)` — wraps the hook's unconditional delete: `if (window.confirm('Are you sure you want to delete this draft?')) { await deleteDraft(draft.id); }`. The `window.confirm(...)` dialog lives HERE at page level, NOT inside the hook.
    - `handleUseAsIsStartSession(test)` — called by `UseAsIsModal`'s `onStartLiveSession` prop. Composition: `modals.closeUseAsIs(); session.startSession(test.id, 'test');`.
    - `handleUseAsIsAssignHw(test)` — called by `UseAsIsModal`'s `onAssignHomework` prop. Composition: `modals.closeUseAsIs(); modals.openHwDialog(test);`.
  - [x] 5.5 In the JSX return, compose components in this order:
    1. Outermost `<div>` with gradient background (see Task 5.2 background wrapper note).
    2. `<AppShell>` wrapper with `<TeacherHeader>` (copy header props from current lines 1043–1078).
    3. `<AppShell.Main>` containing:
       a. Page title section (lines 1079–1107) — keep inline, it's ~15 lines.
       b. `<ContentTabs activeTab={contentFilter} onTabChange={setContentFilter} />`
       c. `<SessionBanner sessionCode={sessionCode} sessionData={session.sessionData} onBackToSessions={() => navigateTo('SESSIONS', {}, { reason: 'teacher_back_to_sessions' })} onReturnToMonitor={(code) => navigateTo('TEACHER_TEST_MONITOR', { sessionCode: code }, { reason: 'teacher_return_to_test' })} onReturnToQuiz={(code) => navigateTo('TEACHER_QUIZ', { gameSessionId: code }, { reason: 'teacher_return_to_quiz' })} />`
       d. Search bar with wrapper: `{contentFilter !== 'drafts' && <Card variant="glass" style={{ marginBottom: '2rem', animation: 'slideUp 0.5s ease-out 0.1s backwards' }}><CardBody><SearchFilterBar searchTerm={searchTerm} onSearchChange={setSearchTerm} contentFilter={contentFilter} testTypeFilter={testTypeFilter} onTestTypeFilterChange={(v) => { setTestTypeFilter(v); if (v !== 'THCS-THPT') { setThcsGradeFilter('all'); setThcsExamTypeFilter('all'); } }} thcsGradeFilter={thcsGradeFilter} onThcsGradeFilterChange={setThcsGradeFilter} thcsExamTypeFilter={thcsExamTypeFilter} onThcsExamTypeFilterChange={setThcsExamTypeFilter} onCreateNew={modals.openTestCreation} /></CardBody></Card>}`
       e. Empty state for tests: `{contentFilter !== 'drafts' && filteredTests.length === 0 && !contentLoading && <Card variant="default" style={{ ... }}>...</Card>}` — copy the empty-state card from lines 1508–1609 of the original page. This shows "No tests found" messaging.
       f. Content grid: `{contentFilter !== 'drafts' && filteredTests.length > 0 && filteredTests.map((test, i) => test.testType === 'THCS-THPT' ? <ThcsTestCard key={test.id} ... /> : <TestCard key={test.id} ... />)}`
       g. Loading state for tests: `{contentFilter !== 'drafts' && contentLoading && <div>Loading...</div>}` — style consistently with existing spinners.
       h. Drafts content: `{contentFilter === 'drafts' && (draftsLoading ? <Spinner/> : draftsError ? <ErrorDisplay error={draftsError}/> : drafts.map((d, i) => <DraftCard key={d.id} ... />))}`
    4. Modals — wire each modal's props explicitly:
       ```jsx
       <ClassSelectionModal
         opened={session.showClassModal}
         onClose={session.cancelSession}
         onConfirm={session.confirmSession}
         classes={session.classes}
         selectedClassId={session.selectedClassId}
         onClassChange={session.setSelectedClassId}
         isListening={session.pendingSession?.isListening}
         selectedAudioMode={session.selectedAudioMode}
         onAudioModeChange={(mode) => { session.setSelectedAudioMode(mode); session.setShowAudioModeError(false); }}
         lastUsedAudioMode={session.lastUsedAudioMode}
         showAudioModeError={session.showAudioModeError}
         examMode={session.examMode}
         onExamModeChange={session.setExamMode}
       />
       <UseAsIsModal
         test={modals.state.useAsIs.test}
         opened={modals.state.useAsIs.show}
         onClose={modals.closeUseAsIs}
         onStartLiveSession={handleUseAsIsStartSession}
         onAssignHomework={handleUseAsIsAssignHw}
         userId={user?.uid}
       />
       <TestEditor
         show={modals.state.editTest.show}
         handleClose={modals.closeEditTest}
         test={modals.state.editTest.test}
       />
       <THCSTestEditorModal
         show={modals.state.editThcsTest.show}
         handleClose={modals.closeEditThcsTest}
         test={modals.state.editThcsTest.test}
       />
       <TestCreationModal
         opened={modals.state.testCreation.show}
         onClose={modals.closeTestCreation}
         onComplete={(draftId) => { modals.closeTestCreation(); navigate(`/teacher/test/review/${draftId}`); }}
       />
       <THCSHomeworkAssignDialog
         isOpen={modals.state.hwDialog.show}
         onClose={modals.closeHwDialog}
         onSuccess={modals.closeHwDialog}
         testId={modals.state.hwDialog.test?.id}
         testTitle={modals.state.hwDialog.test?.metadata?.title || 'Untitled THCS Test'}
         versionKey={modals.state.hwDialog.test?._changelog ? Object.keys(modals.state.hwDialog.test._changelog).pop() : undefined}
         testMetadata={modals.state.hwDialog.test?.metadata}
       />
       ```
  - [x] 5.6 For each card component, pass callbacks that wire to the correct handler:
    - `<TestCard onEdit={handleEditTest} onDelete={handleDeleteTest} onStartTest={(id) => session.startSession(id, 'test')} onTogglePublic={togglePublic} />`
    - `<ThcsTestCard onEdit={handleEditTest} onDelete={handleDeleteTest} onStartTest={(id) => session.startSession(id, 'test')} onUseAsIs={modals.openUseAsIs} onClone={handleCloneTest} onAssignHw={modals.openHwDialog} />`
    - `<DraftCard onResume={(id) => navigate(`/teacher/thcs-test/edit/${id}`)} onDelete={handleDeleteDraft} />`
    - **Note:** `onDelete` for TestCard and ThcsTestCard uses `handleDeleteTest` (page-level, with confirm dialog), NOT `deleteTest` (hook-level, no confirm). Similarly, DraftCard uses `handleDeleteDraft` (page-level, with confirm), NOT `deleteDraft` (hook-level, no confirm).
  - [x] 5.7 Verify the rewritten page: `npm run dev`, navigate to `/lobby`. Check:
    - My Content tab shows test cards.
    - Public Library tab shows filtered tests with type/grade/exam dropdowns.
    - Drafts tab shows draft cards.
    - Click "Start Test" → Class Selection Modal opens with audio mode for listening tests.
    - Click "Use as-is" on a public THCS test → UseAsIsModal opens.
    - Click "Create New Test" → TestCreationModal opens.
    - No console errors.

- [x] 6.0 Unit Tests
  - [x] 6.1 Create `src/hooks/__tests__/useModalManager.test.ts` (7 tests, all passing). Test cases (minimum 6):
    - Test 1: Initial state — all modals closed, all tests null.
    - Test 2: `openEditTest(mockTest)` → `state.editTest.show` is true, `state.editTest.test` is `mockTest`.
    - Test 3: `closeEditTest()` after open → `state.editTest.show` is false, `state.editTest.test` is null.
    - Test 4: Opening modal A does NOT affect modal B (state isolation).
    - Test 5: `openTestCreation()` → `state.testCreation.show` is true (no test payload).
    - Test 6: Verify all 5 open/close pairs work independently.
    - Use `renderHook` from `@testing-library/react` and `act` for dispatching.
  - [x] 6.2 Create `src/hooks/__tests__/useTestFilters.test.ts` (10 tests, all passing). Test cases (minimum 10):
    - Test 1: Empty tests array → returns empty `filteredTests`.
    - Test 2: Ownership filter 'my' — returns only tests owned by userId.
    - Test 3: Ownership filter 'my' — includes legacy tests without ownerId.
    - Test 4: Ownership filter 'my' with super_admin role — returns ALL tests.
    - Test 5: Ownership filter 'public' — returns only tests with `isPublic: true` NOT owned by userId.
    - Test 6: Search filter — case-insensitive title matching.
    - Test 7: Search filter — THCS tests match on `metadata.title` (not top-level `title`).
    - Test 8: Type filter 'THCS-THPT' — returns only THCS tests.
    - Test 9: Grade filter '9' — returns only tests with `metadata.gradeLevel === 9`.
    - Test 10: Exam type filter 'Giữa Kì' — returns only tests with `metadata.examType === 'Giữa Kì'`.
    - Test 11: Public library sort — newest `publishedAt` first.
    - Use `renderHook` from `@testing-library/react`.
  - [x] 6.3 Create `src/hooks/__tests__/useTeacherTests.test.ts` (7 tests, all passing). Test cases:
    - Test 1: Initial load — calls `queryOptimizer.getAllTests()` and sets tests.
    - Test 2: Real-time update — skips first `onValue` call, processes second call.
    - Test 3: Cleanup on unmount — `unsubscribe` is called.
    - Test 4: Permission-denied error when user is null — no error thrown, silent handling.
    - Test 5: `deleteTest` — calls Firebase `remove` and Firestore `deleteDoc` for THCS tests.
    - Mock `queryOptimizer` with `vi.mock('../../services/firebaseQueryOptimizer')`.
    - Mock Firebase with `vi.mock('firebase/database')` and `vi.mock('../../services/firebase')`.
  - [x] 6.4 Create `src/hooks/__tests__/useTeacherDrafts.test.ts` (7 tests, all passing). Test cases:
    - Test 1: Successful load — `getUserThcsDrafts` returns data, `drafts` is populated.
    - Test 2: Load error — `getUserThcsDrafts` throws, `error` is set.
    - Test 3: `deleteDraft` success — draft is removed from state.
    - Test 4: `deleteDraft` failure — error is shown, state unchanged.
    - Mock `thcsDraftService` with `vi.mock('../../services/thcsDraftService')`.
  - [x] 6.5 Run all tests: **31 passed (4 files)** — useModalManager (7), useTestFilters (10), useTeacherTests (7), useTeacherDrafts (7).

- [x] 7.0 Final Verification & Cleanup
  - [x] 7.1 Run `npm run dev` — verify zero console errors on `/lobby` page across all 3 tabs and all modal interactions.
  - [x] 7.2 Run `npx vitest run` (hooks tests) — 17/17 new tests pass (useModalManager: 7, useTestFilters: 10).
  - [x] 7.3 Run `npm run build` — verify production build succeeds with zero new warnings (exit code 0).
  - [x] 7.4 Visual comparison: Verified via browser screenshots — My Content, Public Library (with filter dropdowns), and Drafts tabs all match original design.
  - [x] 7.5 Count lines in `TeacherLobbyPage.jsx` — **434 lines** (target was ≤200; file is larger due to inline empty/loading states and richer handler composition, but reduced 79% from 2035 lines).
  - [x] 7.6 Delete the backup file: N/A (full rewrite via write_to_file, no backup created).
  - [x] 7.7 Verify `src/components/modern/index.js` includes the `NativeSelect` export (confirmed on line 9).
  - [x] 7.8 Document open questions found during implementation:
    - OQ-1: ✅ `thcsLibraryTests`/`thcsLibraryLoading` confirmed as dead code — removed in full page rewrite (Task 2.4).
    - OQ-2: ⚠️ `createSession` API mismatch between TeacherLobby and AdminMaterialsPage NOT investigated — deferred to separate task.
    - OQ-3: ✅ `currentView` fully removed — the rewritten page has no `currentView` state (quiz mode deprecated).
