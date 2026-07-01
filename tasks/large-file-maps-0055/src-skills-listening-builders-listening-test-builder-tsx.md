# ListeningTestBuilder.tsx Large-File Map

## Full Read

- Path: `src/skills/listening/builders/ListeningTestBuilder.tsx`
- Current: 3157 lines; `HEAD`: 2182 lines; delta: +975.
- Evidence: line-numbered full `Get-Content`, full `git show HEAD:...`, zero-context diff, and full-file Node symbol/hook/branch scan.
- Read complete: 3157 / 3157 lines at `2026-06-29T12:24:30.2528053+07:00`.

## Top-Level Surface

- Types/interfaces: `TestType` 62; `Difficulty` 63; `AudioSection` 65-83; `ListeningTestMetadata` 85-97; `ListeningBuilderStep` 99.
- Helpers: `createDefaultSections` 101-102; `buildInitialListeningMetadata` 105-136; `createListeningActionIdempotencyKey` 138-141; `isListeningAuthoringIssue` 143-149; `normalizeAuthoringIssues` 151-170.
- Component/export: `ListeningTestBuilder` 172-3155; default export 3157.
- Consumers: `TestBuilderRouter.tsx` imports/routes it; `ListeningTestBuilder.test.tsx` renders it directly.

## State And Effects

- State 181-236: `metadata`, `currentStep`, `displayMode`, `questionImages`, `errors`, `questions`, `isSaving`, `uploadingSection`, `isAuthenticated`, `isAuthenticating`, `questionText`, `isParsing`, `parsingProgress`, `parsingStage`, `bulkAnswerKey`, `isPublic`, `audioControls`, `allowReplay`, `maxReplays`, `pendingAction`, `draftStatusMode`, `draftWarnings`, `publishBlockers`, `publishReadinessMode`, `publishReadinessBlockers`, `publishReadinessCheckedSections`, `draftId`, `draftConflictToken`, `lastSavedAt`, `lastPersistedFingerprint`, `duplicateAction`, `discardContext`, `draftStatusMessage`, `discardedDraft`, `publishedVersion`, `isPublishedVersionArchived`, `lifecyclePendingAction`.
- Refs 237-240: `pendingActionRef`, `initialFingerprintRef`, `pendingNavigationRef`, `authoringWorkflowRef`.
- Effect 245-249, `[]`: mark the R2-only storage shell ready.
- Effect 392-410, `[draftStatusMode, hasUnsavedChanges]`: clear stale authoring status after edits.
- Effect 1392-1444, `[currentStep, metadata.sections]`: attach/remove the image-step paste handler.

## Side Effects

- R2 upload: `r2StorageService.uploadAudioReplacement` 468-485.
- Obsolete unsupported Google Drive residue: validation 608-613 and iframe fallback 1932-1938. Task 5 does not use or extend this path; removal is separately gated.
- Parser: `listeningRouter.parseListening` 743-750.
- Trusted workflow: `saveDraft` 802-807; `discardDraft` 952-956; `restoreDraft` 998-1003; `archivePublishedVersion` 1030-1035; `publishDraft` 1150-1154.
- Navigation/lifecycle: `navigateTo('SESSIONS')` 696-701; `useAppLifecycle.onBeforeUnload` 412-417.
- Browser/media: `window.confirm` 452-455; `FileReader` 1427-1430 and 2399-2404; clipboard 2391-2429; global paste listener 1442-1443; HTML audio preview 1917-1923.
- Feedback/telemetry: shared `announceListening*`, `toast.*`, sanitized `trackAction`, and diagnostic `console.*`.

## Branch Map

- `handleNext` 638-688: step routing and text/image split.
- `handleBack` 691-728: discard gate, sessions navigation, text/image split.
- `validateAudioUrls` 588-619: empty, R2/direct, and obsolete residue fallback.
- `handleSaveDraft` 783-885: duplicate, saved, conflict, error.
- `handleDiscardConfirmed` 941-992: trusted discard versus unsaved local reset.
- `handleRestoreDraft` 994-1024: guard, conflict/error, success.
- `handleArchivePublishedVersion` 1026-1046: guard, failure, success.
- `handlePublish` 1048-1276: local blockers, range readiness, trusted publish, blocked/conflict/idempotency/error.
- `handleGlobalPaste` 1395-1444: step/input/image/single-section branches.
- Audio preview 1905-1940: direct audio, obsolete residue iframe, invalid URL.

## Diff Touch Regions

- Imports/types/helpers: current 6-170.
- State/workflow/lifecycle/status: 181-419.
- Upload/navigation wiring: 490-728.
- Draft/publish/lifecycle handlers: 783-1276.
- Paste/status/render integrations: 1355-1525, 1698-1757, 2266, 2410-2427, 2984, 3077-3146.

Protected neighboring regions:

- Existing upload mechanics 419-489.
- Section mutation and legacy URL validation 514-619.
- Parser flow 730-781.
- Question/image helpers 1278-1389.
- Main legacy render body 1698-2300.
- Existing tail editor controls 2435-3076.

Every tracked hunk falls within the declared Task 4/5 metadata, orchestration, status, navigation, lifecycle, readiness, or observability regions. No solo/live runtime, `AudioPlayer.tsx`, Reading V2, or Task 6+ region is touched.

## Parity And Responsibility Delta

- Authority match: PRD-0057 requires this file to remain the route-level orchestrator and delegates authoring domain behavior to `src/features/assessment/listening/**`.
- Before: route shell also called legacy save directly and used local alert-style outcomes.
- After: route shell owns step/render composition plus explicit UI state, but durable authoring, conflict/idempotency, readiness, announcements, lifecycle mutation, and observability formatting are delegated.
- Accepted interpretation: +975 lines is substantial orchestration/render growth and a maintenance risk, but no new persistence or lifecycle domain authority moved into the builder. “Thin” means no domain authority, not a small line count. Parent acceptance must preserve this qualification.

Characterization:

- `ListeningTestBuilder.test.tsx` covers route-level authoring actions, duplicate/conflict behavior, lifecycle wiring, pending freezes, readiness semantics, announcements, and observability.
- Focused GREEN before Batch E: included in the 47-test frontend authoring/parser run.

## Decomposition Seams

- Created: workflow ref; document/fingerprint helpers; action gate; status/readiness/lifecycle components.
- Preserve: route-level step routing and composition.
- Future approved refactor seams: audio upload/preview component; draft lifecycle controller hook; question/image editor modules; step-navigation telemetry helper; legacy Google Drive residue removal under its separate task.
