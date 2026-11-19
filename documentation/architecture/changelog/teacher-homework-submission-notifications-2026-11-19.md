# Teacher homework submission notifications

Changelog ID: `CL-20261119-TEACHER-HOMEWORK-SUBMISSION-NOTIFICATIONS`
Master entry: [Master Changelog](../master_changelog.md)

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

## Production status — Released

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
Firestore rules matched the recorded ruleset and source hash. Production RTDB rules matched the merge revision's canonical SHA-256 `98436fd7f6528718e9fc4cacd4da8b2226feb27dc8bc52b25e38cd06d6162223`.

The exact-candidate native preflight passed twice before promotion, including
Cloudflare version-specific module bytes, Worker settings and bindings, the
public adapter, RTDB rules and the Firestore ruleset. The inactive version
`c7ddf424-1874-4b0d-bd56-1e56d6542cbb` was uploaded with tag
`teacher-homework-97747148`, then promoted to 100% in deployment
`54238096-cf62-49a0-b961-3828dab838fc`. The post-deployment native readback passed
with fingerprint `4869e6da3862bc4c4f9486170ea6fe4f4d8ba439a053cd4b1a57cc263ae3a4bf`.
The rollback target remains `7f4edb63-4727-4d0c-9e46-ade6dd51a602`.

The release used the account-and-Worker-only traffic configuration so promotion
and rollback did not synchronize non-versioned settings. The public adapter
returned 401 for an unauthenticated request and 400 for an incomplete event
without writing data. Browser delivery with a disposable teacher and student
journey was not verified because the spare launcher has no qualified homework
notification endpoint. Existing focused Worker and client tests, protected-main
checks and 25 notification panel/destination tests passed.