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
- Current findings come from the shared authoring readiness evaluator after each edit and across save/resume. Required findings stop publication; optional suggestions leave Publish available.
- Supplied answer-key rows are retained privately alongside the original source. Unbound or malformed rows require a specific row correction: use a valid authored answer, link its question, or identify a row outside the selected test. Source key numbers alone never create required questions.
- Explicit instruction facts (word limit, number allowance, selection count, judgement vocabulary and option reuse) are compared with current response rules; historical diagnostic messages do not determine readiness. Restoring supplied rules reevaluates immediately. Explicit teacher rule edits retain the resulting concrete rules without another confirmation; ordinary wording and answer edits do not change source interpretation. Runtime formatting preserves the authored rules while updating display numbering.
- Imports with omitted passage text retain a current comparison and an editable source span. A corrected span must be represented in the authored passage. Answer-slot links select real unassigned slots and source question links preserve the associated passage.
- Source evidence and explicit source interpretations stay private with the draft. Ordinary teacher edits remain authored content without a second approval. Current source requirements are checked by stable target IDs, including requirements for source content removed from the draft.
- The Build Workspace has one issue detail surface. Its primary action is Review N issues when required findings exist and Publish when ready. Source-only findings offer Add or Link to an explicit target; supported interpretation mismatches offer a specific correction. Parser history belongs in Developer details.
- Answer-bank findings compare supplied and current wording and offer Edit answer bank or Use this answer bank. Confirmation records the teacher, time and associated options privately; every required source label must have one non-empty current option. Removing a confirmed option blocks publication again.
- Source-bank association findings identify an incompatible linked question group. Studio offers only semantically compatible groups for relinking, excludes groups already bound to another bank requirement, and uses the exact matching group as the primary direct-link action when there is exactly one. Ambiguous matches require an explicit group choice; incompatible judgement and free-text groups are never offered.
- Bank requirements are read from the immutable source within the passage boundary, including multiple labelled options on one line. Saved parser output does not override the supplied source.
- Issue payloads must not expose hidden provenance or raw source evidence to
  student-safe projections.
- Test settings and optional extraction are normal authoring controls. Developer details contains diagnostics; it does not present a separate readiness count or ordinary editing steps.

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
