# Maintenance baseline — 2026-10-17

Status: **validated-source candidate; production and `main` promotion gates remain open**.

The owner chose the current live app as the maintenance baseline. Newer PDF Book
development stays in the original `luyentap-prd0062` checkout. The historical
October 6 frontend already contained Book code; this branch freezes that code
instead of claiming Book was absent from the deployed artifact.

## What this branch preserves and corrects

- Reconstruction `7a44284e` combines the retained October 6 tracked snapshot and
  required recovered source files. Its per-file donor manifest is in
  [the reconstruction record](live-baseline-reconstruction-20261017.md).
- `323cdc9d` restores the reviewed server-side AI gateway clients and role/key
  protections. Fresh readback still shows gateway version
  `09d2b77a-03ec-40ff-b0c9-933a9b007325` active at 100%. This source correction
  intentionally differs from the current October 6 Hosting app, which regressed
  to direct provider clients and an embedded credential-shaped literal.
- Existing `50a5d55e` release-safety tooling is reused: clean-source builds,
  source/content manifests, hotfix retention, provider readback, and separate
  production/local environment handling. Required local runtime scripts and the
  previously missing Windows Java-emulator launcher are included.
- Normal local Firebase bootstrap now enforces the launcher's disposable
  identity and emulator/Worker endpoints, connects Firestore to its emulator,
  and suppresses Analytics. This narrow correction reuses the canonical local
  guards while retaining acceptance mode; newer persistence/recovery work is
  still separate.
- Normal local development explicitly clears the inherited AI gateway URL.
  Local AI extraction/key administration is unavailable until an isolated AI
  gateway runtime is provided. The Book Worker does not supply that runtime;
  restoring a live URL is not a local setup remedy.
- Production preparation rejects browser Groq/Gemini credential settings and
  missing/unreviewed ordinary-notification or AI gateway endpoints. Local env
  validation no longer requires a browser Gemini key.
- Release assessment checks the Book rollout gate when Book Worker source or
  configuration changes. An AI/ordinary Worker change still requires its own
  provider/compatibility evidence and is not blocked by an unrelated dormant
  Book configuration. A regression check preserves the real Book expiry gate.
- Checked-in primary database rules now reflect the freshly observed live
  rules. Firestore differs only by denying browser access to `settings/api_keys`.
  Unreleased Book rule changes from the historical dirty source were removed
  from this maintenance candidate; they remain in the original feature checkout.
- [Listening cleanup](listening-cleanup-reconciliation-20261017.md) is preserved
  as a separate reconciliation item. Its seven main-only commits are not merged
  without evidence that the behavior belongs to the current live baseline.

## Ordinary notification readiness

Book notifications, teacher grading, and teacher sessions retain their existing
separate scope. The ordinary upgrade was already released; this work prepares
its preserved source and configuration for a controlled subsequent release.

Fresh provider readback on October 17 confirms:

| Surface | Observed state |
| --- | --- |
| Hosting | `10039da56ea1c0ae`, October 6, 458 files |
| Notification command/DO host | `541166ae-93db-4d92-8eda-5fb291325b42`, 100% allocation |
| Notification public entry | `5696e963-c5ed-463d-a495-30db3c07bc98`, 100%; bound to the command host's `NotificationBridgeObject` |
| Cron schedules | Empty, verified by the Cloudflare schedules API |
| Firestore rules release | `8fcf3e1c-1a56-4138-8e4c-24cc594c5316` |
| RTDB notification rules | Equal to the observed live rules; no notification rule migration introduced |
| Public `/events`, `/homework-result-authority`, `/course-enrollment-approval` | Production-origin preflight 204, unauthenticated POST 401 |

The preserved notification Worker dry run passed. The initial Worker test
attempt failed before tests because a validation copy resolved root Vitest 3
instead of Cloudflare Vitest 4; reusing the byte-identical Cloudflare package's
dependency tree corrected the harness. No dependency was installed.

The four ordinary endpoint settings in `env.example.txt` identify the already
deployed public entry. Its `-qa` name is historical; its production role was
verified rather than inferred from that name. The build guard prevents an
omitted endpoint from silently disabling a published workflow.

## Validation completed

- Final normal minified Vite build and bundle budget passed: **262 KB** root entry.
  A separate unminified structural build also passed. Both used fake isolated
  configuration, not production credentials. Generated application text had no
  Groq/Google credential-shaped literals.
- AI frontend/service checks: **147/147**, 15 files; AI Worker mocks: **11/11**.
- Ordinary notification frontend/service checks: **113/113**, 13 files.
- Notification Workerd integration: **44/44**, seven files; Wrangler dry run
  passed using the existing Windows x64 route.
- Isolated Firebase rule checks: **2/2** AI authority checks against the final
  rules; **3/3** notification/Writing checks proving recipient isolation,
  read/replay preservation, atomic reminders and immutable receipts.
- Existing release/acceptance/deployment checks passed **47/47** before the new
  guards; the affected deployment checks were rerun after changes and passed
  **28/28**. Counts overlap and are not a unique total.
- The final combined release-assessment/deployment-guard run passed **50/50**,
  including isolation from an unchanged expired Book rollout and preservation
  of its blocking behavior for an actual Book Worker change.
- After the local Firebase correction, the combined boundary/release/deployment
  checks passed **53/53**. They exercise the actual launcher/module bodies with
  SDK transport spies, including rejected live/missing hosts, all three local
  transports, acceptance in dev/build modes, and production behavior.
- Installed Chromium verified teacher login from `http://localhost:5173/login`,
  notification opening to the class page, and persisted read state after reload.
  Student login from `http://localhost:5174/login` verified the dashboard feed,
  destination and the same read persistence. Both used disposable source-shaped
  notices. Admin login then rendered authenticated AI-key metadata from a local
  gateway stub. This proves the consumers, not deployed delivery/admin commands.
- [The final acceptance record](../release-audits/2026-10-17-candidate-acceptance.json)
  binds those checks to **2,509 byte-compared source/config/public/script files**
  and the generated entry hash. All **392 final JavaScript assets** were scanned
  without finding Groq/Google credential-shaped literals. Remote browser
  requests were blocked; no remote backend connection was allowed. Font-block
  errors and request cancellation during navigation/close were retained in the
  ignored diagnostic logs.
- Fixed test-only drift: the Writing view's inventory guard now recognizes its
  committed-event port; the legacy producer test mocks Firebase; the AI rule
  fixture removes its own previously promoted test user before reruns.
- The 11 new/changed runtime package-script entry points exist. The Windows
  launcher parses. Focused ESLint and diff/UTF-8 checks are recorded with the
  final commit. Six inherited donor whitespace findings remain documented in
  the reconstruction record; donor bytes were preserved.

## Remaining gates

1. **Deployed compatibility:** local browser consumer checks passed; real
   notification provider delivery and deployed AI administration/provider calls
   were not exercised. Current provider versions and isolated Worker tests do
   not establish full compatibility. The desktop browser tool initially failed
   initialization twice; installed Chromium supplied the successful fallback.
   It used fresh contexts and intercepted the candidate artifact at the required
   role origins, with local emulators and loopback permission. Original role
   servers were not replaced. This is not a normal-launcher or production run.
2. **Reviewed production environment:** the machine-local `.env.production`
   was absent at inspection. The checked-in template contains public endpoints,
   not credentials. A real production build remains a separate reviewed input.
3. **Exact live source identity:** Hosting still serves HTML at
   `/.well-known/luyentap-release.json`. The historical source-copy concurrency
   gap remains; provider metadata cannot establish an exact deployed Git tree.
   A separately authorized manifest-bearing bootstrap is required to establish
   that binding. Do not invent a passing compatibility receipt.
4. **Public credential exposure:** the already published Groq-shaped literal
   must be handled through an authorized credential operation. Its validity was
   not tested, and fixing source does not revoke or remove historical exposure.
5. **Remote promotion/release:** no push, `main` update, Hosting/Worker/rules
   deployment, real provider upload, credential rotation, or live data mutation
   occurred here. An ordinary notification redeploy is not needed merely to
   repeat the versions already observed as active.

The direct-student homework UID fix and newer local persistence/recovery work
remain separately inventoried in the research report. They are not quietly
mixed into this reconstruction.

Future work should start from this candidate only for review/qualification.
After acceptance and approved promotion, use the promoted stable revision as
the sole base, keep PDF Book on its feature branch, and record each release's
source manifest. The branch label alone is not stable-state proof.

## Starting future changes

After promotion, clone the reviewed `main` or recorded release tag, verify a
clean status, then create one `codex/<feature>` branch per change. Keep PDF Book
on its existing feature branch until its own acceptance and release. Commit
only intended paths and merge reviewed, checked changes back into the stable
line. Record Hosting, Worker, and rules releases separately against that source
revision; an application deployment does not deploy its backend automatically.
