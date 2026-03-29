---
title: 'Pattern: Shared Result Body, Shell-Owned Governance'
description: Reusable architecture pattern for unifying result views around one shared body while keeping access, release-state, and audience-specific controls in shell owners.
createdAt: '2026-03-29T04:49:22.290Z'
updatedAt: '2026-03-29T04:50:16.327Z'
tags:
  - pattern
  - results
  - governance
  - ui-architecture
  - shared-shells
---

# Pattern: Shared Result Body, Shell-Owned Governance

## Problem

Result systems often drift when each audience surface reimplements the same body, feedback wiring, and visibility decisions.
The failure mode is predictable:
- one shell writes data another shell does not read
- one shell exposes sections another shell hides
- route wrappers and history pages quietly become policy owners instead of policy consumers

## Solution

Keep one shared saved-result body and make shell owners responsible for everything around it.

### Shared body responsibilities
- render canonical saved-result content
- consume canonical result data shape
- render optional feedback and review sections when the shell enables them

### Shell responsibilities
- route and auth entry
- release-state gates
- teacher ownership checks
- container chrome and affordances
- audience-specific action permissions

### Service responsibilities
- canonical persistence shape
- compatibility reads and writes during migration
- feedback generation and upgrade hooks
- visibility classification and ownership resolution

## When to use

Use this pattern when:
- student and teacher surfaces need the same result content but different gates
- one product area needs release-state restrictions and another needs teacher tooling
- a migration must consolidate behavior without forcing every surface into the same container

## Invariants

- The shared body must depend on one canonical saved-result model.
- Shells may differ in layout and gates, but they should not invent alternate storage contracts.
- Access policy must be decided outside the shared body and passed in, not inferred ad hoc by each tab or card.
- Legacy surfaces remain explicit until migrated; they are not considered unified just because they show similar content.

## Example

```tsx
function TeacherShell({ result }: { result: TestResultRecord }) {
  const feedbackState = useFeedbackAutoTrigger({
    resultId: result.resultId,
    result,
    loading: false,
    autoTriggerEnabled: true,
    shellName: 'TeacherShell',
  });

  return (
    <SharedSavedResultCore
      result={result}
      sections={{
        overview: true,
        review: true,
        feedback: true,
        teacherFeedback: true,
      }}
      feedbackState={{
        formativeFeedback: result.formativeFeedback,
        feedbackLoading: feedbackState.formativeFeedbackLoading,
        feedbackError: feedbackState.feedbackError,
        needsUpgrade: feedbackState.storedFeedbackNeedsUpgrade,
      }}
    />
  );
}
```

The teacher shell owns teacher permissions and container behavior. The shared body renders the result content. A student shell can use the same body while applying release-state gates and disabling teacher-only affordances.

## Anti-patterns

- Saving teacher feedback in a node that the shared result readers never read.
- Treating raw producer convenience fields as authoritative ownership signals.
- Leaving a legacy page outside the shared shell stack but assuming it already has unified behavior.
- Letting every route wrapper decide its own feedback-generation semantics.

## Source

- @doc/architecture/result-view/result-view-governance-audit-2026-03-29
- @doc/patterns/pattern-canonical-result-persistence-invariants
- `documentation/architecture/result-view/surface-map.md`
- `documentation/architecture/result-view/visibility-policy.md`
- `documentation/architecture/result-view/verification-matrix.md`
