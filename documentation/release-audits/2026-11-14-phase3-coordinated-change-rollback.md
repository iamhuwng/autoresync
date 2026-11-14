# Phase 3 coordinated change and rollback experiment

Status: **VERIFIED for the release-orchestration contract** on 14 November 2026 (Asia/Bangkok). This is isolated release-assessor evidence; it is not authorization to deploy a backend service.

The experiment used disposable Git fixtures and the existing read-only release assessor:

- `coordinated frontend/backend candidates require backend-first ordering and preserve rollback limits`
- `frontend rollback is rejected without bound backend compatibility evidence`

The first fixture changed a Hosting artifact, a Worker source path and Firebase
rules together. The assessor classified all three services, required Worker
readiness before activating frontend consumers, required additive rules/indexes
before dependent clients, and retained the recovery limit that Hosting rollback
does not reverse database changes. It also emitted negative compatibility findings
for both the frontend/Worker and frontend/rules combinations.

The second fixture changed frontend content and a Worker source path as an
incompatible rollback candidate. Without a source/base/live-bound compatibility
review the assessor rejected the candidate (`UNVERIFIED`, never `PASS`) and
retained the same Hosting rollback limit.

Partial-failure and no-duplicate-publication behavior remains covered by the
existing isolated operation tests:

- `publication with failed readback resumes the same operation without another deployment`
- `verification repairs an interrupted remote receipt after local publication was settled`
- `readback drift leaves draft recoverable and refuses a trusted handle`

Focused execution passed both new coordination tests, all 7 promotion tests,
all 4 workflow-contract tests, all 7 optional browser-tool tests, and all 26
archive/recovery tests. No production or qualification provider was mutated.

This closes the Phase 3 coordinated ordering, negative compatibility, partial
failure, recovery-limit and incompatible-frontend-rollback criteria at the
release-orchestration boundary. Provider-specific Worker, rules, storage and
data releases retain their own native qualification and authorization gates.
