# Isolated homework Worker candidate

Status: source candidate only; no deployment or authenticated workflow acceptance.

This service branch starts at `422b7323f85a5b235d387cd18b25a1b9f63df46a`,
preserving the Book backup dependencies used by the active backup Worker.
Reconstructed main has separate Book validation changes and must not be used
as a substitute bundle for this scoped release.

The recipient correction preserves ID/name alignment during blank filtering,
teacher-owned alias canonicalization and deduplication. Blank optional UIDs keep
their member key. Administrator scope and the existing grant boundary remain.
The shared Reading submit source also retains the deployed assignment-owner
and material binding and boolean `teacher_result_keys` index. Its Functions
source caller is updated with the same assignment input; deprecated Functions
generated artifacts and deployment are outside this service candidate.

The backup package pins jose 6.2.2 and Wrangler 4.103.0. The lock selects
esbuild 0.28.1 and workerd 1.20260617.1. Reuse existing matching dependencies
when checking this worktree; do not install a dependency tree here. Windows
Worker tooling uses the approved x64 Node route.

Local verification on 2026-10-18: **92 tests in 15 backup Worker files passed**,
including 37 assignment tests and three Reading submit route tests. The shared
Reading submit core separately passes all eight tests. This older
base has four restore-execute tests; main-based PR #150 has five and totals 93.
The different totals are intentional and are not interchangeable evidence.

The actual dry-run bundle was compared with the provider-read active module
`reading-release-candidate.mjs`, SHA-256
`c789454458790c5fb0893952043a150b34cefa345c5b02b06c1f04edddad112b`.
Outside the reviewed `resolveTarget` function, comparison permits only build
dependency debug-path prefixes, CRLF, source-map comments, and moving an
asserted-identical 98-line pure declaration block. It asserts all other code
matches. This is reviewed equivalence, not historical deployed Git provenance.
Fresh readback and a clean-source rebuild must remain paired before release.

Local scripts, provider readback, build output and comparison receipts are in
the canonical checkout's ignored `tmp/deployment-audit-20261017/` directory.
No provider upload/deletion or live recipient notification delivery is proved
by the mocked route tests. Local Firebase emulator tokens are deliberately
incompatible with the production JWT verifier; do not weaken that boundary.

Release still requires authenticated recipient workflow qualification, fresh
provider/bundle proof, a reviewed service release and separate authorization.
PDF Book, Listening cleanup, public student feedback pages and the design pack
are excluded from this deployment scope.
