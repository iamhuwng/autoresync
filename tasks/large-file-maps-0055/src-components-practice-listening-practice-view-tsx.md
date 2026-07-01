# ListeningPracticeView.tsx Large-File Map

## Full Read

- Path: `src/components/practice/ListeningPracticeView.tsx`
- Current: 1851 lines; Batch D pre-edit observed baseline: 1761 lines; prior current-turn pre-edit observed baseline: 1700 lines; PRD-0059 Packet 1I baseline: 1694 lines; `HEAD`: 1525 lines.
- Evidence: targeted full-file/source scans for host hooks, submit, timer, autosave, resume, solo delivery boundary, audio boundary, mobile state, and before/after line counts.
- Read complete for current implementation pass at `2026-06-30T04:20:00+07:00`.

## Top-Level Surface

- Component/export: `ListeningPracticeView` remains the solo/homework Listening runtime host.
- Local state ownership: answers, current question, viewed part, current audio index, playback, mobile state, submit sheet, overlays, and resume decision remain in this host.
- Solo hooks: `useSoloTestData`, `useSoloTimer`, `useSoloResume`, `useSoloSubmission`, `useSoloAutoSave`.
- Protected audio boundary: host continues passing props/callbacks into `AudioPlayer`; no `AudioPlayer.tsx` internals, `audioCommand`, or `masterAudioState` are edited here.
- Solo delivery boundary: host resolves asset-ID section audio through the bounded solo delivery adapter before `AudioPlayer`; legacy public sections remain read-only.

## State And Effects

- Attempt identity seed: 188-190.
- Source audio sections and version metadata: 252-265.
- Resume-safe attempt identity derivation: 347-369.
- Solo delivery resolution state/effect: 380-449.
- Timer and submit refs: 625-647.
- Submission hook wiring: 724-767.
- Autosave hook wiring: 755-767.
- Submit sequencing effect: 774-810.
- Answer handler and submit entry points: 813-1080, 1604, 1830.

## Diff Touch Regions

- Imports: Listening solo attempt identity helper and solo delivery adapter/client.
- Attempt identity: add stable generated seed and resume preservation.
- Solo delivery: resolve asset-ID sections at the host boundary and fail closed until authorized URL is available; keep legacy sections public/read-only.
- Submit coordination: one host-level submit sequence, one auto-submit latch, wait for accepted save, final `flushNow`, then `handleSubmit`.
- Hook props: pass `attemptId` and `submissionOperationId` into submission and autosave.
- Tests: host proof for accepted-save/final-flush/time-up ordering, one submit, authorized solo URL handoff, and no authorized URL in autosave mobile state.

Protected neighboring regions:

- Audio playback state, source loading, seek, drift, and player internals.
- Mobile state hydration compatibility and serialization logic.
- Test-data loading, resume modal policy, anti-cheat event capture, and result display.
- Desktop/mobile rendering branches outside submit/identity/flush wiring.

## Parity And Responsibility Delta

- Before: host funneled submits through a ref but did not await accepted autosave, did not force a final flush, and did not pass stable attempt identity into submit/autosave.
- After: host still owns orchestration only; submit identity algorithm lives in `src/features/assessment/listening/runtime/solo/listeningSoloAttemptIdentity.ts`, autosave flush contract lives in `useSoloAutoSave`, and result idempotency lives in `testResults.service`.
- Delta accepted for Task 7.9/7.10: +61 lines from earlier current-turn pre-edit baseline added imports, identity wiring, submit sequencing, and proof hooks; no new audio/runtime authority was added in Batch C.
- Delta accepted for Task 7.11/7.12: +90 lines from Batch D pre-edit baseline adds imports, optional issuer props, solo delivery effect, and resolved audio-section mapping; `AudioPlayer.tsx` remains untouched.

## Decomposition Seams

- Created: stable attempt identity helper under the bounded Listening solo runtime feature path.
- Created: solo delivery adapter/client under the bounded Listening solo runtime feature path.
- Preserved: host-level local state ownership and existing solo hook facade boundaries.
- Future seam: submit sequencing could move into a bounded solo coordinator hook after more Task 7 coverage; solo delivery refresh/cutover source handoff remains a Task 8 dependency if it requires player internals.
