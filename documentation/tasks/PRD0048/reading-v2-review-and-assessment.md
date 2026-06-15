# Reading V2 Studio & Runtime — Review & Gap Assessment

> **Generated:** 2026-04-28
> **Source documents:** PRD-0048, findings-of-tasks-0048, tasks-0048
> **Codebase scope:** `src/components/reading-v2/`, `src/services/reading-v2/`, `src/types/readingV2*`, `src/pages/ReadingV2StudioPage.tsx`, `src/pages/TestPageRouter.tsx`, `src/pages/StudentPracticePage.tsx`, `src/config/readingV2FeatureFlags.ts`, `src/constants/routes.ts`
> **Status note, 2026-06-15:** this is a historical gap assessment, not current product truth. Where this document says all Studio modes converge in one shell, read that as shared draft infrastructure only. It is obsolete if used to justify `Add Passage` in every Studio mode. Current authority: `documentation/architecture/reading-v2-material-publish-and-passage-library.md`, `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`, and `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`.

---

## Part 1 — PRD Review: What the Studio & Runtime Must Do

### 1.1 Studio Responsibilities (PRD §4, §5, §7, §9)

| Responsibility | PRD Reference | Summary |
|---|---|---|
| **Unified authoring shell** | §4.1, Decision 4 | One Studio shell governs create-blank, create-from-import, create-from-auto, resume-draft, revise-published, duplicate, and extract-task-group. All modes share draft infrastructure, but passage-collection controls are enabled only for manual blank creation, paste/import outcomes, and Auto V4 outcomes. |
| **Canonical document model** | §5.1, Decision 2 | The Studio edits a `ReadingV2Document` with first-class sections, stimuli, anchors, task groups, interactions, option sets, and scoring rules. |
| **Three-tab layout** | §7.1 | Stimulus (passage/table/flowchart/diagram editor), Questions (task group + interaction + answer key), Settings (metadata, visibility, duration). |
| **Two-column mental model** | Decision 7 | Left = stimulus/context/outline, Right = task-group editing / question logic. |
| **Grouped task instructions** | Decision 3, §5.2 | Task groups carry `instructionBlocks[]` shared across all interactions in that group, instead of per-question instructions. |
| **Answer rule editing** | §7.3 | Casing/punctuation normalization, response shape (free-text, single-choice, multi-select, binary-judgement, matching, structured-entry), word limits, acceptable answers. |
| **Validation gate** | §7.4, §9 | Publish is blocked if any `severity: 'error'` validation issue exists or metadata title is empty. |
| **Preview → real runtime** | Decision 5.1 | Preview generates a `teacher-preview` projection and hands it to the same `ReadingV2RuntimeShell` the student sees, never a fake/simplified preview. |
| **Publish pipeline** | §9 | Studio triggers `publishReadingV2Material()` which creates an immutable snapshot, generates projections (student-safe, session-safe, review, analytics), writes material metadata, relationship indexes, and where-used entries. |
| **Draft autosave + conflict** | §7.5 | Studio must support revision tokens and conflict recovery (reload, duplicate, diff). |
| **AI import review** | Decision 3, §4.3 | Import candidates must be reviewed and normalized into canonical draft structure before becoming editable. Import evidence is publish-blocking until resolved. |
| **Passage asset management** | Decision 11 | Passages are versioned stimulus assets, not lobby-launchable materials. Studio shows provenance and allows extraction. |
| **Platform integration** | Decisions 12-14 | Studio is entered from Teacher Lobby (existing material cards + edit modal) or direct routes. Studio does NOT create new lobby pages or result pages. |

### 1.2 Runtime Responsibilities (PRD §6, §8)

| Responsibility | PRD Reference | Summary |
|---|---|---|
| **Projection-only input** | §6.1, Decision 13 | Runtime consumes `ReadingV2DerivedProjection` only — never canonical drafts, packaged materials, or legacy payloads. |
| **Desktop/tablet: two-column** | Decision 7 | Left = passage/stimulus, Right = grouped question panel with instruction blocks. |
| **Phone: passage-first** | §6.2 | Full-screen passage with "Questions" bottom-sheet overlay. Passage scroll position preserved when switching. |
| **Task-group navigation** | §6.3 | Tab/button rail showing question range per task group (e.g., Q1-5, Q6-13). |
| **Response controls by shape** | §6.4 | free-text (input + word limit), single-choice (radio), multi-select (checkbox + limit), binary-judgement (TFNG/YNNG button grid), matching (tap-to-assign), structured-entry (table/flowchart/diagram). |
| **Stimulus renderers** | §6.5 | passage-content (paragraphs + anchors), table-content (rows + blank cells), flowchart-content (ordered steps), diagram-content (image + labeled hotspots). |
| **Pre-submit review** | §6.6 | Summary of answered vs. unanswered before confirm. Duplicate-submit protection. |
| **Submit pipeline** | §8 | Answers are bundled with `projectionId`, `sourceSnapshotVersionId`, and `materialId`. Submission goes through trusted processing. |
| **Feature gating** | §9.2 | Rollout mode (`off`, `internal-only`, `teacher-preview`, `public`) controls visibility. |

### 1.3 Critical Architectural Invariants

1. **Strict boundary**: No legacy Reading imports in `src/services/reading-v2/` or `src/components/reading-v2/`.
2. **Three-plane model**: Draft → Snapshot → Projection. No plane may be skipped.
3. **Engine discriminator**: Content must carry explicit `ReadingV2` engine marker. Legacy code must fail-closed on V2 content.
4. **No new surfaces**: Reading V2 plugs into existing Teacher Lobby, Result/Feedback shells — does not create standalone management or result pages.
5. **Default-closed rollout**: `READING_V2_ROLLOUT_MODE` defaults to `off` until Phase 9.

---

## Part 2 — Codebase Assessment: What Exists vs. What's Missing

### 2.1 Inventory of Existing Files

#### Components (17 + 2 files)

| File | Status | Notes |
|---|---|---|
| `studio/ReadingV2StudioShell.tsx` (651 lines) | ✅ **Substantial** | Full shell with modes, tabs, validation, publish gating, document mutation, task group CRUD, reordering |
| `studio/ReadingV2StudioShell.css` (11.7KB) | ✅ **Present** | CSS for studio layout |
| `studio/ReadingV2TaskGroupEditor.tsx` | ✅ **Functional** | Task group list, selection, instruction editing, interaction list, anchor repair section |
| `studio/ReadingV2AnswerRuleEditor.tsx` | ✅ **Functional** | Casing/punctuation normalization, per-interaction scoring (word limit, acceptable answers, binary vocab, matching reuse, structured-entry kind) |
| `studio/ReadingV2MetadataPanel.tsx` | ✅ **Present** | Title, difficulty, target band, tags, visibility, duration |
| `studio/ReadingV2SettingsPanel.tsx` | ✅ **Present** | Settings tab content |
| `studio/ReadingV2ImportReviewPanel.tsx` | ✅ **Present** | Import candidate display with accept/inspect actions |
| `studio/ReadingV2StudioModalAdapter.tsx` | ✅ **Present** | Modal wrapper for Teacher Lobby integration |
| `studio/ReadingV2StudioOperationalStates.ts` | ✅ **Present** | State machine (ready, saving, conflict, retry, etc.) |
| `runtime/ReadingV2RuntimeShell.tsx` (686 lines) | ✅ **Substantial** | Full runtime with phone/desktop layout, all 6 response shapes, submit pipeline, review summary, state management |

#### Services (22 + fixtures)

| File | Status | Notes |
|---|---|---|
| `readingV2Projection.service.ts` | ✅ **Complete** | 5 projection generators (preview, student-safe, session-safe, review, analytics) + student sanitization assertion |
| `readingV2PublishPipeline.service.ts` | ✅ **Complete** | Full publish pipeline with commit plan, relationship indexes, where-used writes, repository commit with rollback |
| `readingV2Repository.service.ts` | ✅ **Present** | Draft/snapshot/material storage abstraction |
| `readingV2ContractGuards.service.ts` | ✅ **Present** | Canonical document validation, projection input assertion |
| `readingV2Validation.service.ts` | ✅ **Present** | Draft validation + publish gate assertion |
| `readingV2Numbering.service.ts` | ✅ **Present** | Visible question number derivation |
| `readingV2OperationalMatrix.ts` | ✅ **Complete** | 18-entry matrix covering all storage path classes with roles, frequency, atomicity, forbidden fields |
| `readingV2StoragePaths.service.ts` | ✅ **Present** | All storage path generators |
| `readingV2EngineDiscriminator.service.ts` | ✅ **Present** | V2 engine marker detection |
| `readingV2NonMigrationGuards.service.ts` | ✅ **Present** | Fail-closed guards for legacy paths |
| `readingV2MaterialMetadata.service.ts` | ✅ **Present** | Material metadata derivation |
| `readingV2PassageAssetWorkflow.service.ts` | ✅ **Present** | Where-used graph writes |
| `readingV2FirebasePublishAdapter.service.ts` | ✅ **Present** | Firebase-specific publish adapter |
| `readingV2LaunchIntegration.service.ts` | ✅ **Present** | Launch resolver integrating with existing platform surfaces |
| `readingV2RuntimeSubmission.service.ts` | ✅ **Present** | Runtime submission processing |
| `readingV2RuntimeBoundary.service.ts` | ✅ **Present** | Projection-kind assertion gate |
| `readingV2Result.service.ts` | ⚠️ **Re-export only** | Barrel file re-exporting from `readingV2ResultAdapter.service` |
| `readingV2ResultAdapter.service.ts` (35.6KB) | ✅ **Substantial** | Full result adapter: scoring, persistence plans, grouped review, regrade artifacts |
| `readingV2TrustedSubmissionProcessor.service.ts` | ✅ **Present** | Trusted server-side submission processing |
| `readingV2Scoring.service.ts` | ⚠️ **Re-export only** | Barrel file re-exporting from `readingV2ResultAdapter.service` |
| `readingV2TeacherLobbyIntegration.service.ts` | ✅ **Present** | Teacher lobby integration adapter |

#### Types & Config

| File | Status | Notes |
|---|---|---|
| `types/readingV2.types.ts` | ✅ **Present** | Canonical document model types |
| `types/readingV2Taxonomy.test.ts` | ✅ **Present** | Task type taxonomy tests |
| `config/readingV2FeatureFlags.ts` | ✅ **Complete** | Rollout modes (off/internal-only/teacher-preview/public), engine constant, product label, schema version |
| `constants/routes.ts` | ✅ **Present** | 4 Studio routes registered |

#### Integration Points

| Integration | Status | Notes |
|---|---|---|
| `pages/ReadingV2StudioPage.tsx` | ✅ **Present** | Dedicated page consuming `ReadingV2StudioShell` |
| `pages/TestPageRouter.tsx` | ✅ **Integrated** | Imports `ReadingV2RuntimeShell` + launch integration service |
| `pages/StudentPracticePage.tsx` | ✅ **Integrated** | Imports `ReadingV2RuntimeShell` for solo practice |
| Boundary import tests | ✅ **Present** | `readingV2BoundaryImports.test.ts` verifying no legacy imports |

---

### 2.2 Gap Analysis: What's Missing or Incomplete

> [!IMPORTANT]
> The following gaps represent areas where the current code does not yet satisfy all PRD requirements.

#### 🔴 Critical Gaps (blocking end-to-end flow)

| # | Gap | PRD Requirement | Current State |
|---|---|---|---|
| **G1** | **Stimulus Editor is a placeholder** | §7.1 — Stimulus tab must allow editing passages, tables, flowcharts, diagrams, and anchors | The Stimulus tab renders a static description ("Stimulus editing keeps passages, anchors, tables…") with no actual editing controls. Teachers cannot create or modify passage content. |
| **G2** | **No real Firebase/Firestore persistence** | §9, Operational Matrix | All services use in-memory `Map` stores (`repository.store`). No actual Firestore reads/writes exist. Draft autosave is theoretical. |
| **G3** | **Scoring engine is a barrel re-export** | §8.2 | `readingV2Scoring.service.ts` is 8 lines of re-exports. Actual scoring logic lives in `readingV2ResultAdapter.service.ts` but has not been verified against all 16 task types. |
| **G4** | **No interaction CRUD in Studio** | §7.3 | The Studio can edit existing interactions (acceptable answers, word limits) but has no UI to **add, remove, or reorder** individual interactions within a task group. |
| **G5** | **No real draft load/resume** | §7.5, mode `resume-draft` | Route `/teacher/reading-v2/drafts/:draftId` exists but there's no service call to load a draft from persistent storage. The Studio always initializes from fixtures. |

#### 🟡 Significant Gaps (functional but incomplete)

| # | Gap | PRD Requirement | Current State |
|---|---|---|---|
| **G6** | **AI import pipeline not connected** | §4.3, Decision 3 | `ReadingV2ImportReviewPanel` exists but is static UI. No service parses AI output into a `ReadingV2ImportCandidate`. |
| **G7** | **No delete/remove task group** | §7.2 | Studio can add and reorder task groups but cannot delete them. |
| **G8** | **Preview opens no actual overlay** | §7.4, Decision 5.1 | The "Preview" button emits an action event but does not launch the runtime preview overlay. The PRD requires generating a `teacher-preview` projection and rendering it in-situ. |
| **G9** | **No option set CRUD** | §6.4 | Option sets are referenced in projections and runtime, but Studio has no UI to create/edit option sets (choices for single-choice, multi-select, matching). |
| **G10** | **Homework/Course/Library adapters not implemented** | Decision 14, §9.3 | `readingV2LaunchIntegration.service.ts` exists with launch resolution logic, but corresponding platform integration adapters for homework assignment, course material, and public library listing are not wired into those existing surfaces. |
| **G11** | **No duplicate/extract mode implementation** | §4.4 | Studio declares `duplicate-material` and `extract-task-group-material` modes but has no logic to initialize from an existing published material. |
| **G12** | **Runtime CSS is inline-only** | §6 | `ReadingV2RuntimeShell` uses inline `style={{}}` for layout. No dedicated runtime CSS file exists (unlike Studio which has `ReadingV2StudioShell.css`). |

#### 🟢 Minor Gaps (polish-level)

| # | Gap | Notes |
|---|---|---|
| **G13** | **No discard confirmation** | The "Discard" button emits `discard` action but no confirmation dialog. |
| **G14** | **No passage scroll preservation implementation** | Phone runtime shows `preservedScrollLabel` as text but doesn't actually preserve/restore scroll position. |
| **G15** | **No anchor repair UI** | Anchor repair section is display-only ("Document anchors: N"). No interactive repair controls. |
| **G16** | **Submission error retry UX** | Runtime shows "submit-failure" state but no automated retry or offline queue. |
| **G17** | **No timer/countdown** | PRD mentions `durationMinutes` metadata but runtime has no visible countdown timer. |

---

### 2.3 Architectural Compliance Summary

| Invariant | Status | Evidence |
|---|---|---|
| No legacy Reading imports in V2 | ✅ **Enforced** | `readingV2BoundaryImports.test.ts` actively verifies |
| Three-plane model | ✅ **Implemented** | Draft → Snapshot → Projection pipeline is complete |
| Engine discriminator | ✅ **Implemented** | `readingV2EngineDiscriminator.service.ts` + fail-closed guards |
| No new surface proliferation | ⚠️ **Mostly compliant** | `ReadingV2StudioPage.tsx` is a dedicated route (acceptable per PRD as Studio surface). No new result/review pages. |
| Default-closed rollout | ✅ **Enforced** | `READING_V2_ROLLOUT_MODE` defaults to `off` |
| Projection sanitization | ✅ **Implemented** | `assertReadingV2ProjectionIsStudentSanitized()` checks for forbidden field leaks |
| Operational matrix | ✅ **Complete** | 18 entries covering all storage path classes |

---

### 2.4 Test Coverage Summary

| Area | Test File(s) | Coverage Level |
|---|---|---|
| Studio Shell | `ReadingV2StudioShell.test.tsx` | ✅ Modes, tabs, validation, publish, actions |
| Task Group Editor | `ReadingV2TaskGroupEditor.test.tsx` | ✅ Selection, instruction editing |
| Answer Rule Editor | `ReadingV2AnswerRuleEditor.test.tsx` | ✅ Response shapes, scoring |
| Runtime Shell | `ReadingV2RuntimeShell.test.tsx` | ✅ Projection rendering, response controls, submit, states |
| Projection Service | `readingV2Projection.service.test.ts` | ✅ All 5 projection types |
| Publish Pipeline | `readingV2PublishPipeline.service.test.ts` | ✅ Full pipeline with commit plan |
| Contract Guards | `readingV2ContractGuards.service.test.ts` | ✅ Validation, boundary assertions |
| Result Adapter | `readingV2ResultAdapter.service.test.ts` | ✅ Scoring, persistence, review payloads |
| Boundary Imports | `readingV2BoundaryImports.test.ts` | ✅ No legacy import violations |
| Feature Flags | `readingV2FeatureFlags.test.ts` | ✅ Rollout mode normalization |
| Launch Integration | `readingV2LaunchIntegration.service.test.ts` | ✅ Engine detection, launch resolution |
| Vertical Loop | `readingV2VerticalLoop.integration.test.tsx` | ✅ End-to-end flow |

---

## Conclusion

### What's Strong

The Reading V2 system has a **solid architectural foundation**. The three-plane model, projection pipeline, publish pipeline, operational matrix, feature gating, boundary enforcement, and engine discriminator are all well-implemented with proper test coverage. The runtime supports all 6 response shapes and has proper phone/desktop layout switching.

### What's Blocking Production Readiness

The 5 **critical gaps (G1-G5)** represent the delta between a well-structured skeleton and a production-ready authoring tool:

1. **Teachers can't edit passage content** (G1) — the entire left column of the Studio is inert
2. **Nothing persists to the database** (G2) — all state is in-memory
3. **Teachers can't add/remove individual questions** (G4) — they can only edit pre-existing fixtures
4. **Teachers can't resume saved work** (G5) — drafts don't load from storage
5. **Teachers can't create answer choices** (G9) — option sets have no CRUD

### Recommended Prioritization

```
Phase 0: Foundation verification (existing — already done)
Phase 1: Stimulus Editor (G1) — unlock the authoring experience
Phase 2: Interaction + Option Set CRUD (G4, G9) — complete question authoring
Phase 3: Firebase persistence (G2, G5) — make work saveable
Phase 4: Preview overlay (G8) — close the author-preview loop
Phase 5: AI import pipeline (G6) — enable import workflow
Phase 6: Platform adapters (G10, G11) — homework, course, library wiring
Phase 7: Polish (G12-G17) — CSS, timers, confirmations, scroll preservation
```

---

## Part 3 — Addendum: Additional Findings From Full PRD0048 Packet Review

> [!NOTE]
> The following findings come from reviewing all 36 documents in the PRD0048 packet — including 5 family specs, 2 runtime page schemas, the V1 parity contract, the result-feedback integration contract, the teacher lobby integration contract, the test-making pipeline contract, the assessment/preservation plan, and the V1 parity verification notes. They surface gaps not captured in the original Part 2 analysis.

### 3.1 V1 UI Parity Gaps (from `reading-v2-student-runtime-v1-parity-contract.md`)

The PRD explicitly mandates that the V2 student runtime **must look and behave like the current V1 runtime**. Any deviation must be documented and senior-approved. The following parity requirements are not yet verifiable in the V2 runtime:

| # | V1 Parity Requirement | Current V2 State |
|---|---|---|
| **P1** | **Browser screenshot verification at 3 breakpoints** (1366×900, 1024×768, 390×844) with side-by-side V1 comparison | V1 parity verification notes mention 3 screenshots were captured during Phase 6, but these are from a temporary harness that was removed. No permanent visual regression infrastructure exists. |
| **P2** | **Flagging / mark-for-review** on desktop runtime | V2 runtime tracks `flaggedInteractions` in state, but the V1 parity contract §4.11 explicitly says mobile flagging must NOT be reintroduced unless approved. Desktop flagging status unclear. |
| **P3** | **Section/passage switching** per V1 navigation placement | V2 runtime renders `sectionTabs` but the contract requires placement "close to V1" — no verification that tab placement matches V1 shell. |
| **P4** | **Deviation documentation** — every visual or interaction deviation from V1 must have a written note | Only one intentional difference is documented in the parity verification notes (scroll state as component state instead of `mobileReadingState.ts`). Any other deviations are undocumented = bugs per contract. |

### 3.2 Result & Feedback Integration Gaps (from `reading-v2-result-feedback-integration.md`)

This contract is strict: **no standalone result-review pages**. V2 must plug into existing result shells via adapters.

| # | Integration Requirement | Current V2 State |
|---|---|---|
| **R1** | **V2 result payload normalizer** that makes V2 records readable by `SharedSavedResultCore` | `readingV2ResultAdapter.service.ts` (35.6KB) exists and is substantial, but no test proves existing shells (`SharedSavedResultCore`, `ReviewTab`, `ResultDetailModal`, `ResultSlidePanel`) actually route V2 records through it. |
| **R2** | **Task-group-first review organization** as default inside existing result shells | The adapter generates grouped review content, but no integration test proves task-group-first layout renders inside the existing `ReviewTab`. |
| **R3** | **Release-policy sanitization** for V2 answer keys, explanations, diagnostics, and import evidence | No evidence of release-policy-aware filtering in the V2 result adapter. The contract requires student surfaces to be unable to see unreleased answers, diagnostics, or import evidence. |
| **R4** | **Regrade as new versioned artifact** — must NOT mutate historical result truth | The adapter has regrade artifact support, but this behavior isn't tested against mutation prevention. |

### 3.3 Teacher Lobby Integration Gaps (from `reading-v2-teacher-lobby-integration.md`)

| # | Lobby Requirement | Current V2 State |
|---|---|---|
| **L1** | **V2 material card** appearing in existing card grid with engine discriminator badge | `readingV2TeacherLobbyIntegration.service.ts` exists, but no evidence of actual `TestCard.jsx` modifications to render V2 cards. |
| **L2** | **Edit-modal adapter** — clicking a V2 material card must NOT open legacy `TestEditor` | `ReadingV2StudioModalAdapter.tsx` exists as a shell, but no integration test proves the lobby routes V2 engine-marked cards to this adapter instead of the legacy editor. |
| **L3** | **Draft-card resume** routes to Studio draft mode | Route exists but resume requires persistence (blocked by G2/G5). |
| **L4** | **Published-edit creates draft revision**, not direct mutation | Studio declares `revise-published` mode but has no logic to initialize from existing published material (same as G11). |
| **L5** | **Passage asset cards hidden** unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` flag is enabled | No evidence this flag exists in `readingV2FeatureFlags.ts`. |

### 3.4 Test-Making Pipeline Gaps (from `reading-v2-test-making-pipeline.md`)

The pipeline contract defines a strict ordered flow: Access → Metadata → Editor → Answer Keys → Settings → Validate/Preview → Publish → Return.

| # | Pipeline Requirement | Current V2 State |
|---|---|---|
| **TM1** | **Metadata must be required or defaulted before publish** | `ReadingV2MetadataPanel.tsx` exists with title/difficulty/tags, but publish gate only checks `severity: 'error'` validation + empty title. No check for missing `materialKind` (full test vs. task-group material vs. derivative). |
| **TM2** | **Material kind classification** — full test, task-group material, or derivative/extracted | Not represented in metadata panel or validation. |
| **TM3** | **Settings must NOT duplicate homework/course/session ownership** — duration is guidance only, due dates belong to homework system | Settings panel includes duration, but boundary is not enforced or tested. |
| **TM4** | **Return context** — closing Studio must return to the same Lobby/Profile context and refresh card state | No return-navigation logic exists; Studio currently has no concept of "where I came from." |
| **TM5** | **Preview must create no live attempts, assignments, session state, or results** — local-only state | Preview isn't implemented yet (G8), but this constraint must be built in from the start. |

### 3.5 Family-Specific Runtime Gaps

After reviewing all 5 family spec documents, these per-family requirements are not yet visually verifiable in the runtime:

| Family | Requirement | Gap |
|---|---|---|
| **Completion** | Summary-completion-text must preserve the **summary shell** — not flatten into unrelated sentence cards | Runtime uses a generic `free-text` control; no shell-preserving renderer exists for summary/note tasks. |
| **Completion** | Note-completion must **preserve note hierarchy** (bullets, indentation) | Generic text input does not render structured note context. |
| **Choice** | Summary-completion-list must show **one flowing summary body with inline selects plus one shared option bank** | Runtime renders `single-choice` controls; no summary-body + inline-select renderer exists. |
| **Choice** | Multiple-select must show **selected-count feedback** ("2 of 3 selected") | No selection-count indicator in the V2 runtime. |
| **Matching** | Desktop must use **specialized matching UI**, not generic selects | Runtime renders matching via `tap-to-assign`; desktop parity with V1's dedicated matching panel not verified. |
| **Matching** | **Option reuse law** must be explicit and enforced at runtime | No runtime enforcement of `optionReuse` rules from answer rules. |
| **Structured Layout** | Phone table-completion must use **zoomable read-only overview + synchronized answer entry** — not cramped inline inputs | Phone renders the same control as desktop; no zoomable overview pattern exists. |
| **Structured Layout** | Phone flowchart-completion must use **simplified structural overview + focused step entry** | No flowchart-specific phone adaptation. |
| **Structured Layout** | Phone diagram-labeling must use **zoomable image + large hotspot targets** — no tiny drag targets | No diagram-specific phone adaptation. |
| **Binary Judgement** | **Vocabulary header** must be visible so student doesn't need to remember TFNG vs YNNG | Runtime renders judgement buttons but no persistent vocabulary legend header. |

### 3.6 Verification Standard Gap

The V1 parity contract §6 requires every runtime implementation slice to include:

1. Component tests proving V2 renders from projection fixtures ✅ (exists)
2. Browser screenshots at 3 breakpoints ⚠️ (were captured once via temporary harness, harness was removed)
3. Side-by-side visual comparison against V1 ⚠️ (done informally, no permanent CI artifact)
4. Evidence of preservation of 6 specific behaviors ⚠️ (partially tested)
5. Written note for every intentional deviation ⚠️ (only 1 deviation documented)

**This means there is no permanent visual regression testing infrastructure for V1 parity**, which the contract treats as a hard requirement.

### 3.7 Updated Gap Summary

After full packet review, the total gap count increases from **17 to 33**:

| Category | Original Gaps | New Gaps | Total |
|---|---|---|---|
| 🔴 Critical (blocking e2e) | G1-G5 (5) | — | 5 |
| 🟡 Significant (functional) | G6-G12 (7) | P1-P4, R1-R4, L1-L5, TM1-TM5, family-specific (10+) | ~25 |
| 🟢 Minor (polish) | G13-G17 (5) | Verification standard (3) | ~8 |

### 3.8 Revised Prioritization

The additional findings don't change the **critical gaps** — G1-G5 remain the blockers. However, they reveal that the **Significant tier is larger than originally assessed**, particularly around:

1. **Result/feedback integration** — the adapter exists but isn't wired into existing result shells
2. **Teacher Lobby integration** — the adapter exists but no actual card routing is in place
3. **V1 visual parity** — no permanent regression infrastructure
4. **Family-specific renderers** — runtime uses generic controls where family specs require specialized ones
5. **Test-making pipeline governance** — metadata classification, return context, and preview safety constraints are missing

```
Revised Phase Plan:
Phase 0: Foundation verification ✅ (done)
Phase 1: Stimulus Editor (G1) — unlock authoring
Phase 2: Interaction + Option Set CRUD (G4, G9) — complete question authoring
Phase 3: Firebase persistence (G2, G5) — make work saveable
Phase 4: Preview overlay (G8, TM5) — close the author-preview loop, preview-safety
Phase 5: Family-specific renderers — summary shells, note hierarchy, matching UI, structured-layout phone
Phase 6: Result/feedback integration wiring (R1-R4) — plug V2 into existing result shells
Phase 7: Teacher Lobby integration wiring (L1-L5) — V2 cards in existing grid
Phase 8: AI import pipeline (G6) — enable import workflow
Phase 9: Platform adapters (G10, G11, TM4) — homework, course, library, return context
Phase 10: V1 parity CI + polish (P1-P4, G12-G17) — visual regression, timers, confirmations
```
