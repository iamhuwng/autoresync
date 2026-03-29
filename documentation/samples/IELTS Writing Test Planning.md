> [!IMPORTANT]
> Historical planning or design document.
> The current finalized source of truth for the teacher writing grading editor is:
> - .knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md
> - documentation/mockups/ielts-writing-grading-editor-finalized-2026-03-30.html
>
> If this file conflicts with the finalization doc or finalized mockup, follow the finalization doc.
# Chat Conversation

Note: _This is purely the output of the chat conversation and does not contain any raw data, codebase snippets, etc. used to generate the output._

### User Input

We will start on planning building test making process for IELTS Writing Test. Check codebase and similar implementation to identify our scope, what we need to do so that we won't miss anything (last time we did THCS test, we miss designing solo practice and homework)

### Planner Response

I'll start by investigating the existing codebase to understand how test-making flows are currently implemented for THCS and IELTS (Reading/Listening), so we can identify the full scope for IELTS Writing. Let me explore the project structure systematically.

*Listed directory [src](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src) *

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Listed directory [test](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test) *

*Listed directory [editor](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test/editor) *

*Listed directory [thcs-editor](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-editor) *

*Listed directory [thcs-student](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-student) *

*Listed directory [thcs-grading](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-grading) *

### Planner Response

Now let me look at the key routing, services, types, and test creation flow:

*Analyzed [TestCreationPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TestCreationPage.tsx) *

*Analyzed [CreateTestPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/CreateTestPage.tsx) *

*Analyzed [TestBuilderRouter.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TestBuilderRouter.tsx) *

*Analyzed [TestPageRouter.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TestPageRouter.tsx) *

### Planner Response

Now let me look at the services, types, and the test-creation components:

*Searched filesystem*

*Searched filesystem*

*Listed directory [skills](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/skills) *

*Searched filesystem*

*Listed directory [test-creation](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test-creation) *

*Listed directory [reading](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/skills/reading) *

*Listed directory [listening](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/skills/listening) *

*Analyzed [thcs-test.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/thcs-test.types.ts) *

*Analyzed [thcs-test.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/thcs-test.types.ts) *

*Analyzed [App.jsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/App.jsx) *

*Listed directory [layouts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test/editor/layouts) *

*Analyzed [testStorage.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/testStorage.ts) *

### Planner Response

Now let me look at practice mode, homework, and session-related components:

*Analyzed [StudentPracticePage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentPracticePage.tsx) *

*Analyzed [IELTSPracticeView.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/practice/IELTSPracticeView.tsx) *

*Analyzed [practice.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/practice.types.ts) *

*Analyzed [WritingSpeakingPlaceholder.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test/WritingSpeakingPlaceholder.tsx) *

### Planner Response

Let me now look at how test monitor, results, and session flow works:

*Analyzed [thcsTestStorage.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/thcsTestStorage.ts) *

*Analyzed [TeacherTestMonitorPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherTestMonitorPage.tsx) *

*Analyzed [TeacherTestResultsPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherTestResultsPage.tsx) *

*Analyzed [StudentTestResultsPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentTestResultsPage.tsx) *

### Planner Response

Now let me look at the homework system, academic record, and the App routes more closely:

*Analyzed [homework.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/homework.types.ts) *

*Analyzed [homeworkManager.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/homeworkManager.ts) *

*Analyzed [THCSProgressTab.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/academicRecord/THCSProgressTab.tsx) *

*Grep searched codebase*

### Planner Response

Let me check routes, existing solo/homework flow, and auto-marking service:

*Analyzed [routes.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/constants/routes.ts) *

*Analyzed [testResults.service.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/testResults.service.ts) *

*Searched filesystem*

*Searched filesystem*

*Analyzed [autoMarking.service.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/autoMarking.service.ts) *

*Analyzed [solo.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/solo.types.ts) *

*Viewed [WritingSpeakingPlaceholder.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test/WritingSpeakingPlaceholder.tsx) *

### Planner Response

Now let me check one more part — the existing documentation folder for any PRDs or plans:

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Listed directory [components](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/skills/listening/components) *

*Listed directory [components](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/skills/reading/components) *

*Listed directory [builders](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/skills/listening/builders) *

### Planner Response

Now I have a comprehensive understanding of the codebase. Let me create the planning artifact.

*Edited relevant file*

### Planner Response

Now let me create the conversation log:

*Edited relevant file*

### Planner Response

Here's the scope analysis summary. I've created a comprehensive document at the artifact. Let me highlight the key takeaways:

---

## 🔍 What I Found

After investigating **40+ files** across the entire codebase, I mapped out **8 architectural layers** that every test type touches. Here's the full picture:

### Every test type hits these layers:
1. **Data Model & Types** — Test structure, question types, draft format
2. **Test Creation (Teacher)** — Builder UI, wizard steps, save/publish
3. **Live Session Delivery** — Student test page, teacher monitor, submit flow
4. **Solo Practice** — ⚠️ **THCS missed this!**
5. **Homework Integration** — ⚠️ **THCS missed this too!**
6. **Marking & Grading** — 🔴 Writing is **fundamentally different** (no auto-marking!)
7. **Results & Review** — Essay display with inline feedback, criteria chart
8. **Academic Record** — Band trend per criteria, not correct/incorrect counts

### 🔴 What Makes Writing UNIQUE vs Reading/Listening

| Aspect | Reading/Listening | **Writing** |
|---|---|---|
| Student answers | Structured (MCQ, fill-in) | Free-form essay text |
| Marking | **Auto-marked** (deterministic) | **Manual/AI grading** (subjective) |
| Score calculation | Correct count → band table | 4-criteria rubric → weighted average |
| Progress tracking | Questions answered / 40 | Word count / target |
| Results display | Correct/incorrect per Q | Essay + comments + criteria chart |

### ⚠️ HIGH-RISK Items (Don't Miss These!)

| Item | Risk Level | Why |
|---|---|---|
| **WritingPracticeView** | 🔴 HIGH | Was missed for THCS |
| **Homework Integration** | 🔴 HIGH | Was missed for THCS |
| **Grading System** | 🔴 HIGH | Uniquely Writing — no auto-marking exists |
| **Band Score by Criteria** | 🔴 HIGH | Different algorithm from Reading/Listening |

### 📋 Proposed 6-Phase Build Plan

1. **Core Test Creation** (MVP) — Teacher can create/publish writing tests
2. **Student Test-Taking** — Live session essay writing
3. **Grading System** — Manual + AI-assisted grading
4. **Results & Feedback** — Essay review with criteria breakdown
5. **Solo Practice & Homework** — Independent practice (DON'T skip!)
6. **Academic Record & Polish** — Progress tracking, templates

Estimated new files: **~15-20**, existing files to modify: **~11**

---

Want me to start drilling deeper into any specific phase, or shall we begin with a detailed task breakdown for Phase 1?

### User Input

what I want to have now iis a list of all interactions we need to build for ielts writing test: test making process, teacher test monitor, grading tool, solo test view, result display, notification, etc. There are a lot now that I can remember all myself.

### Planner Response

Let me do one more pass through the codebase to make sure I capture every interaction point, including notifications, session management, and edge cases.

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Analyzed [notification.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/notification.types.ts) *

*Analyzed [CreateSessionModal.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/session/CreateSessionModal.tsx) *

*Analyzed [ModuleSessionModal.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/session/ModuleSessionModal.tsx) *

*Searched filesystem*

*Searched filesystem*

*Analyzed [SessionControlPanel.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test/SessionControlPanel.tsx) *

*Analyzed [academicRecord.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/academicRecord.types.ts) *

*Analyzed [academicRecordService.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/academicRecordService.ts) *

*Grep searched codebase*

### Planner Response

Now let me also check the library, course materials, and test editor features:

*Searched filesystem*

*Searched filesystem*

*Searched filesystem*

*Analyzed [StudentLibraryPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentLibraryPage.tsx) *

*Analyzed [MaterialProfilePage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/MaterialProfilePage.tsx) *

### Planner Response

Now I have the complete picture. Let me create the comprehensive interaction list artifact.

*Edited relevant file*

### Planner Response

Now let me update the conversation log:

*Edited relevant file*

### Planner Response

Here's your complete reference. I've cataloged **~163 interactions** across 12 categories. Here's the high-level breakdown:

---

### 📋 The Full Picture

| Category | # Items | Key Complexity |
|---|---|---|
| **Teacher — Test Making** | 21 | Task 1 image upload, Task 2 essay prompt, rubric |
| **Teacher — Session Mgmt** | 5 | Mostly reuses existing flow |
| **Teacher — Test Monitor** | 12 | Word count tracking instead of question progress |
| **Student — Live Test** | 18 | Essay editor + word counter is the star component |
| **Student — Solo Practice** | 11 | ⚠️ Don't skip (THCS lesson!) |
| **Student — Homework** | 9 | ⚠️ Don't skip (THCS lesson!) |
| **Teacher — Grading** | 23 | 🔴 **Most complex** — criteria scoring, feedback, AI assist |
| **Teacher — Results** | 14 | Criteria charts, band distribution |
| **Student — Results** | 14 | Band breakdown, teacher feedback, radar chart |
| **Notifications** | 7 | Grading complete, homework due, etc. |
| **Data & Services** | 16 | Types, storage, band calculation |
| **Routing** | 13 | Register in all routers |

### 🔴 The 3 Unique Challenges for Writing

1. **No auto-marking** — Every essay needs manual teacher grading (or AI-assisted). This is the biggest difference from Reading/Listening.
2. **Criteria-based scoring** — 4 criteria × 2 tasks, weighted average. Completely different from "correct answer count → band table".
3. **Essay editor component** — Need a solid rich text area with word counting, auto-save, and paragraph support.

### ⚠️ Items Explicitly Called Out to NOT Miss

- **S4-S7**: Solo Practice View (missed for THCS)
- **S8-S10**: Homework Integration (missed for THCS)
- **T11-T16**: Grading system (unique to Writing — if we skip this, graded scores never reach students)

Want me to start breaking down any specific section into detailed implementation tasks?

### User Input

we have already build solo practice and homework tast tasking for THCS test? we did you list it there still? check conversation log

### Planner Response

You're right, let me verify. I can see `THCSPracticeView.tsx` and `THCSHomeworkAssignDialog.tsx` already exist in the codebase. Let me check the conversation logs and code to confirm what's actually built.

*Searched filesystem*

*Grep searched codebase*

*Analyzed [THCSPracticeView.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/practice/THCSPracticeView.tsx) *

*Analyzed [THCSHomeworkAssignDialog.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-editor/THCSHomeworkAssignDialog.tsx) *

### Planner Response

You're absolutely right — my mistake! The codebase clearly shows:

- **[THCSPracticeView.tsx](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/practice/THCSPracticeView.tsx:0:0-0:0)** (856 lines) — fully built solo practice for THCS tests
- **[THCSHomeworkAssignDialog.tsx](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-editor/THCSHomeworkAssignDialog.tsx:0:0-0:0)** (519 lines) — fully built homework assignment for THCS
- The conversation logs from **2026-02-26** show extensive work on `THCSHomeworkLayout`, [THCSHomeworkAssignDialog](cci:1://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-editor/THCSHomeworkAssignDialog.tsx:59:0-515:1), notifications, late submission policies, etc.

**THCS solo practice and homework were already built.** My earlier statement that "THCS missed solo practice and homework" was **wrong** — I was echoing your initial mention of it as a past concern, but the code shows both were completed. I apologize for the confusion and repeating that incorrect claim throughout both artifacts.

Now, the key correction for the interaction list: the ⚠️ warnings saying "DON'T SKIP — missed for THCS" should be removed. Solo practice and homework still need to be built for **IELTS Writing**, but the reason isn't "we missed it last time" — it's simply because Writing needs its own version of these features.

Let me update the artifact to fix this:

*Edited relevant file*

### Planner Response

Also fix the scope analysis artifact:

*Edited relevant file*

### Planner Response

Good catch. Both artifacts are now corrected. 

**The reality:** THCS already has both [THCSPracticeView.tsx](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/practice/THCSPracticeView.tsx:0:0-0:0) (856 lines) and [THCSHomeworkAssignDialog.tsx](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/thcs-editor/THCSHomeworkAssignDialog.tsx:0:0-0:0) (519 lines) fully built — along with `THCSHomeworkLayout`, late submission policies, notifications, etc. The conversation logs from Feb 26 show extensive work on all of that.

My earlier statement that "THCS missed solo practice and homework" was **wrong**. I was incorrectly echoing that as a lesson learned, but the code clearly shows both were completed. Writing still needs its own versions, but the reason is simply that **essays ≠ MCQ** — the UX is fundamentally different, not because we forgot to build them before.

### User Input

marking feature for writing ielts is extremely difficult. for now, leave it out and only plan for teacher self mark.

### Planner Response

Got it — removing AI grading entirely, keeping only teacher self-mark. Let me update the artifact.

*Edited relevant file*

### Planner Response

Done. Removed the entire **T15. AI-Assisted Grading** section (4 items) and 2 AI-related service items. The grading section is now **teacher manual only** — score each criterion by hand, write feedback, submit.

Changes:
- ❌ Removed: AI Suggest button, AI confidence indicator, AI-generated feedback draft, AI grading integration service, model answer comparison
- ✅ Kept: Criteria scoring (TR, CC, LR, GRA), feedback text areas, quick templates, save draft, submit grading, mark as reviewed
- Total: **~163 → ~157 interactions**

### User Input

how about backup?

### Planner Response

Good call — let me check the existing backup system to see what's covered and what Writing would need.

*Searched filesystem*

*Searched filesystem*

*Analyzed [backupService.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/backupService.ts) *

*Grep searched codebase*

*Grep searched codebase*

*Analyzed [data-backup.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/r2-backup-worker/src/backup/data-backup.ts) *

*Viewed [data-backup.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/r2-backup-worker/src/backup/data-backup.ts) *

### Planner Response

The backup system automatically discovers and backs up **all RTDB nodes** (except `system_flags`) and **all Firestore collections** (except `parsingCache`). It does a shallow read of `/.json?shallow=true` and iterates through every top-level node.

**Good news: backup already covers Writing data automatically.** Here's why:

- **RTDB `tests/{id}`** — Writing tests will be stored here (same node as Reading/Listening/THCS). ✅ Already backed up.
- **RTDB `test_results/{id}`** — Writing results and grading data. ✅ Already backed up.
- **RTDB `game_sessions/{code}`** — Live writing sessions. ✅ Already backed up (with the in-progress filter).
- **Firestore `homework_assignments`** — Writing homework. ✅ Already backed up.
- **Firestore drafts** — Writing test drafts. ✅ Already backed up.

**No changes needed to the backup system for IELTS Writing.** The worker discovers nodes/collections dynamically, so any new data we write goes into the existing backup automatically.

The only thing worth noting is if we add a **new RTDB top-level node** (like `writing_grading/` or similar), it would also be auto-discovered. But per the integration safety rules (Rule 12), we should still verify coverage when we actually create the data model. For now, the plan is to use existing nodes (`tests/`, `test_results/`), so backup is covered out of the box.

Want me to add a quick note about this to the interaction list, or move on to something else?

### User Input

use @[documentation/tasks/create-prd.md]and start our documentation for the planning, I want modals and mockup for design before approveing

### Planner Response

Let me first read the PRD creation template.

*Viewed [create-prd.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/create-prd.md) *

### Planner Response

Now let me check what PRD numbers already exist:

*Searched filesystem*

### Planner Response

Good — next PRD number is **0030**. Now, following the PRD template, I need to ask clarifying questions before writing the document. Let me also look at an existing PRD (like the THCS one) for style reference:

*Viewed [0027-prd-thcs-thpt-test-system-phase1.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/0027-prd-thcs-thpt-test-system-phase1.md) *

### Planner Response

Good — I now understand the PRD format and depth. Per the template instructions, I need to **ask clarifying questions first** before writing the PRD. Let me do that now.

---

Before I write the PRD for IELTS Writing Test, I have some clarifying questions. I've grouped them for easy answering — just reply with the letter/number selections:

### Q1. Scope & Phasing
The interaction list has ~157 items. Should we:
- **A)** One big PRD covering everything (test making → grading → results → solo → homework)
- **B)** Split into phases like THCS (Phase 1: test making + live test taking + basic results, Phase 2: grading + feedback + solo + homework)
- **C)** Other split? Describe.

### Q2. Test Format
IELTS Writing has Task 1 + Task 2. Should the system support:
- **A)** Full test only (Task 1 + Task 2 together, always)
- **B)** Flexible: teacher can create Task 1 only, Task 2 only, or Full Test (both)
- **C)** Full test only for now, flexible later

### Q3. Task 1 Image Upload
For Task 1 (describe a graph/chart/diagram), how should the teacher provide the visual?
- **A)** Upload image only (the teacher creates/screenshots the graph externally)
- **B)** Upload image + paste URL supported
- **C)** We build a chart generator tool (complex, probably later)

### Q4. Essay Editor for Students
How rich should the student's essay editor be?
- **A)** Plain textarea (no formatting, just text + word count) — closest to real IELTS paper test
- **B)** Basic rich text (bold, italic, paragraphs, undo/redo)
- **C)** Plain textarea but with paragraph support (Enter = new paragraph)

### Q5. Spellcheck
During essay writing, should browser spellcheck be:
- **A)** Enabled (helps students, more forgiving)
- **B)** Disabled (closer to real IELTS conditions)
- **C)** Configurable by teacher per test

### Q6. Grading Criteria
Should the teacher grade per IELTS criteria (Task Response, Coherence & Cohesion, Lexical Resource, Grammar), or simpler?
- **A)** Full IELTS criteria (4 criteria × per task, 0-9 scale in 0.5 increments)
- **B)** Simplified: just one overall band score per task + feedback
- **C)** Start with B, upgrade to A later

### Q7. Results Display — When Not Yet Graded
After a student submits a writing test but before teacher grades it:
- **A)** Show "Pending Review" with submission details (word count, time spent) only
- **B)** Show nothing until graded
- **C)** Show "Pending Review" + let student re-read their own essay (read-only)

### Q8. Homework — Due Date Behavior
When a writing homework is past due:
- **A)** Block submission entirely (same as THCS strict policy)
- **B)** Allow late submission with "late" flag
- **C)** Teacher configurable (block or allow late, per assignment)

### Q9. Design Mockups
You mentioned wanting modals and mockups before approving. Should I:
- **A)** Generate image mockups for each major screen (WritingTestBuilder, WritingTestPage, GradingPanel, ResultView) using the generate_image tool
- **B)** ASCII art mockups in the PRD (like the THCS PRD did)
- **C)** Both — ASCII in PRD + generated image mockups for key screens

### Q10. UI Design Style
Should the Writing test UI follow:
- **A)** Same style as existing IELTS Reading/Listening (TwoColumnLayout approach, blue/dark theme)
- **B)** Same style as THCS test (section-based navigation, color-coded progress)
- **C)** New design — describe what you want

*User accepted the command `npx knowns doc edit "migration-progress" -a "`n### 2026-02-27  Batch 1: Test System`n- Created architecture/test-system-architecture (full lifecycle doc)`n- Created patterns/test-taking-flow-pattern (student flow + gotchas)`n- Sources: project-structure-test-creation, test-end-flow-debug-retrospective, timer-bug-fix-retrospective, codebase analysis (41 THCS files, 13 test pages)" --plain 2>&1`*

### User Input

1. a | 2. B | 3. B | 4. A | 5. B | 6. A (ielts writing has some niche rules about marking such as bandscore for criteria cannot be 0.5, only whole number; or skill bandscore will be markdowned if it is not pass each 0.5 mark meaning 6.25 will be 6, 6.7 will be 6.5; but for overall bandscore: from 6.25+, it will be counted as 6.5) | 7. A and C (time spent for each task counted seperately) | 8. c | 9. c | 10. A | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 

### Planner Response

Great answers — especially the IELTS band score rounding rules, that's exactly the kind of nuance that would've caused bugs later. Let me compile what I've locked in and then ask the deeper questions.

---

**Locked In from Round 1:**
- One big PRD, all-in-one
- Flexible tasks (Task 1 only / Task 2 only / Full Test)
- Image upload + URL paste for Task 1
- Plain textarea only (no formatting), spellcheck disabled
- Full IELTS criteria grading (4 criteria, whole numbers 0-9 per criterion)
- Band rounding: criteria = whole numbers; skill band = round DOWN to 0.5 (6.25→6.0, 6.7→6.5); overall band = round UP from .25 (6.25→6.5)
- Pending review shows submission details + read-only essay, time tracked per task
- Homework due date = teacher configurable (block or allow late)
- ASCII + image mockups
- Same UI style as IELTS Reading/Listening

---

## Round 2 — Deep Dive Questions

### 🔢 Band Score Math (you mentioned niche rules — I need to nail this down)

**Q11.** You said criteria scores are whole numbers (0-9). Just to confirm:
- **A)** Each criterion is scored 0, 1, 2, 3, 4, 5, 6, 7, 8, or 9 (integer only, no 0.5)
- **B)** Some other scale?

**Q12.** For a **Full Test** (Task 1 + Task 2), the overall Writing band is calculated as:
`Overall = (Task 1 average × 1/3) + (Task 2 average × 2/3)`
Then the rounding rule applies (round up from .25). 

But how are the **per-task** averages presented? Example: Task 2 scores are TR=7, CC=6, LR=7, GRA=5 → average = 6.25 → **display as 6.0** (round down to 0.5)?
- **A)** Yes, per-task band follows the "round down" rule (6.25→6.0)
- **B)** Per-task band shows as raw average with 1 decimal (6.3)
- **C)** Per-task band uses the same "round up from .25" rule as overall

**Q13.** For a **Task 1 only** or **Task 2 only** test, the overall Writing band is simply the average of 4 criteria (no weighting). Correct?
- **A)** Yes, simple average with round-down-to-0.5 rule
- **B)** Other calculation?

**Q14.** Edge case: If teacher only grades Task 1 but not Task 2 in a Full Test, should the system:
- **A)** Block: can't submit grading until both tasks are scored
- **B)** Allow partial: show Task 1 band, "Pending" for Task 2, no overall band yet
- **C)** Allow partial but show estimated overall based on completed task only

### ⏱️ Time Management

**Q15.** In a Full Test with 60 minutes total, how should time be managed between Task 1 and Task 2?
- **A)** One shared timer for the entire test — student distributes time freely between tasks
- **B)** Separate timers: 20 min for Task 1, 40 min for Task 2, enforced (can't use Task 1 time for Task 2)
- **C)** One shared timer, but **recommended** time indicators shown (e.g., "Recommended: spend 20 min on Task 1")
- **D)** Teacher configures: shared vs split timers per test

**Q16.** You mentioned "time spent for each task counted separately." How should this work with a shared timer?
- **A)** Track wall-clock time while each task tab is active (passive tracking — student doesn't see per-task time, but teacher sees it in results)
- **B)** Student sees per-task time counters live
- **C)** Only track overall time, calculate approximate per-task time from tab-switch timestamps

### ✍️ Essay Writing UX

**Q17.** In a Full Test, how should the student navigate between Task 1 and Task 2?
- **A)** Tabs at top (like section tabs in THCS)
- **B)** Split screen — Task 1 left half, Task 2 right half (both visible)
- **C)** Tabs, but with a "switch task" button + word count summary bar showing both tasks

**Q18.** Should there be a minimum word count **enforcement**?
- **A)** Hard block: can't submit until minimum is reached (150/250)
- **B)** Soft warning: show "Below minimum word count" but allow submit
- **C)** Warning on submit confirmation modal only (e.g., "Task 1: 120/150 words ⚠️ Below minimum")

**Q19.** Maximum word limit — should there be one?
- **A)** No maximum — IELTS has no official max
- **B)** Soft cap (e.g., 500/1000) with warning
- **C)** Teacher-configurable max (optional)

**Q20.** When student submits in a live session, should the essay be **locked** (no further editing)?
- **A)** Yes, immediate lock — identical to IELTS Reading/Listening submit behavior
- **B)** Allow "unsubmit" within a grace period (e.g., 1 minute)
- **C)** Locked, but teacher can "reopen" from monitor

### 🏫 Test Monitor (Teacher watching live session)

**Q21.** What should the teacher see per student in the monitor grid?
- **A)** Word count per task + current task + time elapsed + status (writing/idle/submitted)
- **B)** Word count per task only + status
- **C)** Option A + a "peek" button to read the essay live (real-time sync)

**Q22.** When teacher ends the session, should essays auto-submit?
- **A)** Yes, save whatever the student has written at that moment
- **B)** Give students a 30-second grace period to finish
- **C)** Teacher chooses: immediate end or grace period

### 📝 Test Making (Teacher Builder)

**Q23.** For Task 1 type selection (bar chart, line graph, process diagram, etc.), is this:
- **A)** Just a metadata tag for categorization — doesn't change the UI, purely for teacher's reference
- **B)** Changes the instruction template text (e.g., "Describe the process shown in the diagram" vs "Summarise the information by selecting and reporting the main features")
- **C)** Both — tag + instruction template

**Q24.** Model/sample answer — when teacher provides one, who can see it?
- **A)** Teacher only (reference during grading)
- **B)** Teacher sees during grading + student sees after grading is complete
- **C)** Teacher configurable (toggle: "Show model answer to student after grading")

**Q25.** Should the test builder support **image upload for Task 2** as well (some Task 2 prompts include images)?
- **A)** Yes, optional image upload for both tasks
- **B)** No, Task 2 is text-only always

### 📊 Results & Grading Workflow

**Q26.** Grading flow — when teacher opens a student's essay to grade, should they see:
- **A)** One task at a time (tabbed view: Tab 1 = grade Task 1, Tab 2 = grade Task 2)
- **B)** Both tasks visible simultaneously (scrollable, grade everything on one page)
- **C)** Side-by-side: student essay on left, grading form on right (per task)

**Q27.** Should the teacher be able to **highlight/annotate** specific parts of the student's essay?
- **A)** Yes — select text → add comment (like Google Docs comments)
- **B)** No — just overall feedback text areas (simpler implementation)
- **C)** Nice-to-have, defer to later

**Q28.** Re-grading: Can a teacher change scores after initially submitting grading?
- **A)** Yes, unlimited re-grades — student sees latest scores
- **B)** Yes, but with an audit trail (old scores preserved)
- **C)** No, once graded it's final

### 🗄️ Data & Storage

**Q29.** Where should student essays be stored during a live session?
- **A)** RTDB (real-time sync, teacher can see live) — same pattern as IELTS answer sync
- **B)** Firestore (better for large text, but no real-time sync to monitor)
- **C)** RTDB for real-time tracking + copy to Firestore on submit (long-term storage)

**Q30.** Essay text size — IELTS essays are typically 150-400 words (~2-3KB). But should we set a hard limit on text size to prevent abuse?
- **A)** Yes, hard limit of ~5000 characters (~800 words) — enough for any legitimate essay
- **B)** Yes, hard limit of ~10000 characters (~1600 words) — very generous
- **C)** No hard limit, but cap auto-save frequency for large texts

### 🏠 Solo Practice & Homework

**Q31.** In solo practice, should the student get any feedback after submitting?
- **A)** Only word count + time spent summary (no grading in solo — teacher must grade later)
- **B)** Show submission confirmation only ("Your essay has been saved")
- **C)** In solo self-study mode: show word count + time only. In homework mode: show "Submitted — Pending Teacher Review"

**Q32.** For homework attempts — if teacher allows multiple attempts:
- **A)** Student can re-write from scratch each time
- **B)** Student's previous essay is pre-loaded and they can edit/improve it
- **C)** Teacher configurable

### ⚠️ Potential Conflicts & Edge Cases I've Identified

**Q33.** **Conflict: Task navigation + auto-save timing.** If student is on Task 1, switches to Task 2, types one word, and the auto-save fires — should it save both tasks or only the active one?
- **A)** Always save both tasks together (simpler, safer)
- **B)** Save only the active task (less RTDB writes)

**Q34.** **Edge case: Empty essay submission.** Student submits with 0 words on Task 1 but 300 words on Task 2. Should the system:
- **A)** Allow it — teacher grades whatever is there (even blank tasks get a band 0)
- **B)** Warn but allow: "Task 1 is empty. Are you sure?"
- **C)** Block: "You must write something for all tasks"

**Q35.** **Edge case: Session disconnect during writing.** If student gets disconnected mid-essay:
- **A)** Last auto-saved version is preserved. On reconnect, resume from that point (same as IELTS reconnect behavior)
- **B)** Something different?

**Q36.** **Edge case: Teacher creates a "Task 1 only" test but accidentally sets 250-word minimum.** Should there be:
- **A)** Default word minimums per task type (150 for Task 1, 250 for Task 2) that teacher can override
- **B)** Teacher always sets word minimum manually (no defaults)
- **C)** Defaults + teacher can override, but show warning if they set unusual values

### User Input

11. A | 12. A | 13. A | 14. B | 15. A | 16. A | 17. A | 18. only for solo Practice and Homework: teacher configure | 19. A | 20. C | 21. C | 22. A | 23. A | 24. C - this input is optional | 25. B | 26. A and C | 27. A   (teacher text editor must also be advanced rich text editor) | 28. B | 29. C | 30. C | 31. writing is without auto-grade feature so for solo/homework writing task, even if this happen in THCS test, any test with writing will be able to submit to teacher for grading |  32. B | 33. B | 34. A | 35. A | 36. A (18 discussed this, minimum word limit only applies for homework/solo practice) | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 

### Planner Response

Excellent answers — especially Q31, which reveals a **fundamental architecture difference**: solo/homework writing flows INTO the teacher's grading queue, unlike Reading/Listening which is fully self-contained. That has big implications. Let me lock in and dig into Round 3.

---

**Locked In from Round 2:**
- Criteria: whole numbers 0-9 only
- Per-task band: round DOWN to 0.5 (6.25→6.0)
- Overall band: round UP from .25 (6.25→6.5)
- Partial grading allowed (grade Task 1 first, Task 2 later)
- One shared timer, student distributes freely. Per-task time tracked passively
- Tabs for task navigation
- Word min enforcement: only in solo/homework, teacher-configurable. Live session: no enforcement
- No word maximum
- Submit locks essay, teacher can "reopen" from monitor
- Monitor: word count + status + peek button
- Auto-submit when teacher ends session
- Task 1 type is metadata tag only
- Model answer: teacher-configurable visibility, optional input
- Task 2: text-only (no image)
- Grading: tabbed per task, side-by-side (essay left, grading right)
- Inline annotations: select text → add comment (teacher rich text editor)
- Re-grading with audit trail
- RTDB for real-time + Firestore copy on submit
- No text size hard limit, cap auto-save frequency
- **Solo/homework writing → submit to teacher for grading** (not self-contained)
- Homework re-attempt: pre-load previous essay
- Auto-save: only active task
- Allow empty task submission
- Reconnect: resume from last auto-save
- Default word minimums (150/250), teacher can override

---

## Round 3 — Architecture, Workflow Gaps & Edge Cases

### 📤 Solo/Homework → Teacher Grading Pipeline (Critical New Flow)

This is the biggest non-obvious feature. In Reading/Listening, solo practice is fully self-contained (auto-grade → results). Writing changes this.

**Q37.** When a student submits a writing essay from solo practice, **how does it reach the teacher?**
- **A)** Automatically: system assigns it to the teacher who created the test (test owner)
- **B)** Automatically: system assigns it to the student's class teacher (if enrolled in a class)
- **C)** Student chooses: list of teachers they're enrolled with → select who to send it to
- **D)** Mixed: homework → automatically goes to assigning teacher. Solo self-study → student chooses.

**Q38.** What if the student isn't enrolled in any class (guest or unassigned student)? Can they still practice writing solo?
- **A)** Yes, but essays stay in "self-review" — no teacher grading, student just tracks word count and time
- **B)** No, writing practice requires a class enrollment (teacher must exist to grade)
- **C)** Yes, essay is saved and can be assigned to a teacher later when they join a class

**Q39.** Should the teacher's grading queue distinguish between sources?
- **A)** Yes, show source tags: "Live Session" / "Homework" / "Solo Practice" per submission
- **B)** No, all essays look the same in the queue
- **C)** Yes, AND allow filtering by source type

**Q40.** Can a student submit the **same solo writing test** multiple times to a teacher?
- **A)** Yes, unlimited — each submission is a separate grading entry
- **B)** Yes, but only after previous submission is graded (prevents spam)
- **C)** No, one submission per test per student (must use a different test for another attempt)

### 🖊️ Teacher Grading — Rich Text & Annotations

**Q41.** For inline essay annotations (select text → add comment), how should comments be stored?
- **A)** As character offset ranges + comment text (simple, can break if essay is modified — but essays are read-only at grading time so this is safe)
- **B)** As separate comment objects with quoted text for reference

**Q42.** Should the teacher be able to annotate with **categories** (e.g., tag a comment as "Grammar Error" / "Vocabulary Suggestion" / "Coherence Issue" / "Good Point")?
- **A)** Yes, comment categories matching the 4 IELTS criteria
- **B)** No, just free-text comments
- **C)** Nice-to-have, defer to later

**Q43.** The teacher's per-criteria feedback text — is this:
- **A)** Rich text (bold, italic, lists, links — using the rich text editor you mentioned)
- **B)** Plain text only
- **C)** Rich text for overall feedback, plain text for per-criteria

### 🔄 Grading Audit Trail

**Q44.** When a teacher re-grades, what should the student see?
- **A)** Only the latest scores/feedback (previous version hidden from student, visible to teacher in audit log)
- **B)** Student can see grading history (v1, v2, v3...) with diffs
- **C)** Student sees latest + a note "Updated on [date]" — no full history

**Q45.** If a teacher re-grades and lowers the score, should there be a safeguard?
- **A)** Confirmation dialog: "Previous band was 6.5, new band is 5.5. Confirm downgrade?"
- **B)** No special handling — just save the new scores
- **C)** Confirmation + reason field required (e.g., "Re-evaluated coherence criteria")

### 📱 Monitor & Live Session Edge Cases

**Q46.** "Peek" button in monitor — when teacher peeks at a student's essay live, should the student know?
- **A)** No, invisible peek (teacher reads silently)
- **B)** Yes, show indicator to student: "Teacher is viewing your essay"
- **C)** Teacher configurable

**Q47.** Teacher "reopen" from monitor — when teacher unlocks a submitted student's essay:
- **A)** Student gets a notification/toast: "Your essay has been reopened for further editing"
- **B)** Essay silently unlocks, student discovers on their own when they look at the test page
- **C)** Both — notification + unlock

**Q48.** Edge case: Teacher reopens a student's essay with 5 minutes left on the shared timer. Timer expires. What happens?
- **A)** Auto-submit again (timer takes priority)
- **B)** Reopened essays are exempt from the timer — teacher override means timer doesn't apply to that student anymore
- **C)** Auto-submit, but teacher can reopen again if needed

### 📊 Academic Record & THCS Integration

**Q49.** You mentioned THCS tests can also have writing questions (sentence-rewrite). If a THCS test has writing, should those also flow to the teacher grading queue?
- **A)** Yes — any test with writing questions, regardless of type (IELTS Writing or THCS sentence-rewrite), flows to the grading queue
- **B)** No — THCS writing questions (sentence-rewrite) are graded differently (they already have the `thcsWritingGrading.service.ts`). Only IELTS Writing tests go to the new grading queue.
- **C)** They are separate systems with separate grading queues

**Q50.** How should IELTS Writing results appear in the academic record?
- **A)** Under the existing "Writing" skill breakdown — showing band score trend, criteria averages
- **B)** As a new section alongside IELTS Reading/Listening with its own progress charts
- **C)** Integrated into existing skill breakdown, with a "Criteria Detail" expandable section showing TR/CC/LR/GRA trends

### ⚠️ Conflicts & Irregular Cases I've Found

**Q51.** **Potential conflict: "Task 1 only" test + band calculation.** Task 1 uses "Task Achievement" (TA), while Task 2 uses "Task Response" (TR) — they're technically different criteria names even though scored the same way. Should the system:
- **A)** Use the correct criterion name based on task type (TA for Task 1, TR for Task 2) — strictly IELTS-accurate
- **B)** Use generic "Task Response" for both to simplify
- **C)** Show the correct name but treat them identically in code (same scoring logic, different label)

**Q52.** **Edge case: Teacher creates a Full Test, student writes both tasks, but during grading the teacher realizes Task 1 prompt was wrong and wants to void it.** Should there be:
- **A)** "Void Task" button — removes that task from the calculation, overall band uses only Task 2
- **B)** Teacher just gives Task 1 a compassionate score (teacher judgment)
- **C)** No special handling — teacher re-edits the test and re-assigns

**Q53.** **Irregular timing scenario:** In solo practice with no timer, student could leave an essay open for DAYS before submitting. Is this acceptable?
- **A)** Yes, no time pressure in solo — they submit when ready
- **B)** Auto-close after a configurable timeout (e.g., 72 hours)
- **C)** Track "active writing time" vs "total elapsed time" separately — show active time in results

**Q54.** **Prevention: Plagiarism/copy-paste.** Should the essay editor detect or prevent copy-pasting?
- **A)** No restrictions — this is a learning tool, not a proctored exam
- **B)** Track paste events and show "Pasted text detected" flag to teacher in grading
- **C)** Block paste entirely in live session mode, allow in solo/homework

*User accepted the command `npx knowns doc edit "migration-progress" -a "`n### 2026-02-28  Gap Fill 2: AI, Routing, Sessions, Design, Security`n- Created architecture/ai-parsing-extraction (Gemini/Groq pipeline, THCS regex, error handling)`n- Created architecture/routing-navigation (React Router, PrivateRoute, breadcrumbs, mobile)`n- Created architecture/session-test-modes (5 modes, timer sync, teacher monitor, RTDB)`n- Created architecture/ui-design-standards (Teacher glassmorphism, Student social feed, Avatar)`n- Created architecture/security-architecture (5 layers, 7 vulns, integration safety rules)`n`n## FINAL STATUS: 168 docs, 0 errors. 16 architecture docs covering ALL domains." --plain 2>&1`*

### User Input

37. D | 38. A and C | 39. A and C | 40. A | 41. recommendation as I also want to highlight or change color of the text when grading | 42. I asked for advanced rich text editor , why are you suggetsing this? | 43. A | 44. A | 45. C | 46. A | 47. C | 48. A (reopen only works on given time, time ends means test ends for students) | 49. A | 50. B | 51. A | 52. A | 53. A and C | 54. can we allow copy/paste/cut if the content is within the editor, but if they come from outside of the editor, they won't be allowed? | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 

### Planner Response

Good points — you're right on Q42, I shouldn't have suggested simplifying when you already specified advanced rich text editor. And Q54 is a smart middle-ground. Let me lock in and go deeper.

---

**Locked In from Round 3:**
- Solo → student chooses teacher to submit to. Homework → auto to assigning teacher.
- No class enrollment: self-review only (word count + time), essay saved for later teacher assignment
- Grading queue: source tags ("Live" / "Homework" / "Solo") + filtering by source
- Unlimited solo resubmissions
- Teacher annotations: highlighting, color changes, AND comments on student essay (rich annotation layer)
- Teacher feedback uses advanced rich text editor throughout (per-criteria + overall)
- Student sees latest grading only; teacher has audit trail with re-grade reason required
- Invisible peek; reopen with notification + unlock; reopen bound by timer
- Any test with writing (IELTS Writing OR THCS sentence-rewrite) → grading queue
- Writing gets its own academic record section (alongside R/L, not merged)
- Task Achievement (Task 1) vs Task Response (Task 2) — correct IELTS naming
- "Void Task" button for teacher to exclude a task from calculation
- Solo: no time pressure, track active writing time vs total elapsed separately
- Copy/paste: block external paste, allow internal copy/cut/paste within the editor

---

## Round 4 — Final Gaps, Implementation Edge Cases & Advice

### 📝 Teacher Annotation System (Key UX — Need Precise Spec)

**Q55.** When teacher annotates the student's essay, what annotation types should be available?

I recommend this annotation toolkit based on your requirements:
| Tool | Description |
|---|---|
| **Highlight** | Select text → pick color (4 colors mapping to TR/CC/LR/GRA criteria) |
| **Comment** | Select text → add a text comment bubble (appears in margin or inline) |
| **Strikethrough** | Mark incorrect text with strikethrough |
| **Correction** | Insert suggested replacement text (shown in different color above/below original) |

- **A)** All 4 tools above
- **B)** Highlight + Comment only (simpler)
- **C)** Highlight + Comment + Strikethrough (no correction suggestions)
- **D)** A different set? Describe.

**Q56.** The 4 highlight colors mapping to criteria — should these be:
- **A)** Fixed system colors: e.g., Blue=TR/TA, Green=CC, Orange=LR, Red=GRA
- **B)** Teacher can pick any color (free palette)
- **C)** Both: 4 preset "criteria colors" quick-buttons + free color picker for custom

### 📤 "Submit to Teacher" UX (Solo Practice Flow)

**Q57.** When a student finishes solo writing practice and wants to submit to a teacher, what does the UX look like?
- **A)** After finishing essay → "Submit for Review" button → modal with dropdown of enrolled teachers → confirm → essay appears in that teacher's grading queue
- **B)** After finishing essay → automatically shows list of teachers → student taps one → done
- **C)** After finishing → "Submit for Review" button → if only 1 teacher available, auto-select; if multiple, show dropdown

**Q58.** Should the student be able to add a message/note when submitting to teacher?
- **A)** Yes, optional text field ("Add a note for your teacher...")
- **B)** No, just submit the essay
- **C)** Yes, but only for solo practice (not for homework which has its own context)

### 🔔 Notifications — Exact Triggers

**Q59.** Which notification triggers do you want for IELTS Writing? (Select all that apply)
- **a)** Student → Teacher: "New writing submission from [Student Name] — [Test Title]" (when solo/homework essay submitted)
- **b)** Teacher → Student: "Your writing test [Test Title] has been graded — Band [X]" (when grading completed)
- **c)** System → Student: "Writing homework [Title] is due in 24 hours" (due date reminder)
- **d)** System → Student: "Writing homework [Title] is overdue" (past due)
- **e)** System → Teacher: "You have [N] ungraded writing submissions" (daily/periodic digest)
- **f)** Teacher → Student: "Your essay has been reopened for editing" (monitor reopen)
- **g)** All of the above

### 🗂️ Grading Queue Management

**Q60.** When the grading queue has submissions from multiple sources (live sessions, homework, solo), how should the default sort order be?
- **A)** Submission date (newest first)
- **B)** Submission date (oldest first — grade in order received)
- **C)** Priority: Homework (deadline-sensitive) → Live Session → Solo Practice, then by date within each

**Q61.** Should the grading queue show an "estimated grading time" or any workload indicator?
- **A)** Yes: show essay word count as a proxy (longer essays = more grading time)
- **B)** No, just show the list
- **C)** Show word count + number of pending submissions as a workload summary

**Q62.** Can multiple teachers grade the same student's essay?
- **A)** No, only one teacher can grade each submission (the assigned teacher or test owner)
- **B)** Yes, but only the primary assigned teacher's grades count — others can leave comments only
- **C)** Yes, multiple teachers can grade independently (for moderation/calibration) — show both

### 🏫 Course Module Integration

**Q63.** When a teacher adds a writing test to a course module, should it behave like:
- **A)** A material that students can practice outside of class (same as adding Reading/Listening to a module)
- **B)** A material that MUST be assigned as homework to be usable (can't just practice from module)
- **C)** Both: appears in module, student can practice it as solo OR teacher can assign it as homework from the module

### 🔍 Edge Cases & Preventions I've Identified

**Q64.** **Active writing time tracking** — how to detect "active" vs "idle"?
I recommend:
- Track time between keystrokes. If gap > 3 minutes, stop counting active time until next keystroke.
- Also track per-task by monitoring which tab is active.
- **A)** Yes, this approach works
- **B)** Simpler: just track tab-active time (don't detect idle within a tab)
- **C)** Different threshold or approach?

**Q65.** **External paste blocking** — My recommended implementation:
- On `paste` event: check if the pasted content has a custom `data-internal-editor` marker
- On `copy`/[cut](cci:1://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/backupService.ts:243:0-258:1) from within our editor: add that marker to clipboard
- If marker is missing on paste → block and show toast: "External content pasting is disabled"
- **Edge case:** This can be bypassed by typing into another tab and copying from there. Accept this limitation?
- **A)** Yes, best-effort blocking is acceptable (it's a learning aid, not a proctored exam)
- **B)** Need stronger enforcement (would require more complex solutions like keystroke timing analysis)

**Q66.** **Void Task edge case:** When teacher voids Task 1 in a Full Test, the overall band becomes just Task 2's average (no weighting). But what happens in academic record? Should voided tasks:
- **A)** Be recorded as voided — academic record shows "Band 6.5 (Task 2 only, Task 1 voided)"
- **B)** Just show the resulting band with no special indicator
- **C)** A — and also not count toward the "Number of Writing tests completed" stat

### ⚠️ My Advice — Potential Issues

**Q67.** **Advice: THCS writing in grading queue.** You said any test with writing goes to the grading queue (Q49=A). THCS `sentence-rewrite` questions already have `thcsWritingGrading.service.ts` which does a basic auto-grading. Do you mean:
- **A)** THCS writing questions still auto-grade first, AND then appear in the queue for teacher review/override
- **B)** THCS writing questions skip auto-grading entirely and go straight to manual grading (replacing current behavior)
- **C)** Keep THCS auto-grading as-is, but teacher can optionally review from the queue if they want

**Q68.** **Advice: Grading queue could get overwhelming.** If a teacher has 30 students who each submit a Full Test (2 essays each), that's 60 essays to grade. Have you thought about:
- **A)** Batch grading shortcuts (quick-band: click a pre-set band button for common scores)
- **B)** Grading templates (save common feedback phrases, one-click insert)
- **C)** Both A + B
- **D)** This is fine, teacher will grade at their own pace, no shortcuts needed for now

**Q69.** **Advice: Data size concern.** Rich text annotations + rich text feedback + essay text + audit trail could make each grading record quite large (10-50KB per student). Since this goes into Firestore, is this:
- **A)** Acceptable — Firestore docs have a 1MB limit, this is well within it
- **B)** Concern — should we consider splitting annotations into sub-documents?

That's my Round 4. I think we're about **85% complete** on the vision. One or two more rounds and I think we can start writing the PRD + generating mockups.

### User Input

55. A + change text color + have option to create different categorizations of color alongside 4 criteria (I might want to add brown SPL for spelling, crimson FMT for format, etc.) | 56. C (to support 55) | 57. A | 58. A (exclude test with teacher) | 59. g (find all interactions and decide which one deserves to be reported through notification | 60. A | 61. C | 62. A | 63. C | 64. A (choose the proper value of time to not stress our system) | 65. B (I want a solution that fit our tech and limitation if there is) | 66. C | 67. A | 68. D | 69. B | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 

### Planner Response

Locking in Round 4 — we're in the final stretch now. A few targeted questions remain.

---

**Locked In from Round 4:**
- Annotation toolkit: Highlight + Comment + Strikethrough + Correction suggestion + Text color change
- Custom annotation categories: 4 IELTS criteria presets (TR/TA, CC, LR, GRA) + teacher-defined custom categories (e.g., SPL, FMT) with custom colors
- Free color picker + presets
- Solo submit: "Submit for Review" → teacher dropdown → confirm. Optional note (solo only, not homework)
- All notification triggers from Q59 list + additional ones from interaction audit
- Sort by newest first. Workload: word count + pending count summary
- One teacher per submission
- Module: both solo + homework-assignable
- Active time tracking: keystroke gap method with proper threshold
- External paste: stronger enforcement wanted
- Voided tasks: recorded, don't count toward stats
- THCS writing: auto-grade first → then queue for teacher review/override
- No batch grading shortcuts for now
- Split annotations into Firestore sub-documents

---

## Round 5 — Final Precision Questions

### 🔒 External Paste Blocking (Stronger Solution)

**Q70.** For stronger paste prevention, here's what's technically feasible with a plain textarea:

**Option 1: Input pattern analysis**
- Track every keystroke (character count delta per event)
- If a single `input` event inserts >5 characters at once AND it's not an undo operation → it's a paste → block
- Allows: normal typing, autocorrect (1-2 chars), undo/redo (restore tracked content)
- Blocks: external paste, drag-drop from outside
- **Limitation:** Student could type in another app and paste — this catches it. But very slow typing of copied text character-by-character cannot be detected.

**Option 2: Clipboard API interception (your current plan) + input monitoring**
- Set custom clipboard marker on internal copy/cut
- Block paste without marker
- ALSO monitor input events for sudden large insertions as fallback
- Most robust combination

**Option 3: Virtual keyboard tracking**
- Log every keydown → correlate with input changes
- Any text that appeared without a corresponding keydown = blocked
- Catches everything except keyboard macro tools
- **Limitation:** More complex, may interfere with IME (Vietnamese input methods)

Since your students may use Vietnamese input (IME), Option 3 has risks. I recommend **Option 2**.
- **A)** Option 2 (clipboard + input monitoring)
- **B)** Option 1 (input pattern only — simpler)
- **C)** Different approach?

### 🎨 Custom Annotation Categories

**Q71.** Where does the teacher create/manage custom annotation categories (colors)?
- **A)** In the grading interface itself — a "Manage Categories" button that opens a mini-editor
- **B)** In teacher settings (global, applies to all grading sessions)
- **C)** Both — global defaults in settings + can add new ones on-the-fly during grading

**Q72.** Should custom categories be per-teacher or shared across the school?
- **A)** Per-teacher (each teacher has their own set)
- **B)** Shared within a class/school
- **C)** Per-teacher defaults, can import another teacher's categories

### 📱 Mobile & Responsive

**Q73.** IELTS Writing tests are typically taken on desktop/laptop (students need a keyboard for essay writing). For mobile:
- **A)** Block: "Writing tests require a laptop/desktop. Please switch devices."
- **B)** Allow but warn: "Best experienced on desktop" — render single-column layout
- **C)** Full mobile support — tabs stack vertically, keyboard-friendly

**Q74.** Teacher grading on mobile — should it be supported?
- **A)** No — grading UI is too complex for mobile (annotation, side-by-side, etc.)
- **B)** Simplified mobile grading: view essay + enter band scores only (no annotation)
- **C)** Full mobile support (complex but possible)

### 🗑️ Deletion & Cleanup

**Q75.** If a teacher deletes a writing test that has ungraded submissions in the queue:
- **A)** Block deletion: "This test has X ungraded submissions. Grade or discard them first."
- **B)** Warn but allow: "X submissions will be permanently lost. Continue?"
- **C)** Orphan the submissions: essays remain in queue but marked as "Test deleted — grade or discard"

**Q76.** How long should draft tests be kept?
- **A)** Indefinitely until teacher manually deletes
- **B)** Auto-clean after 90 days of inactivity
- **C)** Teacher configured retention period

### 📊 Student Dashboard Integration

**Q77.** On the student dashboard, how should pending writing reviews appear?
- **A)** A "Pending Reviews" section showing: test title, submitted date, status (Pending/Graded), and when graded → shows band score
- **B)** Integrated into the existing "Recent Activity" feed
- **C)** Both — feed entry + dedicated "My Writing Submissions" section accessible from sidebar/profile

### ⚠️ Final Edge Cases

**Q78.** **Edge case: Student submits solo essay to teacher, teacher hasn't graded it, student deletes their account.** What happens to the essay in the queue?
- **A)** Essay remains in queue as "[Deleted Student]" — teacher can still grade for record
- **B)** Essay auto-removed from queue
- **C)** Mark as "Student account deleted" — teacher can choose to archive or discard

**Q79.** **Edge case: Teacher starts grading an essay, leaves the page without saving, comes back.** Should there be:
- **A)** Auto-save grading progress (same debounced save as test editor)
- **B)** Warning on page leave: "You have unsaved grading progress"
- **C)** Both — auto-save + leave warning as backup

**Q80.** **Edge case: Two separate live sessions using the same writing test.** Student takes it in both sessions. Should:
- **A)** Each session creates a separate submission — both appear in grading queue
- **B)** Only the latest session's submission appears (overwrite)
- **C)** Block: student can't join a session with a test they've already taken

### 💡 My Final Advice

**Advice 1: Data architecture for annotations sub-documents.** You chose to split annotations into sub-documents (Q69=B). I recommend:
```
Firestore:
  writing_gradings/{gradingId}          ← Main grading result (band scores, metadata)
  writing_gradings/{gradingId}/annotations/{annotationId}  ← Individual annotations
  writing_gradings/{gradingId}/audit/{version}              ← Grading history
```
- **A)** This structure works
- **B)** Prefer a different structure?

**Advice 2: The "Submit to Teacher" flow from solo practice is a novel interaction in your app — neither Reading/Listening nor THCS has this.** It creates a teacher-student communication channel outside of live sessions. Consider whether this overlaps with or replaces the existing feedback system (`TeacherFeedbackManager`, `StudentFeedbackViewer`).
- **A)** Writing grading IS the feedback system for writing — use a separate grading result structure, don't mix with existing feedback
- **B)** Integrate with existing feedback system — writing grading saves as enhanced feedback

I believe after this round we'll be at **~95% complete** and ready to write the PRD + generate mockups. Let me know if you want one more round or if we should proceed.

### User Input

70. does option 2 has limitation or ways to cheat? what is your recommendation ? | 71. C | 72. A | 73. C | 74. A | 75.  Why is this a concern? ielts writing question prompt for either task is so small, why don't we just coupled them with the submission?  Teacher needs to see the question text to grade anyway. Did we not have a conclusion about result submission being independent entity previously? that result only need meta data from the test to know the origin of the result? we did not have that? | 76. B | 77. A | 78. C | 79. C | 80. A | Advice 1: reassess, if you think this works then I approve, provide improvements/adjustements/refractorings/redesigns if needed | Advice 2: A | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 
you can stop and start compiling if you think there is nothing more you need, the plan you make will leave no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate.




### Planner Response

Let me address your outstanding questions first, then I'll compile everything into the PRD.

**Q70 — Option 2 Limitations & Recommendation:**

Option 2 (clipboard API + input monitoring) has these limitations:
1. **Browser extensions** could strip custom clipboard markers — but requires deliberate installation
2. **Drag-and-drop from outside** bypasses paste event — **fix: also block `drop` events from external sources**
3. **Browser DevTools** could set textarea value programmatically — **fix: input monitoring catches sudden large insertions**
4. **Fundamental limit**: student can look at external text and manually retype — **no technology can prevent this**

**My recommendation: Option 2 + drop event blocking + log paste attempts for teacher.** This gives ~95% prevention. Acceptable since this is a learning tool. Going to compile this into the PRD now.

**Q75 (Test deletion):** You're absolutely right — I was overcomplicating this. The submission should embed the task prompts (they're tiny, ~100 characters each). Results are self-contained entities with metadata. Deleting a test doesn't affect submissions. This is cleaner architecture.

**Advice 1 Reassessment:** After calculating data sizes (essay ~4KB, annotations ~10KB, feedback ~2.5KB, audit ~2.5KB = ~20KB total per submission) — a single Firestore document handles everything. Sub-documents add unnecessary complexity. **Revised recommendation: ONE Firestore document per submission** containing essays + grading + annotations + audit trail. Well within Firestore's 1MB limit.

---

Now I'll compile the PRD. This is going to be a very large document, so I'm writing it directly to file.

### Planner Response

The PRD is too large for one response. I'll write it in sections. Starting with the first half:

### Planner Response

Writing Part 1 of the PRD to file now:

*Edited relevant file*

### Planner Response

Now let me create the conversation log and generate key mockups:

### Planner Response

The conversation log already exists. Let me append to it:

*Viewed [conversation_2026-02-27_log.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/conversation_2026-02-27_log.md) *

*Edited relevant file*

### Planner Response

PRD is complete at [0030-prd-ielts-writing-test-system.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/0030-prd-ielts-writing-test-system.md). Here's what's in it:

**Structure:**
- **§1-3**: Overview, 6 goals, 15 user stories
- **§4.1**: Complete TypeScript data model — `IELTSWritingTest`, `WritingSubmission`, `WritingGradingResult`, `WritingAnnotation`, `WritingGradingAudit`, band score calculator with exact IELTS rounding rules in code
- **§4.2**: Test Builder — layout mockup, all behaviors, validation, publish flow
- **§4.3**: Student Writing Page — two-column layout, tab navigation, word counter, paste prevention implementation (clipboard API + input monitoring + drop blocking), per-task active time tracking
- **§4.4**: Teacher Monitor — writing-specific cards with word count, status, peek button
- **§4.5**: Grading System — queue with filtering, side-by-side grading interface with annotation toolbar (5 tools + custom categories), void task, re-grading with audit trail
- **§4.6**: Results & Review — pending view + graded view with annotations
- **§4.7**: Solo Practice — "Submit to Teacher" flow with teacher selection dropdown
- **§4.8**: Homework — configurable late policy, word min enforcement, re-attempt with pre-loaded essay
- **§4.9**: Notifications — 7 trigger types
- **§4.10**: Academic Record — Writing progress section
- **§4.11**: THCS Writing integration
- **§5-9**: Non-goals, design notes, technical considerations, success metrics, open questions

**Next step:** Review the PRD, then I'll generate image mockups for the key screens (Builder, Student Test Page, Grading Interface, Results View). Want to review first or should I start generating mockups now?