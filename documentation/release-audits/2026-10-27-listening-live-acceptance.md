# Listening live acceptance — 27 October 2026

The authorized Listening release and bounded recovery passed three targeted
production browser checks. Existing evidence was reused; this record adds no
test run, provider mutation or broader release claim.

## Deployed state

Hosting serves source `5090b7ef1e02562c4f0d873d2172a594df4ab29f`, tree
`8b30b3ce703e89aa30a28d64da487494d798e38b`, provider version
`91b45ecb32db1b58`. All 454 manifest hashes passed on `kahut1.web.app`;
`hocthem.net` served the same manifest and the browser flows below. Its fingerprint is
`88334098dea806847fc6fdbbc1a9187fd40e1236822f79619bca454bed941b24`.
Provider readback at 11:41 UTC is `hosting-provider-after.json`; the full
manifest observation is `hosting-after-editor.json`.

The Upload Worker serves correction source `25861289735ff13b954b4ecb5bd64c1336a38151`,
version `b2ae0aa6-53e2-4f6e-adf1-265fdcf7a3f1`, exact module
`a64f8889eec9256f4716b80d9ef6d5f870bc5d5881a2ceb8e1040be7375e5329`.
Its fresh fixed-profile postupload receipt passed at 11:27 UTC; other qualified
Workers, rules, runtime configuration and schedules remained unchanged.

## Three browser checks

1. The original assigned Cambridge student loaded the retained version
   `version-6b4dd66579b503122e39329ba3bc1fb6` with 40 questions and all six
   image pages. Each of four restored recordings reached readyState 4 with
   no media error and successfully sought to 60 seconds. The original attempt
   was not submitted. Evidence: `live-cambridge-acceptance.json` and section
   screenshots. An unrelated authenticated account received HTTP 403
   `delivery_not_authorized` for the same protected scope.
2. The private text QA assignment
   `homework-b52a29a7-0752-4798-bb1d-819685f63b6a` was actually submitted.
   Firestore records submitted status and the linked result ID; the RTDB
   result records 2/2, 100%. Evidence: `live-private-saved-result.json`.
3. After assignment, teacher changes to the source question, answer
   (`EDITED` to `BROWN`) and audio produced a new publication. The assigned
   student's document and grading key retained assigned version
   `version-ab0e870ac3861581b17d4241ffe2f544` and asset
   `T1ROiSlkXSYZqvAlIUXluA`, while source version
   `version-ce7716674818c2d03de203243308ff77` used a different asset.
   The saved result's correct answer remained `EDITED`, with 2/2 earned;
   evidence is `live-three-flow-summary.json` and the persisted result above.

## Bounded recovery and limits

The four user-approved replacement recordings were fully streamed and SHA-256
verified in R2. Recovery applied four registry compare-and-set writes, the exact
recipient grant and the Firestore assignment-version pin with compare-and-set.
Original question/version payloads and unrelated expired uploads were unchanged.
Evidence: `recovery-object-proof.json`, `recovery-admin-receipts.json` and
`recovery-r2-execution.json`. Temporary Workers, staging objects and probes were
removed and cleanup verified. An unsuccessful direct REST conditional probe
and interrupted/slow transfer attempts remain recorded; staging plus native
conditional copy succeeded. Those earlier attempts are not reported as success.

Evidence files are retained under the product checkout's ignored
`tmp/listening-live-release-20261027/`; the native Worker receipt is under
`tmp/release-receipts/`. Source digests prove the user-approved replacement
files, not the unavailable historical originals. Client-side grading remains
the existing authority model; structured groups remain under construction.
Rollback is prepared, not rehearsed, and does not undo saved data or R2 writes.
