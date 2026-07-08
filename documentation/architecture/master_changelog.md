# Master Changelog

This file is the chronological index for durable change history. Detailed records live in `documentation/architecture/changelog/` and carry stable `CL-*` IDs.

Order: newest first. Architecture docs stay focused on current contracts, authority, policies, and system shape.

## Unreleased

| Date | ID | Area | Type | Summary |
| --- | --- | --- | --- | --- |
| 2026-07-08 | [`CL-20260708-DOCS-CHANGELOG-ARCHITECTURE-SPLIT`](changelog/docs-changelog-architecture-split-2026-07-08.md) | Documentation | Changed | Split primary repair, audit, ledger, and closure-history docs out of `documentation/architecture/`; added changelog rules and master index. |
| 2026-07-08 | [`CL-20260708-ARCHITECTURE-FOLDER-REVIEW`](changelog/architecture-folder-review-2026-07-08.md) | Documentation | Audit | Reviewed remaining architecture docs, moved clear non-architecture files, and recorded split backlog for mixed files. |
| 2026-07-08 | [`CL-20260708-CHANGELOG-SYSTEM-RESEARCH`](changelog/changelog-system-research.md) | Documentation | Research | Researched professional changelog and documentation maintenance patterns and adapted them to this repo. |

## Historical Records

| Date | ID | Area | Type | Summary |
| --- | --- | --- | --- | --- |
| 2026-07-08 | [`CL-20260708-THCS-RUNTIME-BRIDGE-REPAIR`](changelog/thcs-runtime-bridge-repair.md) | Teacher Materials / THCS | Fixed | Recorded THCS runtime bridge repair, owned-only My Content correction, tombstone guard, and live verification evidence. |
| 2026-06-15 | [`CL-20260615-READING-V2-MATERIAL-REMOVAL-LIFECYCLE`](changelog/reading-v2-material-removal-lifecycle.md) | Reading V2 | Changed | Preserved material removal lifecycle notes, retired interpretations, audit/diagnostic expectations, and verification anchors. |
| 2026-06-15 | [`CL-20260615-READING-V2-RUNTIME-INTEGRATIONS`](changelog/reading-v2-runtime-integrations.md) | Reading V2 | Changed | Preserved runtime integration notes for host launch, anti-cheat, trusted submit, feedback, and monitor behavior. |
| 2026-06-08 | [`CL-20260608-READING-V2-STUDIO-REVIEW-ISSUES-CONTRACT`](changelog/reading-v2-studio-review-issues-contract.md) | Reading V2 | Changed | Preserved Studio review issue notes, Auto V4 handoff boundary, deprecated behavior, and regression evidence. |
| 2026-06-03 | [`CL-20260603-READING-V2-MATERIAL-PUBLISH-PASSAGE-LIBRARY`](changelog/reading-v2-material-publish-and-passage-library.md) | Reading V2 | Changed | Preserved material publish and passage-library notes, obsolete interpretations, runtime contract, and verification anchors. |
| 2026-05-24 | [`CL-20260524-READING-V2-AUDIT-TRAIL-CONTRACT`](changelog/reading-v2-audit-trail.md) | Reading V2 | Changed | Preserved audit-trail implementation contract notes, required event shape, registration rules, and rule interaction. |
| 2026-05-24 | [`CL-20260524-READING-V2-AUTO-V4-PROVIDER-REVIEW-CONTRACT`](changelog/reading-v2-auto-v4-provider-review-contract.md) | Reading V2 Auto | Changed | Preserved Auto V4 provider review notes, historical provider split, backend boundary, and historical evidence. |
| 2026-05-16 | [`CL-20260516-LOCAL-MAIN-WORKSPACE-SAFETY-PLAN`](changelog/local-main-workspace-safety-plan.md) | Repo Operations | Governance | Preserved local-main workspace safety plan, live evidence, deploy invariant, and recovery/deploy proof procedure outside the architecture root. |
| 2026-05-14 | [`CL-20260514-READING-V2-AUTO-SOURCE-LEDGER-REPAIR`](changelog/reading-v2-auto-source-ledger-and-repair.md) | Reading V2 Auto | Changed | Preserved historical source-ledger, verifier, and bounded repair companion for the Auto import pipeline. |
| 2026-05-12 | [`CL-20260512-HOMEWORK-RESULT-VISIBILITY-REPAIR`](changelog/homework-result-visibility-repair.md) | Homework Results | Fixed | Recorded teacher homework detail `Access Revoked` failure class and canonical visibility repair contract. |
| 2026-04-06 | [`CL-20260406-IELTS-WRITING-FAMILY-STABILITY-AUDIT`](changelog/ielts-writing-feature-family-stability-audit-2026-04-06.md) | IELTS Writing | Audit | Preserved feature-family stability audit, findings, test-harness blocker, and stabilization backlog. |
| 2026-03-25 | [`CL-20260325-RESULT-VIEW-FR-CLOSURE-MATRIX`](changelog/result-view-fr-closure-matrix.md) | Result View | Governance | Preserved PRD-0040/PRD-0041 FR closure matrix and later closure notes outside the architecture folder. |
| 2026-03-25 | [`CL-20260325-RESULT-VIEW-MAP`](changelog/result-view-map.md) | Result View | Governance | Preserved the older PRD-0040 surface map, phase notes, stale producer inventory, and migration history after concise current maps moved under `result-view/`. |
| 2026-03-25 | [`CL-20260325-RESULT-VIEW-PERMISSION-MATRIX`](changelog/result-view-permission-matrix.md) | Result View | Governance | Preserved the older unified permission matrix and reconciliation notes after concise current policy moved under `result-view/visibility-policy.md`. |
| 2026-03-25 | [`CL-20260325-RESULT-VIEW-VERIFICATION-MATRIX`](changelog/result-view-verification-matrix.md) | Result View | Traceability | Preserved result-view verification traceability outside the current architecture pack. |
| 2026-03-25 | [`CL-20260325-PRD0040-PREFLIGHT-LEDGER`](changelog/prd0040-preflight-ledger.md) | Result View | Ledger | Preserved PRD-0040 preflight ledger, frozen baseline, reassessment corrections, and verification notes. |

## Maintenance Rules

- New change-detail docs must start with a stable `Changelog ID`.
- Use date form `YYYY-MM-DD`; keep IDs immutable after publishing.
- Keep architecture docs current-state only. Move incident notes, repair evidence, audits, preflight ledgers, task closure notes, implementation logs, and migration histories here.
- Cross-link architecture docs to changelog details when history explains why a current contract exists.
