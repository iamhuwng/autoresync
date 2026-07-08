---
title: THCS Runtime Bridge Repair
description: Historical THCS runtime bridge repair, MaterialSummary synchronization, owned-only My Content correction, and 2026-07-08 live evidence.
createdAt: '2026-07-08T00:00:00.000Z'
updatedAt: '2026-07-09T00:00:00.000Z'
tags:
  - changelog
  - teacher-materials
  - thcs
  - material-summary
  - firebase
---

# THCS Runtime Bridge Repair

Repo source: `documentation/architecture/changelog/thcs-runtime-bridge-repair.md`.

This is a repair/live-evidence note, not a bare architecture contract.

Current authority:

- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/universal-material-summary-integration.md`

Current THCS Teacher Materials contract:

- My Content is owned-only active MaterialSummary v1 rows
- runnable THCS tests need `tests/{testId}` with `testType: 'THCS-THPT'`
- Firestore `thcs_library` is metadata support, not My Content authority
- linked/use-as-is public THCS tests do not appear in My Content
- repair must respect newer MaterialSummary `removed` tombstones

2026-07-08 live proof:

- `temp-a1437` THCS bridge repair reached zero-op postwrite dry run
- `hungnguyenzim@gmail.com` showed 13 owned active THCS tests in My Content
- intentionally deleted `Retake` stayed absent
