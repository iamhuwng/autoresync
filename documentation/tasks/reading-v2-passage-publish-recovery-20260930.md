# Reading V2 split-passage publication recovery — 2026-09-30

## Cause and correction

The publish pipeline generated canonical child passage metadata, snapshots, student-safe projections, composition references, and legacy catalog indexes. The Firebase publish adapter built universal MaterialSummary rows only for `material-metadata` operations. Auto-split child metadata arrived as `storage-write` operations with `writeKind: 'reading-passage-metadata'`, so indexed passage discovery could not find those children.

`readingV2FirebasePublishAdapter.service.ts` now passes both forms of Reading V2 metadata through `createReadingV2MaterialSummary(...)` and `buildMaterialSummaryIndexPlan(...)`, using each child's generated student-safe projection. The resulting writes remain in the same one-root atomic Firebase update. The master composition, canonical passage writes, legacy indexes, and visibility rules retain their existing paths.

The adapter regression test covers a three-passage full test: master and three canonical children, valid universal summary fan-out for every child, and discovery through `listTeacherReadingPassages(...)`. It also checks the existing one-passage full-test contract.

## Existing records

A targeted dry-run identified nine generated child passages belonging to three recent Cambridge IELTS 10 tests. Their canonical metadata and student-safe projections existed. The approved targeted repair reconstructed only the nine affected universal summary fan-outs (45 paths). No global reconciliation write was run; its earlier 232-operation dry-run is not current parity evidence. No data repair was repeated during this Hosting release.

## Release evidence

- Firebase project: `temp-a1437`; Hosting target: `kahut1`.
- Candidate source: `C:\tmp\reading-v2-release-candidate-20260930`, derived from the deployed release candidate `C:\tmp\thcs-release-candidate-20260930`. The publisher service was the only changed runtime source; the publisher test and current passage library test were copied for verification. `C:\tmp\lobby-release-candidate-20260930` remains available as the previous rollback baseline.
- Focused Reading V2 suites: 66/66 passed. Scoped ESLint passed. Production build passed with 9,492 modules and bundle budget OK (root entry 247 KB). The first build attempt stopped during esbuild under low available memory; a retry with a 3 GiB Node heap succeeded.
- Hosting-only deploy command: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1 --project temp-a1437 --config firebase.hosting-candidate.json --non-interactive`. Firebase reported 441 Hosting files, version finalized, and release complete.
- Both `https://hocthem.net/` and `https://kahut1.web.app/` served candidate entry `/assets/index-BNBtmXoC.js` (SHA-256 `C3BD828F0EE2D6C641CAE587673DD3E2FB18081F674424C54B6BAE65A45A49DA`) and publisher chunk `/assets/readingV2FirebasePublishAdapter.service-xeh3D3sH.js` (SHA-256 `F8976AD01B987A40FCF7B98134DC2F3EADEA74B06322C4AEED051ECD1A2C8374`) after deployment.
- Browser interaction could not be verified: the browser tool blocked the localhost tab action by URL security policy and explicitly prohibited retrying through another browser surface. Static deployed artifact readback succeeded.

This release changed Hosting only. It did not deploy backend, database rules, or indexes, and did not push Git changes.
