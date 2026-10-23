# Listening publication discovery correction — 2026-10-24

The trusted Listening publisher committed immutable versions without updating
`tests/{testId}` or the universal material summary indexes. A successful publish
therefore returned to an empty lobby search. Live inspection confirmed the
40-question `IELTS Cambridge 21: Test 1 - Listening` version was active, while
both projections were absent.

The Worker now synchronizes the latest canonical version into the launch record
and shared summary fan-out before reporting publish success. Idempotent replay
repairs a failed projection without creating another version. Archive updates
remove discovery rows; replay cannot restore an archived version. Concurrent
publish/archive changes trigger projection convergence. Runtime updates use
individual fields and preserve attempt statistics and existing creation fields.
Catalog summaries remain metadata-only.

## Source and verification

- Isolated base: `1299617ed871cc0e4100f1c3b1c5b8346c295117`, the stable Reading
  MCQ release source; its tree equals diagnostic cleanup commit `b457f752`.
- Observed prior Worker: `r2-upload-signer`, version
  `0204f76d-e1bd-4595-96f3-492a332ecb38`, allocated 100%.
- Deployed source matched the stable bundle plus temporary upload diagnostics.
  The three diagnostic Worker files are preserved in commit `4a5761c4`.
- Original repository regression: 3 failing tests reproduced absent runtime and
  lobby indexes and missing projection-failure recovery.
- Final affected Worker checks: 49 tests passed across six files, covering the
  projection, repository, RTDB client, authoring, uploads, and audio delivery.
- Audited Wrangler dry run passed. The ignored verification configuration only
  resolves existing canonical `pdfjs-dist` dependencies; production bindings
  and runtime settings are unchanged.
- UTF-8 and whitespace checks passed. No Hosting or Firebase rules changes.

The live test's existing successful publication operation can be replayed with
the corrected repository to reconstruct its missing projections. Restrict the
repair to its stable test/version identity and verify every resulting path.
This is separate from deploying the Worker; local checks alone do not prove
the deployed version or the repaired live browser flow.
