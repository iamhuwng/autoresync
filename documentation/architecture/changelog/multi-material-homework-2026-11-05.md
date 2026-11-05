# Separate homework for multiple selected materials

Changelog ID: `CL-20261105-MULTI-MATERIAL-HOMEWORK`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Implementation and integration

Feature commit: `8e0e81f2896590cf05ff878edb6bd7b86347a1bd`, fast-forwarded into `main` on 2026-11-05.

Teachers can select multiple assignable materials, including mixed test types,
choose recipients once, and configure each material separately. Required fields
control progression. Only the final Create Homework action submits the batch;
each material creates its own assignment. Selected Reading Passages stay
separate rather than becoming an automatic master test.

THCS uses its existing type-specific controls inside the shared assignment
modal. Calendar buttons do not submit the form, and review preserves settings
when returning to configuration. Confirmed recipients remain fixed for later
materials. The modal cannot be dismissed during assignment submission.

After a definitive partial failure, retry skips confirmed assignments. Network,
timeout, server, and malformed-success responses have uncertain outcomes and
block automatic resubmission; teachers must check Homework before assigning
again. THCS retains its committed notification event. Notification delivery is
best effort and was not verified through the real recipient inbox in this run.

Local development now routes homework assignment requests to the separate
Worker on `localhost:8788`, while Book endpoints stay on `8787`. Local unsigned
tokens require the exact isolated emulator configuration and retain normal
role and ownership checks. Snapshot replacement preserves the prior snapshot
until replacement succeeds, including the Windows rename fallback.

Current contract: [Teacher Materials bulk selection](../teacher-materials-bulk-selection-actions.md).
Local topology: [local and live deployment](../../system/local-live-deployment.md).

## Verification

- Modal and request-client suites: 45 passed across three files.
- Focused lobby batch/retry cases: four passed. Full lobby suite: 67 passed,
  one PDF Book guided-setup test failed outside this workflow.
- Worker authentication/assignment suites: 54 passed across two files.
- Local Firebase and deployment-safety suites: 41 passed.
- Touched app ESLint, UTF-8 and Git whitespace checks passed.
- Clean production build, bundle budget and local-value scan passed for the
  feature commit. This was build-only and performed no remote mutation.
- Root TypeScript still reports four Listening errors in
  `listeningTestEditing.ts`, `ListeningAudioReplacementNotice.tsx`, and
  `listeningSubmissionClient.ts`; these files are unchanged by the feature.
- Supplementary localhost reads confirmed the teacher login route, local Auth,
  29 users, 32 classes and 72 tests in `demo-luyentap-local`. The assignment
  Worker answered OPTIONS and rejected an unauthenticated POST with 401.
  These reads do not prove authenticated assignment creation.
- In-app browser verification was blocked by an unavailable browser access
  host. No browser acceptance or recipient-notification proof is claimed.

## Release status

**Unreleased. No Hosting, Worker, rules, or data deployment was performed.**

The guarded assessment of the clean feature commit against independently read
Hosting revision `f294ec80abc1cb94d33a29aa3d11a5df0c0a7d48` returned
`UNVERIFIED`. Its local receipt is
`tmp/release-receipts/mixed-homework-8e0e81f2-preflight.json`.

The full diff against the actual deployed revision includes Worker and Firebase
surfaces. The checker requires separate current Worker/provider evidence,
frontend/backend compatibility review and explicit reconciliation of prior
hotfix differences. Neither a local build nor the narrower feature diff clears
those requirements. The release checker and deployment gates were preserved.
