# Reading V2 Runtime Integrations

Status: active architecture contract.
Updated: 2026-06-15

This document records the current integration boundary between Reading V2 and shared platform systems: anti-cheat, trusted submit, AI feedback, admin monitoring, and host-owned launch/return wiring.

## Scope

Reading V2 does not own separate copies of these platform systems:

- anti-cheat and integrity telemetry
- trusted submit transport
- saved-result feedback generation
- admin production monitoring

Reading V2 supplies V2-specific adapters, payloads, and host wiring so those existing systems can work with V2 projections and saved results.

## Cross-Skill Unification Boundary

`documentation/architecture/ielts-reading-v2-listening-unification.md` governs presentation sharing between Reading V2 and Listening. It does not authorize a shared runtime authority model. This document remains authoritative for Reading V2 launch, host wiring, anti-cheat, trusted submit, feedback, monitoring, and return behavior.

## Runtime Hosts

Reading V2 runtime hosts are:

- live sessions: `src/pages/TestPageRouter.tsx`
- solo, public library, course material, and homework practice: `src/pages/StudentPracticePage.tsx`
- rendering shell: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`

The runtime shell owns rendering and answer collection. The host pages own platform context, route state, timer source, anti-cheat config source, submit handoff, and non-live exit routing.

## Launch Surface Integration

Reading V2 launch owner split is:

- `src/services/reading-v2/readingV2LaunchIntegration.service.ts` decides which namespaced projection path is valid for each surface
- `src/pages/StudentHomeworkDetailPage.tsx` prepares student-visible homework summary and resume entry
- `src/pages/StudentPracticePage.tsx` resolves non-live runtime launch and host-owned exit behavior
- `src/pages/TestPageRouter.tsx` resolves live-session runtime launch

Current full-test rules:

- non-live student launch uses `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- live-session launch uses `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`
- student homework detail must read `tests/{materialId}` plus student-safe projection, not owner-only `reading_v2/material_metadata/{materialId}`
- homework rollout may be enabled while direct solo/public launch remains blocked by teacher-preview mode

Obsolete as of 2026-06-15:

- treating `Reading V2 launch requires a published projection.` as expected behavior for a successfully published composition-first full test
- expecting student homework detail to probe namespaced metadata before it can show title/question summary

## Exit And Return Integration

Non-live Reading V2 launches must provide an explicit in-runtime exit affordance.

Current owner split:

- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` owns the visible top-right `X` action through the optional `onExit` prop.
- `src/pages/StudentPracticePage.tsx` owns exit routing because only the host knows the launch surface and route-state contract.

Required rules:

- homework launch exits return to the student homework shell
- class/course-material launch exits return to the owning student course detail page
- solo practice, public library, and private-material library launches exit to the student library shell
- exit routing must use the shared navigation layer, not ad hoc `window.history.back()`
- exit analytics stay host-owned and currently emit `trackAction('leaveTest', ...)`
- the runtime shell must stay projection-bound; it must not infer destination routes from projection payload content

The runtime exit action is a navigation affordance only. It does not submit, auto-save, score, or finalize an attempt by itself.

## Anti-Cheat Integration

Reading V2 uses the existing PRD-0036 anti-cheat hooks:

- `src/hooks/test/useTestIntegrity.ts`
- `src/hooks/test/useAntiCopyPaste.ts`
- `src/hooks/test/useFullscreenMode.ts`
- `src/hooks/test/useIntegrityRefreshRequest.ts` for live sessions

Rules:

- Live Reading V2 reads `game_sessions/{sessionCode}.antiCheatConfig`.
- Homework Reading V2 reads `homework_assignments/{homeworkId}.antiCheatConfig`.
- Solo, public-library, and course-material launches do not enable anti-cheat unless a future platform owner supplies a valid config.
- The host wraps the whole `ReadingV2RuntimeShell` in the anti-copy/paste container ref.
- Auto-submit from integrity threshold becomes a runtime `forceSubmitToken`.
- Submit first flushes integrity events, then attaches the current `integrityReport` to the trusted submit payload.
- Live teacher refresh uses `integrityRefreshRequestedAt` and flushes the V2 integrity buffer.

The browser integrity report is supporting telemetry. It is not trusted for scoring, answer validation, or result authority.

## Trusted Submit Integration

Browser submit payloads are projection-bound and must include only:

- `projectionId`
- `sourceSnapshotVersionId`
- `materialId`
- answer rows with `interactionId`, `taskGroupId`, visible/display number, and value
- optional `integrityReport`
- platform context such as `surface`, `sessionCode`, `homeworkId`, `courseId`, `moduleId`, and source name

The trusted backend validates and scores from canonical Reading V2 published data. It must not trust browser scoring data, answer keys, scoring rules, or canonical content.

Current code anchors:

- browser client: `src/services/reading-v2/readingV2RuntimeSubmission.service.ts`
- shared trusted core: `functions/src/readingV2SubmitCore.ts`
- generated legacy Functions output: `functions/lib/readingV2SubmitCore.js`
- Cloudflare Worker route: `r2-backup-worker/src/reading-v2/submit.ts`

Known source-location caveat:

`functions/src/readingV2SubmitCore.ts` is still the shared trusted-core source imported by the Worker. This does not make Firebase Cloud Functions the production submit backend. The production-aligned backend remains the Cloudflare Worker. Move the shared core to a neutral package when the backend code is reorganized.

## AI Feedback Integration

Reading V2 uses existing saved-result feedback services and tabs. It does not create separate V2 feedback storage.

For Reading V2 saved results:

- `src/services/resultFeedbackPayload.service.ts` must build feedback sections from `result.readingV2.reviewPayload`.
- It must not load legacy V1 `tests/{testId}` data to reconstruct V2 question context.
- Review payload content is already the saved, result-bound V2 review source. It preserves task groups, visible numbers, instruction text, passage snippets, and release-aware answers.

For legacy V1, THCS, IELTS, and generic results:

- the existing source loaders remain valid
- `getTestFromFirebase(...)` and `getThcsTestFromFirebase(...)` are still the expected path where those families need source sections

Do not interpret "V2 feedback avoids V1 storage" as disabling V1 feedback. It only prevents V2 feedback prompts from depending on legacy V1 test rows.

## Admin Monitor Integration

Reading V2 audit events live at:

```text
reading_v2/audit_events/{eventId}
```

Admin production reporting reads this path from `src/pages/AdminReportsPage.tsx`.

Rules:

- Read only recent audit event summaries in the admin monitor.
- Do not render raw `before`, `after`, canonical payloads, passage bodies, answer keys, student answers, scoring rules, AI review evidence, hidden provenance, or import evidence.
- The admin monitor is a read surface. It must not create, repair, delete, or mutate Reading V2 audit events.
- State-changing Reading V2 actions still write audit events through `src/services/reading-v2/readingV2AuditTrail.service.ts`.

## Current Known Good Coverage

Targeted regression coverage includes:

- `src/pages/TestPageRouter.test.tsx`
- `src/pages/StudentPracticePage.test.tsx`
- `src/pages/StudentHomeworkDetailPage.test.tsx`
- `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts`
- `src/services/resultFeedbackPayload.service.test.ts`
- `src/pages/AdminReportsPage.test.tsx`
- `functions/src/readingV2SubmitCore.test.ts`
- `r2-backup-worker/src/reading-v2/submit.test.ts`

## Obsolete Guidance

The following guidance is obsolete:

- Reading V2 live or homework runtime can be considered integrated without host-level anti-cheat hooks.
- Reading V2 submit can ignore browser integrity telemetry after the host gathers it.
- Reading V2 AI feedback should reconstruct V2 prompt context from legacy V1 `tests/{testId}` rows.
- Admin monitoring of Reading V2 audit state requires a new standalone admin product.
- Non-live Reading V2 practice may rely on browser back alone and does not need an explicit in-product return path.
- The runtime shell may guess where to return students from projection metadata instead of host launch context.
- Student homework detail may treat owner-only Reading V2 metadata as part of student runtime contract.

Use this document plus the linked PRD-0048 contracts before changing any Reading V2 runtime integration.
