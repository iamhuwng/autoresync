# Conversation Log - 2026-02-27 Session 3

**Started**: 2026-02-27 19:09 (UTC+7)

---

## 1. Git Commit + Firebase Deploy

### User Request
- Record full current state of the project on git
- Deploy the app on Firebase Hosting
- Remove documentation folder from Firebase Hosting

### Actions Taken

#### Git Commit
- Ran `git add -A` to stage all changes (67 files)
- Committed as `7136c65` with message: `feat: full project state snapshot - 2026-02-27`
- Changes: 67 files changed, 9,603 insertions(+), 3,600 deletions(-)

#### Build
- Ran `npx vite build` — succeeded in ~56 seconds
- 8,856 modules transformed, 221 output files

#### Firebase Hosting Deploy
- Ran `npx firebase deploy --only hosting`
- Project: `temp-a1437`, Target: `kahut1`
- 221 files deployed successfully
- Live URL: https://kahut1.web.app

#### Documentation Folder
- Verified: `documentation/` folder is source-only and does NOT exist in `dist/`
- It was never deployed to Firebase Hosting — no changes needed
