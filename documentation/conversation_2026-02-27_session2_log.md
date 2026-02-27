# Conversation Log — 2026-02-27 (Session 2)

## 1. Fix RestoreBanner Permission Denied Error
**Time:** ~08:12  
**Request:** Console error — `RestoreBanner.tsx` fails to listen to `/system_flags/restore_in_progress` in RTDB due to `permission_denied`.

### Root Cause
The `system_flags` node had **no security rules** in `database.rules.json`. The `RestoreBanner` component subscribes via `onValue()` in real-time, but RTDB denied access because no rule granted read permission.

### Fix Applied
- **File:** `database.rules.json`
- **Change:** Added `system_flags` rule:
  - `.read`: `auth != null` (all authenticated users can read — needed for the banner)
  - `.write`: `super_admin` only (restore worker uses service account token, but this keeps it safe for direct SDK writes)

### Deployment
- Deployed RTDB rules via `npx firebase-tools deploy --only database:rules` — **success** ✅

## 2. THCS Test Taking Interface Layout Adjustments
**Time:** ~08:45  
**Request:** Move section bar up under header, move metadata inline with title, make header & footer narrower.

### Changes
**`THCSTestLayout.tsx`:**
- Header padding reduced (`0.75rem` → `0.4rem`). Title + metadata now on same line via flexbox `alignItems: 'baseline'`
- Title font size reduced (`lg` → `md` desktop, `md` → `sm` mobile) to fit inline layout
- Timer & submit button sizing tightened
- `THCSSectionNav` moved from bottom footer to right below header with `position="top"`

**`THCSSectionNav.tsx`:**
- Added `position?: 'top' | 'bottom'` prop (default `'bottom'`)
- When `top`: sticky top, `borderBottom`, padding `0.35rem`
- When `bottom`: sticky bottom, `borderTop`, padding `0.5rem`
- Section tab margins tightened for compactness


**Result:** More vertical space for question content. Section nav immediately accessible below header.

## 3. THCS Section Nav Enhancements — Split, Auto-advance, Status Coloring
**Time:** ~08:49  
**Request:** Center section names, move question pills to footer (smaller), auto-advance when section complete (green), warn incomplete sections (red).

### Changes
**`THCSSectionNav.tsx` — full rewrite:**
- Added `mode` prop: `'sections-only'` | `'questions-only'` | `'full'`
- Added `sectionStatuses` prop with `SectionStatus` type (`'active'` | `'completed'` | `'incomplete'` | `'default'`)
- Section tabs: centered, green gradient for completed, red tint for incomplete, with ✓/! icons and mini progress counter
- Question pills: much smaller (22px vs 32px) in `questions-only` mode for compact footer

**`THCSTestLayout.tsx`:**
- Split nav into **two instances**: sections-only at top, questions-only at footer
- Added `visitedSections` state — tracks which sections student has navigated to
- Added `sectionStatuses` computed value: green if all questions answered, red if visited but incomplete
- Added **auto-advance effect**: when all questions in current section are answered, auto-moves to next incomplete section after 600ms delay
- Fixed lint warning about useEffect cleanup return path

## 4. Header Student Name, Passage Scroll, Duplicate Title Fix
**Time:** ~08:52  
**Request:** Add student name in middle of header; make reading passage scroll with content; fix duplicate section name in passage.

### Changes
**`THCSTestLayout.tsx`:**
- Added **student name badge** in center of header (👤 + displayName) — hidden on mobile
- Passed `sectionName` prop to both two-column and single-column `THCSPassagePanel`

**`THCSPassagePanel.tsx`:**
- Added `sectionName` prop to suppress duplicate title when `passage.title` matches `sectionName` (case-insensitive)
- **Sticky passage follows scroll**: `position: sticky` with `top: 90px` offset (below header+section tabs), `maxHeight: calc(100vh - 120px)`, `overflowY: auto` — passage panel scrolls independently and stays visible alongside questions
- Added rounded border + subtle shadow for better visual separation

## 5. Sticky Passage Fix, Section Instruction Redesign, Student Name Fix
**Time:** ~08:55  
**Request:** MUST make passage scroll with content; redesign section instructions; student name in header center.

### Root Cause — Passage Not Sticking
The main content wrapper had `overflowY: 'auto'` which created a **nested scroll context**. CSS `position: sticky` only works relative to the nearest scrolling ancestor — since the parent was the scroll target, the sticky `top` offset was meaningless. Removing `overflowY: 'auto'` lets the **page itself scroll**, and sticky elements (including the passage panel) now stick relative to the viewport.

### Changes
**`THCSTestLayout.tsx`:**
- **CRITICAL FIX:** Removed `overflowY: 'auto'` from main content div → sticky passage now works
- **Student name**: Always shown (including mobile), uses gradient background + border for visibility, purple text color `#6d28d9`
- **Section instruction card**: Complete redesign with left accent bar (purple gradient), 📝 icon, section name + points badge pill, instruction text below — clear visual separation while staying aesthetic

**`THCSPassagePanel.tsx`:**
- Adjusted `top: 85px`, `maxHeight: calc(100vh - 130px)` to account for header+tabs and footer pills
- Added `scrollbarGutter: 'stable'` to prevent content shifting when scrollbar appears

## 6. Fix Student Name Centering & Section Instruction Readability
**Time:** ~08:58  
**Request:** Student name still not centered in header; section instruction is very blurry.

### Root Cause
- **Name not centered**: Left zone had `flex: 1 1 auto` while center had `flex: 0 1 auto` — the left zone consumed all available space, pushing the name to the right.
- **Blurry instruction**: Text used `size="xs"` + `c="dimmed"` — too small and too faded.

### Fix
- **Header**: Restructured into 3 equal flex zones (`flex: 1 1 0` for left/right, `flex: 0 0 auto` for center). Left and right zones expand equally, centering the student name badge in the true middle.
- **Instruction text**: Changed from `size="xs"` + `c="dimmed"` → `size="sm"` + `color: '#475569'` (slate-600) with `lineHeight: 1.6` — much more readable.

## 7. Dual Independent Scroll for Long Reading Passages
**Time:** ~09:00  
**Request:** Long passages have no way to see content below when stuck.

### Solution
Replaced sticky passage with **dual independent scroll panels** (TOEFL/Cambridge pattern):
- Both passage and questions get their own scroll area at a fixed height (`calc(100vh - 200px)`)
- Passage panel: rounded card with sticky "📖 Reading Passage ↕ Scroll" header bar, its own `overflowY: auto`
- Questions panel: its own `overflowY: auto`, scrolls independently
- Mobile: passage gets `maxHeight: 50vh`, questions scroll normally
- No more `position: sticky` on the passage — eliminated the root problem entirely

## 8. Remove Dev Accounts, Teacher Invite, and Post-Login Page from Login
**Time:** ~09:37–09:39  
**Request:** Remove dev accounts, teacher invite tab, and the "Go to Dashboard" page after login.

### Changes
**`src/pages/LoginPage.jsx`:**
- Removed "Dev" tab and entire panel (email/password login + test account seeding)
- Removed `seedTestAccounts` function, `seedingStatus` state, unused `loginWithEmail`/`registerWithEmail`
- Removed "Teacher Invite" tab and entire panel (invite code redemption form)
- Removed `handleRedeemInvite` function, all invite-related state (`inviteCode`, `inviteError`, `inviteSuccess`, `processingInvite`)
- Removed `invitationService` import
- Removed "become a teacher" hint text for students
- Replaced "Signed In" alert (which showed email/role and required manual navigation) with simple "Redirecting..." text — useEffect already handles auto-redirect

### Result
Login page now shows only 2 tabs: **Sign In** and **Guest**. After login, users are immediately redirected to their dashboard without any intermediate page.

## 9. Fix "Start Homework" Not Navigating to Test Interface
**Time:** ~09:42  
**Request:** Clicking "Start Homework" on `/student/homework` does not lead student to the test-taking interface.

### Investigation
- Console showed: `Error loading homework submission data: FirebaseError: The query requires an index`
- Error from `useHomeworkSubmission.ts:152` → `getStudentSubmissionsForHomework()` in `homeworkSubmissionService.ts`
- The query used 3 fields: `where('homeworkId')` + `where('studentId')` + `orderBy('attemptNumber', 'asc')`
- `firestore.indexes.json` only had a 2-field index (`homeworkId` + `studentId`), missing `attemptNumber`

### Root Cause
**Missing Firestore composite index.** The query required a 3-field composite index but only a 2-field one existed. Firestore blocked the query, causing `useHomeworkSubmission` to error, which set `error` state, rendering the error UI instead of the homework detail page with the Start button action.

### Fix
- **`src/services/homeworkSubmissionService.ts`**: Removed `orderBy('attemptNumber', 'asc')` from Firestore query → sort in JavaScript instead. A student has at most a few attempts, so JS sort is perfectly efficient.
- **`firestore.indexes.json`**: Added the 3-field composite index as backup.
- Cleaned up unused `limit` and `Timestamp` imports.

## 10. Plan: Reset Homework for Individual Student (Teacher View)
**Time:** ~19:36
**Request:** Create a plan for adding a button that allows teachers to reset homework for a specific student. User noted complexity since homework is assigned at class level.

### Investigation
- Analyzed `homework.types.ts` — homework targets are class/course/group/students level (shared `HomeworkAssignment`)
- Analyzed `homeworkSubmissionService.ts` — submissions are per-student in Firestore (`homework_submissions`)
- Analyzed `testResults.service.ts` — results in RTDB (`test_results/` + session/student indexes)
- Analyzed `HomeworkResultsSummary.tsx` — existing per-student submission table (natural place for reset button)
- Confirmed `deleteTestResult()` already exists for RTDB cleanup, no existing delete in submission service

### Solution
**Full wipe of per-student submissions + results + stats recalculation.** The class-level `HomeworkAssignment` stays untouched. Only the target student's `homework_submissions` docs and linked `test_results` are deleted. Stats on the assignment are recalculated.

### Artifact
- `reset_homework_plan.md` created in artifacts directory with full implementation plan, data flow diagrams, edge cases, and alternative approaches considered.

### User Decisions
1. ❌ No audit log
2. ✅ Notify student when homework is reset
3. ✅ Bulk reset — deferred to class assignment view (separate task)

### Implementation (20:02)
**Files modified:**

1. **`services/homeworkSubmissionService.ts`**
   - Added `deleteDoc` to Firestore imports
   - Added `resetStudentHomework()` function (lines 537–651)
   - Steps: fetch submissions → collect resultIds → delete submission docs → delete test results via `deleteTestResult()` → recalculate homework stats → send notification

2. **`services/notificationService.ts`**
   - Added `sendHomeworkResetNotification()` function
   - Type: 'warning', links to `/student/homework/{homeworkId}`
   - Message: "Your homework has been reset by your teacher. You can now retake it."

3. **`components/homework/HomeworkResultsSummary.tsx`**
   - Added `IconRefresh`, `Modal`, `Button` imports
   - Added reset state management (`resetTarget`, `isResetting`, `resetResult`)
   - Added `handleResetConfirm` callback
   - Added 🔄 reset icon button next to 👁️ view button in each student row
   - Added confirmation modal with warning about permanent deletion
   - After reset: shows success message, then auto-refreshes page

**Build verification:** `npx tsc --noEmit` shows only pre-existing errors; zero new errors introduced.

### Revised Implementation (20:09)
**Problem:** `HomeworkResultsSummary` was never imported/rendered in any page — orphaned component. The actual UI the teacher sees is `HomeworkCard` inside `TeacherHomeworkListPage`.

**Fix:** Moved the reset feature directly into `HomeworkCard`:

4. **`components/homework/HomeworkCard.tsx`**
   - Added `resetStudentHomework` and `getHomeworkSubmissions` imports
   - Added `onResetComplete` callback prop
   - Added reset modal state, student list fetching, and confirmation flow
   - Added 🔄 action button in card header
   - Added native HTML modal (no Mantine dependency) with:
     - Student list with submission status
     - Per-student "Reset" button
     - Confirmation dialog with warning
     - Success/error feedback

5. **`components/homework/HomeworkCard.css`**
   - Added 250+ lines of modal styles (overlay, student rows, warning, buttons)
   - Smooth animations (fadeIn, slideUpModal)

6. **`pages/TeacherHomeworkListPage.tsx`**
   - Wired `onResetComplete={refetch}` to all 3 HomeworkCard instances (chronological, by-class, by-status views)

**Build verification:** Zero new TypeScript errors.


## 11. Re-add Dev Quick-Login Buttons to Login Page
**Time:** 20:06
**Request:** Add back dev account quick-login buttons for Teacher and Student so testing is quick (one-click login).

### Investigation
- Dev accounts were removed in commit `7136c65` (section 8 above)
- Found original credentials from git diff: `teacher@test.com` / `student@test.com` with password `password123`
- `loginWithEmail` function already exists in `AuthContext.jsx` — no backend changes needed

### Changes
**`src/pages/LoginPage.jsx`:**
- Destructured `loginWithEmail` from `useAuth()`
- Added `devLoading` state for button loading feedback
- Added `handleDevLogin(role)` function — uses `loginWithEmail` with hardcoded dev credentials
- Added "DEV QUICK LOGIN" section below Google Sign-in:
  - **Teacher** button (purple, users icon)
  - **Student** button (cyan, user icon)
  - Hover effects, loading states, disabled during login
- Wrapped in `import.meta.env.DEV` — buttons only render in development mode
- "Only visible in development mode" note shown below buttons

### Verification
- ✅ Visually confirmed on localhost:5173 — both buttons render correctly


## 12. WebMCP Integration Planning
**Time:** 22:10
**Request:** Review WebMCP documentation and create integration plan for moving from live preview testing to WebMCP-based testing.

### Research
- Read Google's WebMCP Early Preview doc (Chrome 146+, behind flag)
- Read `auto-webmcp` npm package README on GitHub
- Reviewed project structure (`main.jsx`, `App.jsx`, route map)

### Key Decision: Imperative API > Declarative API
- Our app is a React SPA with very few native `<form>` elements
- Most interactions are React components, modals, and custom inputs
- `auto-webmcp` (npm) auto-scans `<form>` elements → low coverage for us
- **Imperative API** (`navigator.modelContext.registerTool()`) gives full control

### Plan Created
- **Artifact:** `webmcp_integration_plan.md` in artifacts directory
- **4 Phases:** Foundation → Core Tools → Domain Tools → Context-Aware Registration
- **Est. effort:** ~15 hours total
- **Token savings:** 85-93% reduction estimated
- **Safety:** All code gated behind `import.meta.env.DEV` — zero production impact

### Awaiting user approval to proceed with implementation.

### Implementation (22:17)
**User decision:** Forward enforcement only — all new features must include WebMCP tools. Existing features backfilled on-demand.

**Files created:**

1. **`src/webmcp/types.ts`** — TypeScript definitions for `navigator.modelContext` API, `WebMCPTool`, `ToolRegistration`, `ToolCategory`
2. **`src/webmcp/registry.ts`** — Singleton tool registry with route/role-based activation
3. **`src/webmcp/index.ts`** — Bootstrap entry point + console error capture
4. **`src/webmcp/useWebMCP.ts`** — React hook for context sync on route/role changes
5. **`src/webmcp/README.md`** — Developer documentation
6. **`src/webmcp/tools/auth.tools.ts`** — Login/logout/user inspection tools
7. **`src/webmcp/tools/navigation.tools.ts`** — Route navigation + validation tools
8. **`src/webmcp/tools/state.tools.ts`** — Page state introspection, button clicking, error checking

**Files modified:**

9. **`src/main.jsx`** — Added dev-only `initWebMCP()` bootstrap
10. **`documentation/integration-safety-rules.md`** — Added **Rule 16** (WebMCP Tool Registration for New Features)

**Enforcement artifacts:**

11. **`.gemini/antigravity/skills/webmcp-enforcement/SKILL.md`** — Enforcement skill for Antigravity AI agent (mirrors no-mantine pattern)
