# Reading V2 Runtime V1 Parity Verification Notes

This note supports PRD-0048 Phase 6 task 6.28. It records the V1 runtime surfaces used for comparison while implementing the projection-only `ReadingV2RuntimeShell`.

This is evidence-only parity documentation. Product intent and execution law remain owned by the PRD, contract-freeze, feature-pipeline, page-schema, and family-contract docs.

## Desktop And Tablet Reference

Old V1 reference files:

- `src/skills/reading/components/ReadingTestPage.tsx`
- `src/components/practice/IELTSPracticeView.tsx`
- `src/components/test/TwoColumnLayout.tsx`
- `src/components/test/IELTSQuestionsPanel.tsx`
- `src/components/test/AuthenticAnswerInput.tsx`
- `src/components/test/table-completion/TableCompletionGroupRenderer.tsx`
- `src/skills/reading/components/PassageRenderer.tsx`

Current V2 implementation:

- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`

What stayed aligned:

- Left side remains the passage or structured stimulus surface.
- Right side remains a full grouped question panel.
- Grouped instructions stay attached to the task group.
- Completion, choice, binary judgement, matching, and structured-layout controls render from projected `responseShape` and option sets.

Intentional difference:

- V2 does not import or delegate to `IELTSQuestionsPanel.tsx`, `AuthenticAnswerInput.tsx`, `TableCompletionGroupRenderer.tsx`, or `PassageRenderer.tsx`; those files remain reference-only because PRD-0048 forbids legacy Reading interpretation inside the V2 runtime boundary.

## Phone Reference

Old V1 reference files:

- `src/components/test/mobile/MobileReadingExamScaffold.tsx`
- `src/components/test/mobile/MobileQuestionSheet.tsx`
- `src/components/test/mobile/MobileReviewSummary.tsx`
- `src/core/platform/hooks/useMobileExamMode.ts`
- `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`

Current V2 implementation:

- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`

What stayed aligned:

- Phone runtime is passage-first.
- Questions open through a reachable `Questions` action.
- Answer entry appears in a bottom-sheet-like question surface.
- Submit flows through a pre-submit review summary.
- Closing and reopening the question surface preserves answer state and the recorded reading position label.

Intentional difference:

- The current Phase 6 slice records scroll preservation as component state instead of integrating with the older `mobileReadingState.ts` persistence helper. That keeps V2 independent from legacy Reading state while Phase 7 launch integration decides where durable attempt/session state belongs.

## Fixture Coverage Used

Runtime tests consume generated projection fixtures from:

- `src/services/reading-v2/fixtures/readingV2ProjectionFixtures.ts`

Representative family coverage:

- Completion: `sentence-completion`, `summary-completion-text`, `note-completion`, `short-answer`
- Choice: `multiple-choice`, `multiple-select`
- Binary judgement: `true-false-not-given`, `yes-no-not-given`
- Matching: `matching-headings`, `matching-information`, `matching-features`, `matching-sentence-endings`
- Structured layout: `table-completion`, `flowchart-completion`, `diagram-labeling`

## Browser Verification Status

Real-browser verification used a temporary Vite-hosted harness on `http://127.0.0.1:5173/reading-v2-runtime-harness.html` and rendered the actual `ReadingV2RuntimeShell` with generated projection fixtures. The harness was removed after capture.

Captured screenshots:

- `output/playwright/reading-v2-runtime-desktop-completion.png` at 1366x900 with `sentence-completion`
- `output/playwright/reading-v2-runtime-tablet-matching.png` at 1024x768 with `matching-headings`
- `output/playwright/reading-v2-runtime-phone-structured.png` at 390x844 with `table-completion`

Observed diagnostics:

- `[Diag][ReadingV2Runtime] runtime_layout_ready` emitted for desktop/tablet completion with `projectionKind: student-safe`, `layout: desktop-tablet`, `taskGroupCount: 1`, and `interactionCount: 2`.
- `[Diag][ReadingV2Runtime] runtime_layout_ready` emitted for tablet matching with `projectionKind: student-safe`, `layout: desktop-tablet`, `taskGroupCount: 1`, and `interactionCount: 2`.
- `[Diag][ReadingV2Runtime] runtime_layout_ready` emitted for phone structured layout with `projectionKind: student-safe`, `layout: phone`, `taskGroupCount: 1`, and `interactionCount: 2`.

Browser console status:

- No app runtime errors or warnings were present in the successful harness runs.
- Vite connection and React DevTools development messages were expected development-server noise.

## 2026-05-01 Update: Merged Table Runtime

Table Completion runtime now renders persisted table merge data from projections:

- `rowSpan` and `colSpan` are applied to table cells.
- merged blank cells can display multiple question-number chips from `anchorIds`.
- focused table anchors still drive active-cell highlighting.

This keeps teacher preview and student runtime aligned with the canonical table builder. Flowchart and diagram remain documented as deferred teacher-facing editors until their full authoring/runtime path is active.
