# Task List: PRD-0048 Reading V2 Auto V3 Groq Malformed JSON Recovery

> **Created:** 2026-05-21
> **Purpose:** Make Auto V3 recover from malformed Groq structured JSON on real Clippings tests without weakening source-proof or publishing uncertain drafts.
> **Scope:** Follow-up batch for the existing Auto V3 source-proof hardening stack. Focus on malformed JSON classification, targeted retry, JSON-escape prompt contract, safe input normalization, and live Clippings merge gates.
> **Primary source PRD:** `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
> **Parent Auto V3 hardening task:** `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v3-groq-source-proof-hardening.md`
> **Live failure evidence:** `output/reading-v2-clippings-live-v3-cam20-current.json`

## Problem Statement

The approved live Clippings probe for `Practice Cam 20 Reading Test 01.md` failed before Studio draft creation:

```text
groq-package-failed
Groq package 1 failed: Structured generation failed: No valid JSON found in AI response
```

Provider preflight showed Gemini and Groq were available, but Groq structured fanout was degraded:

```text
aiAvailable: true
geminiAvailable: true
groqAvailable: true
groqStructuredJsonSlotCount: 1
groqDistinctPackageFanoutReady: false
keyRegistryReadable: false
```

Offline ledger accepted the same file as a supported full test with 3 passages, Q1-40, and 40 answer-key rows. Mocked V3 generated 40 interactions and bound 40 answers, but rejected the file on stricter verifier issues. Therefore the live failure is not basic Clippings detection. It is the Groq question-area normalization stage returning malformed JSON.

Console evidence showed JSON recovery failures with `Bad escaped character in JSON`, which is consistent with copied Markdown escape noise such as raw `\_` appearing inside JSON strings. The prompt already asks for valid JSON, but it also asks Groq to copy visible source text exactly. That combination can cause Groq to copy source backslashes without JSON-escaping them.

## Decision Contract

Auto V3 must treat malformed Groq JSON as a recoverable provider-contract failure, not as a source failure.

Required behavior:

- Keep local source ledger and source-proof authoritative.
- Do not commit raw Clippings text, raw provider prompts, or raw provider responses.
- Detect malformed JSON failures separately from quota, key rejection, missing groups, and source-proof mismatch.
- Retry only the failed passage package, not the whole import.
- Retry with a stricter JSON-repair prompt and low max attempt count.
- Preserve all previous diagnostics so retry success does not hide that the first provider output was malformed.
- Fail closed if retries still produce invalid JSON.

## Non-Goals

- Do not make generic infinite retries.
- Do not silently sanitize provider output in a way that changes semantic source text.
- Do not weaken final source-proof, group coverage, task-type, or answer-binding gates.
- Do not publish or open a partial Studio draft when package coverage is not proven.
- Do not rotate provider keys or change Cloud/Firestore configuration in this batch.

## Relevant Files

- `src/services/test-creation/ai-json-repair.ts`
- `src/services/ai/groq.provider.ts`
- `src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.ts`
- `src/services/reading-v2/readingV2GroqPackageFanout.service.ts`
- `src/services/reading-v2/readingV2AutoImport.service.ts`
- `src/services/reading-v2/readingV2AutoPassagePackage.service.ts`
- `src/services/reading-v2/readingV2ClippingsHarness.test.ts`
- `src/services/reading-v2/readingV2GroqPackageFanout.service.test.ts`
- `src/services/reading-v2/readingV2AutoImport.service.test.ts`
- `scripts/reading-v2-clippings-harness.ts`

## Phase 0: Freeze Failure Shape

- [ ] Add a small redacted fixture or mocked provider case that reproduces `Bad escaped character in JSON` without storing real Clippings source.
- [ ] Assert the failure is classified as malformed structured JSON, not quota and not source-proof mismatch.
- [ ] Preserve current failure evidence fields:
  - package number
  - key slot fingerprint
  - attempt count
  - parser error class
  - retry outcome
  - final import status

## Phase 1: JSON Error Classification

- [ ] Extend `extractJSON` or its caller to expose a typed parse failure reason instead of only `No valid JSON found in AI response`.
- [ ] Classify at least:
  - no JSON object found
  - bad escape sequence
  - truncated JSON
  - trailing comma or simple repairable syntax
  - malformed transcript shape after valid JSON parse
- [ ] Redact provider output snippets by default. If local debug capture is enabled, store raw payload only in ignored local debug output.

## Phase 2: Prompt Contract Patch

- [ ] Update Groq normalizer system/user instructions to state:
  - Return valid JSON only.
  - When copying backslashes from source, JSON-escape them as `\\`.
  - Never emit raw invalid JSON escapes such as `\_`, `\.`, or `\#` inside JSON string values.
  - `sourceTextExact` means exact visible text after JSON string decoding, not invalid literal JSON bytes.
- [ ] Keep existing rules that passage body text must not be output and answers must not be inferred.
- [ ] Add tests proving prompt text includes the JSON-escape rule.

## Phase 3: Targeted Same-Package Retry

- [ ] Add retry support in `runReadingV2GroqPackageFanout` for malformed JSON failures even when only one Groq key slot is available.
- [ ] Retry only the failed passage package.
- [ ] Use a stricter retry instruction that includes the parser failure class, for example:

```text
Your previous response was not valid JSON because it contained invalid escape sequences.
Return the same transcript shape as valid JSON only.
Escape source backslashes as double backslashes in JSON strings.
Do not use Markdown fences or prose.
```

- [ ] Keep retry budget low:
  - default: 1 same-slot retry for malformed JSON
  - optional: 1 alternate-slot retry when another slot exists
- [ ] Emit diagnostics:
  - `groq-json-malformed`
  - `groq-package-json-retried`
  - `groq-package-json-retry-succeeded`
  - `groq-package-json-retry-failed`
- [ ] Keep existing `groq-package-failed` as final summary only when all recovery fails.

## Phase 4: Safe Input Normalization

- [ ] Evaluate whether package input should include a Groq-facing normalized view for markdown escape noise.
- [ ] If added, keep raw source line coordinates untouched.
- [ ] Do not change source ledger text.
- [ ] Only normalize harmless display escapes that commonly break JSON copying:
  - escaped underscores
  - escaped punctuation
  - repeated underline blank markers
- [ ] Preserve enough information for `sourceTextExact` to remain provable against raw local source.
- [ ] Add tests proving source-proof still compares against raw source, not normalized prompt input only.

## Phase 5: Harness And Live Probe Gate

- [ ] Add an exact-file live probe option to `scripts/reading-v2-clippings-harness.ts` so ad hoc temp scripts are no longer needed.
- [ ] Add `--live-file "Practice Cam 20 Reading Test 01.md"` or equivalent.
- [ ] Ensure live mode still requires explicit `--allow-live-v3-providers`.
- [ ] Ensure reports remain redacted and do not include raw Clippings text.
- [ ] Record provider preflight summary in the report:
  - provider availability
  - key registry readability
  - Groq slot count
  - distinct fanout readiness

## Phase 6: Verification Matrix

- [ ] Focused unit tests:

```powershell
cmd /c npx vitest run src/services/test-creation/ai-json-repair.test.ts src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.test.ts src/services/reading-v2/readingV2GroqPackageFanout.service.test.ts src/services/reading-v2/readingV2AutoImport.service.test.ts src/services/reading-v2/readingV2ClippingsHarness.test.ts --reporter=basic
```

- [ ] Full current focused Reading V2 Auto V3 suite:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.test.ts src/services/reading-v2/readingV2AutoQuestionTranscript.service.test.ts src/services/reading-v2/readingV2GroqPackageFanout.service.test.ts src/services/reading-v2/readingV2ClippingsHarness.test.ts src/components/test-creation/TestCreationModal.test.tsx --reporter=basic
```

- [ ] UTF-8:

```powershell
cmd /c npm run check:utf8 -- src/services/test-creation/ai-json-repair.ts src/services/ai/groq.provider.ts src/services/reading-v2/readingV2AutoQuestionAreaNormalizer.service.ts src/services/reading-v2/readingV2GroqPackageFanout.service.ts src/services/reading-v2/readingV2AutoImport.service.ts scripts/reading-v2-clippings-harness.ts documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v3-groq-malformed-json-recovery.md
```

- [ ] Whitespace:

```powershell
git diff --check
```

- [ ] Chrome E2E with `@chrome`:
  - open `http://127.0.0.1:5173/__smoke/reading-v2-studio?fixture=auto-v3-valid-full-test`
  - Validate shows no required issues
  - Preview opens runtime shell
  - Publish succeeds

- [ ] Live Clippings gate:

```powershell
cmd /c npm run reading-v2:clippings-ledger -- --root "<Clippings root>" --mode provider-preflight --out output/reading-v2-clippings-provider-preflight-live.json
cmd /c npm run reading-v2:clippings-ledger -- --root "<Clippings root>" --mode live-v3-gemini-groq --allow-live-v3-providers --live-file "Practice Cam 20 Reading Test 01.md" --out output/reading-v2-clippings-live-v3-cam20-current.json
```

## Merge Decision Gate

Do not merge while `Practice Cam 20 Reading Test 01.md` fails with malformed Groq JSON, unless the user explicitly declares known-difficult Clippings live provider failures out of scope.

Merge can proceed only after:

- focused tests pass
- UTF-8 passes
- `git diff --check` passes
- Chrome smoke passes
- provider preflight is recorded
- live Cam20 probe either succeeds or fails for a different accepted non-blocking reason
- generated evidence files are either committed intentionally or removed from the branch before merge

## Acceptance Criteria

- [ ] Malformed Groq JSON is classified distinctly from quota and verifier failures.
- [ ] Auto V3 retries failed package JSON once with stricter JSON-escape instruction.
- [ ] Retry diagnostics are visible in harness and Studio diagnostics.
- [ ] Cam20 live probe no longer aborts at package 1 due raw invalid JSON escaping.
- [ ] Source-proof remains fail-closed after successful JSON parse.
- [ ] No raw Clippings content or raw provider payload is committed.
