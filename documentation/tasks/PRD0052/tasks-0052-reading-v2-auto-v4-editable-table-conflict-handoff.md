# Task List: Reading V2 Auto V4 Editable Table Conflict Handoff

Created: 2026-06-08

Scope: Correct the PRD0052 Reading V2 outcome/pipeline regression where localized Auto V4 table-layout conflicts were treated as automatic pre-Studio failures. Keep strict canonical validation, keep narrow source-table rehydration, but stop treating localized table-layout conflicts as automatic pre-Studio failures when a canonical-safe review draft can be built.

Canonical contract: `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`

## Decision

Auto V4 is an import assistant. Bad-but-editable table output should reach Studio as `editable-needs-review`.

Strict guard remains:

- never persist duplicate canonical anchors;
- never weaken publish/runtime validation;
- never silently choose one conflicting table cell as correct;
- never split one visible question into multiple answers.

Studio should open when:

- the affected issue is localized to one structured-layout group;
- normalization can build a canonical-safe draft;
- diagnostics and publish blockers clearly identify the table conflict.

Studio should not open when:

- normalization throws before a draft exists;
- the canonical document would violate contract guards;
- the issue is global, non-localizable, or lacks enough source evidence to create an editable review state.

## Implementation Tasks

- [x] Update Auto import service tests so duplicate structured-layout table conflicts return `success: true`, `reviewStatus: needs_review`, and publish-blocking diagnostics when a safe draft is produced.
- [x] Update Studio workflow tests so localized duplicate table conflicts open a draft instead of rendering the invalid import alert.
- [x] Keep or add a separate failure test for truly malformed canonical candidates that cannot be safely hydrated.
- [x] Change duplicate structured-layout validation diagnostics from pre-Studio non-editable errors to Studio review/publish blockers when they are produced by safe normalization.
- [x] Keep `duplicate-stimulus-anchor` or normalization exceptions as pre-Studio blockers when the document is not canonical-safe.
- [x] Update teacher-facing copy from "before Studio can open" to "before publish" or "before Ready" for localized table conflicts.
- [x] Keep source Markdown table rehydration narrow:
  - use only pipe-table rows from the source question span;
  - accept only when every expected question appears exactly once;
  - fall back to AI group reconstruction plus review diagnostics otherwise;
  - do not expand into a broad internal parser for arbitrary table formats.
- [x] Verify publish remains blocked for unresolved table conflicts.
- [x] Re-run focused Reading V2 Auto import and Studio workflow tests.

## Test Plan

Run after test/code changes:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2StudioWorkflow.service.test.ts --reporter=basic
cmd /c npx vitest run src/pages/ReadingV2StudioPage.test.tsx --reporter=basic
```

Browser retest after unit tests:

- `Practice Cam 10 Reading Test 01.md`
- two additional Clippings files with unusual table layouts
- collect diagnostic log, console log, and Studio/publish state if any flow fails

## Acceptance Criteria

- [x] Clean source Markdown table imports still preserve the original table and exact blank positions.
- [x] Ambiguous duplicate table-position output does not create duplicate canonical anchors.
- [x] Ambiguous duplicate table-position output reaches Studio as `editable-needs-review` when safe.
- [x] Publish/Ready remains blocked until the teacher repairs the affected table group.
- [x] Truly malformed canonical candidates still fail before Studio with a safe alert.
- [x] No Groq whole-test fallback is introduced.
