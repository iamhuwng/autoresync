# Reading V2 Audit Trail Contract

Status: required architecture contract for PRD-0054 implementation.

## Scope

Reading V2 destructive, repair, archive, restore, and duplicate-decision actions use a Reading V2-specific audit path. Do not reuse the legacy shared `audit_logs` path for these PRD-0054 events.

## Storage Path

Use RTDB path:

```text
reading_v2/audit_events/{eventId}
```

Writes are append-only. No update or delete is allowed after event creation.

Event IDs are path segments. Build event IDs from sanitized parts only: replace RTDB-forbidden characters (`.`, `#`, `$`, `[`, `]`, `/`) before calling the audit path helper. Correlation IDs commonly include timestamps, so they must not be interpolated directly into the path.

## Required Event Shape

Each event must include:

- `schemaVersion`
- `eventId`
- `createdAt`
- `actorUserId`
- `actorRole`
- `action`
- `entityType`
- `entityId`
- `ownerId` when known
- `materialId` when known
- `versionId` or `snapshotVersionId` when known
- `titleSnapshot` when available
- `usedElsewhere` when available
- `usageCategories` when available
- `before` and `after` summaries for repair/ref changes
- `adminOverride` for super-admin actions
- `correlationId`
- `sourceFeatureId`
- `sourceRoute`

Events must not include passage body, canonical payload, answer keys, student answers, scoring rules, AI review evidence, hidden provenance, or import evidence.

## Required Actions

- `reading_passage_archived`
- `reading_passage_restored`
- `reading_master_removed`
- `reading_master_broken_ref_repaired`
- `reading_book_broken_ref_repaired`
- `reading_duplicate_warning_existing_used`
- `reading_duplicate_warning_restore_used`
- `reading_duplicate_warning_bypassed`
- `reading_super_admin_passage_archived`

View-only events such as broken-ref warning viewed or duplicate warning shown belong to feature observability, not this audit path.

## Master Removal Events

`reading_master_removed` is written after a Reading V2 master full-test is soft-removed.

The event covers both Teacher Lobby modal outcomes:

- `Remove master only`
- `Remove master and linked passages`

Linked passage archive events remain separate `reading_passage_archived` events because each linked passage state change is owned by the Reading Passage archive service. Do not encode passage bodies, answer keys, review payloads, or frozen assignment/result payloads in either event family.

Feature observability owns UI decision/action ids such as `master_delete_requested`, `master_linked_passages_remove_requested`, `teacher_materials_reading_master_removed`, and `teacher_materials_reading_master_and_linked_passages_removed`.

## Implementation Ownership

Use a Reading V2 service:

```text
src/services/reading-v2/readingV2AuditTrail.service.ts
src/services/reading-v2/readingV2AuditTrail.service.test.ts
```

The service must validate payload shape before writing and must fail closed for missing required state-changing audit fields. User-facing state changes that require audit must not silently skip this service.

## Registration Requirements

Implementation must update:

- `database.rules.json` for append-only create rules and super-admin read rules.
- `src/__tests__/security/readingV2FirebaseRules.test.ts` for create/read/update/delete coverage.
- `src/config/featureRegistry.ts` and `src/config/featureRegistry.test.ts` for visible user actions that cause audit events.
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md` with evidence for event writes, denied mutation, and denied unsafe payload fields.

## Rule Interaction

Read `documentation/rules/infrastructure.md` before adding this RTDB node. Read `documentation/rules/observability.md` before adding or changing any user-facing action that triggers these events.

## Admin Monitor Read Contract

`src/pages/AdminReportsPage.tsx` may read recent rows from `reading_v2/audit_events` for production health monitoring.

Rules:

- The admin monitor is read-only.
- It should read a bounded recent set, currently `limitToLast(25)`.
- It may show summary fields such as action, entity, actor, source route, and timestamp.
- It must not render raw `before`, `after`, canonical payloads, passage bodies, answer keys, student answers, scoring rules, AI review evidence, hidden provenance, or import evidence.
- It must not become a repair, archive, restore, or override writer. State-changing flows still go through the owning Reading V2 service and append-only audit writer.

Related architecture: `documentation/architecture/reading-v2-runtime-integrations.md`.
