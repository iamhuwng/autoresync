# Backend baseline qualification — 2026-10-17

Scope: read-only comparison of candidate backend contracts with deployed providers. No source edits, deployments, key-validity probes, data writes, or provider inference requests. Evidence was refreshed around 12:20–12:24 UTC.

Candidate: `C:/Users/The Lord/.codex/worktrees/live-baseline-reconstruction-20261017/luyentap-prd0062`, HEAD `7f0d782e94807cea0acda65e1eb814974ef5e6d3`. Initial status clean. Final status has other-task modifications to `src/pages/StudentPracticePage.tsx` and its test; this reviewer did not modify them. Regenerate full candidate identity/release receipts after those edits are committed and checked.

## Decisive provider evidence

- `backend-qualification-provider-refresh.json`: direct Cloudflare GETs of deployments, active version/bindings, deployed module content, schedules, and public OPTIONS responses. Stored source/hash/metadata only; OAuth credentials were never printed or retained in the report.
- `backend-qualification-rules-refresh.json`: direct Firestore release/ruleset GET; fresh RTDB attempt is separately classified below.

### AI gateway: restored candidate contracts match the active implementation

Active `thcs-gemma` version `09d2b77a-03ec-40ff-b0c9-933a9b007325` remains at 100%. Deployed module `thcs-gemma-worker.js` has 67,420 characters and SHA-256 `d98ffd26e89ef7c1da8639681393b5be24e66b077a95f8e2ab43922f6e6074a7`.

Bundled candidate source with its current installed dependency tree, Wrangler keepNames behavior, and navigator.userAgent define. Whitespace/syntax-normalized code was equal after exactly two reviewed substitutions: local jose user-agent version v6.2.3 versus live v6.2.2, and insertion order of the same kahut1.web.app/hocthem.net CORS Set entries. Both final normalized hashes are `768a0e66fbb97d8441e771dd15944f365357d39bed706bf7509f14c2b4bc9b88`. This is explicit reviewed equivalence, not byte identity or Git provenance. No other dependency or application-code difference remained.

Live bindings include Workers AI, AI_KEYS KV namespace `3dcc67de4309453fb6ba789b7a357215`, limiter namespace `205513`, production Firebase project/DB, and the GEMINI_RELAY_TOKEN secret NAME. No secret values or KV contents were read. Candidate `cloudflare/wrangler.thcs-gemma.jsonc` agrees on the non-secret binding identifiers and compatibility date. Source clients in `src/services/api-keys.service.ts` and `src/services/ai/browser-provider-clients.ts` use the existing /ai/keys, /ai/groq, and /ai/gemini contracts, Firebase ID-token auth, and key IDs. Deployed allowlists contain the same Gemini/Groq models. All three production-origin preflights returned204 and the expected CORS methods.

No AI Worker release is needed to activate this candidate frontend. An incidental Worker rebuild would change a dependency header string without fixing the gateway contract. Authenticated key metadata and real provider execution were not exercised; no provider-key validity claim is made.

### Ordinary notifications: source and deployment already align

Command/DO host `luyentap-notification-command` version `541166ae-93db-4d92-8eda-5fb291325b42` is still100%. Its TWO deployed modules are byte-identical to candidate checked-in `cloudflare/notification-release/notification-command-active.mjs` and `notification-command-entry.js`:

- active module SHA-256 `4aafcc20e5ebe7d10f1d83c12ec952067500096e339de9ba8c2009e4a52cf91d`;
- entry module SHA-256 `72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270`.

Actual public entry is `luyentap-notification-firestore-qa`, NOT notification-command-qa. It remains version `5696e963-c5ed-463d-a495-30db3c07bc98` at100%, binding the command host NotificationBridgeObject. Its read-back1927-character wrapper explicitly handles /events, /homework-result-authority, /course-enrollment-approval (plus /writing-product), production/local origins, bearer syntax, JSON/body-size boundaries, and forwards to the same named DO instance. Candidate frontend callers use these ordinary paths and template endpoints. The candidate public.js file is the command-host entry; it is not the separate public-entry deployed module. Do not redeploy it as though both Workers share one script.

All three ordinary production-origin preflights returned204. Command schedules remain empty. Existing October17 audit records additionally contain unauthenticated401,44 Workerd tests,113 frontend/service tests and browser consumer/read persistence proof. These are different proof classes; byte identity and preflight do not claim a new authenticated delivery was performed.

No ordinary notification Worker release, new cron, migration, or retry expansion is indicated for baseline frontend restoration.

### Firebase rules: no semantic change currently needs a release

Fresh Firestore GET returned ruleset `projects/temp-a1437/rulesets/8fcf3e1c-1a56-4138-8e4c-24cc594c5316`. Candidate `firestore.rules` is semantically identical after comments/whitespace removal. Both ALREADY deny browser settings/api_keys access. Earlier maintenance prose describing this as a candidate/live behavioral difference is now stale; no Firestore rules release is necessary for this frontend.

Candidate `database.rules.json` equals the existing October17 direct live rule snapshot structurally (object-key ordering ignored), including ordinary notification paths. The fresh RTDB OAuth GET returned401; requesting database/email-scoped refresh then failed Firebase reauth. This is an evidence-auth limitation, not a product authorization failure. No RTDB release is justified by the preserved snapshot. If requiring an immediately current no-drift assertion, refresh only the deployed RTDB rules readback via the previously working authorized provider route; do not deploy rules to compensate for unavailable readback.

## Pending backup Worker UID fix — separate change

Active backup version is `f37869c0-c597-41cc-893b-7f7652d80e41` at100%. Direct deployed-source readback shows resolveTarget returns raw direct-target studentIds and builds authorizedStudentIds from them. It does not contain the pending canonicalStudentIds mapping. This positively confirms the fix is not released; Hosting never supplied it.

Canonical dirty diff is limited to `r2-backup-worker/src/homework/assignments.ts` and `assignments.test.ts`: teacher-owned class member aliases map to Auth UID after authorization; canonical IDs are deduplicated and used in target, count, and authorization projection. Its regression covers one member-key target. The root symptom is credible: `src/services/homeworkManager.ts` queries target.studentIds with the authenticated UID; notifications also consume target IDs.

Do not mix this into baseline restoration. Before a dedicated release, retain existing reject/authorization coverage and add only focused cases for canonical ID plus alias deduplication and corresponding studentNames alignment. IDs are deduplicated while names are retained unchanged; index-based displays (`useTargetGrid`, teacher detail, writing import) can associate the wrong later name after deduplication. Also resolve scope of super_admin direct assignments: that branch never builds alias mapping. A narrow teacher-alias fix should state this limit instead of claiming all direct-target assignments are normalized. Validate nonempty entry.uid if accepting legacy data where that field can be empty. No fix was ported, edited, or tested here.

## Minimal release path and remaining checks

1. Finish/commit the separately owned candidate correction, recheck clean source, and regenerate source/environment-bound build and compatibility receipts.
2. Use reviewed production endpoint environment (handled by the separate environment task). Contract inspection supports keeping current AI and ordinary Workers/rules, so the maintenance release can remain Hosting-only. Record their current versions as external dependencies rather than redeploying unchanged backends.
3. Refresh RTDB readback only if immediate rule drift proof is required; current snapshot equality is explicitly dated evidence. An authenticated read-only /ai/keys smoke with administrator/teacher roles can verify operational metadata availability without testing provider keys. New authenticated notification creation and actual provider execution need separately scoped acceptance and are not proved by this report.
4. Bootstrap the approved manifest-bearing Hosting artifact through the documented pre-manifest route, then read back the manifest/assets/current release and perform authenticated browser consumer checks against the live frontend. Do not claim historical Hosting Git identity, or use the pre-manifest UNVERIFIED receipt as proof of guarded deploy readiness.
5. Keep PDF Book and the UID backend correction in separate qualification/release scopes. If the UID fix is later selected, order its verified Worker release before frontend acceptance that depends on canonical targets; no rule/index change was identified for that fix.

Skipped: authenticated remote data mutations, real AI inference, provider-key probes, new browser runs, and redundant test reruns. Risk: operational provider failures are still possible despite proven contract/source agreement; historical Hosting source provenance remains unavailable until bootstrap, and fresh RTDB rule proof is currently auth-limited.
