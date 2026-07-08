# Reading V2 Material Removal Lifecycle

Status: current removal lifecycle contract. Detailed history lives in
[`documentation/architecture/changelog/reading-v2-material-removal-lifecycle.md`](changelog/reading-v2-material-removal-lifecycle.md).

## Contract

Reading V2 material removal is a lifecycle transition, not a blind delete.
User-facing listing rows must disappear, launch paths must fail closed, and
historical references needed by results/audit remain readable where policy
allows.

## Required Effects

- Set canonical metadata lifecycle to removed or archived as appropriate.
- Remove or deactivate active MaterialSummary v1 rows.
- Remove runtime compatibility bridge rows only when that does not break
  historical result access.
- Preserve audit records.
- Keep repair/reconcile tools idempotent.

## My Content Boundary

My Content reads active owned MaterialSummary rows. Removed Reading V2 materials
must not remain active in any owner, visibility, material-kind, or test-type
summary bucket.

## Related Docs

- [`documentation/architecture/reading-v2-audit-trail.md`](reading-v2-audit-trail.md)
- [`documentation/architecture/reading-v2-material-publish-and-passage-library.md`](reading-v2-material-publish-and-passage-library.md)
- [`documentation/architecture/universal-material-summary-integration.md`](universal-material-summary-integration.md)
