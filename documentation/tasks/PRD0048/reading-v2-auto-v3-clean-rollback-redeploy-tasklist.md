# Reading V2 Auto V3 Clean Rollback And Redeploy Task List

## Goal

Remove the wrong-folder Hosting release, restore live to the last known good pre-bad version, then redeploy the intended Auto Parsing V3 from:

`C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Current Status

Contingency active. Live is restored to stable rollback version `3ba6c4e3fd949f93`.

The intended `f0629e6` V3 build was rebuilt and deployed once, but the live workflow probe failed closed with `25 blocking Auto issues`. The first issue was:

`Transcript text cannot be proven from the source question area or reference-bank lines: "Complete the notes below. Choose ONE WORD ONLY from the passage for each answer.".`

Per contingency, live was rolled back again to `3ba6c4e3fd949f93`. Do not redeploy V3 again until the exact pasted sample has a blocking validator test and passes locally.

## Known Release Anchors

- Bad release: `1778817678276000`, version `0cbd79b5af53962d`, time `2026-05-15T04:01:18Z`, evidence `399` files and `9.19MB`.
- Rollback target: `1778677005473000`, version `3ba6c4e3fd949f93`, time `2026-05-13T12:56:45Z`, evidence `383` files.
- Current fixed V3 backup: `1778821737216000`, version `dfe4a653a233d562`.
- Intended source commit: `f0629e6 fix(reading-v2): require auto task groups`.
- Attempted clean V3 deploy during this run: release `1778913121067000`, version `93f6637aca242ca1`.
- Final live rollback after failed V3 probe: release `1778913423447000`, version `3ba6c4e3fd949f93`.

## Execution Checklist

- [x] 1. Preflight with no live mutation.
  - [x] Force exact repo path with `Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"`.
  - [x] Confirm `git rev-parse --show-toplevel`.
  - [x] Confirm `git status -sb`; tracked source must be clean before build/deploy.
  - [x] Record current live release table with Firebase CLI.
  - [x] Confirm `firebase.json` target/public dir and `.firebaserc` project.
- [x] 2. Create safety anchors before rollback.
  - [x] Confirm or create local branch `codex/reading-v2-v3-fixed-f0629e6` at `f0629e6`.
  - [x] Save release table evidence.
  - [x] Preserve any unrelated local edits before source checkout/build.
- [x] 3. Roll live back to pre-bad release.
  - [x] Clone `kahut1@3ba6c4e3fd949f93` to `kahut1:live`.
  - [x] Verify live channel points to version `3ba6c4e3fd949f93`.
  - [x] Probe live root: `200 text/html`.
  - [x] Probe live JS asset: `200 application/javascript`.
  - [x] Confirm no missing JS asset returns HTML.
- [x] 4. Rebuild correct V3 from exact source.
  - [x] Use exact intended source commit chain ending at `f0629e6`.
  - [x] Confirm commits are present: `6e826bb`, `6246091`, `9b9e9ac`, `80731d0`, `31d17f4`, `f0629e6`.
  - [x] Confirm no tracked dirt before build.
- [x] 5. Verify before deploy.
  - [x] Run targeted Vitest command.
  - [x] Run targeted UTF-8 check.
  - [x] Run production build.
  - [x] Confirm `dist` file count is near `383-385`, not `399`.
  - [x] Confirm current `index.html` does not require `index-D0VsAH2s.js`.
  - [x] Confirm `TestCreationModal-*.js` contains V3 markers.
- [x] 6. Deploy correct V3.
  - [x] Deploy `hosting:kahut1` to project `temp-a1437`.
  - [x] Record new live release ID and version.
  - [x] Probe live root and JS bundle directly.
  - [x] Confirm JS content type is JavaScript, not HTML.
- [ ] 7. Live workflow probe.
  - [x] Open `https://kahut1.web.app`.
  - [x] Use teacher dev quick-login if auth is needed.
  - [x] Paste same IELTS Reading sample.
  - [ ] Confirm text-paste step passes.
  - [ ] Confirm Gemini/topology marker sees full passage question area.
  - [ ] Confirm topology has two levels: passage package range plus task-type groups.
  - [x] Confirm parser problems are blocked/flagged for review instead of silent publish.
  - [ ] Confirm Gemini `429` is treated as provider/key issue, not parser failure.
- [x] 8. Contingency rollback after failed V3 workflow probe.
  - [x] Clone `kahut1@3ba6c4e3fd949f93` back to `kahut1:live`.
  - [x] Verify final live channel version is `3ba6c4e3fd949f93`.
  - [x] Probe final live root and JS asset.
- [ ] 9. Required follow-up before any next V3 redeploy.
  - [ ] Add or confirm a blocking validator test using the exact pasted sample.
  - [ ] Fix source-proof handling for note-completion instruction and blank lines.
  - [ ] Rebuild and live-probe only after local exact-sample pass.

## Required Commands

Rollback to pre-bad stable:

```powershell
Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
try {
  cmd /c node node_modules/firebase-tools/lib/bin/firebase.js hosting:clone kahut1@3ba6c4e3fd949f93 kahut1:live --project temp-a1437
} finally {
  Pop-Location
}
```

Deploy correct V3:

```powershell
Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
try {
  cmd /c node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1 --project temp-a1437
} finally {
  Pop-Location
}
```

Restore current fixed V3 backup if needed:

```powershell
Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
try {
  cmd /c node node_modules/firebase-tools/lib/bin/firebase.js hosting:clone kahut1@dfe4a653a233d562 kahut1:live --project temp-a1437
} finally {
  Pop-Location
}
```

## Contingency Rules

- If rollback clone fails, use Firebase Console release history to roll back to version `3ba6c4e3fd949f93`.
- If Console rollback also fails, redeploy known source `origin/main` or `4f24a7f` from exact rebased worktree as emergency stable state.
- If wrong-folder deploy happens again, immediately clone `kahut1@3ba6c4e3fd949f93` back to `kahut1:live`, then stop all deploy commands until path, repo root, and `dist` count are re-confirmed.
- If live shows `Unexpected token '<'`, fetch the failing JS URL. If body starts with `<`, roll back to `3ba6c4e3fd949f93` or redeploy V3 with stale-asset guard from `80731d0`, then re-probe asset content type.
- If build output jumps to `399` files or around `9.19MB`, stop before deploy. Treat as wrong dist/source pollution.
- If Gemini returns `429`, do not roll back Hosting. Treat as provider quota/key rotation problem.
- If V3 still silently mis-groups questions, roll live back to `3ba6c4e3fd949f93`, keep current V3 branch for debugging, and add a blocking validator test using the exact pasted sample before redeploying again.

## Execution Evidence

- Preflight repo root: `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`.
- Initial live before rollback: release `1778912230151000`, version `7f8beed23ae5690d`.
- First rollback release: `1778913018358000`, version `3ba6c4e3fd949f93`, file count `383`, bytes `2530195`.
- First rollback probe: root `200 text/html`; asset `/assets/index-BhjCGtCF.js` `200 application/javascript`; asset did not start with HTML.
- Local dirty tracked edits were preserved with stash message `codex-pre-clean-v3-redeploy-local-fixes`, then restored after execution.
- Exact source checkout for build: detached `f0629e6 fix(reading-v2): require auto task groups`.
- Confirmed commit chain includes `f0629e6`, `31d17f4`, `80731d0`, `9b9e9ac`, `6246091`.
- Targeted Vitest: `2` files passed, `37` tests passed.
- UTF-8 check: passed for topology marker service and test files.
- Production build: passed.
- `dist` sanity before deploy: `383` files, `8798754` bytes, no `index-D0VsAH2s.js` reference.
- V3 marker bundle: `dist/assets/TestCreationModal-CUrZaokK.js`.
- Clean V3 deploy: release `1778913121067000`, version `93f6637aca242ca1`.
- V3 live asset probe: root `200 text/html`; main `/assets/index-DV9wOOel.js` `200 application/javascript`; `/assets/TestCreationModal-CUrZaokK.js` `200 application/javascript`; V3 markers present.
- V3 live workflow probe: root redirected to `/lobby`; Auto V3 step accepted pasted sample length `23964`; processing returned `25 blocking Auto issues`.
- First blocking issue: `Transcript text cannot be proven from the source question area or reference-bank lines: "Complete the notes below. Choose ONE WORD ONLY from the passage for each answer.".`
- Final contingency rollback release: `1778913423447000`, version `3ba6c4e3fd949f93`, file count `383`, bytes `2530195`.
- Final live probe: root `200 text/html`; asset `/assets/index-BhjCGtCF.js` `200 application/javascript`; asset did not start with HTML.
