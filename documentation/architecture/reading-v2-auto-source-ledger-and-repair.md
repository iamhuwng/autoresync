# Reading V2 Auto Source Ledger And Repair

> **Created:** 2026-05-14
> **Scope:** Durable architecture note for Reading V2 Auto source-ledger, source-fidelity verification, targeted repair, and redacted Clippings harness behavior.
> **Current companion:** `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`

## Ownership Contract

Reading V2 Auto treats the pasted source as the authority and providers as bounded witnesses.

Local code owns:

- source topology: passage boundaries, question ranges, visible question numbers, answer-key rows
- prompt constraints: expected passage number, expected question range, visible source-key count
- deterministic merge: package order, passage numbering, answer-key filtering
- source-fidelity gate: missing passage, missing/extra question, unbound source key row, missing source range, trim risk
- repair policy: retry only failing source chunks, keep known-good chunks, rerun full verification before Studio handoff

V3 provider boundaries:

- Gemini owns only full-source topology marking and answer-key row normalization. It returns coordinates and small metadata, not passage body text, full question text, canonical IDs, or publish readiness.
- Groq owns only per-passage question-area normalization into a strict transcript. It receives question-area text only, never passage body text, and must copy visible question/reference/option/layout text exactly rather than paraphrasing.
- Local code owns passage text, canonical V2 objects, answer binding, scoring, validation, projection safety, and publish readiness.

Local normalization assigns stable IDs from passage/order/range. Provider evidence is used only after source-fidelity verification.

Studio remains the review, repair, validation, preview, and publish surface.

V4 clarification:

- The local ledger is an advisory guardrail, not product authority for messy but human-readable source.
- Gemini/Groq provider output plus Studio diagnostics form the user-facing parse/review contract.
- Local code should warn, block publish, or fail closed when output is unsafe; it should not become a broad messy-format parser.
- Low Groq completion must trigger Groq self-repair with verifier feedback before bounded local audit/repair decides Studio handoff.

## Source Ledger

`src/services/reading-v2/readingV2AutoImportSourceLedger.service.ts` builds a redacted ledger before any Gemini call.

The ledger records only safe topology metadata:

- normalized source hash
- strict `READING PASSAGE N` boundaries
- question ranges and visible question numbers
- answer-key row numbers and redacted answer hashes
- section reference bank kind, line/range, item count, and label summary
- clipped-source pollution markers
- source category and issue codes

The ledger must not expose raw passage text or raw answer-key values in reports, student payloads, or session payloads.

## Prompt Contract

`src/services/reading-v2/readingV2AutoImportPrompt.ts` receives the ledger summary through `SOURCE_LEDGER_EXPECTATIONS`.

The prompt requires:

- no question renumbering
- no invented answers
- no unrelated material creation
- no merging across source chunks
- explicit diagnostics for uncertainty
- copied top-level `answerKeyText` only when source rows are visible

V3 uses additional bounded prompts:

- `src/services/reading-v2/readingV2AutoTopologyMarker.service.ts` builds the Gemini marker prompt from numbered local source lines and line hashes.
- `src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.ts` builds the Groq question-area prompt from the local package's question-area lines only.

Neither V3 prompt asks a provider to produce Studio-ready canonical Reading V2 objects.

V4 keeps the same boundary but makes the Groq stage mandatory for question-area normalization. Groq output is measured against `groupHints`, question coverage, source-proof fields, reference banks, and layout preservation. When coverage is low or unsafe, the app feeds the verifier issues back to Groq for a structured JSON retry before local repair runs.

## Verifier And Repair

`src/services/reading-v2/readingV2AutoImport.service.ts` merges chunk payloads, then verifies against the ledger before Studio handoff.

Blocking verifier diagnostics include:

- `source-passage-missing`
- `source-passage-extra`
- `source-question-missing`
- `source-question-extra`
- `source-answer-row-unbound`
- `source-question-range-missing`
- `source-reference-bank-missing`
- `source-reference-bank-mismatch`
- `source-instruction-task-type-mismatch`
- `source-instruction-word-limit-mismatch`
- `source-instruction-vocabulary-mismatch`
- `source-instruction-reuse-mismatch`
- `source-passage-trim-risk`

The bounded repair loop uses `maxRepairAttempts` and retries only chunks whose expected source questions are absent from the generated payload. It keeps existing valid chunks intact. After retry, it reruns full verification.

Repair diagnostics:

- `source-repair-attempted`
- `source-repair-succeeded`
- `source-repair-failed`

Repair diagnostics include redacted loop metadata: attempt number, source range, verifier issue codes, repair scope, provider result, and verifier result where applicable. Repair scopes group failures by passage, question range, task group, answer-key region, or structured-layout block. This makes repeated failures measurable without storing prompt text, raw source text, or provider output.

If verifier errors remain, Auto fails closed in the modal instead of opening Studio as a misleading partial draft.

When Auto succeeds with a reviewable draft, the candidate carries only redacted `autoImportDiagnostics` records: code, severity, teacher-safe message, passage number, and question number. Studio groups those records into source-structure, question-binding, task-type, option-bank, structured-layout, and publish-readiness repair categories. Raw source text, prompt text, and provider payloads are not stored in the candidate diagnostics.

Local normalization owns stable canonical IDs and task ownership. For Auto Gemini structured payloads, local source name takes precedence over Gemini `sourceFile` when creating the ID stem. Explicit source question ranges own question grouping; Gemini `sectionInstructionId` is used only as a fallback when no local range exists.

Studio import evidence includes redacted source-ledger summary rows and generated-draft summary rows: passage count, question ranges, task-group count, question count, answer-key row count, and generated passage/group/question counts.

## Operational Knobs

Current service options:

- `maxInputChars`: default `120000`
- `minInputChars`: default `80`
- `waitBetweenChunksMs`: default `6500`
- `maxRepairAttempts`: default `1`

Current harness options:

- `--root <path>`: Clippings root override
- `--out <path>`: local report output
- `--mode ledger-only-offline`: default redacted ledger scan
- `--mode ledger-only`: alias for redacted ledger scan
- `--mode mocked-intermediate`: offline mocked topology-verifier scan
- `--mode gemini-marker-mocked`: offline V3 marker-stage scan with marker diagnostic counts
- `--mode groq-transcript-mocked`: offline V3 package/transcript-stage scan with marker/package/transcript diagnostic counts
- `--mode full-mocked-v3`: offline V3 marker/package/transcript/assembler scan with marker/package/transcript/verifier diagnostic counts
- `--mode live-gemini`: curated representative probe mode
- `--mode live-v3-gemini-groq`: curated representative V3 provider probe mode
- `--allow-live-gemini`: required hard opt-in for legacy live Gemini-only probes
- `--allow-live-v3-providers`: required hard opt-in for live V3 probes that send full source to Gemini and per-passage question areas to Groq
- `--live-limit <n>`: maximum live probes to run, capped at 5
- `--live-tags <tag,tag>`: representative tags to probe, such as `clean-full-test`

V3 service tests cover the mocked marker, package splitter, Groq transcript, and end-to-end pipeline. The CLI harness now has V3 mocked report modes for redacted local evidence. Live V3 provider probes remain opt-in because they send real Clippings source to Gemini and per-passage question areas to Groq.

Live Gemini probes are intentionally separate from CI and must be explicit because they consume provider quota and may process copyrighted local Clippings content. Do not commit raw probe inputs or raw provider outputs. Live report errors are capped and redacted for API keys and absolute Windows paths.

Current V4 Clippings gold E2E command:

```powershell
npm run reading-v2:auto-v4-clippings-e2e -- --source "C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 10 Reading Test 04.md" --out output/reading-v2-auto-v4-clippings-e2e/report.json --allow-live-v4-provider
```

The flag is required because it sends local Clippings source to Gemini and per-passage question areas to Groq.

## Verification Evidence

Required local checks for this subsystem:

- focused Auto/ledger/harness/prompt Vitest
- broader `src/services/reading-v2` Vitest
- `TestCreationModal.test.tsx`
- redacted Clippings ledger harness
- redacted mocked-intermediate harness
- targeted UTF-8 check
- production build after app-code changes
- live browser smoke test when provider quota allows
