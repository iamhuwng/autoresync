# Listening Classic player — 2026-10-30

Status: source and local browser qualification complete; release preparation;
not released.
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

The implementation is saved in [draft PR #196](https://github.com/iamhuwng/autoresync/pull/196).
Its exact-head CI results are available on the PR; they cannot clear the
independent browser gate. It has not been merged or prepared as a release source.
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
backend changes. No manual changelog entry or release intent was created.

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
environment qualification or deployed artifact. Task-owned app/Worker/Auth
processes were stopped after checks; existing DB/Firestore services were retained.

Local Auth was restarted using the repository Firebase CLI and dev identities
were restored to the existing local profiles; DB/Firestore were not restarted
or imported. The existing canonical orchestrator served candidate frontend
source on `http://localhost:5174`. Its local Worker is not private Listening
production qualification. No live data was changed for this setup.

Browser verification could not begin. Browser inventory exposed no browser
provider; opening the in-app browser reported unavailable. Selecting the existing
native Windows browser then stopped Computer Use because it could not determine
the current browser URL confidently enough to enforce policy. No alternative
automation method was used to bypass that restriction.

Required before release: real desktop/tablet/narrow and phone layout, 44px
targets, overflow and spacing; actual play/pause/seek/speed/volume, keyboard
focus, policy/optional controls, all four Cambridge recordings, and private
answer/submit/reloaded results. Physical phone/iPad audio remains untested.
The initial blocker was resolved by using the explicitly requested in-app
Browser on 2026-10-30, as recorded below. Final clean-source qualification,
merge, exact live-based comparison, compatibility receipt, guarded Hosting
publication and live private-delivery/result acceptance remain pending.

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

## Publication and recovery

No release intent, Hosting deployment, provider configuration change or release
entry ID exists for this refinement. The prior live source remains the observed
baseline above. Re-observe before the next release operation.

Prepare the final release in the existing qualification checkout from the then
observed live source, apply the exact reviewed UI/tooling delta and preserve
independent hotfixes. Do not deploy all main-based Worker changes. Hosting alone
is the intended scope, subject to the final source assessment. Keep prior
Hosting version `ce578e2ffde92f63` and recovery references until verified release
evidence establishes the new version. No backend rollback belongs to this UI change.
