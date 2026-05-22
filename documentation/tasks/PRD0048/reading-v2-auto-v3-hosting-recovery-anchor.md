# Reading V2 Auto V3 Hosting Recovery Anchor

> **Created:** 2026-05-16
> **Purpose:** Durable Firebase Hosting and Git recovery anchor for the Reading V2 Auto V3 rollback/redeploy sequence. Use this note when live `kahut1` may have been polluted by a wrong-folder deploy or when a future thread needs exact rollback tags without relying on memory.

## Known Release State

### Bad Release

- **Release ID:** `1778817678276000`
- **Version/tag:** `0cbd79b5af53962d`
- **Release time:** `2026-05-15T04:01:18Z`
- **Evidence:** `399` files, `9,196,811` bytes, no stale-asset guard
- **Wrong-folder fingerprint:** `C:\Users\The Lord\Desktop\luyentap\dist\assets\index-D0VsAH2s.js`
- **Interpretation:** This is the likely wrong-folder deploy from `C:\Users\The Lord\Desktop\luyentap`, matching the browser error `index-D0VsAH2s.js:1 Uncaught SyntaxError: Unexpected token '<'`.

### Pre-Bad Rollback Target

- **Release ID:** `1778677005473000`
- **Version/tag:** `3ba6c4e3fd949f93`
- **Release time:** `2026-05-13T12:56:45Z`
- **Evidence:** `383` files, `2,530,195` bytes
- **Interpretation:** Last small known-good release before the wrong-folder deploy sequence.

### Current Live Backup

- **Release ID:** `1778821737216000`
- **Version/tag:** `dfe4a653a233d562`
- **Release time:** `2026-05-15T05:08:57Z`
- **Commit source:** `f0629e6 fix(reading-v2): require auto task groups`
- **Interpretation:** Current fixed V3 state already retained by Firebase Hosting and usable as a rollback target if the pre-bad rollback was a mistake.

## Intended V3 Commit Chain

- `6e826bb` - preserve auto answer keys
- `6246091` - harden auto Clippings import
- `9b9e9ac` - add Auto V3 pipeline
- `80731d0` - stale asset guard
- `31d17f4` - split ranges
- `f0629e6` - required task groups

## Recovery Commands

Always run these from the exact rebased worktree. Do not trust shell cwd.

### Roll Back To Pre-Bad Stable

```powershell
Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
try {
  cmd /c node node_modules/firebase-tools/lib/bin/firebase.js hosting:clone kahut1@3ba6c4e3fd949f93 kahut1:live --project temp-a1437
} finally {
  Pop-Location
}
```

### Restore Current Fixed V3 Backup

Use this if the pre-bad rollback was a mistake or if the current fixed V3 release needs to be restored quickly.

```powershell
Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
try {
  cmd /c node node_modules/firebase-tools/lib/bin/firebase.js hosting:clone kahut1@dfe4a653a233d562 kahut1:live --project temp-a1437
} finally {
  Pop-Location
}
```

### Deploy Correct V3 From Exact Worktree

```powershell
Push-Location -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
try {
  cmd /c node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1 --project temp-a1437
} finally {
  Pop-Location
}
```

## Verification Checklist

### Before Any Deploy

- Run `git status -sb` from `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- Run `git rev-parse --show-toplevel`; expected output is `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`.
- Confirm `dist` file count is around `383-385`, not `399`.
- Confirm no required current asset points to `index-D0VsAH2s.js`.

### After Rollback Or Deploy

- Live root returns `200 text/html`.
- Live JS asset returns `200 application/javascript`, not HTML.
- Live channel version matches the expected version/tag.
- V3 live bundle contains:
  - `Mark two levels of question topology`
  - `expectedQuestionRange is the full question coverage`
  - `topology-marker-group-coverage-missing`

## Contingency Notes

- If `Unexpected token '<'` appears, inspect the failing JS URL. If it returns HTML, restore a stale-asset-guard release or redeploy V3 from the exact rebased worktree.
- If build output is `399` files or around `9.19MB`, stop. That is a wrong-folder or polluted `dist` signal.
- If Gemini returns `429`, do not rollback Hosting. Treat it as a quota/key-rotation issue.
- If V3 still silently mis-groups questions, rollback to `3ba6c4e3fd949f93`, then fix the validator/prompt before redeploy.
- Never trust shell cwd. Always use `Push-Location -LiteralPath`.
