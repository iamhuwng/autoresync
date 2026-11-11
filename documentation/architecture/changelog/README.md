# Changelog Rules

This folder stores detailed change records. It is not the architecture source of truth.

## Belongs Here

- incident notes and repair records
- implementation logs and migration histories
- historical audits, drift reports, and closure matrices explaining a change
- release or rollout notes that explain what changed over time

Candidate/attempt-specific technical dossiers belong in `documentation/release-audits/`
and should be linked from the relevant CL detail. Existing historical files need
not move. The operational release ledger owns intent and target outcomes; retained
archives own recoverable source/artifact/evidence. Neither directory is a second
authority for publication or current activation. Not every routine release needs
a separate prose audit.

## Stays In Architecture

- current contracts, authority maps, and system boundaries
- current data paths and ownership rules
- durable policies and runtime integration contracts
- ADR-style decisions with context and consequences

If a historical architecture-root file also carries an active rule-triggered
contract, move the detailed history here but leave a concise current contract in
`documentation/architecture/`. Repair notes, ledgers, audits, closure matrices,
and incident records should not remain as bare architecture files.

## File Header

Each detailed record starts with:

```md
# Title

Changelog ID: `CL-YYYYMMDD-SLUG`
Moved from: `old/path.md`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)
```

Use `Moved from` only when a file was relocated. New detailed records can omit it.

## ID Rules

- Format: `CL-YYYYMMDD-SLUG`.
- Date is the change date, audit date, or first durable record date.
- Slug names the feature or failure class, not a branch.
- IDs are immutable after publication.
- One master row links each ID to its detailed file.

## Integration and release lifecycle

Meaningful implementation changes add or update a CL detail during ordinary PR
work. CI validates record identity and Master consistency. Trivial formatting,
test-only and documentation corrections need no separate narrative entry.

`release:plan` suggests changed records; an engineer checks applicability against
the actual source and service scope in the existing compatibility review. Native
Hosting requires `changeIds`, or `[]` plus `changelogNotApplicable`. The owner
reviews behavior and release scope, not ledger JSON or identifiers.

One operation can carry several IDs; one ID can appear in several operations.
Associations belong to explicit targets. Historical release-level `changeIds`
remain readable and must not be guessed onto individual targets. Repeated
inclusion preserves the original publication and adds another scoped reference.
Rollback/correction uses another operation and references the previous evidence;
neither erases the earlier publication.

After retained outcomes exist, the guarded route appends `Recorded release outcomes`
blocks to details and links them from the Master row. These are scoped historical
facts, not assertions that every service in a change shipped, verification passed,
or the version is still active. Authored release grouping remains curated; a
Hosting receipt must not promote an unresolved Worker change. Documentation-only
completion is integration evidence and does not require Hosting publication.

If documentation is interrupted, run `node scripts/release-changelog.mjs --reconcile
<operation-uuid>` from the intended documentation checkout. This independently
reads retained archive/outcome assets and can resume partial writes without
publication or a commit/push. Use a task-owned checkout for document writes.
Retain earlier observations and append dated corrections; do not rewrite archived
intent or manufacture historical associations. Research recommendations below
are historical; the adopted CL rules in this README are authoritative.

## Source Notes

Rules follow repo-fit research in [`documentation/architecture/changelog/changelog-system-research.md`](changelog-system-research.md), informed by Keep a Changelog, Semantic Versioning, GitHub/GitLab release-note practices, and ADR guidance.
