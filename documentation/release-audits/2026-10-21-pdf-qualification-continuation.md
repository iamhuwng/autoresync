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

## Authorized isolated staging follow-up

After the source checkpoint, the user explicitly approved provisioning the dedicated staging Firebase project, Worker, scoped identities/secrets, staging rules and QA teacher/student records. This approval does not include production release or production QA data. At source b99338ea all nine CI checks passed.

Project luyentap-pdf-qa-20261021 (861063423341), its Web app, asia-southeast1 default RTDB and native Firestore now exist. Firebase Auth was initialized through its console and read back as FIREBASE_AUTH; Email/Password and localhost domain were configured through the project-specific API. No billing account was linked. Eleven separate server identities and the 21 required secret values were prepared outside Git in a directory restricted to the current user and SYSTEM. Only the existing four QA B2 roles were selected, with their exact key IDs checked; no administrative B2 credential is included.

The first staging rules/index deployment exposed nine existing single-field COLLECTION definitions incorrectly listed as composite indexes. Firestore rejected them as unnecessary. The source file now retains all six actual composite definitions and its unchanged empty fieldOverrides, preserving automatic single-field indexing. A second deployment successfully released the candidate RTDB/Firestore rules and deployed indexes to the staging project only.

Configuration review also corrected the qualification instructions to build then preview instead of Vite development mode, enabled the integrity report gate, replaced the unused AI variable with the actual blank gateway setting, and explicitly fenced the ordinary upload fallback to the staging Worker. The generic notification browser endpoint has no ordinary notification handler in this Worker; those unrelated commands fail there. Book assignment notifications use the dedicated server emitter. Reading UI flags remain, but Reading runtime acceptance is outside this Book staging qualification and its submission endpoint stays blank.

Worker deployment, credential operations, QA seeding and authenticated browser acceptance are still pending at this point. The checked-in example still has no mutation policy; an authorized, expiring staging policy belongs in the actual qualification configuration. Do not infer remote Worker readiness from the prepared secrets or templates.

The subsequent Worker deployment attempt was rejected before activation: 68 secret/text bindings exceed the free plan's 64-binding limit. The qualification-only entry now expands one JSON connection-settings binding into the five existing validated B2 settings. It preserves all 21 distinct role secrets and fits exactly 64 bindings including the live rollout policy. Syntax and a focused assertion verified all five mappings, unchanged role-secret identity, unchanged request/context and absent-config behavior. No paid upgrade was selected.

All 21 secrets are uploaded to the new staging Worker, but this does not establish its executable deployment. Four staging Auth/profile identities, one teacher-owned class containing only the first student, the student class index and all six source-defined test types are seeded. The second student and teacher remain unauthorized negative-test identities. The notification identity has database administration only in the dedicated staging project because that emitter uses OAuth-backed writes. Browser acceptance and final Worker activation remain pending.

## Browser qualification and interrupted cold checkpoint

The staging Worker was subsequently activated at source78329225, version1e7a1ba0-7d03-457c-bc9b-a1cabcd99652. The OAuth-backed source/submission/integrity/notification roles have RTDB administration in staging only; document delivery has RTDB viewer. Scoped Firebase-claim consumers retain their separate keys. All nine CI checks passed at78329225.

The initial browser build exposed a configuration boundary error: Book-specific repo overrides selected staging endpoints, but Vite loaded Firebase from the machine shared env directory. The Teacher quick-login therefore used the existing production test account, whose normal login handler updates lastLoginAt, removes forceReauth and emits its security event. No Book creation or other material action was performed there; both tabs were closed. This was an unintended production login, not a production-free proof. The next build used a dedicated external LUYENTAP_ENV_DIR; all built JavaScript was checked for the staging project and absence of temp-a1437. Staging teacher login was independently confirmed by the staging profile's updated lastLoginAt and empty Materials.

Real local preview then exposed the missing blob: connect-src permission. The shared Book preview policy now permits the local PDF transport. The 14-page real fixture rendered, both fresh Unit Activities were previewed and approved, and the draft survived a browser reload. The full-PDF Create Book operation reached source_upload_account_state_unavailable; it has NOT completed. Do not recreate or retry blindly without inspecting its durable operation. The local draft is titled PDF QA Full 2026-10-21, with two Units (qa-full-unit-1/2), two Activities (qa-full-activity-1/2), full source pages1–4 and5–14 respectively. Browser-local exact export was not completed before interruption; original source PDFs and reconstruction inputs must remain available.

The evaluation composition also lacked a scoped canonical Activity reader. It now reuses the existing canonical reader credential mapping and exact book_activity_runtime_reader claims instead of generic OAuth credentials. Its23-test suite passed. Preview policy and local PDF transport passed8tests across2files. A same-entry typecheck for these changes reports377diagnostics for both baseline and current, no new diagnostics. This is comparative evidence, not a clean backend typecheck.

The requested cold checkpoint was interrupted before source commit, canonical overlay removal and final resume instructions. The continuing work must inspect actual Git/runtime/provider state instead of treating that checkpoint as complete. Production deployment remains unauthorized. Full/component online submission, delivery/reload/submit/result/notification and final hosted-origin proof remain open.
