# PRD0062 #126 production-proof gate — 2026-08-23

Status: **BLOCKED after verified rollback**.

This is the superseding deployed/browser evidence for the prior local status
`LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED`. It records the exact reviewed
artifact/configuration attempt, live readback, browser boundary, rollback, and
post-rollback durable-state readback. It does not close #126.

## Candidate and authority

- Product source candidate: `36ce82eb784c02d35e1b499e182e2ebcaca92d9f`.
- Documentation branch before this evidence: `6c6978db81031164f7f5539e1b77dae935e04af8`.
- Windows ARM64 build harness `af2a041d-e3f9-496e-8437-97a6e6eb3fa8`: Vite 7.1.11, 9,504 modules, 441 files, 11,857,741 bytes; bundle budget passed.
- Local deterministic manifest SHA-256: `5a1672df27ace4e1694019df0642573c3b0cd681a8ea74cf31ce5cb2eb04dfae`.
- The exact committed assignment was consumed read-only. No assignment replay, projector write, or new production data was authorized or observed.

The active recovery plan, 2026-08-15 amendment, bridge §24 overlay, Windows Git/harness contract, and #126 scope all remained authoritative. Listening, WSL authority migration, forensic-ref cleanup, and later PRD tickets remained out of scope.

## Authentication and remote identity

Firebase CLI, gcloud, and Wrangler authenticated as `iamhuwng@gmail.com` for
Firebase project `temp-a1437` (project number `171016256749`) and Hosting site
`kahut1`. Wrangler identified the target account as `Iamhuwng@gmail.com's
Account` with the relevant account/user read, Workers/scripts/routes write,
and tail-read scopes. Secret values were neither printed nor persisted; only
expected secret binding names were read back.

## Artifact, Hosting, rules, and Worker proof

The finalized Hosting live version was `441f1599cd45b6d1` at
`https://kahut1.web.app`. Its entry index SHA-256 was
`081f99341248c68a2cc6d0b404fe096cb6d4b780e9f624bf6cb45050b10e30d5`, and the
four initial assets matched the local build byte-for-byte. Preview finalized
as `c8ebe49d6a053557`.

The deployed RTDB rules SHA-256 was
`c972adec4a36a2ae1777dc9ea0e89dcb38e3838f8d4310bd3697230591e4d412`, equal to
the checked-in `database.rules.json`. Firestore ruleset
`projects/temp-a1437/rulesets/c8061403-2130-4837-97f8-a5dce3852f3a` read back
with source SHA-256
`c797cb35a66abaf3dd9e9d109d05cb7a9ae6cf32952f7c16e6a990452c0fdc47`, equal to
the checked-in rules.

The activation config included the exact saved Backblaze B2 source identity,
the source-provider state enabled, launch-only pilot scope, enabled Homework
read/Delivery/document/Runtime read paths, and disabled create/upload/publish/
assign/mutation/full-publication surfaces. Its redacted operational config
hash was `f9e5e8fddcf6021ba2ff3455ac92a531b702b51234bfbd767173ac2370f2221d`.

The corrected activation version was uploaded and read back as
`ca28629a-624d-4f4b-97e3-60be56b8f45f` and deployed at 100% under harness
evidence `25f221b7-33fb-4b6a-a32a-d85089ad90f7`. The deny-only rollback config
hash was `5854056722c198363ff878d1b6a2d2027ebe6f5b99978e8b9c64c5f24661895a`.

## Browser result

Using the built-in teacher and student quick-login paths against the real
Hosting origin, harness run `da0a9176-9c5f-46f1-becd-ed308e67f68b` proved:

- teacher Homework → Book detail → trusted progress/student row: **PASS**;
- student Homework → Book detail → Open Book Activities → Runtime shell,
  viewer shell, activity pane, and Activity navigation: **PASS**;
- ordinary student Homework remained visible with 30 ordinary cards;
- read-only Book Delivery and launch calls returned HTTP 200;
- no forbidden Worker mutation calls, assignment replay, projector write, or
  page error occurred; and
- the real document HEAD and a redacted authenticated GET probe returned HTTP
  503 with `document_configuration_unavailable`.

Therefore the reference-only/PDF focus required by taskbox 5.8 and the active
production-normal definition did not pass. The Runtime shell was reached, but
the document delivery boundary did not initialize. This is not local,
emulator, or dry-run proof.

## Failure diagnosis and rollback

The response is emitted by
`cloudflare/src/upload-worker/book-source/document.ts:455-463` when its default
document runtime cannot initialize. The exact source trace shows that
`document.ts:311-317` constructs `FirebaseRestBookHomeworkDocumentStore` with a
new environment object containing the project, identity, and service-account
key but not `FIREBASE_WEB_API_KEY`; the repository's default claim-token
provider requires that key at `book-homework/repository.ts:609-615`. The
missing B2 bucket binding was corrected and read back, but the same 503
remained, proving the failure is a separate source-composition boundary before
B2 object access.

Per the active recovery plan's production-failure rule, the corrected deny-only
rollback version `bbc55301-0c59-4edf-a6d6-bb527b7f3080` was uploaded, inspected,
and deployed at 100%. Readback harness `5071edf2-8b32-42d9-8c19-13d696160743`
confirmed 100% rollback traffic. A direct Worker probe then returned HTTP 404
fail-closed. The exact RTDB/Firestore rules and byte-identical Hosting artifact
were retained because neither was the failing boundary.

## Durable state after rollback

Post-rollback readback proved the existing state was preserved:

- RTDB root: committed/committed, revision 7, one recipient, one committed
  recipient, one recipient child, operation identity present;
- Firestore Book Homework authority: one document, revision 2, committed;
- Firestore compatibility collection: 49 documents, exactly one matching Book
  compatibility document with its marker and source/saga revision fields;
- Firestore Book Homework Delivery collection: zero documents; and
- the legacy RTDB homework-assignment path remained absent.

The assignment fingerprint prefix remained `fe8318dc1edb`. No unexpected
durable mutation was observed.

## Truthful disposition and handoff

#126 remains **BLOCKED**, not closed. No product source correction was selected
or committed because the certified starting authority explicitly required the
green local rule-enforced boundary to remain unchanged and prohibited
speculative source mutation. The remaining owner is the Book source document
default-composition seam. A future bounded correction must be reviewed, rebuilt
from the exact source SHA, re-read back at the Worker/config/claims/rules/state
surfaces, and rerun through the teacher/student/Runtime browser contract.

A separate post-#126 task may evaluate a fresh ext4 WSL clone through full
burn-in before any authority change. That future evaluation is not part of this
ticket. Main, Listening, unrelated production data, forensic refs, WSL
authority, and later PRD tickets were untouched.
