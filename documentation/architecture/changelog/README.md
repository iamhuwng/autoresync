# Changelog Rules

This folder stores detailed change records. It is not the architecture source of truth.

## Belongs Here

- incident notes and repair records
- implementation logs and migration histories
- audits, drift reports, and closure matrices
- preflight ledgers, verification bundles, and historical evidence
- release or rollout notes that explain what changed over time

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

## Source Notes

Rules follow repo-fit research in [`documentation/architecture/changelog/changelog-system-research.md`](changelog-system-research.md), informed by Keep a Changelog, Semantic Versioning, GitHub/GitLab release-note practices, and ADR guidance.
