# Teacher Writing Homework Result Access

Changelog ID: `CL-20261104-TEACHER-WRITING-HOMEWORK-ACCESS`
Master entry: [Master Changelog](../master_changelog.md)

Status: deployed and the two reported results repaired on 2026-11-04. Hosting/provider checks and live owner/unrelated-UID rule checks passed. The user explicitly waived browser verification; no browser flow is claimed.

## Incident and live evidence

The assigning teacher opening a submitted IELTS Writing homework sees `Access Revoked` after RTDB denies `test_results/{resultId}`.

Initial read-only production inspection on 2026-11-04 confirmed both reported result IDs (`-P5XSYK6Yo54qRPhEC8_`, `-P5XAvrl9IVAEjYRMGXo`) existed with `visibility.ownershipResolved: false` and no `result_notification_authority` receipt. Their canonical homework IDs and explicit Writing submission IDs agreed. The assignment targeted those students and identified the reported teacher account as creator. That initial inspection changed no live data; the later audited permission correction is recorded below.

The previous completion report based on frontend tests was premature. At initial inspection, `/homework-result-authority` was QA-pinned, its checked-in QA values were `disabled`, and its source-rules seal configuration was absent. A client call alone could not activate it. The later Worker publication below replaces that gate with the reviewed student-only authority contract. The live Firestore ruleset observed was `projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796`; its Writing submission create/read rules remain permissive. Do not treat that ruleset as a verified immutable Writing-source seal.

## Client correction

- After the canonical Writing result and homework attempt commit, call the existing authority verifier. A held/failed verification preserves the saved essay and uses the existing teacher-sharing warning.
- On an initial denied teacher modal subscription, use `getAuthorizedTeacherResult`, the shared authority verifier and ownership repair path. Resume a new realtime subscription only after it succeeds.
- Recover at most once. A denial after a received snapshot still clears data immediately. Closing or switching results cancels stale recovery callbacks.
- No RTDB read rule is broadened and no Firestore fallback exposes an essay. General receipt creation requires the submitting student; the separately audited operator correction covers only the two reported records.

## Verification and rollout boundary

Focused client and shared-authorizer checks cover successful recovery, failed recovery, resumed realtime revocation, stale recovery, and existing submission recovery. These local checks are separate from the production evidence below.

The production candidate now permits receipt creation only when the authenticated actor is the submitting student. Teachers may replay an exact existing protected receipt but cannot create one. The source cutover, correspondence, role, restore, collision and timestamp checks remain. This makes submitting one's own homework the authorization to share that exact saved result; it does not claim that mutable historical Writing fields prove original authorship.

The two reported records have a separate explicit operator permission repair in `scripts/repair-teacher-writing-homework-access.mjs`. Its scope is the owner's reported account, assignment, two results, students and test. It is an administrative correction authorized by the owner report, **not** student consent or historical source-provenance verification. The schema-2 ruleset/cutoff fields record the observed source-rule context; they do not retroactively seal historical Writing sources. The local repair plan and audit distinguish this exceptional operator grant from the general student-only endpoint. No other historical result is eligible. The tool verifies the actual operator principal, source correspondence and restore state; requires a fresh exact-source fingerprint, preflights collisions, creates receipts conditionally, records intent before writing and records each outcome. It never writes essays, scores, canonical identity or visibility. Cross-database checks cannot constitute a transaction; concurrent source changes stop subsequent work and the durable audit retains partial/unknown outcomes.

The existing shared authorizer repairs the visibility snapshot when a protected receipt makes a Writing result readable. Access denial after a received snapshot still clears the modal immediately. Browser verification is waived; the exact current RTDB rule test and live owner/unrelated-UID REST rule evaluation provide permission proof.

Hosting observation returned source revision `c8d7793347620fbb6da1ed6671024c6525ed4f83`. Its Reading table-answer hotfix was merged into the task branch, preserving both master-changelog entries. Its 66 runtime tests and 31 Studio tests pass. The first Studio invocation lacked Firebase fixture configuration and failed during collection; rerunning with the isolated test configuration passed.

The notification release changes only the authority verifier and its route gate in the retained active module. The entry module, public adapter, other command functions, Durable Object identity, limiter, secrets and schedules are preserved. Neither Firebase ruleset is deployed or loosened. The reviewed deployment configuration enables the student-only route and binds the observed source-rule context. The fixed native observer passed before and after deployment, independently reading provider/rules state twice. The historical October 18 observer and its pins remain unchanged.

## Published outcome — 2026-11-04

Implementation PR [#199](https://github.com/iamhuwng/autoresync/pull/199) merged as `985519569662e0b4f7190990b48c238a9b511be3` after seven CI checks passed. The isolated Hosting source is `7d9a6a8e47581a4e462ae9839d53b23977f44163`, based on the observed live source `c8d7793347620fbb6da1ed6671024c6525ed4f83`. It preserves live runtime outside the four reviewed client/test files. Guarded deployment rebuilt that source, passed bundle checks, and verified all 459 served file hashes and provider version `7aa139d3a0dc6ee9`. The custom domain also served the expected manifest.

Notification Worker source `9dc6bdb51469d19c983950994133275e5b46a24f` is deployed as version `7f4edb63-4727-4d0c-9e46-ade6dd51a602`. The fixed native postdeployment observer confirms the pinned artifact and unchanged public adapter, bindings and Firebase rules.

The exact operator repair created and read back both protected receipts at 08:30 UTC. It did not write canonical results, visibility, essays or scores. Live Firebase REST rule evaluation with the reported owner's UID returned HTTP 200 for both results; the unrelated UID returned HTTP 401 for both. This uses the supported administrator `auth_variable_override` to evaluate real rules, not a browser or Firebase Auth login. The same evaluation denied all four reads before repair. Existing shared-authorizer ownership normalization remains part of the next modal open and was not exercised in a browser.

Evidence filenames, publication journal identity, proof limits and recovery targets are in the [release record](../../release-audits/2026-11-04-teacher-writing-homework-access.md). Browser verification and rollback rehearsal were not performed.
