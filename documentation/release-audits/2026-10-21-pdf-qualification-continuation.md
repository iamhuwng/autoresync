# PDF qualification continuation — October 21, 2026

Status: source checkpoint locally verified; authenticated browser, isolated online qualification and fresh Windows recovery remain open. No merge, deployment, production QA records, secret provisioning or donor ownership transfer.

The interrupted successor's changes and decisions were treated as untrusted. Trusted PDF5f14fdf6 independently reproduced the two coverage-suite failures (19/21 pass) and the stale THCS rule hash failure (behavior tests did not execute). The entire4e397c72 delta was reviewed against actual runtime selectors/codecs and exact RTDB expressions. Fresh checks then passed21coverage tests,32schema fixtures,25registry/manifest/codec tests,8THCS/notification real-emulator tests and28Book submission real-emulator tests. These establish local source/emulator proof, not online or browser acceptance.

## Historical combined-document review

Original authority: documentation/tasks/PRD0062/component-pdf-recovery-execution-plan-2026-09-14.md, Lane E-core: result source review opens the pinned combined document at the combined page, with safe component-local provenance. The wrong-model chat's single-source decision is withdrawn. This implementation retains multiple sources, pages and groups; it does not port donor per-component byte viewers.

Immutable publication versions now pin student-document version, descriptor revision, byte checksum and complete descriptor fingerprint. Both trusted component publication and atomic Book submission populate the pin; mapping-only publication retains it. Exact historical lookup rejects absent/mismatched pins and never chooses the latest descriptor or scans matching component sets. Earlier unpinned publications remain unavailable for PDF review rather than guessed or backfilled.

Production result projection now supplies historical context. A transient publication read fails before immutable result-detail creation and retries the already committed terminal tuple; it is not permanently recorded as missing context. Verified absence/malformed context can still project result facts without document capability.

Historical byte delivery validates exact retained binding/publication identity, all local-to-combined mappings, recipient/context/teacher authority, document version/checksum/size and verified storage lifecycle. Component-private byte routes are denied. The viewer opens the combined page while preserving component-local provenance. It does not guess the Worker's opaque ETag from the raw checksum; server checksum verification and client byte-length bounds remain enforced.

The final affected source/UI and Worker reruns, comparative TypeScript and source governance checks passed as recorded below. Earlier fixture/syntax failures were corrected before those affected reruns. These checks do not establish browser or online acceptance.

## Independent online configuration audit

Read-only Wrangler secret-name inspection of luyentap-book-source-canonical-preview returned15names. Submission key, B2 delete key ID/key, evaluation key and integrity key are absent. Existing names do not prove credential validity. gcloud active account/project were inspected before listing all temp-a1437 service accounts; no submission, activity-evaluation or integrity runtime identities exist in that project.

B2 CLI confirms existing separate QA roles under bookpdf prefix book-source/prd0062-preview-20260729/pdf-qa-20261019/: writeFiles; listFiles/readFiles; readFiles; deleteFiles. No key values were printed, no roles were created and no remote objects were written/deleted. CLI administrative credentials are not Worker credentials.

The checked-in preview config still targets real temp-a1437, localhost source origin, an expired October5–6 rollout policy and disabled submission. It is not an isolated online qualification config and must not be deployed unchanged. Staging rollout lifetime is at most24hours; issue a fresh policy only for an authorized qualification window.

Concrete proposed qualification boundary: separate Worker luyentap-book-qualification; dedicated Firebase staging project (proposed ID luyentap-pdf-qa-20261021, availability/provisioning unestablished); existing restricted QA B2 prefix; teacher localhost5173 and student localhost5174 using explicit HTTPS Book Worker endpoints. Keep existing catalog/editor and Reading capability settings. An app served locally against real remote services is real-service qualification, distinct from final hosted-origin proof. Staging Firebase Auth/web-app setup and scoped service accounts/keys must match that project; production keys/placeholders must not be copied into it. Production release remains a separate target and approval.

No staging Firebase project is established by this work. A dedicated project and bounded QA data/service provisioning require the outstanding exact authorization; full teacher/student real-service acceptance cannot be claimed before those resources exist. Existing production approvals were scoped and consumed.

## Local qualification and preservation limits

PR167 recovery source fixes are independently reviewed and committed at aa166ddf; five CI checks pass there. Actual fresh bootstrap/checkpoint/cold restore remains unqualified: the donor owns9000/8080 and machine-wide Java/checkpoint tasks, no disposable Windows VM/Sandbox was found, and native Windows Java failed its loopback selector. An isolated WSL Java listener19000 qualified rules only; it is not the Windows recovery runner. User AGENTS, original donor dataset/profile/Test1, separate IELTS/student-design work and latest Reading multiple-answer source remain preserved.

Evidence is in canonical ignored tmp/pdf-reviewed-*.log and tmp/pdf-historical-*.log. Counts overlap unless explicitly grouped; none substitutes for authenticated browser or provider deployment proof.

## Verified source checkpoint

The new historical-review changes passed49unique source/UI tests in6files (48initial tests plus31affected final tests with overlap), and118unique Worker tests in8files with failed fixtures/syntax corrected and affected suites rerun. The final real RTDB submission suite passed28/28against the new pinned publication payload; no tests skipped in these final source/Worker/rule suites. The early diagnostic single-test filter skipped unrelated tests and is not counted as full-suite proof.

Standard app `tsc --noEmit` passed after fixing three new unknown-value narrowing errors. A same-entry backend comparison against4e397c72 reported377diagnostics versus385baseline and no new diagnostics. This broader backend graph is not globally type-clean. Existing workerd optional canvas-loader warnings did not prevent the qualified assertions from executing; PDF rendering/browser behavior remains a separate unverified layer.

`wrangler.book-qualification.example.jsonc` is a concrete nonsecret proposed staging config; Wrangler dry-run compiled it successfully without deployment. The paired `env.book-qualification.example.txt` explicitly selects staging Book endpoints and preserves catalog/editor/Reading presentation settings. REQUIRED Firebase Web app values must be supplied from the proposed staging project after provisioning. The config includes separate server roles for submission/evaluation/integrity/notifications and all four B2 roles. Its rollout action policy is deliberately absent, so mutations remain fail-closed until a reviewed <=24h policy is issued. This is a reviewable preparation artifact, not evidence that the project, Worker, secrets or complete app configuration exist remotely.

Current blocking gates remain full fresh Windows recovery and real-service authenticated teacher/student acceptance, including final hosted-origin behavior. No authenticated browser proof is claimed for the historical viewer. Production release, rules deployment and new production QA records remain unauthorized. Do not mark the overall assignment complete from this source checkpoint.
