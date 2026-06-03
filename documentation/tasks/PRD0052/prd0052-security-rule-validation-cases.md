# PRD-0052 Security Rule Validation Cases

Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

Verification command:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic --pool=forks"
```

Result on 2026-06-02: passed, 3 files / 16 tests passed / 5 emulator tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

Focused result on 2026-06-03:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic"
```

Result: passed, 1 file / 11 tests. Coverage now checks that `material_catalog` has no root `.read`/`.write` gate, child rules can grant scoped teacher access to safe listing and public projection paths, and Book metadata/node/projection validation does not require RTDB-omitted empty-array/null fields (`authors`, `tags`, `parentNodeId`, `materialRefs`).

Focused Reading Passage list-bucket result on 2026-06-03:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic"
```

Result: red first, then passed, 1 file / 11 tests. The new regression covers bucket-level `.read` rules for `material_catalog/material_indexes/by_owner/{teacherId}` and `material_catalog/material_indexes/by_visibility/{visibility}` because the production Reading Passage library list reader reads those buckets, not only individual `{materialId}` rows. Post-deploy browser QA confirmed the Teacher `Reading Passage` Private/Public scopes load without RTDB `Permission denied`.

Live RTDB rules were deployed with:

```powershell
cmd /c firebase deploy --only database --project temp-a1437
```

Result: passed. Rules syntax was valid and released to `temp-a1437-default-rtdb`. Post-deploy browser proof passed for super-admin public Book approval plus another-teacher public Book list/detail through `material_catalog/public_book_projections`. Emulator-backed validation is still blocked because Java is not on PATH.

Second live deploy on 2026-06-03 used:

```powershell
cmd /c npx firebase-tools deploy --only database --project temp-a1437
```

Result: passed. Rules syntax was valid and released to `temp-a1437-default-rtdb`. Post-deploy browser proof passed for Teacher `Reading Passage` tab Private/Public empty-state reads through `material_catalog/material_indexes`. No Reading Passage assignment security browser proof was possible because current live RTDB has no Reading Passage material/index/projection rows.

## Required Cases

- Teacher can read/write own Books: covered by `materialCatalogFirebaseRules.test.ts` Book metadata/node owner rules.
- Teacher cannot mutate another teacher's private Book: covered by owner-gated Book metadata/node write rules and super-admin exception checks.
- Public-library Book read path does not expose private/non-shareable refs: covered by raw Book metadata owner-only rules, public-safe `material_catalog/public_book_projections` rules, public Book approval service tests, and Book detail projection fallback tests.
- Student cannot read Book organizer data in V1: covered by Book metadata/node rules that do not include student role.
- Student can read assigned Reading Passage projection: covered by Reading V2 student-readable path matrix and homework launch/projection tests.
- Student can read assigned combined Reading Passage homework projection: covered by homework Firestore shape rules and Reading Passage set launch/submission tests.
- Student can read resolved assigned full-test projection but cannot read mutable passage entities: covered by Reading V2 operational matrix allowing student-safe/session-safe projections and excluding canonical drafts/published snapshots.
- Student cannot read canonical Reading Passage content or answer keys: covered by Reading V2 rules requiring student-readable paths to forbid scoring/import/provenance fields and excluding canonical path classes from student roles.
- Only super admins can write Test Type config: covered by `materialCatalogFirebaseRules.test.ts` Test Type write rule check.
