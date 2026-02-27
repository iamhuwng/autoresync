# Phase 3 Implementation Notes — From Phase 2 Experience

> **Purpose:** Critical context gathered during Phase 1+2 implementation to prevent the same mistakes in Phase 3 task generation. This is NOT a task list — it's input for the task generation process.

---

## 🔴 Critical Architecture Gotchas

### 1. passageTitle/passageContent vs section.passage — DATA FORMAT MISMATCH
**Location:** `THCSSectionBlock.tsx` lines 278-286
**Issue:** The editor saves passage data as `section.passageTitle` and `section.passageContent` (flat strings on the section object, cast with `as any`), but the TYPE SYSTEM defines it as `section.passage.title` and `section.passage.content` (nested object).
**Impact on Phase 3:** Any task touching reading passages in the editor, student view, or auto Test Maker MUST account for this mismatch. Either:
- (a) Phase 3 adds a migration task to fix the editor to use `section.passage` properly, OR
- (b) Phase 3 tasks that read passage data must handle BOTH formats

### 2. publishedTestId — Re-publish Flow
**Location:** `THCSTestEditorPage.tsx` → `handlePublish`
**Pattern:** `publishedTestId || generateThcsTestId()` — first publish creates new ID, subsequent publishes reuse it.
**Draft Storage:** `publishedTestId` is stored on the Firestore draft document (added in Phase 2 fix).
**Impact on Phase 3:** Homework assignment pinning relies on `_cachedVersion` and `versionKey` from `sessionManager.js`. If Phase 3 homework uses a different assignment path (not game_sessions), the version pinning logic needs adaptation.

### 3. markThcsTest() is PATH-AGNOSTIC (Forward Reference in Code)
**Location:** `thcsAutoMarking.service.ts` lines 5-10
**Existing Comment:** "This function accepts sections and studentAnswers as INPUT PARAMETERS — it does NOT hardcode any RTDB paths internally. In Phase 3, homework answers will be stored at `homework_submissions/{homeworkId}/{studentId}/`"
**Impact:** The grading function can be reused directly for homework. BUT the caller must handle reading answers FROM the correct path and writing results TO the correct path.

### 4. THCSTestLayout.tsx — Tightly Coupled to RTDB Sessions
**Location:** `THCSTestLayout.tsx` lines 152-169
**Issue:** `saveAnswersToRTDB` and `handleSubmit` hardcode `game_sessions/${sessionCode}/students/${user.uid}/...` paths. Timer, submission, progress writing ALL go to this path.
**Impact on Phase 3:** Homework mode CANNOT reuse THCSTestLayout as-is. Options:
- (a) Add a `mode: 'session' | 'homework'` prop and branch internally (risky — large component), OR
- (b) Create a thin adapter that swaps the submission/save functions, OR
- (c) Extract the pure UI rendering into a shared component, build separate data layers for session vs homework

### 5. THCSPreviewOverlay Already Solves "Local-Only" Mode
**Location:** `THCSPreviewOverlay.tsx`
**Pattern:** It uses the SAME question renderers but with local state only — no RTDB reads/writes. The interactive mode even runs mock grading.
**Impact on Phase 3:** This component's pattern (local state + markThcsTest) could be the basis for homework's offline/standalone mode. Copy the architecture, just swap the submit handler to write to `homework_submissions/` instead of local state.

---

## 🟡 Type System Notes

### THCSQuestion — Discriminated Union by `type` Field
The `THCSQuestion` interface is a MEGA interface where Phase 2 fields are optional:
```ts
// MCQ fields (always present for MCQ types)
options, correctAnswer
// Fill-in fields (only for verb-form/word-form)
sentenceTemplate, blankAnswers
// Writing fields (only for sentence-rewrite/sentence-rewrite-keyword)
originalSentence, sentenceStarter, keyword, modelAnswers
// Cloze fields (only for reading-cloze-wordbank)
passageTemplate, wordBank, blankMapping
```
If Phase 3 adds new question types (e.g., listening, matching), they should follow this pattern — add optional fields to THCSQuestion, NOT create separate interfaces.

### THCSGradingResult — Not the Same as TestMarkingResult
Two separate result types exist:
- `THCSGradingResult` — THCS-native with `scaledScore`, `totalPoints`, `maxPoints`, `sectionResults`, `questionResults`
- `TestMarkingResult` — legacy format for the existing pipeline with `totalScore`, `maxScore`, `percentage`
- Adapter: `thcsResultToTestMarkingResult()` converts between them

Phase 3 homework grading should STORE `THCSGradingResult` natively (not the adapted format).

### Writing Grading is 3-Tier
```
Tier 1: Exact match (≥80% similarity) → auto-correct
Tier 1: Low match (<30%) → auto-incorrect
Tier 2: AI grading (30-80% range) → calls Gemini/Groq
Tier 3: AI fails → marked as "pending" for teacher review
```
Phase 3 homework with writing questions will have `gradingStatus: 'partial'` until teacher reviews. Task list MUST include the teacher review UI for homework writing questions.

---

## 🟢 Patterns to Reuse

### 1. Version Pinning (sessionManager.js)
```js
// For THCS tests:
assignment.versionKey = test._changelog ? latestKey : null;
assignment._cachedVersion = fullTestSnapshot;
```
Phase 3 homework should use the SAME pattern — cache the test version at assignment time.

### 2. Delta-Based Versioning (thcsTestStorage.ts)
`computeDelta()`, `publishTestUpdate()`, `reconstructVersion()` — all work. Phase 3 doesn't need to rebuild this.

### 3. Validation Hook Pattern (useThcsValidation.ts)
Returns `{ errors: string[], warnings: string[], isValid: boolean }`. Phase 3 should extend this for homework-specific validations (deadline set, students selected, etc.), NOT create a separate hook.

### 4. Auto Test Maker (Phase 3 Feature)
PRD-0029 includes auto test maker. The AI services already exist:
- `ai.service.ts` — router
- `gemini.provider.ts` / `groq.provider.ts` — providers
The `ai-extractor.service.ts` for IELTS already parses documents. THCS version should follow the same pattern.

---

## 🔵 Pre-existing Lint Issues (Not Bugs — Intentional)

| File | Issue | Reason |
|------|-------|--------|
| `THCSSectionBlock.tsx:12` | `Button` imported but unused | Was used, import remains — safe to remove in cleanup task |
| `THCSSectionBlock.tsx:278-286` | `passageTitle`/`passageContent` not on `THCSSection` | Draft format uses flat keys with `as any` — needs migration (see gotcha #1) |

---

## 📐 File Size & Complexity Reference

| File | Lines | Notes |
|------|-------|-------|
| `thcs-test.types.ts` | 392 | Type definitions — extension point |
| `THCSTestEditorPage.tsx` | ~630 | Main editor — already very large, consider extraction |
| `THCSTestLayout.tsx` | 509 | Student test view — needs refactoring for homework mode |
| `thcsAutoMarking.service.ts` | 472 | Grading — path-agnostic, reusable |
| `THCSPreviewOverlay.tsx` | 438 | Preview — pattern for local-only mode |
| `sessionManager.js` | ~800 | Session management — THCS version pinning added here |
| `StudentDetailModal.tsx` | 1212 | Very large — avoid adding more logic here |

---

## ⚠️ Task List Quality Learnings

### From Phase 2 Junior Assessment (Conversation a5ec522c):
1. **Always specify exact file paths** — don't say "the editor component"
2. **Specify which fields to read/write** — e.g., "`versionKey` and `_cachedVersion` on the assignment object"
3. **UI loading states must be explicit** — "show skeleton while loading, show error toast on failure"
4. **TypeScript casts with `as any` must be called out** — if a draft format differs from the type, SAY SO
5. **Data separation between IELTS and THCS** — always specify filter conditions (e.g., `testType === 'THCS-THPT'`)
6. **Integration Safety Rules apply** — especially Rule #2 (page-entry prerequisites), Rule #6 (refs in intervals), Rule #11 (restore guard)
