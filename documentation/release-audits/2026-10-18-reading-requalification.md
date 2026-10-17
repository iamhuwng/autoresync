# Reading requalification after Hosting rollback

Status: source/configuration corrections prepared; replacement Hosting release
has not occurred. The earlier attempt and rollback remain recorded in
[the incident record](2026-10-18-stable-hosting-release.md).

## Root cause and configuration correction

The production environment prepared for the first attempt omitted Reading
rollout, passage visibility, and passage-homework settings. The actual application
normalizers close these capabilities when values are absent. The production build
guard previously validated Firebase and backend endpoints without preserving
these existing feature modes.

The restored October 6 feature-flag chunk was independently matched to the
Hosting provider's gzip-level-9 SHA-256. Its modes are now explicit in the
machine-local production file and required by `scripts/deploy-live.mjs`:

| Setting | Required existing live mode |
| --- | --- |
| `VITE_READING_V2_ROLLOUT_MODE` | `public` |
| `VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY` | `opt-in` |
| `VITE_READING_PASSAGE_LIBRARY` | `enabled` |
| `VITE_READING_PASSAGE_HOMEWORK` | `enabled` |

The revised environment SHA-256 is
`b20a584d8bfaeeb48c309fd8e4b0448ec1c1b1d80353c59fa5bf7529af694b35`.
Its values are not committed. Tests exercise missing, blank, disabled, restricted,
and misspelled rollout settings through the real build-only entry before Vite.
The source defaults remain closed; this guard preserves this site's current
production behavior rather than globally enabling features.

Independent configuration review found no further non-Book flag/endpoint omission:
the admin/test-type flags remain disabled as in the old artifact; Listening's five
endpoints match the existing signer host; backup, Reading trusted submission,
ordinary notification/result authority, and course enrollment endpoints match
the deployed contracts. The AI gateway restoration remains an intentional
correction from the old browser-key clients. Missing dedicated notification-command
URL and diagnostic token were already absent in the old artifact. These are
static configuration comparisons, not proof of all runtime workflows.

## Authorized Reading import correction

The owner asked to include the six local fixes investigated in
**Fix Reading V2 question numbering** (`01a14ad5-4a69-7592-a26b-515c064181e3`).
Their committed baseline blobs matched this candidate before copying; only
those six files were brought over. No Book source was included.

- Recognize italic Markdown question-range headings.
- Use the strict source ledger for single-passage chunking, avoiding a false
  split at instructions such as “Reading Passage 2 has seven paragraphs”.
- Normalize Markdown answer rows and explicit paired `25 & 26` answer bindings.
- Expand a combined multiple-select provider object only when the exact source
  range, answer count, and absence of already represented subsequent questions agree.

Source-authoritative extra/missing question, answer-binding, passage-count,
reference-bank, and instruction checks remain in place. Immediate parser diagnostics
continue through existing import result/review ports; no persistent notification,
new action, backend write, or audit event is introduced by this correction.
The original live provider payload remains unavailable, so the combined-object
case is a reproduced boundary weakness rather than a proven original response.

## Current proof and remaining work

- Integrated parser suites: **141 tests / 3 files passed**.
- Explicit corrected Reading configuration and launch suites: **59 tests / 3 files passed**.
- Release/deployment/local-boundary/tool resolver suites: **60 tests passed**.
- Activity coverage: **21 tests and 32 independent schema fixtures passed**.
- Focused ESLint, UTF-8, diff checks, and assessment boundary passed.

The first flag-suite run used missing shared-development modes and failed two
environment-dependent assertions. Repeating with the reviewed production modes
passed all 59; the source's closed-default tests remain intact.

Candidate browser verification, a clean production rebuild, fresh CI, source
promotion/synchronization, and replacement release verification remain pending.
Local emulator startup/recovery is infrastructure proof only. PDF Book stays
separate and disabled for this release. No real AI inference or provider upload
is claimed by these deterministic checks.

## Local runtime follow-up

Normal development failed because the preview-only Book CSP constructor rejected
local-dev's HTTP Worker before Vite started. `vite.config.js` now runs that
constructor only for builds or preview; both keep strict HTTPS validation.
A test executes the actual Vite callback for development, production build, and
preview. The four local-boundary tests and six existing CSP policy tests passed;
the combined release guard run now passes 60 tests, and focused ESLint passed.
An independent source review found no issue in this two-file startup change.

Using the owner's explicitly approved installed Playwright, the candidate
teacher app at `http://localhost:5173/login` passed quick login, Create New Test,
IELTS/Reading V2 setup, paste parsing into Studio with the expected review
warnings, and the populated Reading Passage library (11 rows). No draft was
saved or published. Browser routing blocked external requests; no provider AI
inference, remote database write, or Book upload was exercised. The canonical
orchestrator supplied local Firebase while the selected application/configuration
came from the candidate validation copy. The frontend-only runner omitted the
Book Worker for these non-Book checks.

The owner also reported a live Create New Test reload loop after our deploy and
rollback. Its comparison, controlled browser reproduction, and current cache
correction are recorded in [the asset refresh incident](2026-10-18-asset-refresh-incident.md).
The owner recovered the modal by disabling browser cache. The candidate's
route/JavaScript cache correction has not been deployed. Student browser,
updated clean build/CI, promotion, and deployed header verification remain open.
## Source qualification completed before replacement release

At source `60e7b8bf8cb37578d3c0ae3e207e871a18a14238`, all three applicable CI
checks passed. A clean normal production build passed with the reviewed
`b20a584d...` environment, the bundle budget and local-value checks. All 453
manifest-listed content hashes were verified; no built JavaScript contained a
Groq credential literal. The source tree is
`ab0042fb1654da9798774531066c8902f3aa4514`.

The normal local teacher checks above passed. Student runs against the rich
local snapshot exposed a separate data disagreement: both PDF Book test records
in its 46-row public index fail this older stable listing contract, causing the
shared listing to return empty. Read-only production inspection found 44 rows,
all accepted by the actual candidate listing contract; those two local PDF test
records are absent. The preserved local dataset was not rewritten to hide this
problem. PDF integration must resolve it on its separate branch.

To avoid the failing rich local catalog and repeated cold Vite/resource
problems, a separately compiled acceptance build of the same source was served
through installed Playwright at `http://localhost:5174`. It used only disposable
`demo-luyentap-acceptance` Auth/RTDB/Firestore, candidate rules, and an existing
published Reading test's exact metadata, summary and student-safe projection
copied from the local snapshot. The browser started at `/login`, revealed quick
login, used Student, opened Public Library, started Reading practice, and moved
to the next and previous question. The grouped question panel rendered.
External requests were blocked; no submission, AI request or Book upload was
made. This is controlled browser/emulator proof, not normal-launcher or live
submission proof. Its submission-unavailable banner is expected because that
fixture has no trusted submission Worker.

Evidence is retained under the canonical checkout's
`tmp/deployment-audit-20261017`: `reading-student-isolated-browser.json`,
`reading-student-isolated-runtime.png`, `reading-local-catalog-inspection.json`,
`reading-live-catalog-inspection.json`, and
`reading-corrected-clean-build-60e7b8bf.log`.

Source qualification is complete for the controlled Hosting replacement.
Promotion, the replacement itself, deployed route/asset headers, and live
teacher/student readback remain open. No new stable tag is established yet.
## Qualified replacement — October 18

The replacement is now deployed and verified as Hosting `61721e91a13201ae`,
source `83d794d4`, tag `stable-2026-10-18-reading`. All 453 deployed manifest
hashes match. Live teacher creation/Reading setup/passage-library and student
Library/Reading runtime/passage navigation passed without saving or submitting.
The live Submit control is available. Route and new JavaScript responses return
no-store through both domains, including a missing-script probe; Cloudflare
reports BYPASS for the tested scripts. See [the release record](2026-10-18-stable-reading-hosting-release.md)
for exact identities, backend readback, acceptance limits and rollback history.
Earlier pending statements above describe the preceding qualification stage.