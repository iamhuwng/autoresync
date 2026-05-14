# Reading V2 Auto Source Ledger And Repair

> **Created:** 2026-05-14
> **Scope:** Durable architecture note for Reading V2 Auto source-ledger, source-fidelity verification, targeted repair, and redacted Clippings harness behavior.

## Ownership Contract

Reading V2 Auto treats the pasted source as the authority and Gemini as an extraction witness.

Local code owns:

- source topology: passage boundaries, question ranges, visible question numbers, answer-key rows
- prompt constraints: expected passage number, expected question range, visible source-key count
- deterministic merge: chunk order, passage numbering, answer-key filtering
- source-fidelity gate: missing passage, missing/extra question, unbound source key row, missing source range, trim risk
- repair policy: retry only failing source chunks, keep known-good chunks, rerun full verification before Studio handoff

Gemini owns only the draft extraction of passage blocks, instruction blocks, question rows, and uncertainty diagnostics.
Gemini should not create canonical Reading V2 IDs; local normalization assigns stable IDs from passage/order/range. Gemini may include source-ledger evidence hints for traceability.

Studio remains the review, repair, validation, preview, and publish surface.

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
- `--mode mocked-intermediate`: offline mocked topology-verifier scan
- `--mode live-gemini`: curated representative probe mode
- `--allow-live-gemini`: required hard opt-in for live provider calls
- `--live-limit <n>`: maximum live probes to run, capped at 5
- `--live-tags <tag,tag>`: representative tags to probe, such as `clean-full-test`

Live Gemini probes are intentionally separate from CI and must be explicit because they consume provider quota and may process copyrighted local Clippings content. Do not commit raw probe inputs or raw provider outputs. Live report errors are capped and redacted for API keys and absolute Windows paths.

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
