# Listening homework UI follow-up — 2026-10-29

Scope: fix eligible retakes opening the previous result, private homework
question counts remaining Loading, and the desktop recording notice clipping
above the viewport. Preserve the existing editor, form, player controls, saved
results, and attempt authority. PDF/Book work is excluded.

The list continues to consume the shared shell homework owner. The detail
page's existing material effect owns its detail-only metadata. Listening reads
only `student_safe_tests/{materialId}/questionCount` and `updatedAt`, from the
existing published projection, for the next attempt's current published test.
Started attempts continue to use their canonical version pins. There are no
list-row reads, secondary shared owners, new data paths, or write-on-read.
Same-material refresh preserves loaded metadata; route changes cancel stale
responses. Missing metadata terminates with Question count unavailable.

Authority: student-data-loading rule, student-shell-right-rail architecture,
and Knowns patterns student-shell-single-data-owner,
summary-first-detail-on-demand, and bulk-enrichment-from-shared-student-history.
Existing action names and route registry entries remain valid.

Local evidence: the new retake/count checks failed before the correction;
homework pages and audio player now pass 33 tests, and the mobile header passes
13 tests. An existing Reading projection fixture lacked its required
displayNumber; only that fixture was corrected. No Reading product logic
changed. The actual header/player layout reproduced a notice top of -9.6875px
on desktop; min-height plus non-shrinking header sizing contains it at
1440/1024/375/320px without horizontal overflow.

## Release and acceptance

PR #191 merged as `d35ffba1cfeac76965fbeae683c8c7fe55b651e6`; all five CI
checks passed. Independent review found no remaining blocking finding.
The identical UI delta was applied to the observed live Hosting source
`529854b97343b51cfbdff98618411763d8b1a9a4` in the existing isolated checkout.
This Hosting-only hotfix avoids redeploying already-qualified backend changes.

Deployed source: `a45aa3921f5b60bc9f9c1abaa16588e1b45bcf0d`.
Tree: `575548339789e3709b61e7eac0007a5b1b02f335`.
Firebase Hosting version: `e8078c4f8238311c`.
Manifest fingerprint:
`89d59ed973a24483ccab2048f8b91cc96707d14f8c62fd396786ffe1820901b1`.
The guarded assessment passed, the production build and bundle budget passed,
and post-deploy readback verified all 459 manifest-listed files and matching
custom-domain content. Environment fingerprint remains
`8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.

Fresh before/after native provider reads confirm unchanged Workers, modules,
bindings, functions and database rules. Upload remains
`bdb6df60-a44d-4063-a588-7af5706aebaa`; RTDB rules remain
`99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520`.
Existing private-storage, anonymous-denial, grading/pin and feedback-permission
proofs remain valid; this UI delta does not invalidate them.

Live acceptance on the existing private QA assignment
`homework-5c0f66e6-d13c-49fc-9068-4d0aac01b356`:

- Details show 2 questions and the published update timestamp without a teacher-record read.
- Continue from the submitted homework card opens a new interactive attempt.
- Explicit score access still opens the existing saved-result panel.
- Desktop at 1280px contains the entire notice (top 0, bottom 14.4px) in an
  81.2px header; audio plays and the original text form remains editable.
- Phone identity plus touch emulation selects the existing mobile shell.
  At 375px and 320px the complete notice remains within the viewport, with no
  horizontal overflow. The original phone controls, form and confirmation sheet remain intact.
- Desktop and phone attempts both submit as 2/2. Phone result access after a
  page reload confirms persisted 100% and 2/2. Native readback confirms latest
  submission `listening_attempt_22a0aec10cf23dfab875067abcee448f33410812c14e8a6bdb90803bd7932094`
  and result `listening_result_3ac6c11a615633fd1174bcaec725c13d8442de90589f7269857081ddb1a089c6`.
  Earlier saved results remain unchanged.

## Preserved intent and limits

The UA-first exam-mode hook deliberately keeps desktop browsers in standard
mode even when their windows become narrow, protecting the desktop/tablet
workflow from false phone detection. A 375px desktop-UA check initially exposed
horizontal overflow in that standard layout. It was incorrectly classified as
phone proof. Reading the hook, PRD-0045 and both host branches corrected that
classification; actual phone identity/touch checks passed. No viewport-based
mode switch or compact-player redesign was introduced. Very narrow desktop
windows retain the pre-existing standard-layout width limitation.

Image/text publication semantics, teacher replacement/editing, player authority,
replay/seek policy, progress, attempt pins, grading and saved-result access remain
requirements. The change touches header sizing and homework entry/metadata,
without replacing those owners. The build uses unchanged published desktop and
phone implementations. Testing used browser phone emulation, not physical hardware.
Advanced Reading-style grouped/AST editing remains a separate construction item.

Evidence: `tmp/listening-homework-ui-20261029/` contains before/after screenshots,
live-ui-proof.json, private-workflow-current.json, deployed-proof.json and logs.
Native release receipts are `tmp/release-receipts/listening-ui-predeploy-01.json`
(retained REVIEW_REQUIRED from an overbroad reconciliation path list) and
`listening-ui-predeploy-02.json` (PASS after exact-path review). The earlier
hotfix paths are byte-identical to the observed deployed source; the live
manifest retains their reconciliation obligations and adds this hotfix.

Recovery: Hosting version `31c9eafc2a7ce9be`, source `529854b9`, restores the
preceding private-audio UI and its three known UI gaps. Preserve the current
private Upload Worker, rules and durable audio. No backend rollback or data
rewrite is needed for this Hosting-only correction. PDF/Book source, provider
settings and primary-checkout work remain untouched.

Evidence is also preserved outside the managed worktrees at
`C:/Users/The Lord/repos/luyentap/tmp/listening-release-archive-20261029/listening-homework-ui-evidence.zip`.
All 41 entries were read back and SHA-256 verified. Archive SHA-256:
`42c560cbeeff4c521fdf08ee7d1f63a46016dab77e9a6b4fe274bc1ff803ad65`.
The adjacent listening-homework-ui-manifest.json and
listening-homework-ui-verified.json retain individual hashes and verification.

## Subsequent narrow desktop release

The later [narrow desktop release](2026-10-29-listening-narrow-desktop.md)
resolves the standard-layout horizontal overflow recorded here and supersedes
this Hosting version. Its audit preserves exact new provider/source evidence,
desktop/phone acceptance, recovery and the remaining floating-arrow visual
qualification. This record remains evidence of the preceding release.
