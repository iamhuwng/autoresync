# Teacher Writing Homework Result Access

Changelog ID: `CL-20261104-TEACHER-WRITING-HOMEWORK-ACCESS`
Master entry: [Master Changelog](../master_changelog.md)

Status: notification Worker deployed and verified as version `7f4edb63-4727-4d0c-9e46-ade6dd51a602`; client Hosting publication and the exact-record permission repair remain pending. The user explicitly waived browser verification on 2026-11-04; runtime, permission and provider checks remain required.

## Incident and live evidence

The assigning teacher opening a submitted IELTS Writing homework sees `Access Revoked` after RTDB denies `test_results/{resultId}`.

Read-only production inspection on 2026-11-04 confirmed both reported result IDs (`-P5XSYK6Yo54qRPhEC8_`, `-P5XAvrl9IVAEjYRMGXo`) exist with `visibility.ownershipResolved: false` and no `result_notification_authority` receipt. Their canonical homework IDs and explicit Writing submission IDs agree. The assignment targets those students and identifies the reported teacher account as creator. No live data was changed.

The initial completion report based on frontend tests was premature. At initial inspection, `/homework-result-authority` was QA-pinned, its QA values were `disabled`, and source-context configuration was absent. The qualified Worker rollout has since replaced that disabled gate with student-only issuance. The live Firestore ruleset observed was `projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796`; its Writing submission create/read rules remain permissive. Do not treat that ruleset as a verified immutable Writing-source seal.

## Client correction

- After the canonical Writing result and homework attempt commit, call the existing authority verifier. A held/failed verification preserves the saved essay and uses the existing teacher-sharing warning.
- On an initial denied teacher modal subscription, use `getAuthorizedTeacherResult`, the shared authority verifier and ownership repair path. Resume a new realtime subscription only after it succeeds.
- Recover at most once. A denial after a received snapshot still clears data immediately. Closing or switching results cancels stale recovery callbacks.
- No RTDB read rule is broadened, no Firestore fallback exposes an essay, and no authority receipt is manually granted.

## Verification and rollout boundary

Focused client and shared-authorizer checks cover successful recovery, failed recovery, resumed realtime revocation, stale recovery, and existing submission recovery. These are local implementation checks, not evidence of production access.

The production candidate now permits receipt creation only when the authenticated actor is the submitting student. Teachers may replay an exact existing protected receipt but cannot create one. The source cutover, correspondence, role, restore, collision and timestamp checks remain. This makes submitting one's own homework the authorization to share that exact saved result; it does not claim that mutable historical Writing fields prove original authorship.

The two reported records have a separate explicit operator permission repair in `scripts/repair-teacher-writing-homework-access.mjs`. Its scope is the owner's reported account, assignment, two results, students and test. It is an administrative correction authorized by the owner report, **not** student consent or historical source-provenance verification. The schema-2 ruleset/cutoff fields record the observed source-rule context; they do not retroactively seal historical Writing sources. The local repair plan and audit distinguish this exceptional operator grant from the general student-only endpoint. No other historical result is eligible. The tool verifies the actual operator principal, source correspondence and restore state; requires a fresh exact-source fingerprint, preflights collisions, creates receipts conditionally, records intent before writing and records each outcome. It never writes essays, scores, canonical identity or visibility. Cross-database checks cannot constitute a transaction; concurrent source changes stop subsequent work and the durable audit retains partial/unknown outcomes.

The existing shared authorizer repairs the visibility snapshot when a protected receipt makes a Writing result readable. Access denial after a received snapshot still clears the modal immediately. Browser verification is waived; the exact current RTDB rule test and authenticated remote reads are the required substitutes for permission proof.

Hosting observation returned source revision `c8d7793347620fbb6da1ed6671024c6525ed4f83`. Its Reading table-answer hotfix was merged into the task branch, preserving both master-changelog entries. Its 66 runtime tests and 31 Studio tests pass. The first Studio invocation lacked Firebase fixture configuration and failed during collection; rerunning with the isolated test configuration passed.

The notification release changes only the authority verifier and its route gate in the retained active module. The entry module, public adapter, other command functions, Durable Object identity, limiter, secrets and schedules are preserved. Neither Firebase ruleset is deployed or loosened. The reviewed deployment configuration enables the student-only route and binds the observed source-rule context. A fresh fixed native observer must verify the exact candidate and unchanged provider/rules state twice before deployment. The historical October 18 observer and its pins remain unchanged.
