# Task List: PRD-0048 Reading V2 Auto V3 Groq Source-Proof Hardening

> **Created:** 2026-05-18
> **Purpose:** Harden the Auto V3 Groq transcript stage so messy IELTS question-area formatting is normalized by Groq, audited by local source proof, and never rejected or accepted for the wrong reason.
> **Scope:** Follow-up batch for the existing Reading V2 Auto V3 pipeline. Focus on contract freeze, provenance/replay evidence, Groq transcript schema, source-proof evidence, group coverage, diagnostics, explicit repair, and regression verification.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Parent Auto V3 task:** `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-clippings-hardening.md`
> **Architecture note:** `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md`

This task list supplements, but does not replace:

- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-import.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-gemini-clippings-hardening.md`
- `documentation/tasks/PRD0048/findings-of-tasks-0048-reading-v2-auto-v3-pipeline.md`
- `documentation/tasks/PRD0048/diagnostic-log-reading-v2-auto-v3-pipeline.md`
- `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md`

## Problem Statement

Recent Auto V3 diagnostics showed two different failure shapes being collapsed into one generic `groq-transcript-failed` error:

1. Source-proof mismatch: the source contains visible completion blanks such as `**1** \_\_\_\_\_\_\_`, but Groq returns a Studio-parseable normalized prompt. The old verifier can reject the normalized transcript because it cannot prove harmless source-format differences.
2. Coverage loss: the final transcript reaching verification can miss an expected question group, such as matching-information or summary/completion ranges, but the diagnostic does not prove whether Groq omitted the group, app normalization dropped it, or repair failed.

The root problem is not merely "weird format." Auto V3 needs a clearer contract:

```text
Groq normalizes messy question-area layout.
Local app audits exact source evidence and coverage.
Local app does not become a second full IELTS parser.
```

## Decision Contract

Use a dual-field transcript contract for visible question-area text:

```json
{
  "number": 1,
  "sourceTextExact": "**1** \\_\\_\\_\\_\\_\\_\\_",
  "normalizedPromptText": "studied art, then worked as a ___ in various places in the USA",
  "sourceLines": [123]
}
```

Meaning:

- `sourceTextExact` is Groq's audit trail. It must be copied from the local question-area source line or source fragment.
- `normalizedPromptText` is Groq's cleaned transcript text for Studio parsing and UI assembly.
- `sourceLines` remain the local coordinate authority.
- Local verifier proves `sourceTextExact` against the local source.
- Local verifier only compares normalized text with bounded equivalence rules for question markers, markdown escape noise, and blank placeholders.

This keeps Groq useful for messy formatting while keeping the app's source-proof logic small and deterministic.

## Safest Work Order

Implement this task foundation-first, not prompt-first:

1. Freeze observable contract and replay evidence before changing Groq prompt/schema behavior.
2. Preserve exact low-level transcript/verifier cause codes before adding broader recovery.
3. Make repair and bank recovery explicit before trusting repaired output.
4. Change Groq transcript schema and prompt contract only after steps 1-3 are in place.
5. Add negative-path regression coverage before live provider re-probes.

## Non-Goals

- Do not make the app recognize every possible IELTS formatting variant as a full parser.
- Do not ask Groq to solve answers or infer missing text.
- Do not send passage body text to Groq.
- Do not store raw copyrighted source, raw provider prompts, or raw provider payloads in committed artifacts.
- Do not open Studio with a partial draft when transcript coverage is not proven.
- Do not weaken publish/readiness validation to let uncertain transcripts pass.

## Relevant Files

Likely implementation targets:

- `src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.ts`
- `src/services/reading-v2/readingV2AutoQuestionTranscript.service.ts`
- `src/services/reading-v2/readingV2AutoImport.service.ts`
- `src/services/reading-v2/readingV2AutoPassagePackage.service.ts`
- `src/services/reading-v2/readingV2GroqPackageFanout.service.ts`
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.ts`
- `src/services/ai/groq.provider.ts`
- `src/services/reading-v2/readingV2AutoQuestionTranscript.service.test.ts`
- `src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.test.ts`
- `src/services/reading-v2/readingV2AutoImport.service.test.ts`
- `src/services/reading-v2/readingV2GroqPackageFanout.service.test.ts`
- `src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts`
- `src/services/reading-v2/fixtures/readingV2FixtureManifest.test.ts`
- `src/services/reading-v2/fixtures/readingV2PasteImportFixtures.ts`
- `scripts/reading-v2-clippings-harness.ts`
- `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md`

## Phase 0: Contract Freeze And Replay Unit

- [x] Freeze a versioned per-passage-package contract before prompt/schema changes:
  - `schemaVersion`
  - `sourceHash`
  - `packageHash`
  - `expectedQuestionRange`
  - `groupHints`
  - `referenceBankLineSpans`
  - Groq prompt hash
  - Groq key-slot fingerprint / retry metadata
  - raw Groq JSON shape summary
  - normalized transcript group ranges
  - repaired transcript group ranges
  - final verifier issue codes
- [x] Treat that bundle as the durable replay/postmortem unit for repair and provider investigations.
- [x] Preserve exact low-level transcript diagnostic codes through import diagnostics; `groq-transcript-failed` may remain as a summary wrapper, but never as the only stored cause.
- [x] Separate scheduler metadata such as key-slot choice, retry count, and quota-stop reason from transcript semantics so degraded slot availability does not change failure classification meaning.

## Phase 1: Evidence Capture And Stage-Specific Diagnostics

- [x] Add dev-safe transcript-stage evidence that records, per passage package:
  - every Phase 0 replay field
  - question-area line count
  - stage transitions: raw Groq -> normalized transcript -> repaired transcript -> final verifier
- [x] Keep raw prompt and raw Groq JSON out of committed reports by default.
- [x] Add local-only debug opt-in for raw prompt/provider payload capture when reproducing a failing import.
- [x] Make diagnostics distinguish:
  - `groq-output-missing-group`
  - `app-normalizer-dropped-group`
  - `repair-applied`
  - `repair-skipped`
  - `repair-failed`
  - `source-proof-format-mismatch`
  - `source-text-exact-missing`
  - `normalized-text-source-drift`
  - `group-coverage-mismatch`
  - `missing-reference-bank`
  - `bank-ownership-heuristic-used`
- [x] Keep stage-specific cause codes available through import diagnostics, Studio diagnostics grouping, and harness summaries.

## Phase 2: Explicit Repair And Bank Ownership Policy

- [x] Make every deterministic repair explicit in diagnostics and replay evidence:
  - repair origin
  - repair stage
  - source lines used
  - repair scope
  - repair confidence / proof status
- [x] Tighten bank ownership policy:
  - topology marker spans are first authority
  - explicit package/group reference-bank spans are second authority
  - passage-body bank regex fallback is last resort only
  - heuristic bank recovery must be tagged, never silent
- [x] Any injected reference bank or rebuilt group must carry local source lines and repair metadata.
- [x] Deterministic repair remains allowed only when every reconstructed question/bank line is source-provable.

## Phase 3: Dual-Field Groq Transcript Schema

- [x] Extend question transcript objects to carry both exact and normalized text:
  - `sourceTextExact`
  - `normalizedPromptText`
  - existing `promptText` compatibility path until callers migrate
- [x] Apply the same source/normalized split where useful for:
  - note lines
  - table cells
  - flowchart steps
  - diagram targets
  - labeled options
  - section references
- [x] Update transcript normalization to preserve exact source evidence instead of flattening it away.
- [x] Keep Groq responsibility narrow: transcript groups, exact source evidence, normalized prompt text, and bounded diagnostics only.
- [x] Keep instruction synthesis, bank reconstruction, and final V2 assembly local and deterministic.
- [x] Update deterministic V2 assembly to consume normalized text while keeping source evidence inside import diagnostics only.
- [x] Ensure student/session-safe projections do not expose raw source evidence.

## Phase 4: Verifier Becomes Auditor, Not Parser

- [x] Verify `sourceTextExact` by line coordinates against the local question-area package.
- [x] Use bounded equivalence only for audit comparison:
  - question marker wrappers such as `1`, `1.`, `**1**`, `(1)`
  - markdown escaped underscores
  - long underline blanks
  - ellipsis or explicit blank placeholders
  - whitespace compaction
- [x] Do not add broad IELTS task parsing to the verifier.
- [x] Fail closed when normalized text adds meaningful words that cannot be traced to source evidence.
- [x] Preserve strict checks for duplicate question numbers, missing blanks, missing banks, and task-type conflicts.
- [x] Preserve exact verifier issue codes in the emitted diagnostics instead of flattening them into one generic transcript failure.

## Phase 5: Stronger Groq Prompt Contract

- [x] Change the Groq prompt so `groupHints` are authoritative, not advisory.
- [x] Require exactly one output transcript group for every `groupHints[]` item.
- [x] Forbid merging, splitting, skipping, or reordering hinted groups.
- [x] Require a coverage summary in the Groq output:

```json
{
  "coveredGroups": ["14-17", "18-22", "23-26"],
  "coveredQuestions": [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
}
```

- [x] Require Groq to output a conservative group with diagnostics when a source span is ambiguous, instead of silently skipping it.
- [x] Keep Groq out of final instruction prose, bank reconstruction policy, and canonical Reading V2 assembly decisions.
- [x] Keep rule that Groq must not output passage body text, final Studio instruction prose, or answer guesses.

## Phase 6: Coverage Gate, Targeted Recovery, And Scheduler Separation

- [x] Add a pre-parse coverage gate after Groq JSON extraction and before final transcript verification.
- [x] Compare expected questions from `expectedQuestionRange` and `groupHints` against:
  - raw Groq coverage summary
  - normalized transcript groups
  - repaired transcript groups
- [x] If a group is missing, classify the stage:
  - Groq did not output the hinted group
  - app normalizer dropped the hinted group
  - repair could not rebuild the hinted group from source lines
- [x] Attempt deterministic repair from Gemini/package line hints when every expected question line is visible and source-provable.
- [x] If deterministic repair cannot prove the group, retry Groq only for the missing group span.
- [x] Retrying another Groq key slot may change execution path, but must not change diagnostic semantics or overwrite prior stage evidence.
- [x] Fail closed with exact passage/question diagnostics if targeted retry still misses coverage.

## Phase 7: Regression Fixture, Negative Matrix, And Harness

- [x] Add a minimized synthetic fixture based on the Cam 20 Test 04 failure shape without committing full copyrighted passage text.
- [x] Cover escaped markdown blanks such as `**1** \_\_\_\_\_\_\_`.
- [x] Cover paragraph/matching group ranges such as Q14-17 and Q27-31.
- [x] Cover summary/completion ranges such as Q37-40.
- [x] Add table-driven negative-path cases in `readingV2AutoImport.service.test.ts` for:
  - missing bank
  - omitted expected range
  - duplicate numbering
  - malformed transcript
  - provider rate limit / quota stop
  - source-text hallucination / unprovable text
- [x] Add Studio parsing diagnostics regressions that assert grouped blocking surfaces, not only raw validation errors:
  - `authority.blocking`
  - `question-binding`
  - `option-bank`
- [x] Promote harness coverage from positive-only to positive-plus-negative variants that preserve the exact failure family seen in live diagnostics.
- [x] Assert no successful import may omit an expected question number.
- [x] Assert answer-key rows remain bound only when matching questions exist.
- [x] Add harness summary counters for source-proof mismatch vs group-coverage mismatch vs repair outcome vs bank-heuristic usage.

## Phase 8: Verification

- [x] Run focused transcript/import tests:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.test.ts src/services/reading-v2/readingV2AutoQuestionTranscript.service.test.ts src/services/reading-v2/readingV2GroqPackageFanout.service.test.ts src/services/reading-v2/readingV2AutoImport.service.test.ts src/services/reading-v2/readingV2StudioParsingDiagnostics.service.test.ts --reporter=basic
```

- [x] Run broader Reading V2 service tests if app code changes are wider than transcript/import services. Changes stayed within transcript/import/diagnostic/harness surfaces, so focused suites were sufficient.
- [x] Run targeted UTF-8 check:

```powershell
npm run check:utf8 -- documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v3-groq-source-proof-hardening.md src/services/reading-v2
```

- [x] Run a redacted mocked harness mode after implementation.
- [ ] Run live V3 provider probe only with explicit `--allow-live-v3-providers` and only on curated representative inputs.

## Phase 9: Live E2E Answer-Key Binding Fix

- [x] Capture Chrome E2E diagnostics from `localhost` using `Clippings/Practice Cam 10 Reading Test 04.md`.
- [x] Bind topology answer-key rows by local source line and question number before comparing normalized answer text; explicit answer-key sections use numbered-row structure instead of answer-value pattern exceptions.
- [x] Preserve the exact topology marker diagnostic code when answer-key source proof fails.
- [x] Add regression for `2\. 10/ ten times` binding when the topology marker normalizes slash spacing.
- [x] Run focused auto-import regression and targeted UTF-8 check.

## Phase 10: Follow-Up Answer-Key Topology Proof Contract Alignment

- [x] Replace topology answer-key whitelist proof with source-line evidence proof so Gemini can supply `sourceTextExact` and line hash, and local code proves against raw source lines instead of `sourceLedger.answerKeyRows`.
- [x] Remove `visibleAnswerKeyRows` as a topology marker prompt authority and stop using source question numbers as answer-row coverage authority; omission checks now apply only where local answer-key rows were actually surfaced.
- [x] Add topology regressions for full-row slash normalization, split alternative answers from one source row, bad line-hash/source-text rejection, and witness-free raw-line proof.
- [x] Re-run focused topology/import verification, targeted UTF-8 checks, and Chrome localhost E2E against `Clippings/Practice Cam 10 Reading Test 04.md`.

## Acceptance Criteria

- [x] A versioned replay/provenance bundle exists per passage package before live provider changes are trusted.
- [x] Exact transcript/verifier cause codes survive through import diagnostics; no failure is explainable only as generic `groq-transcript-failed`.
- [x] Repairs and heuristic bank recovery are explicit, source-provable where required, and visible in diagnostics.
- [x] App no longer needs to parse every weird blank/question marker format to prove Groq output.
- [x] Groq transcript carries exact source evidence and normalized Studio text separately, while local code remains final authority for assembly and bank policy.
- [x] Verifier proves exact source evidence by line coordinate and uses only bounded equivalence for harmless formatting.
- [x] Diagnostics identify whether a missing group came from Groq output, app normalization, or repair.
- [x] Every hinted group is either present, deterministically repaired, targeted-retried, or fails closed with exact diagnostics, without scheduler retries overwriting stage evidence.
- [x] Successful Auto V3 import cannot silently lose Q14-17, Q27-31, Q37-40, or any other expected range.
- [x] Regression tests cover source-proof mismatch, missing bank, missing question range, repair outcome, and stage-grouped Studio blocking diagnostics from the observed failure family.
- [x] No raw copyrighted prompt/provider payload is committed or exposed to student/session-safe projections.
