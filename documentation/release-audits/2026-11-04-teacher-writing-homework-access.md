# Teacher Writing Homework Access Release

Status: Worker and Hosting published; both reported results repaired and live permission checks passed on 2026-11-04. Browser verification is explicitly waived by the user. Commit, verification, merge and production deployment are explicitly authorized in the task conversation. The execution plan below is retained as the reviewed plan; observed outcomes follow it.

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
6. Verify owner and unrelated-reader rules through Firebase. Browser verification remains waived. Record versions, hashes and actual outcomes before reporting publication.

The prepared Worker recovery target is command version `a184d75b-8823-485a-885d-e23354646f45`. Hosting recovery uses the independently observed prior live version. Recovery is not rehearsed and must not be described as proven. Worker/Hosting rollback does not remove protected receipts already issued; the exact operator audit identifies any exceptional grants needing an explicitly scoped permission reversal.

## Observed execution — 2026-11-04

PR [#199](https://github.com/iamhuwng/autoresync/pull/199) merged as `985519569662e0b4f7190990b48c238a9b511be3` after all seven CI checks passed. The exact isolated Worker source above was published first. Native postdeployment assessment passed with two independent provider readbacks:

- Command version: `7f4edb63-4727-4d0c-9e46-ade6dd51a602`, 100%.
- Active module, entry module and configuration hashes match the pinned table above.
- Public adapter version, RTDB rules and Firestore ruleset match the unchanged baseline above.
- Publication journal: `teacher-writing-homework-worker-20261104`.
- Native receipt: `tmp/release-receipts/writing-homework-worker-postdeploy-1793778991429.json`.

Hosting was prepared separately from verified live source `c8d7793347620fbb6da1ed6671024c6525ed4f83`. The candidate changes only four client/test files plus related documentation; all other runtime paths match that live source. It was committed and pushed on `release/teacher-writing-homework-hosting` as `7d9a6a8e47581a4e462ae9839d53b23977f44163`, tree `cd6f0ef0b90e5a07f0676f58fed7b6f0f4840c77`. Nine historical hotfix reconciliations passed in the source/base/manifest-bound compatibility review. The guarded `scripts/deploy-live.mjs` route rechecked the live baseline before and after building, validated production authority URL configuration, passed bundle-budget/local-value checks, then published Hosting only.

- Hosting provider version: `projects/temp-a1437/sites/kahut1/versions/7aa139d3a0dc6ee9`.
- Release time: `2026-11-04T08:27:23.761Z`.
- All 459 manifest-listed served file hashes passed native readback. `https://hocthem.net/.well-known/luyentap-release.json` independently returned the expected revision/tree.
- Shared publication journal record: `022ebd90-bc49-48a8-8894-571d27c21528`, `published`, verification `passed`.
- Predeployment receipt: `tmp/release-receipts/writing-homework-hosting-predeploy.json`; compatibility review: `tmp/release-receipts/writing-homework-hosting-compatibility.json`.
- Detached deployment exited 0; logs: `tmp/homework-access/hosting-deploy.log` and `.err.log`. The known static/dynamic-import bundler warning did not fail build or budget checks.

The separate exact two-record operator repair completed at `2026-11-04T08:30:44.424Z`, principal `iamhuwng@gmail.com`. Fresh plan `teacher-writing-repair-plan-1793781000481.json` bound source fingerprint `ce9eeb33f936ed62f95f29827139534696db5ec97624a0b29cb6825f55c7c467`. Durable intent/outcome audit `teacher-writing-repair-applied-1793781026995.json` records both receipts as `created` after conditional writes and readback. These files are under `tmp/release-receipts/`. Only the two protected authority receipts were written; essays, scores, canonical results and visibility were not mutated. This is an administrative permission correction, not historical authorship proof or fabricated student consent.

Live Firebase REST `auth_variable_override` evaluated the real owner UID `AkwZW3CT4AUvkMpJfgg9FwUh3ug2` and an unrelated UID with an existing verified Google operator token. It is rule evaluation, not a browser or Firebase Auth login. The same method returned permission-denied before the repair for all four reads, ruling out an administrator read bypass in this proof.

| Result | Reported owner | Unrelated user |
| --- | --- | --- |
| `-P5XSYK6Yo54qRPhEC8_` | HTTP 200, matching Writing result | HTTP 401, permission denied |
| `-P5XAvrl9IVAEjYRMGXo` | HTTP 200, matching Writing result | HTTP 401, permission denied |

Proof receipts: `teacher-writing-live-rules-before-1793778741731.json` and `teacher-writing-live-rules-after-1793781046506.json` under `tmp/release-receipts/`. Existing shared-authorizer visibility normalization runs on a later modal open; that UI flow was not exercised. Browser verification and rollback rehearsal were skipped. Provider, API-rule, emulator and local test evidence must not be described as a verified browser session.

Local implementation verification included 49 client/shared-authorizer tests, 51 retained Worker tests, the exact-current RTDB emulator regression without skipped branches, 69 existing release/checker tests, four fixed-profile tests and two repair-validator tests. ESLint, UTF-8, diff and Mantine boundary checks passed. The preserved Reading hotfix passed 66 runtime and 31 Studio tests. An initial Studio collection lacked dummy Firebase environment and passed after correcting that test harness configuration.
