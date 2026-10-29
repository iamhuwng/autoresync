# Listening narrow desktop overflow — 2026-10-29

Scope: make the existing standard desktop Listening header usable in a narrow
window while preserving the desktop and phone workflows. PDF/Book is excluded.
Released on 2026-10-29; final evidence reconciliation completed 2026-10-30.
The release result and remaining visual qualification are recorded below.

## Intended behavior and cause

Read the header and player, their live/solo callers, UA-first exam-mode hook,
PRD-0045 host/persistence decisions, mobile audio/navigation contract and header
history before choosing the change. The historic 400px player minimum came
from the old embed layout; its purpose was usable controls, not mandatory
horizontal overflow. The owning hosts must keep all audio, progress,
question navigation and submission authority.

The prior header combined a non-shrinking audio/menu group, a 400px minimum
player and a non-wrapping controls row. Actual before-layout reproduction at
375px measured page width 999px. The fix changes only header presentation:
retain wide defaults, place audio on a full row below identity/Options at
1100px and below, allow controls to wrap, and truncate long names with titles.
No AudioPlayer, exam-mode, phone-host, backend, storage or route source changes.

## Local evidence

The isolated browser fixture renders the real ListeningHeader and AudioPlayer,
with Firebase and sync dependencies stubbed. Every control and notice is
contained at desktop widths 1440/1024/768/375/320px. Long-name, loading,
classroom/headphone and teacher-controlled cases are checked at narrow width.
The teacher-controlled fixture includes master state: Play is withheld, seeking
is disabled and volume remains available. This fixture is layout/policy proof,
not live-session synchronization proof.

CDP DOM identity plus media readback confirms the same playing audio element
and monotonically advancing currentTime across 1440 → 1024 → 375 → 320 → 1440.
No reload or playback reset occurs on resize. Existing player, live-host,
practice-host, mode-selection and mobile-header suites pass 94 tests.
Root ESLint, tooling doctor and diff checks passed. Initial evidence is retained
under `tmp/listening-narrow-desktop/`; final provider/browser evidence and the
durable archive are recorded below.

The source contract is recorded in
[Listening desktop header layout](../architecture/listening-desktop-header-layout.md).

## Deployment and live acceptance

[PR #194](https://github.com/iamhuwng/autoresync/pull/194) merged as
`1577a255f4fdcd705873dc8f7e2139e50bbf1f63`; all five CI checks passed.
Independent source review passed. The identical header/CSS delta was applied
to the observed deployed source `a45aa3921f5b60bc9f9c1abaa16588e1b45bcf0d`.
The guarded Hosting-only assessment, production build and bundle budget passed.

| Release field | Verified value |
| --- | --- |
| Deployed source | `89a139c28196abd9139bf9403e6066932cd7c5c3` |
| Tree | `241c483c038002386a54466bdd1213d604ecc7cd` |
| Hosting version | `ce578e2ffde92f63` |
| Manifest fingerprint | `a8040bb9022078df1f4d084f9d307abd86528c4972fed8fe854311b3244fd369` |
| Environment fingerprint | `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57` |

Post-deployment readback verified all 459 manifest-listed files and matching
custom-domain content. Native before/after reads verified unchanged Workers,
modules, bindings, functions and database rules. Upload remains
`bdb6df60-a44d-4063-a588-7af5706aebaa`; canonical RTDB rules remain
`99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520`.
On 2026-10-30, fresh manifest and provider-version reads still matched this
immutable Hosting release; the successful full content readback was reused.

Live checks used the existing private QA test and assignment
`homework-5c0f66e6-d13c-49fc-9068-4d0aac01b356`:

- The actual pre-release desktop at 375px had a 945px document. After release,
  document width equals viewport width at 1440/1024/768/375/320px. All permitted
  header controls, the full recording notice and Options remain contained.
- At 1440px, every measured control rectangle and header height exactly match
  the preceding release. Options opens normally. Replay also fits when shown.
- The same playing audio element remains mounted through
  1440 → 1024 → 768 → 375 → 320 → 1440. Its time advances monotonically
  from 0.109274 to 0.919628 seconds, without pausing or resetting.
- Genuine phone identity/touch emulation at 375/320px selects the existing
  phone scaffold. Its separate audio row, part tab, form and Submit remain
  usable, with no horizontal overflow. The private recording plays to its
  six-second end.
- Desktop and phone submissions both save 2/2. Continue on the unlimited
  submitted assignment intentionally starts a retake; explicit Your Score
  opens saved results. Phone confirmation shows two answered, zero unanswered.
  A full phone reload retains Attempt 7, 100% and 2/2. Fresh desktop access on
  2026-10-30 confirms both Attempt 6 (desktop) and Attempt 7 (phone) remain 2/2.
- Native readback confirms submitted attempt
  `listening_attempt_9911af720ff5984b4f2fac2bf66e7a2348da3ffcba143cfa09abab12f9a5f2cf`
  and result `listening_result_b0cb93febffcbdfe78d46e2f5c41d3580fdc614d2dab08d54c3ae78fe75e74ce`:
  2 correct, 100%, unchanged version/audio pins and unchanged historical result.

One older browser tab retained the preceding entry bundle after reload.
Fresh root, custom-domain and practice-route HTTP reads served the new entry
`index-B1hbOyyv.js` with no-cache/no-store headers. A fresh browser tab loaded
the new header classes and passed acceptance without clearing saved data.
Old-bundle captures are explicitly retained as `live-stale-build-*`, rather
than presented as candidate evidence.

## Limits and recovery

The existing floating question arrows were preserved. At 375×900px desktop,
the translucent disabled Previous button can overlap the final R in NUMBER
in the instruction. Answer fields and question navigation remain usable;
ordinary question scrolling at 375×812px exposes the full prompt. This small
visual overlap remains; this release resolves header/page overflow and does
not claim every narrow desktop element is unobstructed at every height.
Phone checks used browser emulation, not physical devices. Live classroom
synchronization was not rerun; its unchanged restrictions have fixture and
existing regression evidence.

Recovery: Hosting version `e8078c4f8238311c`, source `a45aa392`, restores the
preceding release and its narrow desktop overflow. Keep the current private
Upload Worker, rules and audio storage. No backend rollback or data rewrite
is required. PDF/Book source, settings and primary-checkout work are untouched.

Evidence is retained under `tmp/listening-narrow-desktop/`, including geometry,
active audio continuity, desktop/phone screenshots, saved results, native
provider readback and release logs. The failed network readback and interrupted
pre-deployment build were retained; neither published a release.
The durable archive outside both managed worktrees is
`C:/Users/The Lord/repos/luyentap/tmp/listening-release-archive-20261029/listening-narrow-desktop-evidence.zip`.
All 94 entries were read back and SHA-256 verified. Archive SHA-256:
`86a7ffd543a9cacb8cd6b1d5044585fb00a89c88048148c6cef1c44bf5aebeec`.
Adjacent manifest and verification JSON files retain individual hashes.
