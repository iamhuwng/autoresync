# PRD-0052 Security Rule Validation Cases

Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

Verification command:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic --pool=forks"
```

Result on 2026-06-02: passed, 3 files / 16 tests passed / 5 emulator tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

## Required Cases

- Teacher can read/write own Books: covered by `materialCatalogFirebaseRules.test.ts` Book metadata/node owner rules.
- Teacher cannot mutate another teacher's private Book: covered by owner-gated Book metadata/node write rules and super-admin exception checks.
- Public-library Book read path does not expose private/non-shareable refs: covered by public Book metadata read rule excluding student role plus Book ref display/list tests that use snapshots only.
- Student cannot read Book organizer data in V1: covered by Book metadata/node rules that do not include student role.
- Student can read assigned Reading Passage projection: covered by Reading V2 student-readable path matrix and homework launch/projection tests.
- Student can read assigned combined Reading Passage homework projection: covered by homework Firestore shape rules and Reading Passage set launch/submission tests.
- Student can read resolved assigned full-test projection but cannot read mutable passage entities: covered by Reading V2 operational matrix allowing student-safe/session-safe projections and excluding canonical drafts/published snapshots.
- Student cannot read canonical Reading Passage content or answer keys: covered by Reading V2 rules requiring student-readable paths to forbid scoring/import/provenance fields and excluding canonical path classes from student roles.
- Only super admins can write Test Type config: covered by `materialCatalogFirebaseRules.test.ts` Test Type write rule check.
