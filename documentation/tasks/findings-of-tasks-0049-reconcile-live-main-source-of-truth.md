# Findings: PRD-0049 - Reconcile Live, Local Main, And Origin Main Source Of Truth

## 2026-05-08 - Initial Drift Evidence

- The PRD-0043 import worktree was created from `origin/main` at `ff3e29a`, which does not contain the full modern Writing grading stack.
- Local `main` is at `aa9c30a`, is `82` commits ahead of `origin/main`, and contains the modern Writing grading stack.
- `backup/wip-preserve-local-changes-20260412` is at `7112041`, is `104` commits ahead of `origin/main`, and contains large WIP/snapshot content.
- Branch-to-branch comparison found `backup/wip-preserve-local-changes-20260412` has `23` commits local `main` lacks, while local `main` has `1` commit backup lacks.
- Diff from local `main` to backup branch is large: `1250 files changed, 404900 insertions, 5018 deletions`.
- The active `C:\Users\The Lord\Desktop\luyentap` worktree had `178` status entries, including Reading V2, Obsidian, output, and package changes.
- Firebase Hosting project `temp-a1437` has target `kahut1` mapped in `.firebaserc` and `firebase.json`.
- Firebase Hosting site `kahut1` live channel last release time was `2026-05-05 02:05:04`.
- Deployed `https://kahut1.web.app` JS fingerprint included modern grading markers: `Start Grading`, `Review AI Suggestions`, and `writing_grading_ai_cache`.

## 2026-05-08 - Initial Conclusion

- Current `origin/main` is not the reliable live-parity source for this repo.
- Current local `main` is closer to live-parity than `origin/main`.
- `backup/wip-preserve-local-changes-20260412` is not a clean base for new work because it includes broad WIP and snapshot content.
- Until reconciliation is complete, new live-parity feature work should branch from local `main`, not `origin/main` or backup branches.
- Long-term target remains: repair `origin/main` so it again becomes the deployable source of truth.

## 2026-05-08 15:05 +07:00 - Phase 1 Recovery Anchors

- Active worktree confirmed before Git mutation: `C:\Users\The Lord\Desktop\luyentap-writing-import`, branch `codex/writing-homework-import`, dirty with PRD-0043 Writing import changes and untracked PRD-0049 docs.
- Safety tags created before reconcile branch movement:
  - `safety/0049-origin-main-20260508-150400` -> `ff3e29ac2a2798494d3aef6ce5a7ce9386fae74a`
  - `safety/0049-local-main-20260508-150400` -> `aa9c30aec4c463e7e43444c41247fa627f803d91`
  - `safety/0049-backup-wip-preserve-local-changes-20260412-20260508-150400` -> `711204141f8bf496a1173895d3b810ca26d00f2a`
  - `safety/0049-codex-writing-homework-import-20260508-150400` -> `ff3e29ac2a2798494d3aef6ce5a7ce9386fae74a`
- Full Git bundle created outside repo: `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\luyentap-all-refs-20260508-150400.bundle`, size `159515757`, SHA256 `F2C8F071F9B712E1E593EAE266F4A97781C8622C98CFEFB58015F89045D0BCDA`.
- Bundle verification command exited `0`; output listed `53` refs and ended with `The bundle records a complete history.` and `The bundle uses this hash algorithm: sha1`.
- Dirty tracked changes from `C:\Users\The Lord\Desktop\luyentap` exported to `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\main-worktree-dirty-tracked-20260508-150400.patch`, size `2387291`, SHA256 `8BDD913F2B1E1D4521F0C35E8E8F119BD5D613A858E160CBAD9819612A89DF56`.
- Staged changes from `C:\Users\The Lord\Desktop\luyentap` exported separately to `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\main-worktree-staged-20260508-150400.patch`, size `0`, SHA256 `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
- Untracked WIP from `C:\Users\The Lord\Desktop\luyentap` archived outside repo: `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\main-worktree-untracked-wip-20260508-150400.zip`, `366` files, size `35304947`, SHA256 `C7B14A4E231DB25DF3AB68C744673F18E48C6D5E33781BC16912D6C55D1195A9`.
- Recovery manifest saved at `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\recovery-manifest-20260508-150400.txt`.
- No `git reset`, `git clean`, branch deletion, force push, destructive cleanup, checkout, or reconcile branch movement was run during Phase 1.

## 2026-05-08 15:17 +07:00 - Phase 2 Branch And Live State Inventory

- Detailed inventory saved outside repo at `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\branch-live-inventory-20260508-150737.txt`, size `14012`, SHA256 `E7C087301A480443A2A44468223B057D7D6116D6E5F76FCE27C0E791F960CAAE`.
- Corrected branch matrix saved at `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\branch-live-inventory-fix-20260508-150835.txt`, size `2482`, SHA256 `7588E682F1C6B82A8B70F0B0A9CFCA164B784E02E7907C584713F9E59CF9CDF0`.
- Recursive live JS marker scan saved at `C:\Users\The Lord\Desktop\luyentap-0049-recovery-20260508-150400\live-js-recursive-marker-scan-20260508-1515.json`, size `2504`, SHA256 `016675DAE62459CC052855FFB9F7253A6ECD7D9BE0D2B4F2168403F46EFA6BB1`.

| Branch | SHA | vs `origin/main` | vs local `main` |
| --- | --- | --- | --- |
| `origin/main` | `ff3e29ac2a2798494d3aef6ce5a7ce9386fae74a` | `0` origin-only / `0` branch-only | `82` main-only / `4` branch-only |
| local `main` | `aa9c30aec4c463e7e43444c41247fa627f803d91` | `4` origin-only / `82` branch-only | `0` / `0` |
| `backup/wip-preserve-local-changes-20260412` | `711204141f8bf496a1173895d3b810ca26d00f2a` | `4` origin-only / `104` branch-only | `1` main-only / `23` branch-only |
| `origin/backup/wip-preserve-local-changes-20260412` | `2c6f2b8e31a86277199b4c1d73dc2aad33f9f9ff` | `4` origin-only / `103` branch-only | `1` main-only / `22` branch-only |
| `codex/wip-main-sync-20260418` | `9d5dda35fca024debb0945852ac00c8c53b08309` | `2` origin-only / `101` branch-only | `1` main-only / `22` branch-only |
| `codex/writing-homework-import` | `ff3e29ac2a2798494d3aef6ce5a7ce9386fae74a` | `0` / `0` | `82` main-only / `4` branch-only |

- Remote truth checked with `git ls-remote` and no local ref update: remote `main` is `ff3e29ac2a2798494d3aef6ce5a7ce9386fae74a`; remote backup is `2c6f2b8e31a86277199b4c1d73dc2aad33f9f9ff`; remote `codex/wip-main-sync-20260418` is `9d5dda35fca024debb0945852ac00c8c53b08309`; no remote `codex/writing-homework-import` head was listed.
- Dirty worktree summary: main worktree `C:\Users\The Lord\Desktop\luyentap` has `73` tracked/submodule dirty entries and `366` untracked files; current PRD-0043 worktree has `43` tracked dirty entries and `34` untracked files; `.git\codex-commit-wt` has `4` tracked dirty entries; `.tmp_reading_label_contract_worktree` has `1`; two Codex detached worktrees are clean; several old desktop worktrees are prunable/missing.
- Firebase config: `.firebaserc` default project is `temp-a1437`; hosting target `kahut1` maps to site `kahut1`; `firebase.json` publishes `dist` and rewrites all paths to `/index.html`.
- Firebase CLI `15.16.0` listed Hosting sites `app3384`, `kahut1`, `portal69`, and `temp-a1437`. Channel list for site `kahut1` shows `live`, last release `2026-05-05 02:05:04`, URL `https://kahut1.web.app`, expiry `never`.
- Live JS recursive scan visited `336` assets. `https://kahut1.web.app/assets/WritingGradingPage-BYfhld2x.js` contained `Start Grading`, `Review AI Suggestions`, `writing_grading_ai_cache`, and `AI Suggestions`. `https://kahut1.web.app/assets/AnswerKeyModal-B8-CVOmY.js` contained `AI Suggestions`. A few unrelated asset fetches had transient `fetch failed` errors, but the live-critical Writing markers were found.
- Four `origin/main` commits absent from local `main`:
  - `ff3e29a fix(student-practice): render listening homework tests`
  - `c809fd6 fix(test-editor): tolerate full storage`
  - `2631703 fix(ielts-reading): disambiguate A-J summary bank labels`
  - `b1cb2ec fix(ielts-reading): backport paste-text label hotfix`
- Local `main` has `82` commits absent from `origin/main`; recent heads include `aa9c30a Merge branch 'feat/student-auto-resume-activity'`, `487da80 feat(student): restore active work on reopen`, and student mobile/result/homework shell work.
- Backup branch has `23` commits absent from local `main`, including `7112041 fix(thcs-parser): repair orphan reading sections`, broad Reading V2/runtime parity work, and earlier Listening/mobile/THCS WIP. Local `main` has only `aa9c30a` absent from backup.
- Diff from local `main` to backup remains large: `1250 files changed, 404900 insertions(+), 5018 deletions(-)`.

## 2026-05-08 15:20 +07:00 - Phase 3 Canonical Base Decision

- Canonical base decision: local `main` at `aa9c30aec4c463e7e43444c41247fa627f803d91` remains the intended live-parity source for reconciliation because it contains the modern Writing grading stack and live `kahut1` contains the matching Writing markers.
- Backup decision: `backup/wip-preserve-local-changes-20260412` and `origin/backup/wip-preserve-local-changes-20260412` remain archive/WIP preservation branches only. Their extra commits must not be silently merged into canonical `main`; any salvage should happen in separate task-scoped WIP branches after owner review.
- Current feature branch decision: `codex/writing-homework-import` is based on `origin/main` and remains a feature/WIP branch, not a source of truth.
- Four `origin/main`-only commits were reviewed:
  - Accept `c809fd6 fix(test-editor): tolerate full storage` as a valid hotfix. It is localized to `src/components/TestEditor.tsx` and `src/components/TestEditor.test.tsx`. Verification target: `cmd /c npx vitest run src\components\TestEditor.test.tsx --reporter=basic`.
  - Accept `2631703 fix(ielts-reading): disambiguate A-J summary bank labels` as a valid hotfix. It is localized to `src/utils/readingQuestionContract.ts` and its test. Verification target: `cmd /c npx vitest run src\utils\readingQuestionContract.test.ts --reporter=basic`.
  - Defer `ff3e29a fix(student-practice): render listening homework tests` from blind cherry-pick pending equivalence proof. It is too broad for automatic integration because it inserts `439` lines in `src/components/practice/IELTSPracticeView.tsx`, touching shared runtime/render/audio/navigation behavior. It should be explicitly rejected only if local `main` already has equivalent listening homework behavior; otherwise integrate the missing behavior carefully.
  - Reject `b1cb2ec fix(ielts-reading): backport paste-text label hotfix` as too broad for blind hotfix integration: `638` insertions across `src/services/ai/gemini.provider.ts`, `src/services/ai/groq.provider.ts`, and `src/utils/readingQuestionContract.ts`; provider refactor/prompt behavior is not a minimal hotfix. Its narrow label-parsing intent is superseded by accepted `2631703`.
- Source-of-truth policy before branch movement: create a clean reconciliation branch from local `main`, integrate accepted hotfixes `c809fd6` and `2631703`, verify or integrate/defer `ff3e29a` based on equivalence proof, reject full `b1cb2ec`, then verify before any remote update. `origin/main` becomes deployable source of truth only after this verified branch is pushed/merged with owner approval.
- Explicit gate reached: stopped for owner approval before creating `codex/reconcile-live-main` or doing any branch movement.

## 2026-05-08 15:27 +07:00 - Phase 3 Approval

- Owner approved the corrected approach:
  - accept `c809fd6`
  - accept `2631703`
  - reject full `b1cb2ec`
  - verify `ff3e29a` equivalence before final accept/reject
- Approved next action: create `codex/reconcile-live-main` from local `main`, integrate accepted hotfixes, and keep remote push gated for separate owner approval.

## 2026-05-08 15:45 +07:00 - Phase 4 Reconciliation Branch

- Active worktree confirmed before branch mutation: `C:\Users\The Lord\Desktop\luyentap-writing-import`, branch `codex/writing-homework-import`, dirty with PRD-0043 WIP and PRD-0049 docs.
- Created clean worktree and branch from exact local `main`: `C:\Users\The Lord\Desktop\luyentap-reconcile-live-main`, branch `codex/reconcile-live-main`, base `aa9c30aec4c463e7e43444c41247fa627f803d91`.
- Cherry-picked accepted hotfix `2631703 fix(ielts-reading): disambiguate A-J summary bank labels` as `29c50ec`.
- Cherry-picked accepted hotfix `c809fd6 fix(test-editor): tolerate full storage` as `205a061`.
- Verified `ff3e29a fix(student-practice): render listening homework tests` was not equivalent in local `main`: local `main` lacked the `isListeningTest` branch, listening audio state/handlers, and listening-specific render components in `src/components/practice/IELTSPracticeView.tsx`.
- Integrated `ff3e29a` as `7e0756d` after one conflict in `src/components/practice/IELTSPracticeView.tsx`.
- Conflict resolution preserved local `main` mobile reading host behavior and inserted the listening render path before `isMobileExamMode`, so listening homework does not fall into `MobileReadingExamScaffold`.
- `b1cb2ec fix(ielts-reading): backport paste-text label hotfix` remains explicitly rejected as a full commit. Reason: broad AI provider changes are not required after `2631703`; narrow label intent is covered by `29c50ec`.
- No backup branch commits, Reading V2 WIP, Obsidian WIP, or PRD-0043 Writing import work were included.
- Reconcile code diff against local `main`: `5` files changed, `905` insertions, `10` deletions.
- Included code files: `src/components/TestEditor.test.tsx`, `src/components/TestEditor.tsx`, `src/components/practice/IELTSPracticeView.tsx`, `src/utils/readingQuestionContract.test.ts`, `src/utils/readingQuestionContract.ts`.
- Current reconcile branch status after Phase 4 code integration: clean for code commits, with untracked PRD-0049 task/finding docs pending documentation commit.

## 2026-05-08 16:05 +07:00 - Phase 5 Verification Progress

- Branch/source command `git -C "C:\Users\The Lord\Desktop\luyentap-reconcile-live-main" log --oneline --decorate main..HEAD` shows three reconcile commits above local `main`:
  - `7e0756d fix(student-practice): render listening homework tests`
  - `205a061 fix(test-editor): tolerate full storage`
  - `29c50ec fix(ielts-reading): disambiguate A-J summary bank labels`
- Branch doctor command `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && npm run branch:doctor"` exited `0` and reported:
  - worktree `C:/Users/The Lord/Desktop/luyentap-reconcile-live-main`
  - current branch `codex/reconcile-live-main @ 7e0756d6879d`
  - local `main` `aa9c30aec4c4`
  - `origin/main` `ff3e29ac2a27`
  - local main vs origin/main: local `+82`, origin `+4`
  - current vs local main: current `+3`, local `+0`
  - current vs origin/main: current `+85`, origin `+4`
  - Firebase project `temp-a1437`
  - Hosting target `kahut1 -> kahut1`
  - Hosting public dir `dist`
  - warnings for local/origin main drift and dirty worktree
  - recommended temporary command: `git worktree add -b codex/<task-slug> ..\luyentap-<task-slug> main`
- Focused accepted-hotfix command passed: `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && set ""VITE_FIREBASE_API_KEY=test"" && set ""VITE_FIREBASE_AUTH_DOMAIN=test.firebaseapp.com"" && set ""VITE_FIREBASE_DATABASE_URL=https://test.firebaseio.com"" && set ""VITE_FIREBASE_PROJECT_ID=test"" && set ""VITE_FIREBASE_STORAGE_BUCKET=test.appspot.com"" && set ""VITE_FIREBASE_MESSAGING_SENDER_ID=123"" && set ""VITE_FIREBASE_APP_ID=1:123:web:test"" && npx vitest run src\components\TestEditor.test.tsx src\utils\readingQuestionContract.test.ts src\components\practice\IELTSPracticeView.test.tsx src\pages\StudentPracticePage.test.tsx --reporter=basic"`.
- Accepted-hotfix result: `4` test files passed, `25` tests passed.
- Focused Writing grading command passed when run alone after a parallel Vitest OOM: `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && set ""VITE_FIREBASE_API_KEY=test"" && set ""VITE_FIREBASE_AUTH_DOMAIN=test.firebaseapp.com"" && set ""VITE_FIREBASE_DATABASE_URL=https://test.firebaseio.com"" && set ""VITE_FIREBASE_PROJECT_ID=test"" && set ""VITE_FIREBASE_STORAGE_BUCKET=test.appspot.com"" && set ""VITE_FIREBASE_MESSAGING_SENDER_ID=123"" && set ""VITE_FIREBASE_APP_ID=1:123:web:test"" && npx vitest run src\pages\WritingGradingPage.test.tsx src\services\writingSuggestionService.test.ts src\components\writing-grading\WritingSuggestionsPanel.test.tsx src\components\writing-grading\WritingSuggestionsReviewModal.test.tsx src\utils\writingGradingReadiness.test.ts --reporter=basic"`.
- Writing grading result: `5` test files passed, `21` tests passed.
- Script test command passed: `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && node --test scripts\__tests__\branch-doctor.test.mjs"`.
- Branch doctor test result: `4` tests passed.
- A previous app build passed after the current code-level reconciliation changes and before branch-doctor/doc-only edits: `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && set ... && npm run build"` ended with `[bundle-budget] OK - root entry 219KB; public preloads are within budget.` and `built in 27.86s`.
- Later build retries at `16:04` and `16:05` exited `1` during Vite `transforming...` with native Node fatal errors before any TypeScript, Vite, or Rollup diagnostic. System memory at the time showed only about `1.9 GB` free. A `1536 MB` heap retry transformed all `9181` modules but failed during Terser minification.
- Final app build command passed with a bounded heap: `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && set ""NODE_OPTIONS=--max-old-space-size=2048"" && set ""VITE_FIREBASE_API_KEY=test"" && set ""VITE_FIREBASE_AUTH_DOMAIN=test.firebaseapp.com"" && set ""VITE_FIREBASE_DATABASE_URL=https://test.firebaseio.com"" && set ""VITE_FIREBASE_PROJECT_ID=test"" && set ""VITE_FIREBASE_STORAGE_BUCKET=test.appspot.com"" && set ""VITE_FIREBASE_MESSAGING_SENDER_ID=123"" && set ""VITE_FIREBASE_APP_ID=1:123:web:test"" && npm run build"`.
- Final app build result: `9181` modules transformed, built in `1m 12s`, `[bundle-budget] OK - root entry 219KB; public preloads are within budget.`
- UTF-8 command passed: `cmd /c "cd /d ""C:\Users\The Lord\Desktop\luyentap-reconcile-live-main"" && npm run check:utf8 -- package.json scripts\branch-doctor.mjs scripts\__tests__\branch-doctor.test.mjs documentation\architecture\repo-branch-source-of-truth.md documentation\tasks\tasks-0049-reconcile-live-main-source-of-truth.md documentation\tasks\findings-of-tasks-0049-reconcile-live-main-source-of-truth.md src\components\practice\IELTSPracticeView.tsx src\pages\StudentPracticePage.test.tsx src\components\TestEditor.tsx src\components\TestEditor.test.tsx src\utils\readingQuestionContract.ts src\utils\readingQuestionContract.test.ts"`.
- UTF-8 result: `UTF-8 check passed for 12 text file(s).`
- Whitespace command `git -C "C:\Users\The Lord\Desktop\luyentap-reconcile-live-main" diff --check` exited `0`.
- Browser/dev-server check was deferred because the live-critical Writing grading surface is covered by the focused component/page tests and the user did not request browser verification for this reconciliation task.

## 2026-05-08 16:05 +07:00 - Phase 6 Remote Gate

- Remote mutation gate reached and honored.
- No `git push`, PR creation, merge, force push, remote branch movement, local main reset, or cleanup was run.
- Remaining Phase 6 work requires owner approval after verification is complete.

## 2026-05-08 16:05 +07:00 - Phase 7 Branch Doctor Guardrail

- Added `scripts/branch-doctor.mjs`.
- Added `branch:doctor` package script: `node scripts/branch-doctor.mjs`.
- Added minimal test coverage in `scripts/__tests__/branch-doctor.test.mjs`.
- Script reports worktree, current branch, current/local/origin SHAs, ahead/behind counts, dirty count, Firebase project, hosting target, hosting public dir, warnings, and a safe worktree recommendation.
- Warnings implemented:
  - local `main` and `origin/main` diverge
  - current branch appears based on stale `origin/main` while local `main` has live-parity commits
  - current branch is `backup/*` or `wip/*`
  - worktree is dirty

## 2026-05-08 16:05 +07:00 - Phase 8 Durable Policy Docs

- Created `documentation/architecture/repo-branch-source-of-truth.md`.
- Defined branch roles for `origin/main`, local `main`, `codex/*`, `backup/*`, and `wip/*`.
- Defined post-reconcile new-worktree base: `origin/main` after `npm run branch:doctor` passes.
- Defined pre-reconcile temporary exception: local `main` is safer than `origin/main` because it matches live Writing grading.
- Defined recovery procedure: safety tags, bundle, bundle verify, tracked patch, staged patch, untracked archive, recorded hashes and paths.
- Defined deploy proof procedure: Hosting config, channel/release time, and JS marker fingerprint.

## 2026-05-08 16:15 +07:00 - Phase 9 Final Review And Residual Risks

- Re-opened `documentation/tasks/tasks-0049-reconcile-live-main-source-of-truth.md`; completed checkboxes through Phases 0-5, 6.1, 7, 8, and 9 have evidence in this findings file.
- Acceptance item `origin/main is updated only after safety artifacts and verification pass` remains unchecked because no push, PR, merge, or remote main mutation was performed.
- Phase 6.2 through 6.7 remain unchecked and require owner approval before any remote mutation.
- No destructive cleanup, `git reset`, `git clean`, branch deletion, force push, or local main reset was performed.
- Backup/WIP branches were preserved as archive only; no backup-only commits were silently merged into canonical main.
- Reconcile branch contents:
  - local `main` base `aa9c30aec4c463e7e43444c41247fa627f803d91`
  - accepted hotfix `2631703` as `29c50ec`
  - accepted hotfix `c809fd6` as `205a061`
  - accepted after equivalence check `ff3e29a` as `7e0756d`
  - rejected full `b1cb2ec` because `2631703` covers the narrow label intent and the full commit carries broad AI provider changes
- Residual owner actions:
  - approve push of `codex/reconcile-live-main`
  - open or prepare PR to `main`
  - merge only after reviewing safety artifacts and verification evidence
  - confirm `origin/main` then contains modern Writing grading and accepted hotfixes
  - fast-forward or otherwise reconcile local `main` only after owner-approved backup checks
- Conventional commit target: `chore(repo): add branch source guardrails`.
