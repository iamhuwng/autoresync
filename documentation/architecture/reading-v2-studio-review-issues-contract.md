# Reading V2 Studio Review Issues Contract

Status: current Studio review issue contract. Detailed history lives in
[`documentation/architecture/changelog/reading-v2-studio-review-issues-contract.md`](changelog/reading-v2-studio-review-issues-contract.md).

## Contract

Studio review issues are teacher-facing validation and source-fidelity signals.
They guide edit/publish decisions but are not student runtime payload.

## Issue Rules

- Issues must have stable ids, severity, location, message, and safe context.
- Blocking issues must stop publish until resolved or explicitly allowed by the
  owning publish contract.
- Non-blocking issues may warn without blocking publish.
- Issue payloads must not expose hidden provenance or raw source evidence to
  student-safe projections.

## Ownership

- Auto providers may generate issue candidates.
- Studio owns teacher presentation and edit state.
- Publish owns final validation.
- MaterialSummary rows may expose only safe summary facts, not review issue
  bodies.

## Related Docs

- [`documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`](reading-v2-auto-v4-provider-review-contract.md)
- [`documentation/architecture/reading-v2-material-publish-and-passage-library.md`](reading-v2-material-publish-and-passage-library.md)
- [`documentation/architecture/teacher-test-creation-parsing-and-review.md`](teacher-test-creation-parsing-and-review.md)
