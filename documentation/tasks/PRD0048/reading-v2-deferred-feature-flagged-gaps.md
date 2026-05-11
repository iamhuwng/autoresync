# Reading V2 Deferred And Feature-Flagged Gaps

Updated: 2026-05-01

## Inactive Task Types

- Flowchart Completion: inactive until structured authoring and runtime rendering are complete enough for a teacher-visible workflow.
- Diagram Labelling: inactive until persisted image upload, hotspot authoring, preview, publish, and student runtime rendering are implemented. Temporary local-only URLs must not be used.

## Remaining Editor Gaps

- Rich passage editing and anchor-map repair are still outside this task-type editor phase.
- Duplicate question-group support remains disabled because grouped copy support is not complete.
- Table row/column deletion is guarded when merged cells cross the last row or column. Validation remains the final safety gate for imported or legacy malformed table structures rather than guessing a repair.
- Browser visual verification was not rerun for this phase; focused unit/runtime coverage was run instead.

## Verification Notes

Focused verification passed:

`cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2TableCompletionBuilder.test.tsx src/services/reading-v2/readingV2Validation.service.test.ts src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic`

Full-project TypeScript remains blocked by existing unrelated errors outside this phase. The touched Reading V2 source and test files were exercised through Vitest and passed targeted UTF-8 checks.
