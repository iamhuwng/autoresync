# Docs Changelog Architecture Split

Changelog ID: `CL-20260708-DOCS-CHANGELOG-ARCHITECTURE-SPLIT`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Summary

Created the repo changelog lane and moved primary historical records out of `documentation/architecture/`.

## Moved Files

| ID | Old path | New path |
| --- | --- | --- |
| `CL-20260512-HOMEWORK-RESULT-VISIBILITY-REPAIR` | `documentation/architecture/homework-result-visibility-repair.md` | `documentation/architecture/changelog/homework-result-visibility-repair.md` |
| `CL-20260325-PRD0040-PREFLIGHT-LEDGER` | `documentation/architecture/prd0040-preflight-ledger.md` | `documentation/architecture/changelog/prd0040-preflight-ledger.md` |
| `CL-20260514-READING-V2-AUTO-SOURCE-LEDGER-REPAIR` | `documentation/architecture/reading-v2-auto-source-ledger-and-repair.md` | `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md` |
| `CL-20260325-RESULT-VIEW-FR-CLOSURE-MATRIX` | `documentation/architecture/result-view-fr-closure-matrix.md` | `documentation/architecture/changelog/result-view-fr-closure-matrix.md` |
| `CL-20260325-RESULT-VIEW-MAP` | `documentation/architecture/result-view-map.md` | `documentation/architecture/changelog/result-view-map.md` |
| `CL-20260325-RESULT-VIEW-PERMISSION-MATRIX` | `documentation/architecture/result-view-permission-matrix.md` | `documentation/architecture/changelog/result-view-permission-matrix.md` |
| `CL-20260325-RESULT-VIEW-VERIFICATION-MATRIX` | `documentation/architecture/result-view/verification-matrix.md` | `documentation/architecture/changelog/result-view-verification-matrix.md` |
| `CL-20260708-THCS-RUNTIME-BRIDGE-REPAIR` | `documentation/architecture/thcs-runtime-bridge-repair.md` | `documentation/architecture/changelog/thcs-runtime-bridge-repair.md` |
| `CL-20260406-IELTS-WRITING-FAMILY-STABILITY-AUDIT` | `documentation/architecture/ielts-writing/feature-family-stability-audit-2026-04-06.md` | `documentation/architecture/changelog/ielts-writing-feature-family-stability-audit-2026-04-06.md` |
| `CL-20260516-LOCAL-MAIN-WORKSPACE-SAFETY-PLAN` | `documentation/architecture/local-main-workspace-safety-plan.md` | `documentation/architecture/changelog/local-main-workspace-safety-plan.md` |
| `CL-20260524-READING-V2-AUDIT-TRAIL-CONTRACT` | `documentation/architecture/reading-v2-audit-trail.md` | `documentation/architecture/changelog/reading-v2-audit-trail.md` |
| `CL-20260524-READING-V2-AUTO-V4-PROVIDER-REVIEW-CONTRACT` | `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md` | `documentation/architecture/changelog/reading-v2-auto-v4-provider-review-contract.md` |
| `CL-20260603-READING-V2-MATERIAL-PUBLISH-PASSAGE-LIBRARY` | `documentation/architecture/reading-v2-material-publish-and-passage-library.md` | `documentation/architecture/changelog/reading-v2-material-publish-and-passage-library.md` |
| `CL-20260615-READING-V2-MATERIAL-REMOVAL-LIFECYCLE` | `documentation/architecture/reading-v2-material-removal-lifecycle.md` | `documentation/architecture/changelog/reading-v2-material-removal-lifecycle.md` |
| `CL-20260615-READING-V2-RUNTIME-INTEGRATIONS` | `documentation/architecture/reading-v2-runtime-integrations.md` | `documentation/architecture/changelog/reading-v2-runtime-integrations.md` |
| `CL-20260608-READING-V2-STUDIO-REVIEW-ISSUES-CONTRACT` | `documentation/architecture/reading-v2-studio-review-issues-contract.md` | `documentation/architecture/changelog/reading-v2-studio-review-issues-contract.md` |

## Reviewed But Kept In Architecture

- Current-state contracts and policies stayed in `documentation/architecture/`.
- `documentation/rules/repo-branch-source-of-truth.md` stayed in place as manual-review/current policy, because it defines current branch roles and recovery/deploy procedure rather than a time-scoped change record.
- Mixed architecture docs with evidence sections stayed in place for this pass; future cleanup should extract large historical sections into new `CL-*` detail files while leaving short current-state links behind.

## New Indexes

- `documentation/architecture/master_changelog.md`
- `documentation/architecture/changelog/README.md`
- `documentation/architecture/changelog/changelog-system-research.md`

## Root Architecture Cleanup

The detailed historical Reading V2 notes were moved out of the architecture root
into `documentation/architecture/changelog/` after content review showed large
sections primarily preserve slice-level implementation/change history.

Concise current contracts remain in `documentation/architecture/` only where
they are active architecture or rule-triggered authority:

- `reading-v2-audit-trail.md`
- `reading-v2-auto-v4-provider-review-contract.md`
- `reading-v2-material-publish-and-passage-library.md`
- `reading-v2-material-removal-lifecycle.md`
- `reading-v2-runtime-integrations.md`
- `reading-v2-studio-review-issues-contract.md`

Repair/history-only records remain changelog-only, including:

- `homework-result-visibility-repair.md`
- `reading-v2-auto-source-ledger-and-repair.md`
- `thcs-runtime-bridge-repair.md`
