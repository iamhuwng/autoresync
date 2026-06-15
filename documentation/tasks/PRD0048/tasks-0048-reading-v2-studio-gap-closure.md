# Task List: PRD-0048 Reading V2 Studio Gap Closure

> **Created:** 2026-04-28
> **Purpose:** Cover missing Reading V2 Studio implementation pieces found during independent assessment.
> **Scope:** Studio-facing authoring, draft, import, preview, publish, passage asset, extraction, and verification gaps.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`

This task list supplements, but does not replace:

- `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`

## Why This Exists

The main PRD-0048 task list covers many Studio requirements, but several checked subtasks currently correspond to scaffolding, service foundations, static panels, or emitted callbacks rather than complete Studio-facing workflows.

This gap-closure list defines the missing implementation work explicitly so future developers do not treat the existing Studio shell as complete.

## Evidence Standard

A checkbox in this file may be checked only when the real Studio behavior exists and is tested.

The following do **not** count as completion by themselves:

- a button that only emits `onAction`
- placeholder explanatory text
- a service helper with no Studio integration
- a fixture-only path with no page or modal wiring
- a test that verifies an action name but not the owning workflow
- a visual shell that cannot load, save, preview, or publish real data

Every parent task below is done only when:

1. The Studio UI is wired to the owning service or adapter.
2. The workflow can be exercised from `ReadingV2StudioPage` or `ReadingV2StudioModalAdapter`.
3. Tests prove the user-facing behavior, not only internal helpers.
4. Legacy Reading paths remain unchanged.
5. Relevant UTF-8 checks pass for changed text files.

## Gap Summary

| Gap | Current state | Required closure |
|---|---|---|
| Studio draft loading | Route passes `draftId` / `materialId`, shell falls back to fixtures | Load real draft/revision context before rendering editable Studio state |
| Save/autosave | Button emits `saveDraft` | Persist through repository/Firebase adapter with revision-token conflict handling |
| Preview | Button emits `preview` | Generate teacher preview projection and render real `ReadingV2RuntimeShell` with local-only state |
| Publish | Button emits `publish` | Run validation, publish pipeline, Firebase commit adapter, and return-context refresh |
| Stimulus tab | Placeholder panel | Real passage/table/flowchart/diagram stimulus and anchor editor |
| Interactions | Existing interactions editable only | Add/remove/reorder interactions from Studio and preserve stable IDs |
| Option sets | Type supports option sets, no Studio CRUD | Create/edit/reorder option banks for choice and matching task groups |
| Import | Static review panel | Pasted/uploaded import candidate normalizes into canonical draft with evidence and repair state |
| Passage assets | Service helpers exist, no Studio panel | Search/select/version/where-used/provenance UI in Studio |
| Extraction | Button emits `extract` | Select scope, create independent draft/material copy, show hidden provenance |

## Task 0.0 Rebaseline Studio Completion Evidence

- [x] 0.1 Re-read the required source packet listed at the top of this file before changing Studio code.
- [x] 0.2 Review `documentation/tasks/tasks-0048-prd-reading-v2-studio-and-runtime.md` Task 4.0 and Task 5.0 checkboxes against current code evidence.
- [x] 0.3 Record any over-claimed checkbox as "covered by plan, not complete in behavior" in implementation notes or the final PR summary.
- [x] 0.4 Confirm no new Teacher Lobby page, Reading V2 lobby dashboard, Reading-only filter rail, or standalone result-review page is introduced by this gap-closure work.
- [x] 0.5 Run or update the PRD0048 packet lint before implementation if any source-packet references are changed.

## Task 1.0 Wire Studio Data Loading And Mode Context

**Acceptance Criteria:** Create, import, draft resume, published revision, duplicate, and extraction entries load the correct editable canonical draft context before the Studio shell renders authoring controls. Fixture fallback is allowed only for explicit test/demo harnesses, not production routes. Entry resolution is separate from passage-collection affordances: `Add Passage` is enabled only for manual blank creation, paste/import Studio outcomes, and Auto V4 Studio outcomes.

- [x] 1.1 Read `documentation/rules/navigation.md`, `documentation/rules/observability.md`, `documentation/rules/codebase-hygiene.md`, and `documentation/rules/mobile-portability.md` before changing route, page, navigation, or workflow code.
- [x] 1.2 Implement a Studio data-loading boundary for `ReadingV2StudioPage` that resolves `create-blank`, `create-from-import`, `resume-draft`, and `revise-published` into a typed loading result.
- [x] 1.3 For `create-blank`, create or hydrate an editable draft record with a real `draftId`, revision token, owner, metadata defaults, and canonical document.
- [x] 1.4 For `create-from-import`, create or hydrate a draft context that includes import candidate state and does not allow publish before normalization and repair.
- [x] 1.5 For `resume-draft`, load the existing Reading V2 draft by `draftId`; show missing, permission-denied, and conflict states inside the Studio shell.
- [x] 1.6 For `revise-published`, load the published material metadata/snapshot and create or resume a draft revision without mutating the live published snapshot.
- [x] 1.7 Add duplicate-material and extract-task-group material entry resolution where existing platform actions expose those modes.
- [x] 1.8 Preserve return context from Teacher Lobby, Material Profile, or direct Studio route through save, discard, preview close, and publish completion.
- [x] 1.9 Add tests proving each Studio mode loads distinct draft context and does not silently fall back to the default sentence-completion fixture.
- [x] 1.10 Add tests proving unauthorized, missing, deleted, malformed, and unsupported-schema drafts fail closed.
- [x] 1.11 Add tests proving individual Reading Passage Studio and non-creation modes hide passage-collection controls while manual blank, paste/import, and Auto V4 creation outcomes keep `Add Passage`.

## Task 2.0 Wire Draft Save, Autosave, Discard, And Conflict Recovery

**Acceptance Criteria:** Studio save/autosave/discard actions persist or transition real draft records through the Reading V2 repository/Firebase boundary with base revision tokens. Stale saves show recovery options and never use silent last-write-wins.

- [x] 2.1 Replace `Save Draft` action-only behavior with a call to the owning draft save service or repository adapter.
- [x] 2.2 Include `baseRevisionToken` on every save/autosave/discard write.
- [x] 2.3 Update the Studio shell with the returned draft revision token after successful save.
- [x] 2.4 Implement autosave scheduling outside the core shell in a hook or page/controller layer so rendering remains deterministic and testable.
- [x] 2.5 On stale revision token, show reload latest, duplicate draft, and compare diff actions wired to real handlers.
- [x] 2.6 Implement discard confirmation and discard state transition without deleting published material or historical snapshots.
- [x] 2.7 Add tests proving draft saves persist canonical document edits, metadata edits, task-group edits, interaction edits, and settings edits.
- [x] 2.8 Add tests proving stale revision conflicts reject writes and preserve the local unsaved draft for recovery.
- [x] 2.9 Add tests proving discard requires confirmation and does not mutate published snapshots.

## Task 3.0 Implement Real Stimulus Editing

**Acceptance Criteria:** The `Stimulus` tab lets teachers edit canonical stimulus content and anchors for passages, tables, flowcharts, and diagrams. Edits write to `ReadingV2Document.stimuli` and `ReadingV2Document.anchors`, not renderer-only fields.

- [x] 3.1 Create `src/components/reading-v2/studio/ReadingV2StimulusEditor.tsx`.
- [x] 3.2 Create `src/components/reading-v2/studio/ReadingV2StimulusEditor.test.tsx`.
- [x] 3.3 Implement passage paragraph editing with stable paragraph/anchor IDs.
- [x] 3.4 Implement inline blank anchor creation, edit, and removal with publish-blocking validation when linked interactions break.
- [x] 3.5 Implement table shell editing for rows, columns, header/body roles, blank cells, and table-cell anchors.
- [x] 3.6 Implement flowchart shell editing for ordered steps, step links, and flow-step anchors.
- [x] 3.7 Implement diagram shell editing for image metadata, alt text, hotspots, labels, and diagram-hotspot anchors.
- [x] 3.8 Show linked task-group summaries for the selected stimulus and warn when task groups depend on anchors being edited.
- [x] 3.9 Add stimulus reorder controls where supported by the existing section model, preserving stable stimulus IDs.
- [x] 3.10 Add tests proving every stimulus edit updates canonical draft state and preserves object identity unless the teacher intentionally creates a new semantic object.
- [x] 3.11 Add tests proving broken anchor references become publish-blocking validation issues.

## Task 4.0 Implement Passage Asset Studio Panel

**Acceptance Criteria:** Studio exposes passage asset search, selection, version metadata, where-used visibility, provenance, and dependency warnings through a real panel instead of static text.

- [x] 4.1 Create `src/components/reading-v2/studio/ReadingV2PassageAssetPanel.tsx`.
- [x] 4.2 Create `src/components/reading-v2/studio/ReadingV2PassageAssetPanel.test.tsx`.
- [x] 4.3 Wire passage asset search to `searchReadingV2PassageAssets` or the approved Firebase-backed equivalent.
- [x] 4.4 Show passage asset title, source, rights, topic, word count, current version, reuse advisory, and provenance summary where available.
- [x] 4.5 Allow selecting a passage asset version into the current draft through `selectReadingV2PassageAssetForDraft` or the approved adapter.
- [x] 4.6 Show where-used entries before teachers replace or materially adapt a passage version.
- [x] 4.7 Prevent raw passage assets from becoming launchable lobby materials unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` allows a future phase.
- [x] 4.8 Add tests proving passage selection changes canonical stimulus content without mutating published dependents.
- [x] 4.9 Add tests proving hidden provenance does not enter student-safe or session-safe projections.

## Task 5.0 Implement Interaction CRUD And Option Set CRUD

**Acceptance Criteria:** Teachers can add, remove, reorder, and configure scored interactions and option sets inside the `Questions` workflow for all five Reading V2 engineering families.

- [x] 5.1 Extend `ReadingV2TaskGroupEditor` with add interaction controls scoped to the selected task group.
- [x] 5.2 Implement remove interaction with confirmation and validation repair for linked anchors and option references.
- [x] 5.3 Implement reorder interaction controls that preserve `interactionId` and rederive visible IELTS numbering.
- [x] 5.4 Implement response-shape selection for free-text, single-choice, multi-select, binary-judgement, matching, and structured-entry interactions.
- [x] 5.5 Create option-set editing UI for single-choice, multi-select, summary-completion-list, and matching families.
- [x] 5.6 Support option labels, values, order, reuse law, selection limit, and correctness mapping where applicable.
- [x] 5.7 Implement controlled task-type conversion only when the existing interactions and answer rules can safely support the new type.
- [x] 5.8 Add validation so every scoring-bearing interaction requires a valid scoring rule before publish.
- [x] 5.9 Add tests for adding, removing, and reordering interactions without changing stable IDs incorrectly.
- [x] 5.10 Add tests for option-set creation, editing, selection limits, matching reuse rules, and publish-blocking incomplete answer keys.
- [x] 5.11 Add tests proving structured-layout interactions keep table/flowchart/diagram target identity.

## Task 6.0 Wire AI And Manual Import Normalization

**Acceptance Criteria:** Import from pasted text or supported uploaded files produces a canonical editable draft, keeps evidence and uncertainty visible, and blocks publish until scoring, anchors, numbering, and unsupported structures are resolved.

- [x] 6.1 Create `src/services/reading-v2/readingV2ImportNormalization.service.ts`.
- [x] 6.2 Create `src/services/reading-v2/readingV2ImportNormalization.service.test.ts`.
- [x] 6.3 Define a typed import candidate result for pasted text and supported file metadata without storing a separate import-only source of truth after acceptance.
- [x] 6.4 Normalize import candidates into `ReadingV2Document` sections, stimuli, anchors, task groups, interactions, option sets, answer rules, validation issues, and import evidence refs.
- [x] 6.5 Unsupported uploaded file types must fail closed with a visible repair path.
- [x] 6.6 Unresolved uncertainty on scored meaning, answer rules, anchors, numbering, or student-visible structure must remain publish-blocking.
- [x] 6.7 Wire `ReadingV2ImportReviewPanel` accept/repair actions to real draft normalization behavior.
- [x] 6.8 Preserve import evidence for author inspection while excluding it from student-safe/session-safe projections.
- [x] 6.9 Add tests proving imported content becomes normal editable canonical draft content before answer-key editing, settings, preview, or publish.
- [x] 6.10 Add tests proving unsupported structures are not guessed into false-valid task groups.

## Task 7.0 Implement Real Teacher Preview

**Acceptance Criteria:** `Preview` generates a teacher-only preview projection from the current canonical draft and renders the real `ReadingV2RuntimeShell` in a Studio-owned overlay or modal. Preview creates no assignments, sessions, attempts, homework records, course records, or permanent results.

- [x] 7.1 Read `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md` section 3.4 before preview work.
- [x] 7.2 Create `src/components/reading-v2/studio/ReadingV2PreviewOverlay.tsx`.
- [x] 7.3 Create `src/components/reading-v2/studio/ReadingV2PreviewOverlay.test.tsx`.
- [x] 7.4 Wire the Studio `Preview` button to run validation and `generateReadingV2PreviewOnly` against the current draft.
- [x] 7.5 Render `ReadingV2RuntimeShell` from the generated teacher preview projection.
- [x] 7.6 Keep preview answers local to the preview overlay and discard them on close unless a future PRD adds draft preview persistence.
- [x] 7.7 Show validation errors before preview when the draft cannot produce a safe preview projection.
- [x] 7.8 Add tests proving preview uses the same runtime contract as student delivery.
- [x] 7.9 Add tests proving preview creates no permanent writes.
- [x] 7.10 Add browser verification for preview overlay at 1366x900, 1024x768, and 390x844.

## Task 8.0 Wire Studio Publish To The Publish Pipeline

**Acceptance Criteria:** `Publish` from Studio runs validation, creates an immutable snapshot, generates projections, writes material metadata/indexes/where-used updates through approved boundaries, commits to Firebase where configured, and refreshes the originating Teacher Lobby, Material Profile, or route context.

- [x] 8.1 Read `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md` section 4.7 and `reading-v2-feature-pipeline-matrix.md` section 3.4 before publish work.
- [x] 8.2 Wire Studio publish to `publishReadingV2Material` with current draft document, metadata, owner, material ID, passage asset uses, and return context.
- [x] 8.3 Wire the Firebase commit path through `commitReadingV2PublishPlanToFirebase` or an approved injected publish adapter.
- [x] 8.4 Show publish-pending, publish-success, publish-failure, partial-failure, permission-denied, and retry states inside the Studio shell.
- [x] 8.5 Ensure publish failure leaves the previous live snapshot active and does not expose half-generated student payloads.
- [x] 8.6 Ensure successful publish updates metadata/indexes used by Teacher Lobby, Material Profile, library, assignment pickers, live launch summaries, solo launch, result identity, and analytics.
- [x] 8.7 Ensure answer keys, author diagnostics, import evidence, and hidden provenance do not enter student-safe or session-safe payloads.
- [x] 8.8 Add tests proving blocked validation prevents publish before any persistent write.
- [x] 8.9 Add tests proving successful publish creates a new snapshot instead of mutating a prior published snapshot.
- [x] 8.10 Add tests proving return-context refresh happens through approved repository reads, not canonical draft inspection by Teacher Lobby.

## Task 9.0 Implement Extraction And Provenance UI

**Acceptance Criteria:** Teachers can select a passage plus one or more task groups, confirm extraction scope/material kind, create an independent draft/material copy with new IDs, and inspect hidden provenance without creating a live link to the source.

- [x] 9.1 Add extraction scope selection UI to Studio for selected passage asset version and selected task groups.
- [x] 9.2 Confirm material kind and metadata before creating the extracted draft.
- [x] 9.3 Wire extraction to `extractReadingV2TaskGroupMaterialDraft` or the approved repository/Firebase adapter.
- [x] 9.4 Assign new material, task group, and interaction identities for the extracted copy.
- [x] 9.5 Preserve source test/material/snapshot/passage/task-group provenance as hidden author metadata.
- [x] 9.6 Open the extracted draft in Studio after creation without mutating the source material.
- [x] 9.7 Add tests proving source edits do not flow into extracted copies.
- [x] 9.8 Add tests proving extracted-copy edits do not mutate source materials or passage assets.
- [x] 9.9 Add tests proving hidden provenance is excluded from student-safe/session-safe payloads.

## Task 10.0 Close Teacher Lobby Material-Card Entry Gaps

**Acceptance Criteria:** Teacher Lobby shows published Reading V2 materials as normal material cards, keeps standalone passage assets and Reading V2 drafts out of legacy grids, and routes the existing material-card `Edit` action to the Reading V2 Studio revise route. Teacher Lobby must not add separate Reading V2 create/import controls or embed a Studio modal.

- [x] 10.1 Identify the existing Teacher Lobby material-card controls and modal ownership before changing lobby code.
- [x] 10.2 Remove the incorrect Teacher Lobby Reading V2 create/import controls and Studio modal wiring.
- [x] 10.3 Route published Reading V2 material-card `Edit` to `TEACHER_READING_V2_REVISE` without creating a new lobby page or embedding Studio in Teacher Lobby.
- [x] 10.4 Preserve legacy Reading, Listening, Writing, THCS, and existing test creation behavior.
- [x] 10.5 Track material-card edit actions through existing feature registry and observability plumbing.
- [x] 10.6 Add tests proving Reading V2 material-card `Edit` routes to the revise Studio route while legacy Reading cards still use the legacy editor.
- [x] 10.7 Add tests proving standalone passage assets and Reading V2 drafts do not appear as legacy Teacher Lobby cards.

## Task 11.0 Final Studio Gap-Closure Verification

**Acceptance Criteria:** The Studio can complete a real teacher-facing path from entry to draft load, stimulus edit, task-group/interaction edit, save, preview, publish, return-context refresh, and lobby/material visibility without entering legacy Reading internals.

- [x] 11.1 Add a Studio vertical-loop integration test covering create draft -> edit stimulus -> add interaction -> save -> preview -> publish -> return context.
- [x] 11.2 Add a Studio resume vertical-loop integration test covering load draft -> edit -> autosave conflict -> recover -> save.
- [x] 11.3 Add a published revision integration test covering open live material -> create/resume draft revision -> publish new snapshot -> prior result/snapshot remains unchanged.
- [x] 11.4 Add a Teacher Lobby integration test covering create/import/card/draft/revision entries into the same Studio shell.
- [x] 11.5 Add a browser smoke test for the full Studio workflow at 1366x900, 1024x768, and 390x844.
- [x] 11.6 Run targeted Studio and Reading V2 service tests with `cmd /c npx vitest run ... --reporter=basic`.
- [x] 11.6a Run live port 5173 verification from Teacher quick-login -> Teacher Lobby material card -> `Edit` -> Reading V2 Studio revise route using `PRD0048 Live Pipeline 2026-04-29T05-06-58-043Z - Practice Cam 16 Reading Test 03`; verify the editor shows the real title, Roman shipbuilding passage, 9 task groups, no fixture stimulus, and no loading/error placeholder.
- [x] 11.6b Run live port 5173 verification from Teacher Monitor `Start Test` -> Reading V2 session-safe projection -> student runtime using `PRD0048 Live Pipeline 2026-04-29T05-06-58-043Z - Practice Cam 16 Reading Test 03`; verify the session reaches `in-progress`, writes `projectionKind: session-safe`, exposes 9 task groups and 40 interactions, and loads for the student with no runtime error.
- [x] 11.7 Run source-packet lint and targeted UTF-8 checks for changed text files.
- [x] 11.8 Run filtered TypeScript checks for touched Reading V2 Studio, service, route, and lobby files.
- [x] 11.9 Confirm no V2 core folder imports legacy Reading editor/runtime/parser/scoring or flat-question reconstruction helpers.
- [x] 11.10 Confirm every previously missing piece in the gap summary has direct code evidence and test evidence.

## Task 12.0 Implement Teacher-Facing Table Completion Builder

**Acceptance Criteria:** Teachers can create a `table-completion` group from blank without using schema/internal terms or flat question-card workarounds. The group shows a dedicated table builder, lets teachers create or paste a table, edit rows/columns/cells, mark blank cells, fill correct answers beside those blanks, preview through the existing Reading V2 runtime, and publish only after table blanks and answers are valid.

- [x] 12.1 Update the PRD0048 table-completion and Studio page-schema docs with the teacher-facing horizontal workflow and schema mapping.
- [x] 12.2 Update the Reading V2 Studio feature registry or action tracking so table-completion edits are observable through the existing Studio feature.
- [x] 12.3 Refactor table-completion authoring into a focused component rather than adding more table-specific responsibility to `ReadingV2TaskGroupEditor.tsx`.
- [x] 12.4 Make `Add Question Group -> Table Completion` create a starter linked table stimulus with blank-cell anchors and structured-entry interactions.
- [x] 12.5 Render a teacher-facing `Table Completion Builder` for selected table-completion groups with table title, paste-table, editable grid, row/column controls, and blank toggles.
- [x] 12.6 Render a side answer panel listing each blank as a teacher-readable question with correct-answer editing and word-limit controls.
- [x] 12.7 Keep generic schema/internal interaction controls hidden from the normal teacher-facing table-completion path.
- [x] 12.8 Add tests proving table paste/edit/blank/answer updates write to the canonical draft model and preserve stable links.
- [x] 12.9 Run focused Studio tests, targeted UTF-8 checks, and a filtered TypeScript scan for Reading V2 Studio files.

**Verification Evidence (2026-04-30):**
- `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/components/reading-v2/studio/ReadingV2TaskGroupEditor.test.tsx src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/components/reading-v2/studio/ReadingV2AnswerRuleEditor.test.tsx src/components/reading-v2/studio/ReadingV2StimulusEditor.test.tsx src/components/reading-v2/studio/ReadingV2ImportReviewPanel.test.tsx --reporter=basic` passed: 6 files, 45 tests.
- `cmd /c npm run check:utf8 -- <Task 12 docs and touched Studio files>` passed: 11 text files.
- `cmd /c npx tsc --noEmit --pretty false 2>&1 | findstr /i "reading-v2\\studio"` returned no Reading V2 Studio matches after cleanup. Full repo `tsc --noEmit` still fails on existing non-Studio TypeScript backlog.
