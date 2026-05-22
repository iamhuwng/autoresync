# Reading V2 Auto V3 Pipeline Findings

> **Created:** 2026-05-14
> **Status:** Current V3 implementation evidence. This file does not replace the historical `6246091` checkpoint findings.

## Implemented V3 Contract

- Raw source remains the source of truth.
- Gemini receives full line-indexed source only for topology coordinates and visible answer-key row normalization.
- Local code verifies Gemini marker spans, passage coverage, question coverage, source-bound answer rows, excluded pollution, and passage-body/question-area overlap.
- Local code splits exactly three passage packages from verified line spans.
- Groq receives one package question area per call and never receives passage body text.
- Groq package fan-out assigns distinct non-benched key slots when available, retries only the failed package on another slot, preserves successful transcripts, and redacts raw keys.
- Groq transcript output is parsed and verified locally before canonical V2 assembly.
- Local code inserts local passage body text, generates Studio instructions from task type metadata, binds verified answer-key rows, validates/projection-checks the draft, and fails closed on unresolved diagnostics.

## Non-Live Verification

- Focused mocked V3 suite: topology marker, package splitter, question-area normalizer, Groq fan-out, transcript parser/verifier, Auto import integration, and Groq provider preferred-slot tests.
- Broader Reading V2/Groq regression suite: `src/services/reading-v2` plus `src/services/ai/groq.provider.test.ts`.
- TypeScript filter over new V3 files is clean; full repo `tsc` is still blocked by pre-existing unrelated repo-wide TypeScript errors.
- Redacted local Clippings harness: `reading-v2:clippings-ledger -- --mode full-mocked-v3` scanned 276 local files without provider calls and reported marker/package/transcript/verifier counts separately.
- No-content provider preflight: `reading-v2:clippings-ledger -- --mode provider-preflight` writes a redacted readiness report without scanning Clippings or making provider model calls. Current result shows Firestore key registry permission-denied, 5 total configured AI keys, 1 available Groq structured JSON slot, and degraded distinct 3-package Groq fan-out until more Groq slots are readable.
- Production build: `cmd /c npm run build` passed after V3 production-code changes; Vite transformed 9271 modules and bundle budget check passed. Later reruns after Auto V3 setup-copy/quota-recovery UI and the reference-bank-lines prompt fix also passed. The latest build rerun after post-reference-bank source-fidelity patches was rejected before execution by Codex usage-limit approval review, so no sandbox Vite/esbuild fallback was attempted. Existing PostCSS `@import` ordering warnings remain unrelated to V3 and are tracked in the diagnostic log.
- UI/provider labels: Test Creation now shows `Process with Auto V3`, Auto setup says `Auto V3 import`, Studio review labels candidates as `Auto V3`, V3 service success reports `provider: 'gemini-groq'`, and Test Creation submit metadata uses `provider: 'auto-v3'`.
- UI quota recovery: `TestCreationModal.test.tsx` now covers mocked Gemini marker quota exhaustion and mocked Groq package quota exhaustion. Both paths keep the raw source recoverable, show visible alert/diagnostics, avoid navigation/close, and emit failure metadata with `provider: 'gemini-groq'`.
- Non-live browser smoke: `reading-v2-studio-smoke.spec.ts` now includes synthetic Auto V3 full-test and malformed-key fixtures. The success smoke opens Studio in `create-from-auto`, verifies three passages, previews the runtime shell, publishes, and asserts zero Gemini/Groq request URLs. The malformed smoke verifies `Needs review`, visible validation items, disabled publish, teacher-key diagnostics, and zero Gemini/Groq request URLs.
- Historical docs: the older `tasks-0048-reading-v2-auto-gemini-import.md` file now carries a V3 pivot note so its `Process with Gemini` and `provider: 'gemini'` examples are treated as legacy Gemini-only context, not active V3 instructions.
- Live-provider safety: `live-v3-gemini-groq` requires `--allow-live-v3-providers`; the legacy `--allow-live-gemini` flag does not grant Groq consent.
- Quota-stop safety: live probes and degraded Groq package fan-out run sequentially and stop after the first Gemini/Groq quota, rate-limit, or exhausted-key signal. The redacted live probe record includes `quotaStopSignal` and `stopReason`; Auto V3 diagnostics include `provider-quota-exhausted`.
- Direct-approved live probes: the first capped real Clippings run wrote `output/reading-v2-clippings-live-v3-report.json` and failed closed at Gemini topology verification for `IELTS Reading/002 - Reading Practice Test 02.md` with `topology-marker-failed`, no quota stop, and no Studio candidate. The post-heading rerun wrote `output/reading-v2-clippings-live-v3-post-heading-report.json`, advanced past that marker blocker, and stopped at Groq package 1 with `provider-quota-exhausted`, `groq-package-failed`, `quotaStopSignal: true`, and `stopReason: "quota-or-rate-limit"`.
- Groq mitigation update: the V3 question-area normalizer now targets `meta-llama/llama-4-scout-17b-16e-instruct`, caps `maxOutputTokens` at 8192, and retries structured generation downward on request-too-large/TPM failures. This is verified by focused provider/normalizer tests, and later live probes moved past the Groq quota-size blocker.

## Static Review Fixes Applied

- Answer-key marker rows now must bind to the local ledger row by question number, source line, and answer hash. Short answers such as `A`, `B`, or `TRUE` can no longer pass just because the token appears elsewhere on the same line.
- Groq structured generation now captures the selected preferred key slot in a local variable, preventing concurrent calls from benching or reporting the wrong shared `currentKeyIndex`.
- Marker verification rejects overlapping passage-body and question-area spans before package splitting.
- Marker verification now accepts a Gemini body/title span that starts after the ledger-owned strict `READING PASSAGE N` heading and before the verified question area. This mitigates the first live probe's heading-anchor rejection on a web-clipped full test while preserving fail-closed checks for impossible, overlapping, or unanchored spans.

## Remaining Gates

- Direct approval was received and capped live Gemini/Groq probes ran on real Clippings content. The latest post-reference-bank-fix probe wrote `output/reading-v2-clippings-live-v3-after-reference-bank-fix-report.json` with `success: true`, `passageCount: 3`, `questionCount: 40`, `errorCode: null`, `quotaStopSignal: false`, and no transcript/package/reference-bank/missing-question failure.
- Live report diagnostics now include sanitized root-cause message objects, not just codes. The current single `canonical-validation-blocked` message is Q37 source-content inconsistency: answer key `E` is not present in the visible A-D option bank.
- The V3 code now repairs the live target's missing flowchart transcript group, preserves `NO MORE THAN THREE WORDS`, normalizes YES/NO answer-key labels to TFNG where the source task vocabulary is TFNG, and avoids turning copied source instruction prose into V3 publish blockers.
- User clarified that 95-99% parsing success is acceptable when minor wrong questions are detected for teacher repair before publish. Under that standard, the current live `reviewable` result is acceptable because Q37 is detected and publish-blocking rather than silent.
- Provider preflight still proves only one available Groq structured JSON slot in this process. The V3 fan-out code supports three distinct slots, but the live environment remains degraded until more readable Groq keys are available. The successful live probe proves the degraded one-slot path can still complete the target source.
- Real browser smoke with live providers remains a separate optional manual/UX gate. The non-live browser smokes prove route/Studio handoff and fail-closed behavior; the live harness now proves provider fidelity through candidate creation.

## Diagnostic Log

Blockers and encountered errors are tracked in `documentation/tasks/PRD0048/diagnostic-log-reading-v2-auto-v3-pipeline.md`. Use that file to remove root causes without rediscovering command traps, live-provider consent gates, or already-fixed P1 issues.

## Completion Audit

Prompt-to-artifact completion status is tracked in `documentation/tasks/PRD0048/completion-audit-reading-v2-auto-v3-pipeline.md`. Current status: V3 pipeline target complete for the approved one-file live probe under the clarified detection-before-publish acceptance threshold; source Q37 repair, repeated-run evidence, live browser smoke, and latest build rerun remain separate downstream/open gates.
