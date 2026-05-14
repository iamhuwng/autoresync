# Findings: Reading V2 Auto Gemini Clippings Hardening

> **Status note, 2026-05-14:** This file is historical checkpoint evidence for the pre-V3 hardening pass committed as `6246091 feat(reading-v2): harden auto clippings import`. It is **not** the final target architecture after the V3 pivot.
>
> Use these findings as provenance for why V3 exists: source-ledger evidence, non-live test evidence, repair-loop evidence, harness evidence, and remaining live-provider gaps. For current Auto V3 implementation scope, use `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-clippings-hardening.md` and the visual PRD `documentation/tasks/PRD0048/reading-v2-auto-v3-pipeline-prd.html`.
>
> Do not clear this file. After V3 implementation, create a new V3 findings file instead of replacing this checkpoint record.

## 2026-05-14 Implementation Pass

- Added first-class raw-source ledger and source-fidelity verifier. The reported silent partial-success shape is now covered by a synthetic regression where source has three passages and questions 1-40, but Gemini output only returns questions 1-13; Auto fails before Studio with missing-question and unbound-answer diagnostics.
- Added extra-material guard. If source has only one strict `READING PASSAGE` heading but Gemini invents another material from loose instructional prose, verifier emits `source-passage-extra` and blocks Studio handoff.
- Added redacted section reference-bank detection for paragraph labels, people lists, headings lists, option sets, and matching endings. Ledger stores bank kind, line/range, item count, and label summary only; it does not store option text, names, or heading text in bank records.
- Added verifier enforcement for option/reference banks. If Gemini omits or changes required option/reference labels against source ledger banks, Auto emits `source-reference-bank-missing` or `source-reference-bank-mismatch` before Studio handoff.
- Added verifier enforcement for instruction constraints. Source task-type cues, word limits, TFNG/YNNG vocabulary, and letter-reuse rules now produce `source-instruction-task-type-mismatch`, `source-instruction-word-limit-mismatch`, `source-instruction-vocabulary-mismatch`, or `source-instruction-reuse-mismatch` when Gemini output drifts. Task-type cues cover matching-information vs matching-features, headings, table, flowchart, diagram, note, summary, sentence completion, MCQ, and TFNG/YNNG.
- Tightened the Auto prompt contract so Gemini no longer owns importer/canonical IDs. It now asks for source-ledger evidence hints plus question ranges, while local normalization owns stable Reading V2 IDs.
- Tightened deterministic assembly. Auto Gemini imports now derive stable canonical IDs from the local source name rather than Gemini `sourceFile`, and source question ranges own task grouping when Gemini `sectionInstructionId` drifts.
- Added canonical validation handoff. Auto now runs `validateReadingV2Draft` after normalization; reviewable but incomplete drafts carry publish-blocking validation messages into the Studio candidate instead of looking complete.
- Added bounded source-ledger repair. When verifier diagnostics identify omitted source chunks, Auto retries only the failing chunk(s), preserves already-valid chunks, reruns the verifier, and records `source-repair-attempted`, `source-repair-succeeded`, or `source-repair-failed` diagnostics. The success regression now repairs omitted Q14-26/Q27-40 and normalizes to three sections and 40 interactions.
- Added repair-loop trace metadata. Repair diagnostics now include attempt number, source range, verifier issue codes, repair scopes, provider result, and verifier result where applicable, so repeated failures are measurable without storing source/provider payloads.
- Added redacted Auto diagnostics on successful Studio candidates. Studio teacher diagnostics now group Auto repair/source issues into source-structure, question-binding, task-type, option-bank, structured-layout, and publish-readiness categories with jump targets, while hiding raw provider payloads.
- Added visible redacted source/generated summaries to the Studio candidate evidence: source ledger category/hash, passage count, question ranges, task-group count, question coverage, answer-key row count, and generated draft passage/group/question counts.
- Added local-only Clippings ledger harness. Command: `npm run reading-v2:clippings-ledger -- --out output/reading-v2-clippings-ledger-report.json`. Latest ledger-only scan: 276 files, 91 supported full-test candidates, 72 accepted, 20 reviewable, 7 rejected, 177 unsupported. Report is ignored and redacted; grep found no raw source or answer-key fields.
- Added mocked-intermediate harness mode and representative selection. Command: `npm run reading-v2:clippings-ledger -- --mode mocked-intermediate --out output/reading-v2-clippings-ledger-report-mocked.json`. Latest mocked scan after instruction/task-type verifier tightening: 276 files, 91 supported full-test candidates, 64 accepted, 7 reviewable, 28 rejected, 177 unsupported, 3439 generated interactions, 3062 bound answers. Representative tags now include clean full test, missing answer key, partial extract, polluted web clip, known difficult, and unsupported when available.
- Added explicit live Gemini harness mode behind `--mode live-gemini --allow-live-gemini`, with capped `--live-limit` and `--live-tags` controls. The guard, cap, and API-key/path error redaction are covered by `readingV2ClippingsHarness.test.ts`. Command without opt-in fails before provider calls: `npm run reading-v2:clippings-ledger -- --mode live-gemini --out output/reading-v2-clippings-ledger-report-live-guard.json`. Real copyrighted Clippings probes were not run in this pass.
- Added architecture note `documentation/architecture/reading-v2-auto-source-ledger-and-repair.md` covering ledger authority, prompt contract, verifier diagnostics, bounded repair loop, operational knobs, harness modes, and required verification evidence.
- Live browser smoke test passed on `http://localhost:5174/` with a synthetic non-copyrighted full-test source. Evidence: teacher quick-login worked on `localhost` after `127.0.0.1:5174` was blocked by Firebase API-key referrer restrictions; metadata-first flow and `Paste Text`/`Auto`/`Create New Test` choices appeared; Auto disabled duplicate submit while Gemini processed; Studio opened with 3 passages, 40 structured questions, 40 teacher-key rows, source ledger 1-40, publish disabled, and teacher preview opened the Reading V2 runtime without answer-key/diagnostic leakage in the runtime shell.
- Provider/key-rotation runtime gate passed after fixing test isolation in `gemini.provider.test.ts`: `src/services/ai/gemini-key-rotation.service.test.ts`, `src/services/key-cooldown.service.test.ts`, and `src/services/ai/gemini.provider.test.ts`; 3 files, 28 tests. Coverage includes benched-key skip, invalid/expired-key bench and rotation, rate-limit bench and recovery, high-demand rotation without benching, and structured-JSON expired-key rotation.
- Remaining scope: no real copyrighted Clippings live probe loop and no deploy in this pass. Local commit completed with detailed notes, including live Gemini and deploy status.
- Whole-repo `tsc -p tsconfig.json --noEmit --pretty false` remains blocked by pre-existing unrelated TypeScript errors outside this Reading V2 Auto slice. A filtered tsc check found no errors in the new Reading V2 hardening files after type cleanup. Latest focused hardening suite passed: 7 files and 117 tests. Latest broader Reading V2 service plus `TestCreationModal.test.tsx` suite passed: 38 files and 336 tests. Latest provider/key-rotation suite passed: 3 files and 28 tests. Latest ledger-only Clippings harness scan: 276 files, 91 supported full-test candidates, 72 accepted, 20 reviewable, 7 rejected, 177 unsupported. Latest mocked-intermediate harness scan: 276 files, 91 supported, 64 accepted, 7 reviewable, 28 rejected, 177 unsupported, 3439 generated interactions, 3062 bound answers. Redaction grep found no raw source/prompt/provider/answer payload fields in the local reports. Targeted UTF-8 checks, `git diff --check`, and `npm run build` passed.

## Completion Audit Snapshot

Objective: implement `tasks-0048-reading-v2-auto-gemini-clippings-hardening.md` and verify the target outcome, meaning Reading V2 Auto must use local source topology before trusting Gemini, fail or repair supported Clippings without silent passage/question/answer loss, expose teacher-safe diagnostics, preserve projection safety, and complete the tasklist's required verification/rollout gates.

| Requirement | Evidence | Status |
|---|---|---|
| Source ledger before Gemini | `readingV2AutoImportSourceLedger.service.ts`; `readingV2AutoImportSourceLedger.service.test.ts` covers full-test topology, strict passage headings, reference banks, instruction mismatch, extra material, and redacted prompt summary | Achieved |
| Prompt does not let Gemini own canonical IDs or hallucinate structure | `readingV2AutoImportPrompt.ts`; `readingV2AutoImportPrompt.test.ts` asserts ledger constraints and absence of canonical-ish ID requests | Achieved |
| Deterministic assembly, stable IDs, answer binding, canonical validation handoff | `readingV2AutoImport.service.ts`; `readingV2ImportNormalization.service.ts`; focused Auto/normalization tests cover stable local source names, range-owned grouping, missing answer-key publish blockers, and 40-question normalization | Achieved |
| Verifier blocks missing/extra source topology and reference-bank drift | `verifyReadingV2AutoPayloadAgainstLedger(...)`; source-ledger and Auto tests cover missing Q14-40, extra material, unbound rows, reference bank mismatch, instruction semantics, and trim risk | Achieved |
| Bounded repair loop keeps valid chunks and retries failing chunks | `repairPayloadAgainstLedger(...)`; Auto tests cover failed and successful omitted-range repair plus repair metadata | Achieved |
| Teacher-safe diagnostics and Studio review queue | `readingV2StudioParsingDiagnostics.service.ts`; diagnostics tests cover source, task-type, option-bank, structured-layout, jump targets, and redacted Auto diagnostics | Achieved |
| Structured layouts, scoring rules, publish blockers, and projection safety | `readingV2ImportNormalization.service.test.ts`, `readingV2Validation.service.test.ts`, `readingV2Projection.service.test.ts`; broader suite `38 files / 336 tests` passed | Achieved |
| Clippings harness and redacted reports | `scripts/reading-v2-clippings-harness.ts`; ledger-only and mocked-intermediate reports scanned 276 files; grep found no raw source/prompt/provider/answer payload fields | Achieved for non-live modes |
| Live browser smoke | Synthetic non-copyrighted browser smoke reached Studio and preview without runtime leakage | Achieved for synthetic non-copyrighted path |
| Real Clippings live Auto probe loop | Tasklist Phase 9 and final acceptance require clean/bad/repeated live probes on local Clippings content | Not achieved; requires explicit approval because content is sent to Google |
| Forced provider failure/key exhaustion path | `src/services/ai/gemini-key-rotation.service.test.ts`, `src/services/key-cooldown.service.test.ts`, and `src/services/ai/gemini.provider.test.ts` passed together; 3 files and 28 tests. Covers benched-key skip, expired invalid key bench-plus-rotate, thrown 429 bench-plus-rotate, 503 high-demand rotate without benching, and structured JSON expired-key rotation | Achieved |
| Commit and deploy gates | Local commit completed with source-ledger, verifier, repair-loop, Clippings harness, tests, and deployment status in the message; deploy has not run | Commit achieved; deploy not achieved because representative live probes still need explicit approval |

Conclusion: non-live implementation and verification are substantially complete and locally committed, but the target outcome is not fully achieved while live Gemini Clippings probes and deploy remain open.

Current branch state after local commit: `main` is ahead of `origin/main` by two local commits: the pre-existing `6e826bb fix(reading-v2): preserve auto answer keys` plus this hardening commit. Working tree was clean before the post-commit documentation amendment.

## Remaining Gate Commands

Run these only after explicit approval.

Live Gemini Clippings probes:

```powershell
Set-Location -LiteralPath 'C:\Users\The Lord\Desktop\luyentap-writing-import-rebased'
cmd /c npm run reading-v2:clippings-ledger -- --mode live-gemini --allow-live-gemini --live-limit 3 --live-tags clean-full-test,known-difficult,polluted-web-clip --out output/reading-v2-clippings-ledger-report-live.json
```

The live command may send local Clippings source content to Google Gemini and should remain opt-in.

Local commit command used:

```powershell
Set-Location -LiteralPath 'C:\Users\The Lord\Desktop\luyentap-writing-import-rebased'
git commit -m "feat(reading-v2): harden auto clippings import" -m "- Add source ledger, verifier, repair loop, and redacted diagnostics" -m "- Add Clippings harness, docs, and regression coverage" -m "- Verified non-live tests, harness scans, UTF-8, diff check, and build" -m "- Live Gemini probes and deploy not run"
```
