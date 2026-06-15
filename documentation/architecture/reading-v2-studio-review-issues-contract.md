# Reading V2 Studio Review Issues Contract

> **Created:** 2026-06-08
> **Scope:** Canonical UX and data contract for Reading V2 Studio validation/import review issues.
> **Status:** Canonical PRD0048 architecture note. This supersedes tooltip-first warning text in older PRD0048 notes where they conflict.

## Decision Authority

Use this order when Reading V2 Studio warning/review docs disagree:

1. This contract.
2. `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md` for Auto V4 handoff rules.
3. Active PRD0048 tasklists that link back to this contract.
4. Current implementation tests and smoke fixtures.
5. Historical rollout notes and real-test incidents.

## Product Contract

Reading V2 Studio warnings are an authoring workflow, not a hidden tooltip.

The warning pill must:

- open a click-stable `Review issues` panel;
- show a count equal to the visible actionable rows in that panel;
- remain usable without hover;
- use only short hint text in `title` or tooltip, for example `Click to review issues`;
- never expose long backend diagnostic wording as the primary teacher-facing row text.

Each review row must:

- use compact teacher-facing copy: `Question X: Error Type` or `Questions X-Y: Error Type`;
- activate on row click;
- close the panel after successful activation;
- move Studio to the affected passage, task group, and question when that target is knowable;
- focus or highlight the affected editor card/field long enough for the teacher to see it;
- preserve the original raw diagnostic message for diagnostics export.

The warning panel must not include a separate `Show source` button. Source evidence remains in import diagnostics and source-review surfaces. The review row's primary action is navigation to the editable field.

## Issue Data Contract

One normalized issue list feeds all teacher-facing warning surfaces:

- topbar warning pill count;
- `Review issues` panel rows;
- inline issue chips or review guidance near affected task groups/questions;
- diagnostic navigation observability.

Do not duplicate issue-count logic between those surfaces.

Recommended model:

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

## Severity Defaults

- `publish-blocker`: canonical validation issue that blocks publish until fixed.
- `needs-review`: import/source verifier issue that can open in Studio and be repaired or accepted by the teacher.
- `info`: provenance, source-ledger note, successful repair evidence, or non-actionable import context.

Examples:

- `invalid-packaged-material-assembly` with wrong judgement vocabulary: `Question X: Wrong Judgement Vocabulary`, `publish-blocker`.
- `missing-scoring-response-shape`: `Question X: Missing Answer`, `publish-blocker`.
- `matching answer not in option list`: `Question X: Answer Not In Options`, `publish-blocker`.
- `duplicate-structured-layout-question`: `Questions X-Y: Structured Layout Conflict` when canonical-safe and editable, otherwise Auto V4 fails before Studio.
- `group-source-underrepresented`: `Questions X-Y: Source Coverage Weak`, `needs-review`.
- `question-text-changed`: `Questions X-Y: Question Text Changed`, `needs-review`.
- `high-risk-token-changed`: `Questions X-Y: High-Risk Token Changed`, `needs-review`.

## Auto V4 Handoff Boundary

Auto V4 may hand imperfect but editable drafts to Studio. Review issues are the user-facing repair queue for those drafts.

Studio should open when:

- the draft can hydrate into canonical-safe Reading V2 data;
- the issue is localizable to a passage, task group, question, answer key, or layout block;
- publish can remain blocked until teacher repair.

Studio must not open when:

- no canonical-safe draft can be built;
- duplicate anchors or malformed structured layout would corrupt canonical ownership;
- the failure is global or non-localizable;
- raw source/evidence needed for repair is unavailable.

This mirrors the Auto V4 provider review contract: bad-but-editable opens Studio with review items; malformed canonical data fails closed.

## Deprecated Behavior

Deprecated:

- hover-only warning content;
- full validation text in a `title` attribute;
- row text such as `Interaction <id> uses the wrong judgement vocabulary`;
- generic deduplication that collapses separate question-level issues into one visible row;
- separate `Show source` buttons inside the compact warning panel;
- treating one real Cambridge diagnostic case as a product rule.

Replacement:

- click-stable panel;
- compact `Question X: Error Type` rows;
- one visible row per actionable issue;
- row click navigates to the exact editable question when known;
- diagnostics export keeps raw provider/backend wording for investigation.

## Regression Evidence

Current smoke fixture:

```text
/__smoke/reading-v2-studio?fixture=cam16-test4-diagnostics
```

This fixture comes from a real pasted diagnostic log. It verifies the UI contract, not a permanent answer-key rule:

- pill count equals visible panel row count;
- rows render as `Question 23: Wrong Judgement Vocabulary`, `Question 24: Wrong Judgement Vocabulary`, and `Question 26: Wrong Judgement Vocabulary`;
- backend diagnostic text stays hidden from row copy;
- row click closes the panel and focuses the affected question editor.

Real import incidents are regression fixtures only. They must not hard-code product behavior around one test, one question range, one table shape, or one answer vocabulary mismatch.
