# AI Worker service audit — 2026-09-24

Status: migration release blocked; this is not a production completion record.
The dated checkpoints below supersede earlier observations where stated.

All inference and infrastructure added for this migration must remain on free
tiers. Do not enable paid plans, credits, automatic top-ups, or billed fallback.
Quota exhaustion must fail or move to another configured free provider.

## Current caller map

| Feature | Shared AI path |
| --- | --- |
| THCS restructuring, repair, unsupported-type conversion | THCS parser: Groq Qwen → dedicated Worker Gemma → Gemini |
| THCS answer inference | Gemini rotation → browser Worker adapter |
| Reading V2 automatic import | Gemini provider structured generation → browser Worker adapter |
| Older document extraction / passage and question parsing | AI router → Gemini/Groq providers → browser Worker adapter |
| Missing-answer generation and bulk answer-key import | AI router → provider methods → browser Worker adapter |
| Alternative fill-in and writing answers | AI router → provider methods → browser Worker adapter |
| THCS writing auto-grading | THCS writing grading service → AI router → browser Worker adapter |
| IELTS writing suggestions and grading assistance | Writing suggestion service → AI router → browser Worker adapter |
| Formative feedback, including saved-result feedback | Formative feedback service → Gemini rotation/Groq → browser Worker adapter |
| Progressive feedback | Progressive feedback service → Gemini rotation → browser Worker adapter |
| Hybrid document extraction | Hybrid Gemini provider → Gemini rotation → browser Worker adapter |
| Listening test builder “AI Parse” | Listening router → local listening parser; no provider request in this path |

The production-source scan found no remaining direct Groq/Gemini SDK imports or
provider URLs under `src`, excluding test mocks. Key discovery returns opaque
Worker key IDs. Provider requests attach the signed-in user's Firebase token;
the Worker resolves active credentials in KV.

## Correction in this continuation

The shared providers incorrectly treated a loaded adapter as proof of successful
key initialization. After an initial failed or empty Worker inventory, grading,
suggestions, extraction, and connection checks could remain unavailable for the
session. Retry initialization whenever no clients exist. Groq must also return
its cached import promise on the retry, rather than returning undefined.

Two recovery regressions failed before the correction. The corrected provider
tests pass. Transport checks additionally cover Gemini structured options and
response metadata, and Groq quota error propagation without browser bypass.

## Evidence checkpoint at `bf52a04b`

- App checks: 104 tests in nine files passed; a second set of 119 tests in six
  files passed, including Reading V2 import, Listening parsing, THCS writing
  grading, and adapter contracts. These sets overlap; do not sum their counts.
- Touched-file ESLint and `git diff --check` passed.
- Six dedicated Worker tests passed using the existing Windows x64 Node runtime.
  The Vite production build and bundle budget passed with the isolated
  checkout's sanitized environment (`LUYENTAP_ENV_DIR` set to that checkout).
- Real Edge browser at `http://localhost:5173/admin/settings` displays four
  Gemini and six Groq records, all active. No key values were printed.
- Actual browser adapters against the deployed Worker: Groq Qwen returned `OK`;
  Gemini returned HTTP 400 `FAILED_PRECONDITION`, with the unsupported-location
  error. A direct machine-side request using the selected Gemini key returned
  `OK`; this is not proof of the Worker route.
- Worker deployment inspection found version
  `e0548bc5-9345-4959-84d7-b9d26d1e7e34` at 100% traffic, with no Gateway experiment
  secrets restored.
- Google project `temp-a1437` billing is disabled. The Gateway dashboard shows
  $0 credits and Require Provider Credentials enabled. After the approved key
  save retry, a fresh Gateway page still reports Google AI Studio not configured.
  The CLI-authenticated passthrough probe returns HTTP 401 before reaching Google.

Do not deploy the application cutover or Firestore key lockout until secure,
free Gemini access works. Reading V2 has a Gemini-specific extraction contract;
silently substituting Groq is not an equivalent fix. Full feature-browser QA and
the exact 158-question source fidelity run remain required after that blocker
is resolved. The previous successful sample run predates the secure cutover and
does not satisfy this gate. Preserve the source Firestore records and other
tasks' work. Coordinate Hosting releases with task
`01a0d224-f1ad-79d3-bb86-59382608f0e3`.
That task replied that it is paused and has no newly verified Hosting state;
its reply is not a release lock or proof of the current Hosting artifact.

## Final experiment and preservation checkpoint — 2026-09-24

The user authorized one replacement account-scoped **AI Gateway Run** token and
one final provider-native BYOK experiment, with no provider-key header and no
Unified Billing fallback. Gateway `gemini-byok-probe` now has a successfully
linked Google AI Studio `default` provider configuration. Authentication and
Require Provider Credentials are enabled; logging, caching, and automatic
retries are disabled; the dashboard shows $0.00 credits.

The documented provider-native base was
`https://gateway.ai.cloudflare.com/v1/e41db829dabe9993f03674afdfd56510/gemini-byok-probe/google-ai-studio`.
Only `cf-aig-authorization: Bearer <Run token>` authenticated the requests;
`cf-aig-no-wholesale: true` and `cf-aig-collect-log: false` were retained.
No `x-goog-api-key` was supplied.

| UTC time | Surface and request | Observed result |
| --- | --- | --- |
| 16:46:45 | Machine → provider-native `/v1/models/gemini-2.5-flash:generateContent`; `Hi`, one output token | HTTP 200, `MAX_TOKENS`, no text. This proves only the minimal v1 request succeeded. |
| 16:52:34 | Authenticated application request → remote Worker preview → same v1 Gateway route; `Reply OK.`, 16 output tokens, `thinkingBudget: 0` | HTTP 400 `INVALID_ARGUMENT`: thinking is unavailable in v1 and requires v1beta. Validation failure is not feature-inference proof. |
| 16:53:14 | Same remote Worker integration using v1beta as required by that probe's thinking option | HTTP 400 `FAILED_PRECONDITION`: `User location is not supported for the API use.` |

Correction to the progress commentary: `thinkingConfig` was introduced in the
verification request; current feature callers do not set it. It is therefore
incorrect to claim that every feature requires v1beta, or that the final minimal
v1 experiment failed. Real feature compatibility through the v1 route remains
unverified. The actual Worker v1beta integration remains blocked by the upstream
Gemini free-tier egress/location restriction. No further endpoint, placement,
binding, alias, header, or token experiments were performed after that failure.

The temporary Run token was revoked successfully (HTTP 200); its local secret
file and the earlier temporary probe script were removed. The remote preview
was stopped. The stored BYOK/default secret remains configured. The unshipped
provider-native integration was discarded, and the live-disproved binding
change `33e72b67` was reverted. The three reverted Worker files are identical to
their versions at `bf52a04b`. Its provider recovery fix and the independently
proven Groq, CORS, authentication, KV key migration, and role security work remain.

No Hosting cutover, Firestore key lockout, source-key deletion, or alternative
provider substitution is authorized by this failed integration. Preserve
production's existing Gemini path. In particular, Reading V2 Auto V4 remains
Gemini-only under its [provider review contract](reading-v2-auto-v4-provider-review-contract.md).

### Past-day work preservation

- Scanned 61 locally available conversation logs updated in the preceding day,
  covering 63,550 records, then read the relevant final messages and current
  source. Snapshot cutoff: 2026-09-23 16:39:37 UTC.
- Captured HEAD, status, and tracked binary-diff hashes for all 16 existing
  worktrees. The canonical Book checkout has 397 changed status entries; it
  was excluded from every AI edit, stage, restore, and deployment.
- The AI worktree contains `77bcf94c` (THCS editor fixes), `070d2d3c` (the shared
  Hosting source checkpoint), and `bf52a04b`; ancestry was checked directly.
- The paused notification candidate remains on its separate branch at
  `a016917e`. Its staged secret-only Worker version contains an old script and
  must not be activated by itself. No notification deployment was performed.
- Fresh Firebase CLI readback confirmed live Hosting version `aea32fa07517146f`,
  released at 09:06:05 UTC. The AI preview channel is a separate artifact;
  neither is replaced as part of this rollback.

### Architectural decision required

1. Retain the currently functioning production Gemini path temporarily. This
   preserves service behavior and the free-tier constraint, but leaves the
   browser-key cutover incomplete.
2. Authorize a billing-capable regional Google backend. This changes the
   provider/egress boundary, but requires an explicit exception to the current
   free-tier-only requirement; no billing or regional backend was enabled.
3. Benchmark free alternative providers against the contracts below before
   authorizing a provider change. Quota exhaustion must fail closed, without
   paid fallback. A benchmark is not permission to replace Gemini silently.

| Feature contract | Required alternative-provider evidence |
| --- | --- |
| Reading V2 Auto V4 | Full-document passage/group/question/answer coverage, source-coordinate fidelity, valid structured output, notes/tables/flowcharts/diagrams, correct answer binding, canonical-safe Studio handoff, and unchanged review/publish blockers. Whole-test Groq fallback is prohibited by the current contract. |
| THCS import, repair, conversion, and answer inference | Re-run the exact 158-question source; retain every question, option, source passage, numbering, and answer association; verify inferred answers and repair fidelity. |
| Older and hybrid extraction; missing/bulk/alternative answers | Preserve section boundaries, question types, answer labels, accepted variants, word limits, and machine-readable response shapes without inventing source content. |
| THCS writing grading; IELTS writing suggestions and grading assistance | Preserve current scoring/teacher-review behavior and structured suggestion output; benchmark correctness and rubric agreement on representative teacher-reviewed examples. No separate automatic IELTS band-grading service was identified in the caller audit. |
| Formative, saved-result, and progressive feedback | Verify question-linked evidence, correctness classifications, actionable feedback, JSON shape, and current-versus-previous progress claims. Progressive feedback currently calls Gemini directly through the shared rotation adapter. |
| Listening builder | Its current “AI Parse” path is a local parser, so no provider replacement is required there. Provider-based feedback and answer services still require the applicable checks above. |

Full feature-browser verification and the secure production cutover remain
incomplete. Passing local transport tests or the one-token v1 probe does not
close those gates.

## Rollback readback — 2026-09-25

- Commit `1afe264e` reverts `33e72b67` and records the experiment. Six dedicated
  Worker tests, UTF-8 validation, diff checks, and Wrangler dry-run passed.
- Deployed only `thcs-gemma` at 06:26:45 UTC. Wrangler readback confirms version
  `dbb3a5c6-43b2-43cf-99a9-8f4a638ed2ab` at 100% traffic, with the original KV,
  AI, rate-limit, and Firebase bindings and no Gateway variable or token secret.
- At 06:28:41 UTC, the real browser adapter at `http://localhost:5173` returned
  `OK` from Groq Qwen through the deployed Worker, with finish reason `stop`.
  The key inventory still contains four Gemini and six Groq records, all active.
- Fresh Firebase readback confirms Hosting is still `aea32fa07517146f` and
  Firestore ruleset `c8061403-2130-4837-97f8-a5dce3852f3a` was last released on
  2026-08-23. Neither Hosting nor Firestore was deployed in this continuation.
- All 15 other worktrees retained the snapshot's HEAD, status listing, and
  tracked binary-diff hash. This comparison does not hash untracked file contents.
- No new Gemini inference request, provider substitution, billing change, or
  notification deployment was made during the rollback continuation.

## Deno Free relay diagnostic — 2026-09-25

The isolated AI worktree now contains a minimal authenticated Deno relay at
`deno/gemini-relay/main.ts`. Deno Deploy playground `vague-squid-5659` serves
`https://vague-squid-5659.hocthem.deno.net`; `GEMINI_API_KEY` and `RELAY_TOKEN`
are masked Secret variables. Unauthenticated `/health` returns 401, while an
authenticated health request returns 200. The relay sends the key only from its
runtime to Google's fixed `v1beta` Gemini 2.5 Flash endpoint and does not log
payloads or credentials. `deno check` and `deno fmt --check` pass. No Cloudflare
AI Gateway configuration or billing change was made for this experiment.

The account is on Deno Free without a billing card. Its live deployment setting
is **All Regions: `ord, ams`**. The region editor says single-region selection
requires an upgrade, so this is **not a fixed-US deployment**. A successful
relay request alone cannot prove that a US-only Gemini egress boundary is
available under the current free-only constraint.

Using the same Worker KV Gemini key (key 1), model, `v1beta` endpoint, and
application passage-stage generation options, the first 7,260-character source
excerpt produced transient upstream 503 `UNAVAILABLE` on both Cloudflare and
Deno, then HTTP 200 on both; direct machine inference also returned 200. The
exact full 24,373-character source from `Cam 10 reading Test 3.md` produced:

| Route, same key 1 and 30,654-byte provider request | Result |
| --- | --- |
| Machine → Gemini | HTTP 200, `STOP`, 17,075 response-text characters |
| Authenticated Cloudflare Worker → Gemini | HTTP 200, `STOP`, 17,080 characters |
| Authenticated Deno Free relay → Gemini | HTTP 200, `STOP`, 17,071 characters |

The real teacher browser Auto V4 import first succeeded through the Worker on
Gemini keys 2 and 3 and opened a 40-question, three-passage Studio draft. It
revealed an independent local source-copying bug: when Questions 1–4 preceded
the Passage 1 prose, Studio copied only the 96-character timing instruction.
The source-backed extraction was corrected in the isolated worktree; all 44
focused import tests pass. A subsequent real browser import through the Worker
produced all questions 1–40 and passage lengths 5,085, 5,577, and 6,031
characters. Passage 1's editor contains its first and final prose, without
the preceding question instructions. The sample has no answer-key section, so
the draft correctly retains empty answers and blocks publishing for review.

Between those successful browser runs, the same full passage-stage request on
Gemini key 4 returned Worker HTTP 400 `FAILED_PRECONDITION`, `User location is
not supported for the API use.` The identical payload and key 4 later returned
HTTP 200 from the machine and the same live Worker. The Worker active deployment
was read back as `dbb3a5c6-43b2-43cf-99a9-8f4a638ed2ab` at 100% traffic.
This is intermittent upstream location behavior, not proof that key 4 is bad,
nor proof that Deno fixes Cloudflare egress. All key records remain active.

No Deno integration into feature traffic, Hosting cutover, Firestore key
lockout, alternative-provider substitution, or paid fallback has occurred.
Fresh remote readback still shows Hosting version `aea32fa07517146f` and
Firestore ruleset `c8061403-2130-4837-97f8-a5dce3852f3a`.
The secure Gemini path remains unaccepted until location failures have a proven
free-tier backend resolution and the remaining feature contracts pass through
it. Production's existing Gemini path remains intact.

## Groq rotation correction — 2026-09-25

The isolated worktree now retries the next active Groq key after actual
provider 401, 403, or 429 failures in chunk parsing, structured JSON,
writing grading, answer suggestions, and writing suggestion batches. Rotation
only temporarily benches a failed slot; it does not deactivate or delete any
stored key. Worker user throttling and account/auth failures are identified
separately, so those errors do not bench healthy provider keys. The Worker
still returns a distinct user-level `rate_limited` response; no browser-secret
fallback was added. Focused application tests pass (including Reading V2),
as do the Worker route tests using x64 Node. These changes have not been
deployed to production. Touched-file ESLint, Deno check/format, and
`git diff --check` pass. The full TypeScript check still exits 2 on existing
Book/material and other unrelated diagnostics; none name the changed AI or
Reading import files.

## Fixed-US Deno relay comparison — 2026-09-27

Deno Deploy's CLI created `gemini-us-relay` on the account's Free plan. Live
settings show its single deployment region as **United States (`ord`)** and
the endpoint as `https://gemini-us-relay.hocthem.deno.net`. This supersedes the
Playground-specific region restriction above; the older Playground deployment
remains global. The new app has Secret variables for the same active Gemini
key 1 and an independent relay token. Unauthenticated `/health` returns 401;
authenticated `/health` returns 200. No Cloudflare AI Gateway or paid inference
was configured.

The exact full Reading V2 passage-stage provider payload used above (30,654
bytes, Gemini 2.5 Flash, `v1beta`) was repeated with the same key:

| Route | Result |
| --- | --- |
| Machine → Gemini | HTTP 200, `STOP`, 17,180 response-text characters |
| Authenticated Cloudflare Worker → Gemini | HTTP 400 `FAILED_PRECONDITION`, unsupported user location |
| Fixed-US Deno relay → Gemini | HTTP 200, `STOP`, 17,071 characters; close-timed confirmation after the Worker failure also HTTP 200, `STOP`, 17,079 characters |

The Worker request normalized to the same prompt parts and generation options
as the direct/Deno provider payload. The Worker location failure is intermittent
on prior evidence, but this comparison establishes a successful US egress path
at the time the Worker failed with that key and real feature-shaped request.
The next step is a Worker → Deno canary preserving Worker authentication,
key selection, quota behavior, and the existing Gemini response contract.
Production Hosting and Firestore remain unchanged until feature validation.

## Authenticated Worker → fixed-US Deno canary — 2026-09-27

The isolated AI branch routes Gemini from the existing authenticated Worker to
the fixed-US Deno Free app. The Worker retains Firebase authorization, account
status checks, per-user rate limiting, KV key selection, and the browser
response contract. It passes the selected key to Deno over HTTPS with a
Worker-only relay token; Deno sends it to Gemini. Missing relay configuration
returns 503, and provider errors return through the same route without a
browser-key or paid Cloudflare inference fallback. Groq still uses the Worker
directly, with rotation after provider 401/403/429; an enterprise-only Groq
model was removed from the allowlist. No AI Gateway BYOK change was made.

The Deno app remains on Free with its single region set to United States
(`ord`). The canary Worker `thcs-gemma-deno-canary` is separate from the
production `thcs-gemma` Worker. Remote Wrangler readback at 2026-09-27
14:39 UTC shows canary version `2788b4ca-c524-47c9-91e6-3c7efe864fa2`
at 100% and a `GEMINI_RELAY_TOKEN` secret binding; unauthenticated `/ai/keys`
returns 401. Worker route tests pass 9/9; Deno check and format pass.

Live authenticated application-service checks through the canary passed:

| Contract | Observed result |
| --- | --- |
| Reading V2 Auto V4, complete Cam 10 Test 3 source | Three passages (5,080 / 5,448 / 5,892 characters), questions 1–40, canonical draft; source without an answer key remained `needs_review` with 77 publish blockers. The check recorded only `/ai/gemini` 200 requests, no direct provider calls. |
| Gemini extraction, answer, writing, suggestions, formative feedback | One passage, 13 parsed questions and 13 generated answers; writing scores and three source-anchored findings; AI-mode feedback with two topics, two explanations, a summary and recommendations. |
| Groq writing, answer suggestions, structured JSON and batching | Five real `/ai/groq` calls passed; one rejected slot rotated to another active key. |
| Exact original 158-question THCS source | Live parse returned 158 source/parsed/draft rows, 158 source and parsed answers, globally unique numbers 1–158, two complete passages, and zero stem/option/answer/passage mismatches. The shared parser now restores source identity only when count, options, and global answer key prove positional alignment. |

The THCS canary encountered a Groq 401, a Groq input-limit 413, and transient
Gemini/Deno 503s before completing. Its three listening sections were skipped
with explicit audio-required warnings; this fixture supplies no audio files.
The saved `output/thcs-158-canary` failure and corrected reports preserve the
before/after evidence. The old browser-key production path remains in place.

Real Edge teacher browser checks on the isolated app at `http://localhost:5173/`
used the built-in quick login and the canary endpoint. Reading V2 Auto V4
processed the complete Cam 10 source and opened Studio with source passage
prose visible and the draft marked `Needs review`; both browser-observed Gemini
requests returned 200 through `/ai/gemini`. THCS Paste Text processed the exact
158-question source and displayed `158 questions · 158 answers extracted` in
the review panel; Groq 401/413 and Gemini 429/503 attempts rotated to a final
Gemini 200. The audio-required listening warnings remained visible. Neither
browser flow saved or published a test. The browser checks complement the
separate exact-source fidelity report; the THCS review panel does not itself
prove option and passage equality.

The browser run also exposed false `SKIPPED` badges on answered sections:
source listening-section indices were being compared to the compressed parsed
section list. The parser now keeps those source indices as diagnostics without
assigning them to parsed sections; the audio-required warnings remain. Its
focused regression passes 30/30. A post-fix browser recheck is pending.

Focused application tests passed 153/153 across THCS parser/provider, Groq,
Gemini, browser adapters, and Reading V2 before that final diagnostic fix;
the changed THCS tests then passed 39/39. Touched-file ESLint passes. The
frontend production build completed with the production Worker URL, and the
bundle budget passed (246 KB root entry). Bundle scanning found no Groq key
pattern or direct provider endpoint; all 13 Google-style key matches equal the
public Firebase configuration key. A local Firestore emulator attempt exited
before tests because the Java runtime could not open a loopback selector; that
is a harness failure and provides no security-rule behavior proof.

Live state changed during this work. On 2026-09-27 the active Firestore ruleset
was `c81aab74-1f9a-4e56-8225-a1c697e552cc`, which still permits authenticated
reads of `settings/api_keys` and contains newer notification rules absent from
this AI branch's earlier baseline. The isolated branch now preserves those live
notification rules and changes only the key-document rule to deny reads and
writes. A dry run compiled the merged file; it has **not** been deployed. The
latest Hosting `kahut1` version readback was `94bed1874490bff0` (released
2026-09-26). Because this AI branch and local main have substantial unrelated
divergence, the successful isolated build is not yet proof that replacing that
Hosting version would preserve all other features. The production Worker still
runs version `dbb3a5c6-43b2-43cf-99a9-8f4a638ed2ab` at 100% and has not
been switched to Deno. Production Hosting, Worker, and Firestore cutover remain
gated on release-baseline reconciliation, the remaining service/browser checks,
and a fresh remote-state comparison immediately before deployment.

The final isolated build used only this worktree's ignored `.env.local` plus
the production Worker URL. Inspection of all 382 emitted JavaScript files
found that URL and the configured backup and Reading V2 submission URLs;
it found neither the canary URL nor either direct provider host. The bundled
Google-style key occurrences matched the public Firebase configuration key,
and no Groq key pattern appeared. This validates the candidate bundle's
credential boundary, not its suitability as a replacement for the current
Hosting release. The AI branch omits at least the `public/student/dw/` files
present on local `main`, and no source commit has yet been tied to Hosting
version `94bed1874490bff0`. A direct Hosting deploy from this branch could
remove unrelated live routes, so the cutover remains blocked on an exact
baseline or complete live-manifest reconciliation.

## Follow-up verification — 2026-09-28

The remaining Gemini callers were traced through the shared browser adapter:
hybrid extraction, progressive feedback, formative feedback, IELTS extraction,
Reading V2 Auto Import, and THCS parsing. Listening-specific modules do not
make Gemini or Groq inference calls; the THCS fixture has no audio, so its
listening sections retain explicit audio-required warnings. A final live
canary run returned one hybrid passage with two questions and progressive
summary/advice. Its recorded inference requests all targeted the canary
`/ai/gemini` route, with statuses 200, 429, 200; the provider 429 rotated to
another key and succeeded.

Worker-owned `user_rate_limited`, `user_account_disabled`, and
`user_unauthorized` errors are now excluded from Gemini provider-key cooldown
classification, including GeminiProvider's local retry paths. Real provider
429/403 failures remain benchable. Focused tests passed 39/39, and touched-file
ESLint and diff checks passed.

With short child-process `TEMP` and `TMP` paths on Windows, the Firestore and
RTDB emulators started and the focused key-authority test passed 2/2:
authenticated browser reads and writes of `settings/api_keys` were denied,
while unrelated RTDB user-role rules still passed. The earlier Java selector
failure was a harness path-length failure. The test's fixture assertion was
corrected to run inside `withSecurityRulesDisabled` rather than reading its
void return. This is local emulator proof, not deployed-rule proof.

The post-fix Edge THCS browser retry initially reached teacher quick login
but failed while mounting `/teacher/thcs-test/create` with `Component firestore
has not been registered yet`, before parsing or any canary call. A later
attempt reached the review UI, but a port-owner check showed that
`localhost:5173` was served by the separate canonical checkout's pre-existing
Vite process. The served parser contained the old skipped-section mapping and
the browser saw two false badges; no canary-host request was recorded. That
attempt is evidence of the old bug, not a post-fix check. No test was saved or
published. The corrected isolated UI must be served and identified before
the post-fix browser check can be counted.

Firebase Hosting `channels/live` still points to version
`94bed1874490bff0`, finalized 2026-09-26 09:45:02 UTC, with 442 files.
The isolated AI build has 438 files; among 136 same-path files, no hashes
match, with 306 live-only and 302 AI-build-only paths. The deployed release
does not contain `/student/dw/index.html`; requests for it resolve through
the SPA catch-all. Commit `52ba69c2` was created six seconds before the live
release and is a candidate source baseline, but Hosting metadata has no Git
SHA. A clean production Vite build from an isolated `52ba69c2` worktree
succeeded (9,515 modules, 1m18s) with provider-key and admin credentials
omitted from its process environment. Exact file/hash comparison with the live
release remains pending because a fresh Hosting REST read using the available
`gcloud` token returned 403 for its quota project. The earlier Firebase CLI
auth context that read the 442-file manifest must be restored or the quota
project configured before this comparison can close.

The 2026-09-27 browser observations above were previously attributed to the
isolated app, but the 2026-09-28 port-owner check found a canonical-checkout
Vite process on port 5173. Unless earlier process evidence is recovered,
their source-checkout provenance is uncertain. The service-level canary
checks and exact-source fidelity report remain separate evidence. The
corrected THCS and Reading browser flows must be rechecked from an identified
isolated build before production cutover.
