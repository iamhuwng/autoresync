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
  The three diagnostic Worker files were captured in commit `4a5761c4` for
  source provenance. The user then requested completing the interrupted
  diagnostic cleanup, so the final candidate removes those hooks and retains
  the publication correction. Live frontend bundles already contain no
  temporary upload diagnostics; no Hosting release is needed.
- Original repository regression: 3 failing tests reproduced absent runtime and
  lobby indexes and missing projection-failure recovery.
- Final affected Worker checks: 49 tests passed across six files, covering the
  projection, repository, RTDB client, authoring, uploads, and audio delivery.
- After diagnostic cleanup: the 20 affected upload/authoring checks passed
  again, and the clean Worker audited dry run passed.
- Audited Wrangler dry run passed. The ignored verification configuration only
  resolves existing canonical `pdfjs-dist` dependencies; production bindings
  and runtime settings are unchanged.
- UTF-8 and whitespace checks passed. No Hosting or Firebase rules changes.

The live test's existing successful publication operation can be replayed with
the corrected repository to reconstruct its missing projections. Restrict the
repair to its stable test/version identity and verify every resulting path.
The existing operation was replayed successfully: all 38 projection paths were
read back and verified. The real teacher Public Library search now displays
the exact title, 40 questions, IELTS Listening, and 50-minute duration. This
repair created no additional immutable version and changed no other material.

Local browser verification was unavailable because the local RTDB and Worker
were not listening. The authenticated deployed browser flow was verified
instead. Full test completion, grading, and a new large audio upload were not
repeated; the affected Worker contracts were covered by the checks above.

## Deployed result

Final source commit: `f5b7448baaad8f7595a959561cfffdcaabf815bb`.
Active Worker version: `a5fca24b-f1f3-41bf-ad4a-0a5e6097e737` at 100%.
The remote bundle matches the final audited build byte-for-byte, and all
temporary upload diagnostic marker families have zero occurrences.
Live Public Library proof is saved in `live-lobby-fixed.png`.
