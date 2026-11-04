# Teacher Writing Homework Access Release

Status: notification Worker published and verified; client Hosting publication and exact-record repair remain pending. Browser verification is explicitly waived by the user. Commit, verification, merge and production deployment are explicitly authorized in the task conversation.

## Exact Worker scope

Product revision: `9dc6bdb51469d19c983950994133275e5b46a24f`.
Product tree: `52efc93bee4498a8b966f58c7f2854666ba78216`.
Reviewed base: `2feb29e558aefdc8ee09440c272e1a3b0685c6a6`.

Only `luyentap-notification-command` is deployed by the Worker phase. The active module allows the submitting student to authorize receipt creation; teachers may only replay an exact existing protected receipt. All current source correspondence, cutoff, role, collision and restore checks remain. The route is explicitly enabled in the fixed production configuration. The original October 18 observer/pins are preserved.

| Artifact | SHA-256 |
| --- | --- |
| Active module | `ff2f130d7d33d1b32f2cde3e6c9bd9bee833a03d6484b2fa031bf95970cf709c` |
| Unchanged entry module | `72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270` |
| Deployment configuration | `593146eabea52d672fbb74da446d16241f3ed58b9f66232a6479ab5d801b3591` |
| Bytes outside the two reviewed authority functions | `1fe376a161f57869ec7c7c86b37586e0403754ee7ee754da3b06a8a2c8c952b6` |

Baseline command version: `a184d75b-8823-485a-885d-e23354646f45` at 100%.
Unchanged public adapter: `5696e963-c5ed-463d-a495-30db3c07bc98` at 100%.
Unchanged RTDB canonical rule-tree SHA-256: `99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520`.
Unchanged Firestore ruleset: `projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796`.

The fixed observer in `scripts/release-writing-homework-evidence.mjs` binds the product revision/tree, complete changed-path list, exact module/configuration hashes, and two native Cloudflare/Firebase observations. It verifies unchanged public adapter, routing, secret names, Durable Object namespace, rate limiter, schedules and both Firebase rulesets. Caller JSON and pure validators cannot create a trusted observation. Generic Worker releases retain `UNVERIFIED`.

Run from the tooling checkout, selecting the clean, dependency-free product worktree:

```powershell
node scripts/release-check.mjs --cwd tmp/writing-homework-worker-candidate --mode release --base 2feb29e558aefdc8ee09440c272e1a3b0685c6a6 --observe-writing-homework-worker --worker-phase predeploy --receipt tmp/release-receipts/writing-homework-worker-predeploy-final.json
```

The final pinned candidate returned native `PASS`; the actual retained Worker regression and current-rule emulator test executed without skipped branches. The Wrangler dry-run emitted exactly the two pinned modules. Independent source review found the modal repair race, which was corrected before the final pin. The reviewer then found no additional concrete Worker blocker; tests and provider readback were run by the main agent, not independently rerun by the reviewer.

## Execution and recovery

1. Merge the reviewed source and qualify the exact pinned Worker again immediately before execution.
2. Deploy `documentation/release-audits/notification-writing-homework-release.wrangler.json` through the existing repository Wrangler route. This preserves the reviewed entry/active modules and all unrelated behavior. It removes the obsolete authority QA actor/result variables and sets only the reviewed authority activation/source-context variables.
3. Repeat the fixed observer with `--worker-phase postdeploy`. No Firebase rules, data migration, other Worker or storage deployment belongs to this step.
4. Build and deploy a separately qualified Hosting hotfix from the observed live source plus the client correction. Verify `VITE_HOMEWORK_RESULT_AUTHORITY_URL` in the exact production environment and artifact. Do not deploy unrelated main-versus-live changes.
5. Apply only the exact two-record operator permission repair described in the [changelog](../architecture/changelog/teacher-writing-homework-access-2026-11-04.md), with a fresh plan, explicit intent audit, identity/source rechecks, create-only receipts and per-record readback. This administrative correction is separate from student-authorized issuance and does not claim historical authorship proof. Canonical essays, scores and identity fields are not written.
6. Verify actual authenticated teacher reads and unrelated-reader denial through Firebase. Browser verification remains waived. Record versions, hashes and actual outcomes before reporting publication.

The prepared Worker recovery target is command version `a184d75b-8823-485a-885d-e23354646f45`. Hosting recovery uses the independently observed prior live version. Recovery is not rehearsed and must not be described as proven. Worker/Hosting rollback does not remove protected receipts already issued; the exact operator audit identifies any exceptional grants needing an explicitly scoped permission reversal.

## Worker execution

PR #199 merged as `985519569662e0b4f7190990b48c238a9b511be3` after all seven CI checks passed. The exact pinned Worker product was deployed as version `7f4edb63-4727-4d0c-9e46-ade6dd51a602` at 100%. Fresh predeploy and postdeploy native assessments passed. The postdeploy receipt is `tmp/release-receipts/writing-homework-worker-postdeploy-1793778991429.json`; publication is also recorded as `teacher-writing-homework-worker-20261104` in the shared release changelog. Both Firebase rulesets and the public adapter remained unchanged.

The first production rule evaluation reproduced denial for both owner reads and both unrelated reads, using the supported Firebase REST auth-variable override. This exercises actual deployed UID-based rules, not an interactive Firebase Auth login or browser session. The receipt is `tmp/release-receipts/teacher-writing-live-rules-before-1793778741731.json`. IAM-based Firebase Auth test-token minting was unavailable; no IAM role, password, account or API-key restriction was changed for testing.
