# Teacher homework submission notifications

Changelog ID `CL-20261119-TEACHER-HOMEWORK-SUBMISSION-NOTIFICATIONS`
Master entry [Master Changelog](../master_changelog.md)

## Change

New homework submission notifications include the student’s display name and the
homework title from the verified saved result. The existing heading and link to
the teacher’s homework detail page are retained. For example, the message reads
`Student One submitted "Class Writing Homework".` Missing display fields use
neutral fallbacks. Each field is limited to 160 UTF-8 bytes. The Worker reads
three additional display fields in parallel with existing result reads. The
browser needs no extra requests, and existing notices retain their original copy.

The existing Worker checks the authenticated student, submission, assignment and
teacher recipient. The copy never accepts a caller-provided recipient or message.
Replaying an event preserves the existing notification and its read state.

## Verification

Implementation `712b42ff` merged through [PR #303](https://github.com/iamhuwng/autoresync/pull/303)
as protected `main` revision `977471487c042cd152967c90da99149cd83006cf`.
The [exact-main Release Safety run](https://github.com/iamhuwng/autoresync/actions/runs/44433171819)
passed, including notification workflows and integration. All 54 focused Worker
tests and six focused client tests passed locally. Broader local runs failed in
other areas, including Book/PDF dependency resolution and Book Homework progress.
The documented spare browser launcher does not configure a homework notification
endpoint, so an authenticated browser delivery journey was not verified.

## Production status — Unreleased

Wrangler's dry run on the merge revision produced the two expected modules with
SHA-256 `fc1ebdfddeb84b849c4393af050bf8bc082de04d1e4220f9a1f728022221146e`
for `notification-command-active.mjs` and
`72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270`
for the identical entry module. The historical production deployment config
has SHA-256 `593146eabea52d672fbb74da446d16241f3ed58b9f66232a6479ab5d801b3591`.

Cloudflare readback on November 19 found `luyentap-notification-command` at
100% on `7f4edb63-4727-4d0c-9e46-ade6dd51a602`, the recovery target. Its active
module matched the reviewed base byte for byte. The public adapter remained on
`5696e963-c5ed-463d-a495-30db3c07bc98`. The Writing authority setting, Durable
Object binding, rate limit, required secret names and trigger state were observed.
Firestore rules readback matched the recorded ruleset and source hash.

The [repository release assessment](../../system/release-safety.md#fixed-notification-homework-qa-correction-assessment)
returned `UNVERIFIED` for this new Worker candidate. The local Wrangler login
could not refresh, and the available Firebase CLI identity returned HTTP 401
for the production RTDB rules read. Publication is pending fresh, candidate-bound
Worker qualification with those authenticated readbacks. No production version
was uploaded or promoted.
