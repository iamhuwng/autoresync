# Task List: Reading V2 Studio Review Issues UX

Created: 2026-06-08

Scope: PRD0048 Reading V2 Studio warning/review UX for Auto V4, paste import, manual editing, validation, and source-truth review.

Ownership: This is PRD0048 work. It is not PRD0052 work. PRD0052 exposed the issue through Teacher Materials flows, but the warning system belongs to Reading V2 Studio and Auto V4 review architecture.

Implementation status, 2026-06-08:

- Implemented: normalized Review Issue mapper, click-stable Review Issues panel, warning pill replacement, issue row navigation, inline issue chips, source-action callback, Studio observability actions, focused unit coverage, docs deprecation notes.
- Browser smoke verified: `/__smoke/reading-v2-studio?fixture=cam16-test4-diagnostics` on `localhost:5173` opens the panel, keeps it viewport-visible, shows row count equal to pill count, renders compact question issue rows, closes after clicking a row, and focuses the target question editor field.
- Not completed in this slice: two additional real Clippings Auto V4 browser QA runs and exported QA log artifacts under `output/reading-v2-review-issues-ux/`.
- Verification passed: focused Vitest suite for Review Issues panel, Build Workspace, Studio Shell, issue mapper, and Reading V2 validation; UTF-8 check; `git diff --check` with only existing CRLF normalization warning on `reading-v2-validation-notes.md`.

Canonical contracts:

- `documentation/architecture/reading-v2-studio-review-issues-contract.md`
- `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`
- `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-source-authoritative-group-repair.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-canonical-anchor-foundation.md`

Interpretation rule: Auto V4 may send imperfect but editable drafts into Studio. Warnings exist to help teachers see, jump to, compare, repair, or accept issues. A warning UI must not act like a hidden developer tooltip.

## Regression Evidence Scope

Real Clippings imports should be preserved as regression evidence, not as canonical product rules.

Use concrete files only to prove the UI behavior against real parser output. Do not hard-code or overfit the design to one Cambridge test, one question range, one answer vocabulary, or one task shape.

The problem to preserve is not a specific answer-key mismatch. The problem is that when Studio has issue data, the teacher-facing warning surface is hard to use:

- top-left warning pill showed a count that was hard to reconcile with the visible tooltip content;
- warning content was hidden behind hover;
- hover was difficult to trigger and easy to lose;
- text was too small and too long;
- teacher-facing messages exposed backend wording such as "Interaction ... uses the wrong judgement vocabulary";
- clicking a warning did not take the teacher directly to the affected question;
- source-truth evidence was not visible beside the editable field.

## Related Outdated Data To Deprecate

The current implementation and tests treat the hover tooltip as the primary warning surface:

- `ReadingV2BuildWorkspace.tsx` builds `validationTooltipText` and puts full issue content into a `title` attribute.
- `ReadingV2BuildWorkspace.tsx` renders `.reading-v2-build__warning-popover` as hover-dependent tooltip content.
- `ReadingV2BuildWorkspace.test.tsx` asserts that question-level details appear in the pill tooltip.

Deprecate this behavior:

```text
Deprecated: hover/title tooltip as primary warning UI.
Replacement: click-stable Review Issues panel plus inline issue chips.
Allowed after replacement: tooltip may remain only as a short hint, e.g. "Click to review issues".
```

Also deprecate warning data that cannot drive teacher action:

```text
Deprecated: warning rows without question/range, source, severity, and target action when that data is knowable.
Replacement: normalized teacher-facing issue rows with stable issue type, severity, question/range, source category, and navigation target.
```

## Product Decision

The Studio warning system must become a navigation and review workflow:

```text
warning detected
-> normalized teacher-facing issue row
-> click-stable Review Issues panel
-> click row or Q label
-> Studio switches to correct passage/group/question
-> question card scrolls into view and highlights
-> teacher edits, reviews source evidence, or marks reviewed
```

The warning count must equal the visible actionable rows in the panel. If the pill says `4 issues`, the panel must show 4 issue rows.

## Non-Goals

- Do not change the judgement-vocabulary validation rule in this task.
- Do not normalize YES/NO into TRUE/FALSE in this task.
- Do not change publish rules except where warnings are displayed or navigated.
- Do not make Auto V4 block Studio for reviewable content issues.
- Do not redesign all Reading V2 Studio UI.
- Do not change PRD0052 Teacher Materials behavior except through shared Reading V2 Studio components.

## Target Files

Expected files to modify:

- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx`
- `src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.css`

Likely files to create:

- `src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.tsx`
- `src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.test.tsx`
- `src/services/reading-v2/readingV2ReviewIssueMapping.service.ts`
- `src/services/reading-v2/readingV2ReviewIssueMapping.service.test.ts`

Optional files if source comparison is implemented in this slice:

- `src/components/reading-v2/studio/ReadingV2SourceEvidencePanel.tsx`
- `src/components/reading-v2/studio/ReadingV2SourceEvidencePanel.test.tsx`

Documentation files to update:

- `documentation/tasks/PRD0048/reading-v2-studio-ui-assessment.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
- `documentation/tasks/PRD0048/reading-v2-validation-notes.md`
- `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-source-authoritative-group-repair.md`

## Warning Data Contract

Create or standardize a teacher-facing issue model:

```ts
export type ReadingV2ReviewIssueSeverity = 'publish-blocker' | 'needs-review' | 'info';

export type ReadingV2ReviewIssueSource =
  | 'answer-key'
  | 'question-text'
  | 'source-comparison'
  | 'layout'
  | 'validation'
  | 'import-review';

export interface ReadingV2ReviewIssueTarget {
  readonly questionRange?: { readonly start: number; readonly end: number };
  readonly passageNumber?: number;
  readonly taskGroupId?: string;
  readonly interactionId?: string;
  readonly anchorId?: string;
}

export interface ReadingV2ReviewIssue {
  readonly id: string;
  readonly severity: ReadingV2ReviewIssueSeverity;
  readonly source: ReadingV2ReviewIssueSource;
  readonly type: string;
  readonly label: string;
  readonly detail: string;
  readonly target: ReadingV2ReviewIssueTarget;
  readonly originalMessage: string;
}
```

Teacher-facing labels must be short:

```text
Q12: Wrong judgement vocabulary
Q18: Missing answer-key row
Questions 31-35: Question text changed
Questions 9-13: Table cell missing
```

Backend/developer messages must remain available in diagnostics export, but hidden by default in the teacher panel.

## Severity Rules

Use these defaults:

- `publish-blocker`: validation issue that blocks publish.
- `needs-review`: Auto V4/source verifier warning that can be edited or accepted by teacher.
- `info`: import evidence, source ledger notes, successful repairs, or non-actionable provenance.

Examples:

- `invalid-packaged-material-assembly` with wrong judgement vocabulary: `publish-blocker`.
- `missing-scoring-response-shape`: `publish-blocker`.
- `duplicate-structured-layout-question`: `publish-blocker` if canonical-safe but publish-blocked.
- `group-source-underrepresented`: `needs-review`.
- `question-text-changed`: `needs-review`.
- `high-risk-token-changed`: `needs-review`.
- `auto-v4-source-authoritative-passage`: `info`.

## Phase 0 - Lock Current Failure And Deprecation Evidence

- [ ] Add a test in `ReadingV2BuildWorkspace.test.tsx` proving the old tooltip-first behavior is not enough.
  - Render three validation messages with question ranges.
  - Assert the pill exists.
  - Assert the new Review Issues panel opens on click, not hover.
  - Assert the `title` attribute is absent or only contains `Click to review issues`.
- [ ] Add a test that the visible issue row count equals the pill count.
  - Example: three issues in, pill says `3 issues`, panel has three rows.
  - Do not allow hidden fourth rows or hidden tooltip-only rows.
- [ ] Add a test that each issue row renders a short teacher-facing label.
  - Example label: `Q12`.
  - Example title: `Wrong judgement vocabulary`.
  - Example detail: `Answer vocabulary does not match this question group.`
- [ ] Add comments in the test name or arrange block marking the old hover tooltip as deprecated.
- [ ] Confirm the new tests fail before implementation.

Recommended command:

```powershell
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx --reporter=basic
```

Expected pre-implementation result:

```text
FAIL: Review Issues panel cannot be opened by click
FAIL: issue rows are not rendered as stable clickable review rows
```

## Phase 1 - Normalize Review Issue Data

- [ ] Create `src/services/reading-v2/readingV2ReviewIssueMapping.service.ts`.
- [ ] Create `src/services/reading-v2/readingV2ReviewIssueMapping.service.test.ts`.
- [ ] Implement a mapper that converts `ReadingV2BuildValidationMessage` and import-review messages into `ReadingV2ReviewIssue`.
- [ ] Include stable mapping for current known issue types:
  - wrong judgement vocabulary;
  - missing answer;
  - matching answer not in option list;
  - duplicate structured layout question;
  - table cell missing;
  - source coverage weak;
  - question text changed;
  - high-risk token changed;
  - source range missing.
- [ ] Ensure unknown messages still show safely:
  - `label`: question/range if available, otherwise `Review item`;
  - `type`: `review-required`;
  - `detail`: sanitized teacher-facing message;
  - `originalMessage`: exact original string for diagnostics export.
- [ ] Add tests for a generic single-question judgement-vocabulary issue:
  - Input message: `Interaction sample-import-q12 uses the wrong judgement vocabulary.`
  - Input range: `{ start: 12, end: 12 }`
  - Expected row:
    - label `Q12`
    - type `wrong-judgement-vocabulary`
    - detail contains `Wrong judgement vocabulary`
    - severity `publish-blocker`
    - source `validation`
- [ ] Add tests for group warnings:
  - Input range `{ start: 38, end: 40 }`
  - Expected label `Questions 38-40`
  - Expected severity `needs-review`.
- [ ] Run the mapper tests and confirm failure before implementation, then pass after implementation.

Recommended command:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2ReviewIssueMapping.service.test.ts --reporter=basic
```

## Phase 2 - Build Click-Stable Review Issues Panel

- [ ] Create `src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.tsx`.
- [ ] Create `src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.test.tsx`.
- [ ] Component props:

```ts
export interface ReadingV2ReviewIssuesPanelProps {
  readonly issues: readonly ReadingV2ReviewIssue[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onIssueActivate: (issue: ReadingV2ReviewIssue) => void;
}
```

- [ ] Render trigger text outside or inside parent as `N issue(s)`.
- [ ] Render panel only when open.
- [ ] Panel must be click-stable:
  - opens on button click;
  - closes on close button;
  - closes on `Escape`;
  - does not close on mouse movement;
  - does not rely on CSS hover.
- [ ] Add a heading:

```text
Review issues
```

- [ ] Add row count summary:

```text
3 review items
```

- [ ] Render rows as compact navigation buttons only:
  - question/range label plus short type label;
  - visible format must be `Question X: Error type` or `Questions X-Y: Error type`;
  - no severity chip, source chip, long detail, `Go to question`, or `Show source` secondary button.
- [ ] Make rows keyboard accessible:
  - row button has useful accessible name;
  - Enter/Space activates navigation;
  - close button is reachable.
- [ ] Add tests:
  - opens on click;
  - closes on Escape;
  - clicking a question label calls `onIssueActivate` with that issue;
  - `Go to question` calls the same action;
  - hover is not required.

Recommended command:

```powershell
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.test.tsx --reporter=basic
```

## Phase 3 - Replace Hover Tooltip In Build Workspace

- [ ] Modify `ReadingV2BuildWorkspace.tsx`.
- [ ] Remove `validationTooltipText` as a full warning content surface.
- [ ] Keep the warning pill but make it a click trigger.
- [ ] Use the issue mapper to convert `validationMessages` to `ReadingV2ReviewIssue[]`.
- [ ] Render `ReadingV2ReviewIssuesPanel` from the topbar warning area.
- [ ] Replace old `title={validationTooltipText}` with no title or:

```text
Click to review issues
```

- [ ] Add state:

```ts
const [reviewIssuesOpen, setReviewIssuesOpen] = useState(false);
```

- [ ] Ensure `validationMessages.length` is no longer used as the final UI source if mapped issue count differs.
  - Use `reviewIssues.length` for pill count.
  - If a message cannot map, it still becomes one fallback issue row.
- [ ] Add tests in `ReadingV2BuildWorkspace.test.tsx`:
  - old tooltip assertion is removed or updated;
  - pill click opens panel;
  - panel row count equals pill count;
  - panel displays teacher-facing labels;
  - no backend `Interaction ...` wording appears in visible row title.

Recommended command:

```powershell
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx --reporter=basic
```

## Phase 4 - Add Issue Row To Question Navigation

- [ ] Extend `ReadingV2ReviewIssue` navigation handling in `ReadingV2BuildWorkspace.tsx`.
- [ ] When an issue is activated:
  - identify `interactionId` if present;
  - otherwise find the first interaction whose display number is inside `questionRange`;
  - identify the owning task group;
  - call `onSelectPassage` for the passage containing that task group if needed;
  - call `onSelectTaskGroup`;
  - call `onQuestionLinkNavigation` with source `diagnostic`;
  - close the panel only after target resolution succeeds.
- [ ] Add a temporary focus/highlight state:

```ts
const [focusedIssueQuestion, setFocusedIssueQuestion] = useState<number | null>(null);
```

- [ ] Scroll the target question card into view using refs or existing question-link navigation behavior.
- [ ] Add `data-review-focus="true"` or a CSS class to the focused question card for 2-3 seconds.
- [ ] Add CSS in `ReadingV2StudioShell.css`:

```css
.reading-v2-build-question-card--review-focus {
  outline: 3px solid rgba(245, 158, 11, 0.8);
  box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.18);
}
```

- [ ] Add tests:
  - clicking a question-level issue calls `onSelectTaskGroup` for the containing group;
  - clicking a question-level issue calls `onQuestionLinkNavigation` with `source: 'diagnostic'`;
  - selected/focused question gets focus marker.

Recommended command:

```powershell
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx --reporter=basic
```

## Phase 5 - Add Inline Issue Chips

- [ ] In `ReadingV2BuildWorkspace.tsx`, group mapped issues by question number and task group.
- [ ] On affected question cards, render a compact chip:

```text
Wrong vocabulary
```

- [ ] On affected task group headers, render:

```text
3 issues
```

- [ ] Clicking a chip opens the Review Issues panel filtered or scrolled to that issue.
- [ ] Use same issue data source as the panel. Do not create separate count logic.
- [ ] Add tests:
  - affected question card shows the relevant issue chip;
  - unaffected question card does not show an issue chip;
  - group header count equals affected issues in that group;
  - clicking chip opens panel.

Recommended command:

```powershell
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx --reporter=basic
```

## Phase 6 - Deprecated Source Evidence Button

- [ ] Do not add `Show source` inside the warning panel.
- [ ] Warning panel rows should be single-purpose: click row -> move to affected question in editor.
- [ ] Source evidence remains available through existing import diagnostics/developer evidence surfaces, not this compact warning list.

## Phase 7 - Update PRD0048 Docs And Deprecate Old Warning Contract

- [ ] Update `documentation/tasks/PRD0048/reading-v2-studio-ui-assessment.md`.
  - Add section: `Review Issues Panel replaces hover tooltip`.
  - Mark hover tooltip warning details as deprecated.
- [ ] Update `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`.
  - Add Review Issues panel to Studio topbar schema.
  - Add inline issue chips to question card schema.
  - Add click navigation behavior.
- [ ] Update `documentation/tasks/PRD0048/reading-v2-validation-notes.md`.
  - Add teacher-facing issue taxonomy.
  - Add severity rules.
  - Add guidance that real import incidents are regression fixtures, not canonical behavior definitions.
- [ ] Update `documentation/tasks/PRD0048/tasks-0048-reading-v2-auto-v4-source-authoritative-group-repair.md`.
  - Add cross-reference to this tasklist.
  - Clarify that source-truth warnings should route into Review Issues panel.
- [ ] Search for docs that still describe tooltip-only warning UX:

```powershell
rg -n "tooltip|warning pill|validation items|hover" documentation/tasks/PRD0048 documentation/architecture
```

- [ ] Update or mark stale references as deprecated. Do not silently leave conflicting docs.

## Phase 8 - Integration And Regression Verification

- [ ] Run focused component tests:

```powershell
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.test.tsx --reporter=basic
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx --reporter=basic
cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx --reporter=basic
```

- [ ] Run relevant service tests:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2ReviewIssueMapping.service.test.ts --reporter=basic
cmd /c npx vitest run src/services/reading-v2/readingV2Validation.service.test.ts --reporter=basic
```

- [ ] Run UTF-8 check for touched files:

```powershell
cmd /c npm run check:utf8 -- src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.tsx src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.test.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.css src/services/reading-v2/readingV2ReviewIssueMapping.service.ts src/services/reading-v2/readingV2ReviewIssueMapping.service.test.ts
```

- [ ] Run whitespace check:

```powershell
git diff --check -- src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.tsx src/components/reading-v2/studio/ReadingV2ReviewIssuesPanel.test.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.tsx src/components/reading-v2/studio/ReadingV2BuildWorkspace.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.tsx src/components/reading-v2/studio/ReadingV2StudioShell.test.tsx src/components/reading-v2/studio/ReadingV2StudioShell.css src/services/reading-v2/readingV2ReviewIssueMapping.service.ts src/services/reading-v2/readingV2ReviewIssueMapping.service.test.ts
```

## Phase 9 - Browser QA

- [ ] Use at least two real Clippings imports that produce warnings.
- [ ] A previously observed warning case may be used as one regression fixture, but it must not be the only browser QA case.
- [ ] Create Reading V2 Auto V4 drafts.
- [ ] Confirm Studio opens even when issues exist.
- [ ] Confirm top pill says exactly the number of visible issue rows.
- [ ] Confirm clicking the pill opens a stable panel.
- [ ] Confirm clicking a question-level issue moves to that question in the editor.
- [ ] Confirm the target question card highlights.
- [ ] Confirm issue text follows this shape:

```text
Q<number>: <short issue type>
```

- [ ] Confirm unaffected questions do not show unrelated issue chips.
- [ ] Confirm `Esc` closes the panel.
- [ ] Export diagnostic logs after QA and save to `output/reading-v2-review-issues-ux/`.
- [ ] Capture console logs after QA and save to `output/reading-v2-review-issues-ux/`.

## Acceptance Criteria

- Warning pill is click-stable and not hover-dependent.
- Tooltip is not the primary issue surface.
- Pill count equals visible panel row count.
- Every visible issue row has short teacher-facing text.
- Question-level issue rows are clickable.
- Clicking a question-level issue moves Studio to the target question in the editor.
- The target question card scrolls into view and highlights.
- Keyboard users can open the panel and activate issue rows.
- Inline issue chips appear on affected questions/groups.
- Backend jargon is hidden from teacher-facing rows.
- Diagnostics export still preserves original raw messages.
- PRD0048 docs mark old tooltip-warning behavior as deprecated.
- PRD0048 docs classify real import incidents as regression evidence, not canonical behavior definitions.

## Implementation Notes

- Do not weaken validation to make the UI look clean.
- Do not count `info` issues in the publish-blocker pill unless the panel also shows them in a separate `Info` section.
- Do not duplicate issue count logic between topbar, panel, and inline chips.
- Prefer one normalized issue list that feeds all warning surfaces.
- If exact source evidence is unavailable, degrade honestly and point to diagnostics export.
- Preserve raw source privacy: issue UI is teacher/author-only; runtime/student payloads must not include raw source.
