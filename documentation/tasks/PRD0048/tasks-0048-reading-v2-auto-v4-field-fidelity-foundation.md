# PRD0048 Reading V2 Auto V4 Field Fidelity Foundation

> **Created:** 2026-05-25
> **Branch:** `codex/reading-v2-ielts-task-contracts`
> **Scope:** Make Studio field content, completion/list structure, and verifier severity source-faithful after V4 raw import. This continues after `tasks-0048-reading-v2-auto-v4-source-authoritative-group-repair.md`.

## Context

Random raw Clippings E2E with `Practice Cam 16 Reading Test 02.md` proved the V4 path now preserves passage count, group count, question count, and answer bindings well enough for an editable Studio draft. Field scan exposed the next foundation problems:

- Completion/list groups flatten source layout into inline text.
- Option banks may appear both inside body text and separate controls.
- Instructions may be shortened from raw wording.
- Mojibake and source typos are preserved without clear teacher-facing classification.
- Group verifier warnings are too broad: correct MCQ/TFNG/YNNG groups can be marked weak because the verifier is not task-family aware enough.

## Architecture Direction

- AI provider should extract conservatively and preserve source wording/structure.
- App verifier is the judge. It must compare Studio fields to raw source spans, classify severity, and block only student-impacting failures.
- Studio should distinguish editable draft, needs review, and publish blocker instead of treating all fidelity warnings as equal.

## AI Processing Tasks

- [x] 1.0 Make extraction source-faithful.
  - [x] 1.1 Keep raw `sourceText`, rendered `displayText`, and `normalizedText` as separate concepts.
  - [x] 1.2 Require group-scoped source evidence for instruction, stem/statement, options, blanks, and answer rows.
  - [x] 1.3 For completion/list groups, preserve heading, body blocks, inline blank order, and option bank as distinct fields.
  - [x] 1.4 Stop instruction rewriting except for explicit normalized metadata.

- [x] 2.0 Add verifier-friendly source spans.
  - [x] 2.1 Attach source line IDs or source quote evidence to each extracted group field.
  - [x] 2.2 Compare generated fields against mapped raw group span, not global source text.
  - [x] 2.3 Emit exact missing/changed field IDs for Studio review.

- [x] 3.0 Add byte-safe comparison normalization.
  - [x] 3.1 Reuse the shared source-proof normalizer for group coverage comparisons.
  - [x] 3.2 Normalize mojibake, curly quotes, markdown emphasis, escaped punctuation, blank markers, and whitespace for comparison only.
  - [x] 3.3 Preserve raw source text for audit and display repaired text only after explicit app-side repair.

## App-Wise Tasks

- [x] 4.0 Improve group severity classification.
  - [x] 4.1 `publish-blocker`: missing question, missing answer, impossible option, blank-count mismatch, malformed range.
  - [x] 4.2 `needs-review`: layout flattening, instruction shortening, duplicated option bank, source typo/mojibake warning.
  - [x] 4.3 `info`: source-preserved typo or encoding artifact that does not change answerability.
  - [x] 4.4 Mark simple MCQ/TFNG/YNNG groups ready when stems/options/answers match even if wording normalization differs.

- [x] 5.0 Repair completion/list structures.
  - [x] 5.1 Build deterministic rehydration from raw group span for headings, body lines, blanks, and option banks.
  - [x] 5.2 Prevent option-bank duplication in body plus controls.
  - [x] 5.3 Keep ambiguous repairs as teacher-review or group repair requests.

- [x] 6.0 Add Raw vs Studio compare foundation.
  - [x] 6.1 Add machine field scan harness for Studio fields from raw paste import.
  - [x] 6.2 Compare title, passage body, instruction, stem/statement, options, blanks, option bank, and answer bindings.
  - [x] 6.3 Store hash/line evidence only in committed reports.
  - [ ] 6.4 Later UI: group compare panel with raw span on left and Studio fields on right.

## Acceptance Criteria

- [x] Field-level verifier catches real source loss without false positives from mojibake or markdown.
- [x] Completion/list groups preserve raw layout enough for teacher editing.
- [x] Option banks are represented once in the correct field.
- [x] Correct MCQ/TFNG/YNNG groups are not noisy publish blockers.
- [x] Encoding/typo issues are classified separately from answerability failures.
- [x] Raw random Clippings E2E can compare every Studio field to gold/raw.

## Implementation Notes

- 2026-05-25: Started with shared source-proof normalization inside group coverage comparison. This targets the false-positive class where source and Studio are semantically equal but differ by mojibake, markdown, escaped punctuation, or blank marker representation.
- 2026-05-25: Completed field-fidelity foundation with group-scoped line evidence, missing field IDs, source artifact preservation, summary-list option-bank de-duplication, review-vs-blocker severity split, encoding-artifact info classification, simple MCQ/TFNG/YNNG tolerance, and Clippings E2E field-scan report rows.
- 2026-05-25: Ran raw random Clippings service E2E on `Practice Cam 14 Reading Test 01.md` because computer-use/Chrome was unavailable. Gold baseline came from raw markdown line ranges only. Latest report path: `output/reading-v2-auto-v4-random-clippings-e2e/cam14-test01-live-report.json`; source SHA-256 `376b33225d9b23f354ea194faa114816c24a3803367accb7a49d270b15b3d633`.
- 2026-05-25: Added smart passage pollution cleanup for clipped sibling-test headings and web artifacts. Auto V4 source-backed passage text now stops before repeated `Cam/Cambridge ... Reading Test ...` headings, skips pollution marker lines, and structured payload normalization applies the same cleanup before Studio paragraph creation.

## Follow-Up Todo From Cam14 Field Scan

- [ ] Treat `reviewStatus: needs_review` and field-content coverage mismatches as `editable-needs-review` in E2E verdicts, even when counts and answer keys match.
- [ ] Improve source coverage matching for note/list indentation markers so bullets and dash-normalized note rows do not show false uncovered prompts.
- [ ] Compare matching-information paragraph labels against source paragraph anchors (`A-G`) instead of requiring synthetic option text like `Paragraph A` to exist verbatim.
- [ ] Preserve raw multiple-select instruction wording closely enough that source-span coverage passes for `Choose TWO` groups.
- [ ] Preserve matching-features instruction wording closely enough that source-span coverage passes without losing the researcher bank.
- [ ] Keep summary-completion fields as group-level summary body plus blank map; per-question prompt windows are editable but field scan currently marks every summary prompt uncovered.
- [x] Strip clipped cross-test pollution from source spans before field comparison; Cam14 Q40 scan included adjacent clipped headings after the test body.
- [ ] Add non-provider regression fixture using the Cam14 gold baseline so field-content coverage logic can be tested without spending live Gemini calls.
