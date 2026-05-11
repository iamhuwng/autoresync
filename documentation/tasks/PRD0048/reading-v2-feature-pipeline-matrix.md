# Reading V2 Feature Pipeline Matrix

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`

This file freezes access points, owning surfaces, pipeline order, outputs, tests, and forbidden patterns for PRD-0048 feature areas that are broader than the Studio test-making flow.

---

## 1. How To Use This Matrix

For every implementation task, the developer must identify:

1. the feature area being changed
2. the allowed access point
3. the owning surface or service
4. the input data class
5. the required pipeline
6. the output data class
7. the forbidden patterns
8. the tests that prove the behavior

If an implementation task touches a feature area listed here and the code path does not match the listed access point or pipeline, stop for senior review before coding.

---

## 2. Global Ownership Law

Reading V2 uses three separated planes:

| Plane | Editable source? | Used by |
|---|---|---|
| Canonical authoring/runtime plane | Yes, inside drafts and Studio only | Studio, validation, scoring against published snapshots |
| Library and packaging plane | Yes, for material/package metadata and asset management | Lobby, Material Profile, library, assignment pickers, publish pipeline |
| Delivery and projection plane | No | preview, student runtime, live sessions, review, analytics |

Global forbidden patterns:

- do not let launch, runtime, result, review, library, homework, course, or live-session surfaces read canonical drafts
- do not edit projections manually
- do not let platform feature settings become canonical Reading content
- do not mutate published snapshots, historical attempts, historical results, or extracted provenance in place
- do not add a new Teacher Lobby page or standalone Reading V2 result-review page

---

## 3. Feature Pipeline Matrix

### 3.1 Source Packet And Foundation

Allowed access point:

- Task 0.0 source-packet setup and `scripts/check-prd0048-packet.mjs`

Owner:

- implementation foundation, source-packet lint, Reading V2 module README

Required pipeline:

1. Read required PRD0048 packet.
2. Verify every required packet path exists.
3. Reject stale missing-doc, future-doc, standalone-result-page, new-Teacher-Lobby-page, and disconnected-pipeline wording.
4. Create module invariant notes.
5. Add feature flags and rollout guards.
6. Add fixture and projection strategy.

Required outputs:

- source-packet lint command
- module invariant notes
- default-closed feature flags
- fixture manifest strategy

Tests must prove:

- required docs exist
- stale references fail the packet check
- unresolved public exposure defaults closed

---

### 3.2 Passage Asset Lifecycle

Allowed access points:

- Studio `Stimulus` tab passage asset search/select/create controls
- Studio import normalization
- Studio extraction workflow
- Material Profile read-only where-used or dependency display where existing profile actions support it

Not allowed:

- broad Teacher Lobby passage-asset cards in phase 1 unless `READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` enables that later phase
- student launch directly from raw passage assets

Owner:

- Reading V2 repository and Studio passage asset panel

Required pipeline:

1. Create or import stimulus text.
2. Fill source, rights, topic, word count, paragraph map, accessibility, and provenance metadata where available.
3. Store a versioned `PassageAssetVersion`.
4. Link the passage asset version into a draft material.
5. Update where-used graph when a material publishes.
6. If published dependents exist, create a new version or derivative asset instead of hot-editing the old version.
7. Surface dependency status in Studio and Material Profile where relevant.

Required outputs:

- versioned passage asset
- where-used graph entries
- provenance records
- linked stimulus references in canonical drafts or published snapshots

Tests must prove:

- asset edits do not mutate published dependents
- derivative/adapted passages get new identity or version history
- phase-1 Teacher Lobby hides standalone passage assets by default
- student launch surfaces cannot launch raw passage assets

---

### 3.3 Task-Group Material Extraction

Allowed access point:

- Studio extraction action from a selected `passage + task group`

Owner:

- Studio extraction control, Reading V2 repository, publish pipeline

Required pipeline:

1. Select a passage asset version and one or more task groups.
2. Confirm extraction scope and material kind.
3. Copy canonical task-group content into a new independent draft.
4. Assign new material identity and preserve stable IDs only where meaning and ownership law allow.
5. Add hidden provenance pointing to the source material, source snapshot, source passage, and source task group.
6. Require metadata confirmation before publish.
7. Publish as an independent material through the normal publish pipeline.

Required outputs:

- independent draft material
- hidden provenance record
- eventual independent published material and projections

Tests must prove:

- extracted copies are not live-linked to the source
- source edits do not update extracted copies
- extracted-copy edits do not mutate source materials or passage assets
- provenance is hidden from student-safe/session-safe payloads

---

### 3.4 Validation, Preview, And Publish

Allowed access points:

- Studio `Validate`, `Preview`, and `Publish` actions
- adapted Teacher Lobby edit-modal host only when it delegates to Studio controls

Owner:

- Reading V2 validation service
- Reading V2 projection service
- Reading V2 publish pipeline service

Required pipeline:

1. Run validation against the canonical draft.
2. Block publish for errors, unresolved scoring placeholders, missing answer keys, broken anchors, invalid numbering, unsupported task structures, unsafe projection fields, and unresolved import uncertainty that affects student-visible or scored meaning.
3. Generate teacher-only preview projection from the draft.
4. Keep preview answer state local-only.
5. On publish, re-run validation.
6. Create an immutable published snapshot.
7. Generate student-safe, session-safe, review, and analytics projections from the snapshot.
8. Update material metadata and relationship indexes used by Lobby, Material Profile, library, assignment pickers, live launch, solo launch, result identity, and analytics.
9. Return to the originating Studio, Teacher Lobby, or Material Profile context.

Required outputs:

- validation issue set
- teacher-only preview projection
- immutable published snapshot
- student-safe projection
- session-safe projection input
- review projection or result adapter input
- analytics projection
- relationship/index updates

Tests must prove:

- preview writes no assignment, session, attempt, homework, course, or result records
- publish fails when blocking validation issues exist
- answer keys and author diagnostics never reach student-safe/session-safe payloads
- projections regenerate from canonical/package truth and cannot become editable source truth
- historical attempts/results remain unchanged after republish

---

### 3.5 Student Runtime Delivery

Allowed access points:

- shared solo-practice launch
- shared homework launch
- shared course-material launch
- shared public-library launch
- shared live-session route
- teacher-only Studio preview

Owner:

- shared platform launch plumbing chooses engine
- `ReadingV2RuntimeShell` owns V2 runtime rendering

Required pipeline:

1. For shared student launch routes, read the student-readable platform material registry first.
2. Detect an explicit Reading V2 engine discriminator before reading any `reading_v2/*` delivery data.
3. If the registry row is legacy V1 or unmarked, keep the launch on the existing V1/platform branch and do not probe `reading_v2/*`.
4. If the registry row is explicitly Reading V2, use the registry snapshot pointer to read the student-safe projection, session-safe projection, or teacher-only preview projection as appropriate.
5. Route to `ReadingV2RuntimeShell`.
6. Select desktop/tablet or phone layout.
7. Render task-family interaction components from projections only.
8. Save answer state against stable interaction IDs and visible question numbers.
9. Submit through the V2 submission pipeline.

Required outputs:

- runtime answer state keyed by stable interaction identity
- submission payload bound to material and projection/snapshot version

Tests must prove:

- runtime rejects canonical drafts and unpackaged materials
- legacy V1 launches do not read `reading_v2/*`
- explicit Reading V2 launch failures stay on V2 error states instead of falling back to V1
- desktop/tablet imitates current Reading V1 two-column UI
- phone imitates current Reading V1 passage-first UI, question sheet, and pre-submit review flow
- all five task families capture answer state from projection fixtures
- unsupported schema versions fail closed
- no legacy Reading renderer interprets V2 projections

---

### 3.6 Platform Launch Relationships

Allowed access points:

- Student Practice
- Student Homework Detail
- Student Course Detail
- Student Library
- live session route
- Teacher Lobby and Material Profile actions for preview, assign, revise, duplicate, or launch where the platform already owns those actions

Owner:

- existing platform surfaces remain owners of their own workflows
- Reading V2 supplies metadata, projections, launch eligibility, and runtime engine branch

Required pipeline:

1. Listing surfaces read published material metadata or approved indexes.
2. Assignment/course/live/library surfaces select a published V2 material, never a canonical draft.
3. Shared launch resolvers read the platform material registry row first, such as `tests/{materialId}`.
4. Launch resolver detects explicit Reading V2 engine markers such as `deliveryEngine: 'reading-v2'`, `contentEngine: 'reading-v2'`, or `runtimeEngine: 'reading-v2'`, and uses that row's published snapshot pointer as launch metadata.
5. Legacy or unmarked materials stay on their existing V1/platform launch branch and must not read `reading_v2/*`.
6. Non-live V2 launches consume student-safe projections.
7. Live V2 launches generate or consume session-safe projections.
8. Runtime opens through `ReadingV2RuntimeShell`.
9. Completion/status writes flow back through existing platform completion mechanisms with V2 result identity.

Required outputs:

- launchable V2 material references
- session-safe payloads for live sessions
- student-safe launch payloads for non-live routes
- completion/result relationship indexes

Tests must prove:

- each existing platform surface can list or launch V2 only from published/projection data
- no platform launch reads canonical drafts
- legacy Reading, Listening, Writing, THCS, homework, course, library, and live-session behavior remains unchanged
- positive V2 classification is sticky: missing or denied V2 metadata/projection produces a V2 launch error, not a V1 fallback
- rollout guard blocks public exposure while default closed

---

### 3.7 Submission, Scoring, Results, Feedback, And Regrade

Allowed access point:

- V2 runtime submit action
- existing teacher/student result entry surfaces after saved result exists
- existing feedback and regrade controls where already supported

Owner:

- Reading V2 scoring/result services own V2 interpretation
- existing result/feedback shell owns presentation, feedback workflow, release state, and regrade entry shell

Required pipeline:

1. Runtime submits answers with stable interaction IDs, task-group IDs, visible numbers, attempt context, and snapshot/session projection version.
2. Scoring reads the exact published canonical snapshot used by the attempt.
3. Saved result stores snapshot/version binding permanently.
4. Result fan-out indexes update existing result surfaces.
5. Existing result shell opens the saved result.
6. Reading V2 result adapter supplies grouped task review content to existing review shell.
7. Release policy sanitizes student-visible score, correct answers, explanations, and answer keys.
8. Feedback uses existing feedback surfaces and services.
9. Regrade creates a new versioned result/regrade artifact and never mutates historical answer or snapshot truth.

Required outputs:

- authoritative saved result row
- result fan-out indexes
- grouped review adapter payload
- release-policy-safe student result view
- feedback records through existing system
- immutable regrade artifact

Tests must prove:

- scoring never uses legacy Reading heuristics
- result records bind to the exact snapshot/projection version used at attempt time
- existing result shells render V2 through adapters
- student result surfaces cannot see unreleased answers, answer keys, author diagnostics, provenance, or import evidence
- no standalone Reading V2 teacher/student result-review routes or pages exist
- regrade does not mutate historical result truth

---

### 3.8 Rollout, Observability, And Non-Migration

Allowed access points:

- feature registry
- route guards
- Teacher Lobby visibility guards
- launch guards
- public-library guards
- source-packet lint and final vertical-loop test

Owner:

- feature registry, rollout flags, observability events, route/launch guards

Required pipeline:

1. Register Reading V2 feature surfaces and actions.
2. Keep rollout default closed.
3. Gate route, lobby, launch, and public-library exposure.
4. Track create, import, metadata edit, save, validate, preview, publish, extract, launch, submit, review, feedback, regrade, and error states.
5. Prevent automatic migration of historical Reading tests.
6. Run source-packet lint and vertical-loop integration test before readiness.

Required outputs:

- feature registry entries
- action/event metadata
- rollout guard constants
- non-migration guard tests
- vertical-loop fixture

Tests must prove:

- Reading V2 is not public by default
- historical Reading tests do not silently enter V2
- observability covers every introduced user-facing workflow
- source packet stays complete
- vertical loop reaches existing result/feedback shells without entering legacy Reading interpretation

---

## 4. Feature Area To Task Mapping

| Feature area | Primary tasklist owner |
|---|---|
| Source packet and foundation | Task 0.0, Task 1.0 |
| Canonical model and taxonomy | Task 2.0 |
| Storage and repository versioning | Task 3.0 |
| Test-making Studio flow | Task 4.0 |
| Validation, preview, publish, projections | Task 5.0 |
| Passage assets and extraction | Task 3.0, Task 5.0 |
| Student runtime | Task 6.0 |
| Platform launch relationships | Task 7.0 |
| Submission, result, feedback, regrade | Task 8.0 |
| Rollout, observability, non-migration | Task 9.0 |

If a feature area appears in code but not in this table, stop for senior review before implementation.
