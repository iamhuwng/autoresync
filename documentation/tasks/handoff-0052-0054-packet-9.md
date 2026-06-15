# Handoff - PRD-0052/0054 Packet 9

## Working Folder

`C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Final Status

Packet 9 is complete as of 2026-06-10 22:27 +07:00.

The previously blocked live archive/restore mutation and Student frozen-runtime/result browser proof were completed after explicit approval to create disposable live dev data.

## Disposable Live Fixture

- Firebase project: `temp-a1437`
- Teacher uid: `glMHCrzMnyS6AqFcb9I0nlOqQ6X2`
- Student uid: `x3hDfjYVN7cJtSbwq0ChIjl1Bk62`
- Prefix: `packet9-live-20260610151227`
- Reading Passage material: `packet9-live-20260610151227-passage`
- Snapshot version: `packet9-live-20260610151227-snapshot-v1`
- Composition version: `packet9-live-20260610151227-composition-v1`
- Homework launch: `packet9-live-20260610151227-hw-launch`
- Homework result: `packet9-live-20260610151227-hw-result`
- Result: `packet9-live-20260610151227-result`
- Attempt: `packet9-live-20260610151227-attempt`

## Fixes Found During Live Proof

- `src/services/reading-v2/readingV2AuditTrail.service.ts` now strips optional `undefined` fields before validation/write. Live archive had failed on `adminOverride: undefined`.
- `database.rules.json` now permits owner reads on the archive-index parent path `material_catalog/material_archive_indexes/by_owner/$ownerId/reading-passage`. Live Archive subtab had failed with `Permission denied`.
- Tests were added/updated in `src/services/reading-v2/readingV2AuditTrail.service.test.ts` and `src/__tests__/security/materialCatalogFirebaseRules.test.ts`.
- Deployed rules to `temp-a1437`:
  - `firebase deploy --only "database,firestore:rules" --project temp-a1437`
  - `firebase deploy --only "database" --project temp-a1437`

## Browser Proof

Teacher proof used exact `http://localhost:5173/lobby`.

- Active before archive: `artifacts/packet-9-browser-proof/13-live-active-before-archive-5173.png`
- Archive dialog: `artifacts/packet-9-browser-proof/14-live-archive-dialog-5173.png`
- Archived row after rule fix: `artifacts/packet-9-browser-proof/15-live-archive-row-after-rule-fix-5173.png`
- Restore dialog: `artifacts/packet-9-browser-proof/16-live-restore-dialog-5173.png`
- Restored active row: `artifacts/packet-9-browser-proof/17-live-restored-active-5173.png`
- Active list after successful re-archive: `artifacts/packet-9-browser-proof/18-live-active-after-successful-archive-5173.png`

Student proof used `http://localhost:5174` per repo live-browser role-port rule after explicit logout/Student quick-login.

- Homework cards: `artifacts/packet-9-browser-proof/20-student-homework-frozen-cards-5174.png`
- Frozen runtime: `artifacts/packet-9-browser-proof/21-student-frozen-runtime-5174.png`
- Frozen result panel: `artifacts/packet-9-browser-proof/22-student-frozen-result-panel-5174.png`

Required proof fields are recorded in both findings files: browser surface, viewport, URL, IDs, expected result, actual result, and screenshot path.

## Audit Evidence

Archive audit event:

```powershell
firebase database:get "/reading_v2/audit_events/glMHCrzMnyS6AqFcb9I0nlOqQ6X2:packet9-live-20260610151227-passage:archive:reading_passage_archived:packet9-live-20260610151227-passage" --project temp-a1437 --json
```

Returned `action: reading_passage_archived`, `actorRole: teacher`, `after.state: archived`, `sourceFeatureId: teacher_materials_reading_passage_archive`, `sourceRoute: /lobby`, and `usedElsewhere: false`.

Restore audit event:

```powershell
firebase database:get "/reading_v2/audit_events/glMHCrzMnyS6AqFcb9I0nlOqQ6X2:packet9-live-20260610151227-passage:private:restore:reading_passage_restored:packet9-live-20260610151227-passage" --project temp-a1437 --json
```

Returned `action: reading_passage_restored`, `actorRole: teacher`, `after.state: published`, `after.visibility: private`, `sourceFeatureId: teacher_materials_reading_passage_restore`, and `sourceRoute: /lobby`.

## Verification

Packet 9 targeted test groups from both tasklists were rerun after the live-proof fixes.

- PRD-0052 publish/composition: 6 files, 42 tests.
- PRD-0052 duplicate-index integration: 2 files, 22 tests.
- PRD-0052 master modal/creation: 5 files, 82 tests.
- PRD-0052 assignment/runtime/result: 8 files, 68 tests.
- PRD-0052 submit-core equivalent: 1 file, 2 tests.
- PRD-0052 routes/registry/rules: 5 files, 95 tests, 11 skipped.
- PRD-0054 audit/duplicate foundations: 3 files, 28 tests, 7 skipped.
- PRD-0054 archive/restore data/library: 3 files, 19 tests.
- PRD-0054 archive UI: 4 files, 52 tests.
- PRD-0054 broken refs/master repair: 4 files, 21 tests.
- PRD-0054 Book repair: 9 files, 72 tests.
- PRD-0054 duplicate warning surfaces: 3 files, 6 tests.
- PRD-0054 assignment/runtime/result/publish: 7 files, 75 tests.
- PRD-0054 routes/registry/rules: 7 files, 115 tests, 17 skipped.
- Combined script ended with `ALL_PACKET9_TARGETED_GROUPS_PASSED`.

Final checks:

- UTF-8 targeted checks: PASS.
- `git diff --check`: PASS.

## Residual Risk

- Disposable live dev fixture remains in Firebase for auditability. It is clearly prefixed `packet9-live-20260610151227`.
- In-app browser API attach failed during final Student proof setup, so Chrome DevTools MCP was used. Reason is recorded in findings.
- Existing unrelated course-membership debug warning appeared during Student proof; no Reading V2 console errors or failed Reading V2 network requests were observed.

## Follow-Up Prompt

No Packet 9 follow-up prompt is required.
