# PRD0062b Packet P1 Storage And Security Inventory

Status: `VERIFIED`

Authority: Approved Amendment §§1, 4.1, 14; baseline PRD §§9, 24, 25, 29.1, 31.9; canonical Component 01 Tasks 5.6 and 7.1–7.5, 10.1.

This is the PRD0062b-local owner corresponding to historical PRD0062 storage/findings pointers. Historical files remain non-execution evidence and are not edited.

## Canonical stores

| Store/path | Owning service | Immutable/mutable contract | Index/query dimensions | Browser read/write authority | Student-safe boundary | Migration/archive/delete | Backup/negative proof |
|---|---|---|---|---|---|---|---|
| `book_activity/materials/{activityId}` | `activityAuthoring.service.ts`; trusted authoring Worker/repository | Identity, kind, owner, creation fixed; title/lifecycle/current draft/version pointer trusted mutable | `.indexOn`: `ownerId`, `lifecycleState`, `materialKind` | Active teacher owner or active super-admin direct read; browser write denied | Metadata is authoring state, never student delivery | No deployed compatible rows; archive lifecycle retained; browser delete denied | `bookActivityFirebaseRules.test.ts`; `data-backup.test.ts`; `restore-execute.test.ts` |
| `book_activity/candidates/{candidateId}` | trusted authoring Worker/service | One bounded raw replacement payload; atomically consumed on Save Draft | `.indexOn`: `ownerId`, `status`, `targetActivityId` | Active teacher owner or super-admin direct read; browser write denied | Never projected to students | Temporary until consumed; no client delete | Direct/ancestor candidate writes denied in emulator |
| `book_activity/drafts/{activityId}/{draftId}` | trusted authoring Worker/service | One HMAC-bound editable payload; revision/CAS mutable | `.indexOn`: `ownerId`, `activityId`, `updatedAt` | Active teacher owner or super-admin direct read; browser write denied | Never projected to students | Retained authoring state; trusted lifecycle only | Direct/ancestor draft writes denied; authoring CAS tests |
| `book_activity/versions/{activityId}/{versionId}` | trusted publish transaction | Immutable normalized content, hidden interaction/item IDs, publish identity/time | `.indexOn`: `ownerId`, `publishedAt` | Active teacher owner or super-admin direct read; browser write denied | Canonical answer-bearing version never student-readable | Immutable; archive through material lifecycle, not mutation | Student/cross-owner reads and all browser writes denied |
| `book_activity/student_safe_projections/{activityId}/{versionId}` | `activityProjection.service.ts`; trusted publish transaction | Exact allowlisted immutable derivative of version | `.indexOn`: `activityId`, `versionId`, `projectionKind` | Active teacher owner or super-admin direct read; browser write denied; students denied | Students obtain context-bound Book Delivery projection only after entitlement; canonical enumeration forbidden | Rebuilt/replay-checked from immutable version; no browser delete | Nested allowlist mutation tests; actual emulator student/cross-owner/ancestor denials |
| `book_activity/draft_save_operations/{operationId}` | trusted authoring transaction | Immutable HMAC/idempotency ledger | Direct operation lookup only; no client query | Active super-admin read; browser write denied | Never student-visible | Retained for replay/audit; trusted retention only | Explicit deny rules and emulator admin/teacher/student read proof |
| `book_activity/activity_publish_operations/{operationId}` | trusted publish transaction | Immutable HMAC/idempotency/publication ledger | Direct operation lookup only; no client query | Active super-admin read; browser write denied | Never student-visible | Retained for replay/audit; trusted retention only | Explicit deny rules and emulator admin/teacher/student read proof |
| `material_catalog/material_summary_indexes/v1/**` Activity rows | `bookActivityMaterialSummary.service.ts`; shared `materialSummaryPort.service.ts` | Private, allowlisted summary derived from aligned published material/version/projection | `by_id`, `by_owner`, `by_visibility/private`, `by_material_kind/interactive-activity`, `by_test_type` | Existing universal summary rules: active teacher owner/admin writes and owner/admin reads; Activity public rows rejected; students denied | Contains no answers/authoring/source internals; `deliveryProjectionReady: false` in P1 | Reconciled from `book_activity/materials`; archived summary leaves active list indexes | Material Catalog emulator owner/cross-owner/student/public-negative proof |

## Non-stores and indexes

- No Packet P1 Firestore collection exists. `firestore.rules` and `firestore.indexes.json` require no Activity delta.
- Existing RTDB `.indexOn` entries above match current owner/status/direct-lookup inventory. No speculative index is added without a query owner.
- `BookEditorWorkspace` reads canonical summary `by_owner` and `by_visibility/public` indexes plus legacy indexes for compatibility. Capability filtering is central; Activity summaries remain private.
- No new P1 R2 object or automatic restore-sensitive database trigger exists.

## Backup and recovery

- `r2-backup-worker/src/backup/data-backup.ts` includes required RTDB node `book_activity`.
- `r2-backup-worker/src/restore/restore-execute.ts` includes `book_activity` in approved restore inventory.
- Shallow-root backup/restore also preserves `material_catalog/material_summary_indexes/v1`; final focused tests assert a private Activity summary/version/projection-readiness row round-trips with its canonical index root.
- This packet accepts local backup/restore inventory proof only: final focused Vitest passed 2 files/6 tests. No deployed backup, remote object, recovery rehearsal, or remote readback is inferred.

## Residual operational risks

- Full `book_activity` ETag/CAS replacement grows with immutable history; retention/partitioning remains later operational work.
- Material Summary producer contract is P1-owned and verified locally; lifecycle composition/persistence activation remains fail-closed until its owning authoring integration packet composes it.
- Later dirty Assembly/runtime stores are outside P1 and do not change this inventory.
