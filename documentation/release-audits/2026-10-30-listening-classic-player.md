# Listening Classic player — 2026-10-30

Status: LIVE Hosting publication and content verification passed. Final acceptance
evidence is recorded below; physical-device audio remains outside this run.
Scope: approved Classic presentation and required guarded Hosting recorder
integration. No PDF/Book source, backend runtime, storage, authorization,
assignment/version pins, grading or result schema changes.

## Design and source

Approved preview and research are preserved at
`C:/Users/The Lord/.codex/visualizations/2026/10/26/01a17960-898d-7370-901f-1acc9eeac358/`.
The approved `listening-player-compact-designs.html`, balanced spacing JSON,
375px/320px screenshots and overview were inspected before editing. The other
two proposals were already removed. Preview evidence does not prove app behavior.

The main-based implementation branch is `codex/listening-classic-player-20261030`,
in the existing `listening-durable-audio/luyentap` checkout, based on
`35cb2591c70bc5782f2f734c1cf159e20a768836`. The canonical checkout has unrelated
dirty work and was not staged, reset or switched.

The implementation was merged in [PR #196](https://github.com/iamhuwng/autoresync/pull/196),
head `469834a84be009982470eacd0837b3c019016936`, merge
`dfbcbf99f49fc50767f2090fc0b86bec96086fb2`. All seven exact-head CI checks passed.
Browser qualification remains separate evidence from CI.
The first CI run required the shared-registry change to carry Result View
Governance records. Those records were added to the existing surface map,
visibility policy, FR matrix and preflight ledger, with no result behavior or
FR-closure change. The governance check was preserved.

The shared minimal player now has one responsive control tree with native
ranges/disclosures and SVG controls. Source CSS specifies 64px wide and 88px
narrow bars, the approved 32px Play circle/44px target and 10px clearances.
Speed stays visible; volume and conditional replay/next use small panels.
Loading/error states, sync, refresh handoff and readable notices remain.
The header's old wrapping selector is removed because its player now owns
component-width responsiveness. Action names are registered and tracked.

Immediate announcements and persistent notifications are not applicable: this
presentation change adds no durable material/user outcome. Existing playback
errors and recording notices are retained. Reporting uses the existing feature
registry/tracking port; actual browser/backend reporting delivery is unverified.

Current release instructions require integrated Hosting recording. The clean
source predated that integration. The existing canonical recorder modules were
ported with the guarded deploy integration, selected-cwd safety and a minimal
build-config classifier prerequisite. These are release tools, not product
backend changes. No manual changelog description was added; the guarded release
created its integrated intent before publication, as recorded below.

## Evidence and unresolved gates

Fresh native Hosting observation verified source
`89a139c28196abd9139bf9403e6066932cd7c5c3`, tree
`241c483c038002386a54466bdd1213d604ecc7cd`, fingerprint
`a8040bb9022078df1f4d084f9d307abd86528c4972fed8fe854311b3244fd369`.
Evidence: `tmp/release-receipts/classic-initial-observation.json`. This initial
main-based assessment is UNVERIFIED for unrelated Worker deltas; it is baseline
observation, not a qualification of the UI candidate.

Final player/host/mode/sync/mobile-header/scaffold run: 106 tests passed across
seven files. Recorder/deployment/release checker tests: 97 passed, zero skips.
Logs are under `tmp/listening-classic/` and `tmp/classic-*.log` in the
implementation checkout. The tests cover native control changes, media-node
identity, panel dismissal/focus, independent replay permission and limits,
teacher restrictions and the mobile layer order.

Independent source review found and corrected replay/pause permission coupling,
mobile panel layering, teacher icon alignment and focus after panel actions.
Source recheck found no remaining concrete defect; it did not test a browser
and does not clear the browser gate.

Touched UI lint, Mantine boundary, UTF-8 and diff checks passed. Full root
ESLint encountered retained generated Worker bundles and an unchanged
`cloudflare/src/book-source-worker/processor-count.ts` no-unsafe-finally error.
Those files were not modified. Source-wide `eslint src scripts` passed. An
initial and final-source `npm run build`/bundle-budget checks passed, with a
258KB root entry. This is local source-build proof, not a guarded production
environment qualification or deployed artifact. The first task-owned app/Worker/Auth
processes were stopped after those checks; later detached runtime recovery is
recorded below. Existing DB/Firestore services were retained.

Local Auth was restarted using the repository Firebase CLI and dev identities
were restored to the existing local profiles; DB/Firestore were not restarted
or imported. The existing canonical orchestrator served candidate frontend
source on `http://localhost:5174`. Its local Worker is not private Listening
production qualification. No live data was changed for this setup.

The initial browser verification could not begin. Browser inventory exposed no browser
provider; opening the in-app browser reported unavailable. Selecting the existing
native Windows browser then stopped Computer Use because it could not determine
the current browser URL confidently enough to enforce policy. No alternative
automation method was used to bypass that restriction.

The initial required browser gate covered real desktop/tablet/narrow and phone layout, 44px
targets, overflow and spacing; actual play/pause/seek/speed/volume, keyboard
focus, policy/optional controls, all four Cambridge recordings, and private
answer/submit/reloaded results. Physical phone/iPad audio remains untested.
The initial blocker was resolved by using the explicitly requested in-app
Browser on 2026-10-30. The local qualification below and final publication and
acceptance evidence supersede that initial blocked state.

## In-app browser qualification — 2026-10-30

The actual local app was opened at `http://localhost:5174/login`; Student quick
login succeeded. A bounded local fixture was necessary because this emulator
dataset contained no Listening library material. Only two task-owned test/safe
projection paths were seeded, with prior values saved. It uses a retained local
WAV and real Library → Practice → player/form flow. It does not prove Cambridge
or private delivery. No Book, Firestore, asset registry or live data was seeded.

At desktop widths 1440/1024/768/375/320px, document width equals viewport width.
Wide control bars measure 64px; narrow bars measure 88px. Across the full resize
cycle the same audio backend node (48) remains playing, with currentTime
advancing from 61.843 to 62.339 seconds. Mouse click and native ArrowRight seek,
speed 1.25x, actual media volume 0.01, pause, Escape and focus were verified.

Phone identity plus touch emulation selects the real mobile scaffold. At
375/320px it measures 88px, 44×44px Play and 44px seek/speed regions, a 32px
circle with 10px top inset, no overlap and no horizontal overflow. Actual play,
seek, 1.5x speed and media volume 0.01 work. Volume-panel hit testing confirms
it paints above tabs/content. Part 2 selects destination questions/audio and
starts playback. Screenshots confirm the approved visible spacing.

A real Header/AudioPlayer fixture supplies deterministic policy inputs: optional
Next and Replay fit at 320px, replay consumes its limit, recording notice stays
readable, teacher control removes Play/speed/Next and disables seek while keeping
volume, classroom mode mutes/hides controls and requests headphones, and loading
and retired-source error states remain readable. This is not live-class sync.

Browser checks found and fixed two issues before release: the wide Play hover
background needed its dark contrast preserved, and Replay needed to notify the
host when restarting paused playback. Replay now shows Pause while real audio
advances, retains focus, and cannot exceed its configured limit. The existing
replay test asserts the host callback; all 106 UI regressions passed again.

Evidence: canonical `tmp/listening-classic-20261030/browser-checks.json`,
`local-desktop-*.jpg`, `local-phone-*.jpg`, `local-policy-*.jpg`; corrected test/build
logs in candidate `tmp/listening-classic/`. Auth and the app/Worker now use
Windows-owned `LuyenTap-Classic-auth`/`LuyenTap-Classic-student` tasks, with logs,
launcher and recovery instructions outside the worktree in the canonical evidence
directory. The in-app browser is Codex-managed and cannot be detached; its state
is recoverable only through saved evidence and a fresh/reconnected tab. No
physical phone, iPad, Safari audio or assistive-technology test is claimed.

## Publication and recovery — 2026-10-30

The clean release source is `943277ad6f8c1c89fed35fcced7afc2f720f46d2`, based on
observed live `89a139c28196abd9139bf9403e6066932cd7c5c3`. Its seven UI/test files
match the reviewed implementation byte-for-byte. Worker, rules, Functions,
storage and package/lockfile paths have no delta. The compatibility review binds
this source, baseline, environment and observed fingerprint, including the six
prior independent-hotfix reconciliation obligations. The fresh shared checker
returned PASS; the exact release's 95 deployment/recorder checks passed.

The supported `npm run deploy:hosting` ran once through the detached
`LuyenTap-Classic-hosting-release` task. It revalidated, built production in
2m19s, passed the 257KB root bundle budget, recorded intent, published Hosting
only and verified the served manifest/content hashes. The command exited zero
at 2026-10-30T01:20:10Z (08:20 Bangkok).

| Field | Observed value |
| --- | --- |
| Effective target | `firebase:temp-a1437:hosting:kahut1` |
| Publication | `published` |
| Verification | `passed` |
| Provider version | `a350cd1d67adc3bd` |
| Provider release time | `2026-10-30T01:18:00.198Z` |
| Source fingerprint | `b390bb0d8ba03741414d967ac493d257fe767e9b239d14c897097100d455f312` |
| Recorder entry | `c7466f60-2707-45f3-83db-105f0da5da71` (`live`) |
| Recovery version | `ce578e2ffde92f63`, source `89a139c2` |

The saved entry is at
`C:/Users/The Lord/.luyentap/changelog/temp-a1437/state.json`. The exact release
branch and annotated tag `deployed-listening-classic-2026-10-30` are pushed.
No recovery was executed. Hosting recovery would not roll back backend data or
Workers; no backend rollback belongs to this presentation change.

Durable evidence is in canonical `tmp/listening-classic-20261030/`, including
`classic-qualified.json`, `compatibility-review.json`, `hosting-command-outcome.json`
and the deployment log. The two bounded local fixture paths were restored to
their saved null values after browser qualification. Detached Auth/app tasks
remain available; the in-app browser remains Codex-managed.

## Live acceptance and preservation

Fresh production tabs rendered the Classic player. At desktop widths
1440/1024/768/375/320px, document width equals viewport width and the control
bar measures 64px wide or 88px narrow. Across the resize cycle the same audio
backend node (68) remains playing, advancing from 8.754 to 9.407 seconds.
Actual media play, native seek, speed 1.25x and volume 0.01 were verified.

The initial four-part phone probe sampled parts 2–4 before metadata was ready;
those readyState=0 entries are retained in `live-browser-checks.json` and do not
prove playback. The follow-up uses phone UA plus touch and waits for readyState=4.
All four Cambridge 21 recordings then play and seek through the private Worker
origin, with durations 352.687, 415.294, 385.034 and 472.683 seconds. Destination
images, part navigation and the Part 4 answer sheet remain available. At
375/320px the real phone scaffold has an 88px bar, 44px Play target and no
document overflow. Cambridge practice was not submitted.

The private QA homework accepted GREEN and QA through the live form. The UI's
result history showed 8 of 8, scoring 2/2 (100%) at 08:28 Bangkok. After a full reload, opening Your Score
reopened that result with earlier attempts still selectable. Evidence:
`browser-acceptance-addendum.json`, `private-result-2of2.png`,
`cambridge-mobile-part4.png` and the retained desktop screenshots.

The provider readback identifies submission
`listening_attempt_479fa13ceac96b180c3d18798f806fac4166717744ea149e2c12f10f398517f7`
and result `listening_result_933e97e77535aa5d44ef5e3bf01b1cb870d9fb67debe740819137460effa4120`.
Its submission `attemptNumber` is 7. The UI's 8 of 8 is the result-history
fallback ordinal across the student's same-test results, not that submission
counter; the saved result's assignment context separately contains 1. These
existing counters are not treated as interchangeable or changed by this release.

`private-after-browser.json` verifies submitted status, GREEN/QA correctness,
current and pinned version `version-f198cd191755715855a186ffebddb1e9`, audio asset
`kNIcLKTDWnzQtnc5E1V6Sg`, exact prior/historical saved results, and unchanged
published/immutable content and homework metadata. The authorized QA adds one
started and submitted attempt (6 → 7). The existing assignment completionRate
aggregate moves 600 → 700; no aggregation code was changed or qualified here.

Native provider readback at 2026-10-30T01:29:53Z verified the new Hosting source
and version, including matching `hocthem.net` manifest. All four Worker versions,
modules, bindings/settings/routes/schedules match the predeploy baseline. RTDB
rules SHA-256 remains `99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520`;
Firestore rules remain `654a30c61436c2f9f6e2716c9d9ca397cc5d662687de2bc914c3494f335901bc`.
No Functions exist; writes remain enabled with no active restore. The private
R2 managed domain remains disabled, custom domains empty and lifecycle unchanged.

The independent Cambridge readback preserves version
`version-bf6e12f0568ae511e1f2fc6b9ae24f38`, 40 questions, all four runtime/safe
audio pins, immutable versions and asset checksums/keys/state. Evidence:
`native-after.json`, `native-after-summary.json` and `cambridge-after.json`.

No physical phone/iPad/Safari audio, assistive-technology session, live teacher
sync or reporting-backend delivery is claimed. Teacher/offline/error policies
were exercised locally with the real components and deterministic inputs.
