# Qualified stable Reading Hosting release — 2026-10-18

Status: **deployed and verified**. The earlier failed release and rollback remain
in [their incident record](2026-10-18-stable-hosting-release.md). This replacement
restores Reading availability and corrects the cached-script reload mechanism;
it does not erase the earlier failure.

| Release identity | Verified value |
| --- | --- |
| Source revision | `83d794d479c570a1149f0bfe204bee5ebe5a2bd0` |
| Source tree | `c3e7d68e296867a332343ebd658e0b6fb84cb4fb` |
| Stable source tag | `stable-2026-10-18-reading` |
| Firebase project / Hosting site | `temp-a1437` / `kahut1` |
| Finalized Hosting version | `61721e91a13201ae` |
| Released | October 18, 06:15:50.835 Asia/Bangkok (`2026-10-17T23:15:50.835Z`) |
| Production environment SHA-256 | `b20a584d8bfaeeb48c309fd8e4b0448ec1c1b1d80353c59fa5bf7529af694b35` |
| Deployed content verification | All 453 manifest-listed hashes independently fetched and matched |
| Provider / uploaded file counts | 456 provider files / 454 local files including the manifest |

PR #148 merged after its three applicable CI checks passed. All three checks on
the resulting main commit passed too. GitHub main and the clean local main at
`C:/Users/The Lord/repos/luyentap` were synchronized before release. The normal
clean production build ran at `549951e6`; promotion produced the identical
complete tracked tree above. The repository manifest writer then bound that
same artifact to the merged source revision. A direct Firebase config read
confirmed that deployment used the clean clone's `dist`, not the dirty Book
checkout. Canonical tooling had zero missing required dependencies; the build
clone reused compatible ancestor tools without installation.

The reviewed source includes the four required existing Reading modes and the
owner's six approved Reading import fixes. Focused evidence includes 141 parser
tests, 59 Reading flag/launch tests, 60 release guards, six CSP policy tests,
lint/UTF-8 checks, and the controlled cached-fallback browser reproduction.
Counts overlap and are not a unique total. See [requalification](2026-10-18-reading-requalification.md)
and [the cache incident comparison](2026-10-18-asset-refresh-incident.md).

## Live acceptance

At `https://hocthem.net`, teacher quick login reached Materials. Create New Test
opened twice without reloading or adding `asset_refresh`. IELTS → Reading V2 →
Details → Start → Paste Import was available, and Reading Passage listed 11
records. No test was saved or published.

Student quick login reached the dashboard and Public Library (38 materials).
Cambridge IELTS 19: Test 1 opened its Reading V2 runtime; questions and passage
navigation rendered, and Submit was available without the unavailable-submission
banner seen in the isolated fixture. The test was exited without answering or
submitting. This does not prove a new academic-result submission.

On both Hosting domains, lobby/login HTML, the new entry and modal scripts, and
a unique missing-script probe returned `no-cache, no-store, must-revalidate`.
Cloudflare reported `BYPASS` for all three tested script paths on `hocthem.net`.
The new policy prevents future cached reload-script responses; it does not purge
responses already stored by browsers or edge caches.

The production manifest at `https://kahut1.web.app/.well-known/luyentap-release.json`
matches the local revision, tree, environment fingerprint, and all 453 content
hashes. The finalized provider version and file count were independently read.

## Backend and scope boundaries

Fresh provider reads confirmed unchanged AI gateway, notification command,
notification public-entry, and backup Worker active versions. Live RTDB rules
match the candidate. Firestore ruleset `8fcf3e1c-1a56-4138-8e4c-24cc594c5316`
differs only by one provider-secrets comment; its authorization code matches.
**Only Hosting was deployed.** No Worker, rules, migration, database, or B2 release
occurred. No real AI inference, new notification delivery, or provider upload was
performed during this replacement's live acceptance.

PDF Book remains disabled for this release and separate from stable main. Two
newer PDF Book test summaries break this older candidate's rich local public
catalog; production's 44 summaries all validate and exclude those records.
Do not import that PDF development dataset into the stable baseline. Its shared
contract integration remains part of PDF qualification.

## Future changes and retained work

Clone the existing GitHub repository and start a separate feature branch from
`main`. Use the stable tag when exact deployed source is required. Keep production
environment values outside Git and use the guarded release workflow now that a
real production source manifest is served.
A clean clone does not isolate shared machine environment files or emulator
state. Preserve the Book dataset and deliberately select appropriate stable
test data; do not reset the preserved dataset as an incidental setup step.

Still separate from this release: the direct-student homework UID Worker fix,
28 retained local feedback/dashboard commits, the deferred Listening deadline
and restore/lease hardening chain, and newer local persistence/recovery tooling.
Their ownership and limits remain in [the maintenance baseline](../system/maintenance-baseline-20261017.md).
The PDF readiness inventory remains [separate](2026-10-17-pdf-book-deployment-preparation.md).

Local evidence and screenshots are retained in the canonical checkout under
`tmp/deployment-audit-20261017/reading-replacement-*` and
`reading-live-replacement-*.png`. Earlier evidence and the withdrawn tag's incident
history were preserved. The old failed `stable-2026-10-18` tag was not recreated.
