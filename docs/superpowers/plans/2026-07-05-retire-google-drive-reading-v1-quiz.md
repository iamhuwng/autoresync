# Google Drive, Reading V1, and Quiz Retirement Implementation Plan

> **Execution rule:** implement locally on `codex/remove-drive-reading-v1-quiz`. Remote purge, deployment, staging, commit, push, and PR are separate gates.

**Goal:** Remove Google Drive support, Reading V1, and Quiz from active product code; permanently purge their material and delivery records; preserve completed academic results and Answer Review.

**Supported product after completion:** Reading V2, R2-backed Listening, Writing, THCS, and test-mode live sessions.

**Primary decision sources:**

- `CONTEXT.md`
- `docs/adr/0001-retired-material-purge-boundary.md`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`

---

## Current State and Scope Fence

Branch:

```text
codex/remove-drive-reading-v1-quiz
```

Completed pre-work:

- `CONTEXT.md` defines retirement language.
- `docs/adr/0001-retired-material-purge-boundary.md` records purge boundaries.
- `scripts/end-active-sessions.mjs` provides dry-run and `--apply` session closure.
- `scripts/__tests__/end-active-sessions.test.mjs` has three passing tests.
- Firebase project `temp-a1437` had session `CDXM5WVW` closed on 2026-07-05.
- Readback after closure reported zero active sessions.

Existing unrelated user file:

```text
documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md
```

Do not edit, stage, commit, or claim this file.

## Locked Decisions

- Remove all Google Drive upload, playback, streaming, validation, OAuth, environment, and UI support.
- Ignore files stored in users' Google Drive accounts; LuyenTap has no deletion authority over them.
- Never delete R2 objects directly from retirement tooling.
- Delete all Reading V1 and Quiz materials.
- Delete Listening materials whose stored audio depends on Google Drive.
- Delete associated drafts, active assignments, student-safe delivery copies, catalog/index rows, course/module references, stale launch notifications, and launch payloads.
- Preserve completed academic results and result indexes.
- Preserve Answer Review from saved answers, correct answers, scores, and feedback.
- Remove or scrub obsolete source URLs from retained result snapshots.
- Source Review may report that original material was removed.
- Store no retired-material tombstone database.
- Dedicated Quiz URLs show a Quiz retirement notice.
- Shared URLs for deleted materials show a generic material-unavailable state.
- End active sessions normally; do not build mixed-session migration or session-record hard deletion.
- Reading V2 must be identified only by explicit `reading-v2` engine/source markers.
- `skill: Reading` and `contentKind: ielts_reading` are not sufficient deletion markers.
- THCS reading question types are unrelated and must survive.
- Knowns Markdown may be edited directly because Knowns MCP and CLI were removed.
- Raw conversations, exported transcripts, archived evidence, and generated artifacts remain historical and unchanged.

## Explicit Non-Goals

- Reading V1-to-V2 migration.
- Quiz export or migration.
- Google Drive owner reauthorization.
- External Google Drive file deletion.
- Direct R2 deletion or R2 lifecycle redesign.
- Remote purge during normal app startup, browser usage, deployment, or cron.
- Retired-material ID registry.
- Rewriting historical conversations or evidence.
- Production deployment, rule deployment, commit, push, or PR without their own approvals.

---

## Task 1: Freeze Retirement Classifiers with Tests

**Create:**

- `src/services/retirement/retiredMaterialClassifier.ts`
- `src/services/retirement/retiredMaterialClassifier.test.ts`

**Required classifiers:**

1. `isReadingV2Material(value)`
   - Return true only when one of `engine`, `contentEngine`, `deliveryEngine`, or `runtimeEngine` normalizes to `reading-v2`.
   - Reuse the canonical Reading V2 discriminator rather than duplicating it.

2. `isReadingV1Material(value)`
   - Require normalized IELTS/Reading material identity.
   - Require `isReadingV2Material(value) === false`.
   - Never classify THCS reading sections or Reading V2 metadata as Reading V1.

3. `isQuizMaterial(value)`
   - Classify records from the canonical `/quizzes/{quizId}` root.
   - Classify explicit Quiz material/session references only; do not classify generic question collections.

4. `hasGoogleDriveAudio(value)`
   - Inspect known Listening audio locations, including top-level audio fields and `audioSections[*].audioUrl`, `streamUrl`, and `originalUrl`.
   - Match:
     - `drive.google.com`
     - `docs.google.com/file`
     - `drive.usercontent.google.com`
   - Do not treat Google Fonts, Gemini, Firestore REST, or unrelated `googleapis.com` URLs as Drive audio.

**Tests:**

- Reading V2 with `deliveryEngine: reading-v2` is never retired.
- Reading V1 with `skill: Reading` and no V2 marker is retired.
- THCS `reading-comprehension` is never retired.
- Listening with R2 audio is never retired.
- Each supported Drive URL variant is retired.
- Ordinary HTTPS audio is not retired.
- Unknown or malformed records return an explicit `unknown`/blocked classification for purge planning rather than defaulting to deletion.

Run:

```powershell
npx vitest run src/services/retirement/retiredMaterialClassifier.test.ts
npx tsc --noEmit
```

---

## Task 2: Remove User Entry Points

**Main surfaces:**

- Teacher test creation modal and builder routing.
- Teacher Lobby material actions.
- Admin material management.
- Student library, homework, course, practice, and live-session entry.
- Session creation and material selection.

**Changes:**

- Remove Reading V1 from teacher creation skill options.
- Remove Quiz mode from session creation, including localhost/dev-only controls.
- Remove Quiz and Reading V1 editor/open/start/assign actions.
- Prevent Drive-backed Listening materials from appearing as usable materials.
- Keep Reading V2 creation/import/revision routes intact.
- Keep R2 Listening, Writing, and THCS creation intact.
- Update feature registry routes/actions in the same change.

**Retirement states:**

- Add native, non-Mantine retirement notice content for dedicated Quiz URLs.
- Shared material/session routes render generic `Material no longer available` when the record is absent.
- Return targets:
  - teacher -> Teacher Lobby;
  - student -> Student Dashboard;
  - guest -> login/join surface.
- Use registered route helpers; do not compose route strings manually.
- Track retirement notice views and return actions.

**Tests:**

- Reading V1 option absent.
- Reading V2 option still present.
- Quiz mode absent in development and production configurations.
- Dedicated teacher/student Quiz URLs render retirement notice without reading `/quizzes`.
- Missing shared material renders generic unavailable state.
- Return controls use correct registered routes.

Run focused page/component tests, then:

```powershell
npx tsc --noEmit
```

---

## Task 3: Remove Google Drive Runtime and Configuration

**Delete after consumers are removed:**

- `src/services/googleDrive.js`
- `src/services/googleDrive.d.ts`
- `src/services/googleDriveAudio.ts`
- Drive-only badge/component and tests when no longer imported.
- Obsolete Google Drive cleanup-backup samples that are active tooling rather than historical evidence.

**Modify:**

- `src/config/env.config.ts` and tests.
- `env.example.txt`.
- Listening authoring builder.
- Listening `AudioPlayer`.
- Listening result audio resolution.
- Any current comments, type declarations, mocks, or runtime fallbacks that describe Drive as supported.

**Required behavior:**

- New and existing active Listening paths accept R2/authorized delivery only.
- No iframe/embed fallback.
- No Drive share-link validation.
- No Google OAuth initialization.
- No `VITE_GOOGLE_DRIVE_CLIENT_ID`.
- Retained results never attempt a Drive network request.

**Static audit:**

```powershell
rg -n "VITE_GOOGLE_DRIVE_CLIENT_ID|googleDriveAudioService|googleDriveService|drive\.google\.com|docs\.google\.com/file|drive\.usercontent\.google\.com" src env.example.txt
```

Expected: zero production matches. Retirement classifier tests and purge tooling are reviewed separately.

---

## Task 4: Remove Reading V1 Implementation

**Remove production ownership:**

- Legacy Reading creation/parsing/review flow.
- `src/skills/reading/**` when dependency scans prove no supported consumer.
- Legacy `IELTSPracticeView` Reading path.
- Legacy `ReadingTestPage`.
- Reading V1-only mobile scaffold/state/components.
- Reading V1-only integration tests.

**Shared-code warning:**

- Do not delete a file merely because its name contains `reading`.
- Preserve utilities used by Reading V2, Listening, or THCS.
- Preserve `skill: reading` where Reading V2 metadata contracts require it.
- Preserve `ielts_reading` content kind for Reading V2 homework and delivery.

**Host behavior:**

- `TestPageRouter` routes explicit Reading V2 to Reading V2 runtime.
- Missing/deleted legacy material renders generic unavailable state.
- `StudentPracticePage` keeps explicit Listening, Writing, THCS, and Reading V2 branches.
- Legacy Reading is never used as a default fallback for unknown IELTS material.

**Tests:**

- Reading V2 live/practice/homework routing remains green.
- R2 Listening uses dedicated Listening runtime.
- Unknown IELTS material does not fall into Reading V1 runtime.
- THCS reading sections still render and score.

---

## Task 5: Remove Quiz Implementation

**Remove:**

- Quiz editors and admin material actions.
- Teacher and student gameplay pages.
- Quiz feedback/result pages that have no retained-result responsibility.
- Quiz cache/query functions.
- Quiz assignment APIs.
- Quiz inspection/debug scripts after purge tooling replaces their required inspection.
- Deprecated Quiz components.
- Quiz-only package scripts.

**Session contracts:**

- Make active session creation test-only.
- Remove Quiz mode, Quiz assignment, `activeQuizzes`, and `assignedQuizId` from active session contracts.
- Preserve legacy result fields still required to read retained completed results.
- Do not broadly delete `quizId` from result DTOs until retained-result tests prove it is unnecessary.

**Routes:**

- Keep dedicated Quiz URL patterns only as retirement notice routes.
- Remove Quiz routes from `liveSessions` feature ownership.
- Register retirement notice routes/actions under retirement observability.

**Firebase rules:**

- Prepare removal/denial of `/quizzes`.
- Do not deploy rule changes before remote purge and readback finish.

**Tests:**

- Session creation is test-only.
- Waiting/join flows never load Quiz data.
- Dedicated Quiz routes render retirement notice.
- Supported test-mode live sessions remain green.
- Retained Quiz result snapshots remain readable through shared result services.

---

## Task 6: Preserve Academic Results and Answer Review

**Contract:**

- Keep `test_results/{resultId}` and every required student/teacher/class/course result index.
- Keep title, skill/type snapshots, score, percentage/band, submission time, question results, student answers, correct answers, and feedback.
- Keep stable IDs required for grouping attempts.
- Remove embedded Drive audio URLs and other retired source payloads from retained results.
- Persist `sourceMaterialRemoved: true` or the agreed equivalent result-level marker.

**UI:**

- Academic Record still shows retained results.
- Answer Review renders from `questionResults`.
- Do not fetch deleted material just to render Answer Review.
- When original question/passage/audio context is absent, show `Original material removed`.
- Do not promise Source Review after purge.

**Tests:**

- Academic Record retains Reading V1/Quiz/affected Listening result summaries.
- Answer Review displays saved answers and scores with material absent.
- No material lookup is required for basic Answer Review.
- Drive audio URL is neither rendered nor requested.
- Reading V2 review projection behavior remains unchanged.

---

## Task 7: Add Retired-Material Purge Script

**Create:**

- `scripts/purge-retired-materials.mjs`
- `scripts/__tests__/purge-retired-materials.test.mjs`

**Package command:**

```json
"materials:purge-retired": "node scripts/purge-retired-materials.mjs"
```

**Commands:**

```powershell
npm run materials:purge-retired -- --project temp-a1437
npm run materials:purge-retired -- --project temp-a1437 --apply
```

Default is dry-run. `--apply` is destructive and requires separate approval.

**Discovery roots:**

- `/quizzes`
- `/tests`
- `/drafts`
- `/student_safe_tests`
- `/homework_assignments`
- `/homework_student_safe_tests`
- `/homework_student_safe_test_access`
- `/course_materials`
- embedded course/module material references
- `/material_catalog/material_indexes/**`
- legacy `/materials` rows when they reference a targeted material
- `/session_test_payloads`
- notifications/launch records carrying a targeted material/test/quiz ID
- retained `/test_results` only for source scrubbing; never result deletion

**Protected roots:**

- `/reading_v2/**`
- Reading V2 projections and metadata.
- Completed result records and result indexes.
- R2 asset registry/object state.
- Classes, courses, and modules themselves.
- Session records after Session Closure.

**Dry-run manifest must include:**

- project ID;
- candidate counts by reason: Quiz, Reading V1, Drive-backed Listening;
- exact material IDs;
- every planned deletion path;
- every planned retained-result scrub path;
- unknown/blocked records;
- active-session count;
- protected Reading V2 collision count;
- planned R2 delete count fixed at zero.

**Apply preconditions:**

- Re-read all candidates immediately before mutation.
- Abort on active sessions.
- Abort on any Reading V2 marker.
- Abort on unknown/malformed candidate shape.
- Abort when a parent course/class/module would be deleted.
- Abort if a completed result is planned for deletion.
- Abort if any R2 delete operation is planned.
- Use bounded, idempotent Firebase updates.

**Apply readback:**

- zero Quiz materials;
- zero Reading V1 materials;
- zero Drive-backed Listening materials;
- zero stale active assignment/catalog/delivery references;
- zero active sessions;
- retained result counts unchanged;
- zero Drive URLs in retained result source fields;
- Reading V2 counts unchanged;
- R2 delete count zero.

---

## Task 8: Reconcile Rules and Active Types

After local purge tooling and tests are complete:

- Remove `/quizzes` client read/write rule.
- Remove Quiz-only validation fields from new active session writes.
- Preserve compatibility reads only where retained results require them.
- Update route security for retirement notice routes.
- Update active TypeScript types without making retained historical result records unreadable.

Add emulator-backed tests proving:

- `/quizzes` client read/write denied;
- supported `/tests` ownership remains correct;
- Reading V2 paths remain correct;
- retained result access remains correct;
- test-only session creation remains authorized.

Do not deploy rules in this task.

---

## Task 9: Reconcile Documentation and Knowns

**Create:**

- Canonical retired-features architecture/current-state document linking the ADR and this plan.

**Update active authority:**

- Product definition and technology stack.
- Root design known-drift/route descriptions.
- Upload/storage authority.
- Teacher creation/navigation architecture.
- Homework/solo practice architecture.
- Student delivery projection architecture.
- Session and result governance.
- Feature registry documentation.
- Documentation indexes.

**Mark obsolete:**

- Reading V1 PRD and task list.
- Mobile Reading V1 PRD/task plan where it owns the retired runtime.
- Quiz PRD/task material.
- Quiz editor/system architecture and SOPs.
- Google Drive-specific portions of broader audio documents.

**Historical treatment:**

- Add an obsolescence banner/status and replacement pointer.
- Preserve completed task/history text.
- Mark unfinished work cancelled because feature retired; never mark it completed.
- Do not rewrite conversation logs, exports, archived proof, or generated evidence.

**Knowns:**

- Directly edit relevant `.knowns/docs` and `.knowns/tasks`.
- Do not use removed Knowns MCP/CLI.
- Do not edit generated `.knowns/.search` files.
- Update `CLAUDE.md` and `GEMINI.md` to remove stale requirements to use unavailable Knowns tooling.

Run stale-truth scans for:

```text
Google Drive supported
Quiz Mode supported
Reading V1 supported
legacy playback continues
no source/tests changed
docs-only
```

---

## Task 10: Verification, Review, and Local Closure

Run focused tests throughout. Final local gate:

```powershell
npm run sessions:end-active -- --project temp-a1437
node --test scripts/__tests__/end-active-sessions.test.mjs
node --test scripts/__tests__/purge-retired-materials.test.mjs
npx vitest run
npm run test:security
npm run lint
npx tsc --noEmit
npm run build
npm run check:utf8:all
npm run enforce:check
git diff --check
```

Browser verification:

- Teacher: `http://localhost:5173`
- Student: `http://localhost:5174`
- Use dev quick-login buttons.
- Verify Reading V2, R2 Listening, Writing, THCS, test-only session creation, Quiz retirement URLs, generic deleted-material state, Academic Record, and Answer Review.

Final source scans:

- no production Google Drive runtime/config;
- no Reading V1 creation or runtime;
- no executable Quiz flow;
- no Mantine introduced in touched UI;
- no Reading V2 path selected for purge;
- no R2 delete capability added;
- no user-owned unrelated file included.

Perform code review after implementation and proof are complete.

Use exact-path staging only after review. Verify staged paths before commit.

Suggested commits:

1. `chore(sessions): add active-session closure script`
2. `refactor: retire drive reading-v1 and quiz`
3. `chore: add retired-material purge tooling`
4. `docs: mark retired features obsolete`

Commit, push, PR, deploy, and remote purge remain separate approvals.

---

## Task 11: Remote Purge and Deployment Gates

These steps do not occur automatically during implementation.

### Gate A: Prevent new retired data

- Merge/deploy feature-removal UI/runtime first.
- Verify creation and session selectors expose only supported materials.

### Gate B: Close sessions and inspect purge

```powershell
npm run sessions:end-active -- --project temp-a1437 --apply
npm run materials:purge-retired -- --project temp-a1437
```

- Review dry-run manifest.
- Confirm zero active sessions, zero protected collisions, zero planned result deletions, and zero R2 deletions.

### Gate C: Destructive approval

Only after explicit approval:

```powershell
npm run materials:purge-retired -- --project temp-a1437 --apply
```

Run full readback and retain only the manifest/proof required for audit; do not retain deleted material payloads.

### Gate D: Rules deployment

- Deploy cleaned Firebase rules only after purge readback passes.
- Verify `/quizzes` denial and supported feature access against deployed state.

### Gate E: Main integration

- Follow feature merge/main refresh safety rules.
- Prefer PR.
- Direct push to `main` requires explicit approval plus diff, commit, and test summary.
- Fast-forward local `main` only after remote merge.
- Remove worktree only after reachability, cleanliness, and user approval.
