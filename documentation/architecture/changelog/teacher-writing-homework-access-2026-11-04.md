# Teacher Writing Homework Result Access

Changelog ID: `CL-20261104-TEACHER-WRITING-HOMEWORK-ACCESS`
Master entry: [Master Changelog](../master_changelog.md)

Status: prepared client correction; **not deployed or verified in the production browser**.

## Incident and live evidence

The assigning teacher opening a submitted IELTS Writing homework sees `Access Revoked` after RTDB denies `test_results/{resultId}`.

Read-only production inspection on 2026-11-04 confirmed both reported result IDs (`-P5XSYK6Yo54qRPhEC8_`, `-P5XAvrl9IVAEjYRMGXo`) exist with `visibility.ownershipResolved: false` and no `result_notification_authority` receipt. Their canonical homework IDs and explicit Writing submission IDs agree. The assignment targets those students and identifies the reported teacher account as creator. No live data was changed.

The previous completion report based on frontend tests was premature. The existing `/homework-result-authority` route is QA-pinned, its checked-in QA values are `disabled`, and its source-rules seal configuration is absent. Calling it from a new client does not activate it. The live Firestore ruleset observed was `projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796`; its Writing submission create/read rules remain permissive. Do not treat that ruleset as a verified immutable Writing-source seal.

## Client correction

- After the canonical Writing result and homework attempt commit, call the existing authority verifier. A held/failed verification preserves the saved essay and uses the existing teacher-sharing warning.
- On an initial denied teacher modal subscription, use `getAuthorizedTeacherResult`, the shared authority verifier and ownership repair path. Resume a new realtime subscription only after it succeeds.
- Recover at most once. A denial after a received snapshot still clears data immediately. Closing or switching results cancels stale recovery callbacks.
- No RTDB read rule is broadened, no Firestore fallback exposes an essay, and no authority receipt is manually granted.

## Verification and rollout boundary

Focused client and shared-authorizer checks cover successful recovery, failed recovery, resumed realtime revocation, stale recovery, and existing submission recovery. These are local implementation checks, not evidence of production access.

Production resolution still requires a qualified authority service and source-rule provenance, authenticated issuance for the existing reported submissions, then real teacher browser verification. Preserve the verifier's release gates until that evidence exists.

Hosting observation returned source revision `c8d7793347620fbb6da1ed6671024c6525ed4f83`, which differs from current main. Reconcile and review the complete live-to-candidate delta before deployment; do not replace unrelated live changes with a narrow client fix.
