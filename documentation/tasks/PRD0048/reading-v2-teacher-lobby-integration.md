# Reading V2 Teacher Lobby Integration Contract

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`

This file replaces the earlier over-scoped Teacher Lobby page schema. It is an integration contract, not a request to build a new Teacher Lobby page.

---

## 1. Purpose

Reading V2 must integrate with the existing Teacher Lobby material-card workflow.

The Teacher Lobby is not a new Reading V2 discovery product in PRD-0048. It remains the current `/lobby` shell where teachers already see material cards and draft cards for other test families.

Current data-loading architecture is defined in `documentation/architecture/teacher-materials-listing-and-diagnostics.md`. Reading V2 lobby integration must use the same scoped material-listing contract as every other family: normal teachers read owned `/tests` rows by `ownerId` and `createdBy`; public library reads `/tests` by `isPublic`; drafts stay on the draft path. The lobby must not hydrate Reading V2 canonical documents, passage assets, projections, or result payloads just to render cards.

Current lobby chrome, card-title, search-icon, create-modal, and responsive header behavior is defined in `documentation/architecture/teacher-lobby-authoring-and-navigation.md`. Reading V2 integration must fit that surface instead of creating a parallel lobby shell.

Baseline PRD-0048 Teacher Lobby behavior:

- the existing lobby page remains the entry surface
- a Reading V2 material appears as a normal material card in the current card grid/list pattern
- clicking or editing the material card opens the existing edit-modal pattern, adapted for Reading V2
- draft cards continue to resume draft work through the existing draft-card pattern
- the actual Reading V2 editor is still the Studio contract; the lobby modal is only an entry shell or host

---

## 2. Current Code Anchors

Use these current files as integration-pattern references only:

- `src/pages/TeacherLobbyPage.jsx`
- `src/hooks/test/useTeacherTests.ts`
- `src/services/firebaseQueryOptimizer.js`
- `src/utils/teacherMaterialsDiagnostics.js`
- `src/components/modern/TestCard.jsx`
- `src/components/modern/DraftCard.tsx`
- the existing `modals.openEditTest(...)` / edit-modal flow in `TeacherLobbyPage.jsx`
- existing editor modal patterns for IELTS, THCS, and Writing materials

Do not copy legacy Reading authoring schema or runtime heuristics from those files into Reading V2.

---

## 3. Ownership Boundary

Teacher Lobby owns:

- listing material cards through the existing lobby shell
- deciding which card action was clicked
- opening the adapted Reading V2 edit modal or Studio entry
- forwarding assign, duplicate, preview, resume, and revise actions to the owning platform flow
- passing the entry mode and return context into the Reading V2 test-making pipeline

Reading V2 Studio owns:

- metadata setup and readiness within the V2 test-making pipeline
- canonical authoring
- answer-key and scoring-rule editing inside the Questions workflow
- material-level Settings behavior
- AI/manual import review
- validation and publish gate
- draft save and autosave
- published edit through draft revision
- preview launch

The Teacher Lobby modal must not become a second independent Reading V2 editor.

---

## 4. Allowed UI Scope

Allowed in phase 1:

1. Add a Reading V2 engine/material marker to existing material-card data.
2. Add card metadata that already fits the current card template, such as title, skill/type, status, owner, visibility, and last updated.
3. Add a Reading V2 badge or status chip if the existing card pattern supports badges.
4. Route the card edit/open action into the adapted Reading V2 edit modal.
5. Route draft-card resume into the Studio draft mode.
6. Route published edit into Studio draft-revision mode.
7. Preserve existing assignment and duplication entry points where the platform already supports them.
8. Preserve existing material-card polish: two-line card titles with full-title tooltip, summary badges only, and no canonical draft hydration for card chrome.
9. Preserve existing Teacher Lobby header/search behavior: compact teacher-navigation hamburger at narrow desktop widths and shared SVG `SearchIcon` in the search bar.

Not allowed in phase 1 unless a future senior-approved product decision explicitly adds it:

- a new Teacher Lobby page layout
- a new Reading V2 left filter rail
- new public-library tabs invented only for Reading V2
- standalone passage asset cards in Teacher Lobby by default
- a broad passage-asset browsing surface in Teacher Lobby
- new card families that look like student-launchable tests but are only raw passage assets
- hidden Reading V2 editor state stored inside the lobby card itself

---

## 5. Material-Card Click Contract

When a teacher clicks a Reading V2 material card or its edit action:

1. Detect the explicit Reading V2 engine discriminator.
2. Do not send the payload into the legacy Reading editor.
3. Open the adapted Reading V2 edit modal entry.
4. The modal must load or host the Reading V2 Studio shell/components for the correct mode:
   - existing published material -> open or create draft revision
   - existing draft -> resume draft
   - import action -> Studio import mode
   - create action -> Studio create mode
5. The loaded Studio flow must follow the ordered test-making pipeline: metadata -> editor -> answer-key/scoring in `Questions` -> material Settings -> validate/preview -> publish.
6. Closing the modal must return to the same Teacher Lobby context and refresh card state only through approved repository reads.

If implementation chooses route navigation instead of an embedded modal for a specific action, the user-visible behavior must still start from the existing material-card/edit action and must be senior-approved before coding.

### 5.1 Create And Import Entry Contract

When a teacher starts a new Reading V2 material from an existing Teacher Lobby create or import control:

1. The lobby must not create a separate Reading V2 creation page.
2. The lobby forwards the selected mode into the Studio pipeline.
3. The teacher sees or confirms metadata before publish.
4. Import candidates must become canonical drafts before answer-key editing, settings, preview, or publish.
5. Save and discard return to the same lobby/profile context where that context owns the action.
6. Successful non-revision publish returns the teacher to the Teacher Lobby/Materials context so the just-published test is re-entered through normal material-card/list workflows.
7. Published-revision follow-up may stay in Studio only for bounded draft-revision actions; it must not imply direct mutation of the live published snapshot.

Teacher Lobby may show card metadata after publish, but it must not become the metadata source of truth or own canonical draft mutations.

---

## 6. Required Tests

Teacher Lobby integration tests must prove:

- Reading V2 cards use the existing material-card pattern.
- Normal teacher My Content uses indexed owned material reads instead of full `/tests` scans.
- Public Library uses the indexed `isPublic` read instead of full `/tests` scans.
- Card rendering does not require Reading V2 canonical draft/projection hydration.
- Clicking a Reading V2 material does not open legacy `TestEditor`.
- Clicking a Reading V2 material opens the Reading V2 modal adapter or approved Studio entry.
- Reading V2 draft cards resume Studio draft mode.
- Published Reading V2 edit creates or opens a draft revision rather than mutating the live published snapshot.
- Create/import/resume/revise actions enter the same Reading V2 test-making pipeline and do not split metadata, answer-key, settings, or publish into disconnected products.
- Successful non-revision publish returns to Teacher Lobby/Materials instead of leaving a stale editable Studio shell on screen.
- Metadata shown on cards comes from approved material metadata/index reads, not from canonical draft inspection.
- Existing IELTS Reading, Listening, Writing, THCS, and non-V2 material cards keep their current behavior.
- Standalone passage assets are hidden from broad Teacher Lobby exposure unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` explicitly enables that later phase.
- Existing card-title clamp, search-icon, and compact-header behavior stays intact for Reading V2 materials.

---

## 7. Forbidden Patterns

Do not:

- build a new Teacher Lobby page for PRD-0048
- replace the existing lobby card grid/list with a Reading V2-specific management console
- add new Reading V2 Teacher Lobby filters unless they fit an existing shared filter surface and are separately approved
- treat raw passage assets as launch-ready test cards
- implement Reading V2 authoring inside `TeacherLobbyPage.jsx`
- use Teacher Lobby as the canonical state owner for Reading V2 drafts, published snapshots, attempts, results, or projections
- store answer keys, material settings, or publish-readiness state directly in lobby card state
- reintroduce normal-teacher `getAllTests()` loading or full `/tests` client-side filtering for card lists

---

## 8. Related Docs

- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
