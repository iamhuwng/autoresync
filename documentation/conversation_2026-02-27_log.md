# Conversation Log — 2026-02-27 (Session 3)

## 1. Avatar & Section Instruction Fix
**Request:** Replace default Gmail avatar with user's custom uploaded avatar; remove box-in-box from section header.
**Actions:**
- Updated `THCSTestLayout.tsx` header to use `profile.avatarUrl` from `useAuth()` as primary avatar source (uploaded to R2), falling back to `user.photoURL` (Gmail), then initial letter circle
- Destructured `profile` from `useAuth()` in THCSTestLayout
- Removed outer card box from section header — section name+points are now plain text, only instruction text is boxed

## 2. Compact Question Cards
**Request:** Keep font sizes but make question/choices cards more compact to show more content.
**Actions:** (THCSQuestionRenderer.tsx)
- Card padding: `1.25rem` → `0.6rem 0.75rem`
- Header margin: `0.75rem` → `0.35rem`
- Question text margin: `1rem` → `0.5rem`
- Options gap: `0.5rem` → `0.3rem`
- Option padding: `0.75rem 1rem` → `0.45rem 0.75rem`
- Option border: `2px` → `1.5px`
- Between question cards gap: `0.75rem` → `0.5rem` (THCSTestLayout.tsx)

## 3. Prev/Next Question Navigation Buttons
**Request:** Add prev/next buttons in footer to move between individual questions.
**Actions:**
- Added `currentQuestionIndex` state to THCSTestLayout
- Added `onPrevQuestion`, `onNextQuestion`, `isFirstQuestion`, `isLastQuestion` props to THCSSectionNav
- Buttons navigate question-by-question within section, auto-cross section boundaries
- ‹ and › buttons appear on left/right sides of question pills in footer

## 4. Section Instruction Text Visibility
**Request:** Make instruction text color more noticeable.
**Actions:**
- Changed instruction text color from `#475569` to `#1e293b` (near-black)
- Added `fw={500}` (medium weight)

## 5. Searchable Assign Homework Modal
**Request:** Replace raw Class ID / Student IDs text inputs with searchable dropdowns.
**Actions:** (THCSHomeworkAssignDialog.tsx)
- Added `useEffect` to fetch teacher's classes via `getClasses(user.uid)` on modal open
- Built `classOptions` (searchable `Select`) from fetched classes showing "Name (X students)"
- Aggregated all students from all classes into `studentOptions` (searchable `MultiSelect`) showing "Name — Class"
- Replaced `TextInput` for Class ID with searchable `Select`
- Replaced `TextInput` for Student IDs with searchable `MultiSelect`
- Updated validation messages and submission logic
- Added `MultiSelect` import, removed unused `TextInput`

## 6. NO MANTINE Rule — Absolute Ban Enforcement
**Request:** Stop using Mantine entirely. Create rules across all AI systems to enforce this.
**Actions:**
- Created `documentation/system/NO-MANTINE-RULE.md` — master rule document
- Added **Rule 15** to `documentation/integration-safety-rules.md` with full trigger, examples, alternatives table
- Updated `.agent/rules/GEMINI.md` — added to Integration Safety Rules table + standalone section
- Created Claude/Antigravity skill: `no-mantine-enforcement/SKILL.md`
- Rule covers: all `@mantine/*` packages, all scopes (new files, modifications, refactors)

## 7. Visual Calendar Date Picker
**Request:** Due Date should open a visual calendar alongside text input.
**Actions:**
- Created `src/components/common/DateTimeCalendar.tsx` — custom calendar component
  - Pure HTML + CSS + React (NO Mantine)
  - Monthly grid with clickable days, ‹/› month navigation
  - Purple gradient header, today highlight, min-date graying
  - Time picker at bottom with Clear/Done actions
  - Outside-click-to-close behavior
- Updated `THCSHomeworkAssignDialog.tsx` to use `DateTimeCalendar` for both Available From and Due Date

## 8. IELTS Writing Planning — Scope Corrections
**Request:** Fix incorrect claims about THCS missing solo practice/homework.
**Actions:**
- Confirmed THCS has `THCSPracticeView.tsx` (856 lines) and `THCSHomeworkAssignDialog.tsx` (519 lines)
- Updated `ielts_writing_all_interactions.md` and `ielts_writing_scope_analysis.md` artifacts
- Writing needs own versions because essay UX ≠ MCQ/fill-in

## 9. IELTS Writing — AI Grading Removal + Backup Check
**Request:** Remove AI marking, only teacher self-mark. Check backup coverage.
**Actions:**
- Removed AI grading section from interaction list (~163 → ~157 items)
- Verified backup system auto-discovers all RTDB nodes + Firestore collections — no changes needed

## 10. IELTS Writing PRD — 5 Rounds Socratic Questioning
**Request:** Create PRD using create-prd.md template. Want modals + mockups.
**Actions:**
- 5 rounds, 80+ decisions covering: test format, editor, timer, grading criteria, band score rules, annotations, paste prevention, solo/homework flows, notifications, academic record, THCS integration
- Created `documentation/tasks/0030-prd-ielts-writing-test-system.md` — complete PRD with data models, ASCII mockups, implementation specs
- Image mockups pending user review of PRD
