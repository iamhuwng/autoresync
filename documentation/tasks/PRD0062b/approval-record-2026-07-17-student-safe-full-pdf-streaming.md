# PRD0062b Student-Safe Full-PDF Streaming Approval — 2026-07-17

Status: `APPROVED_AUTHORITY_EDIT`

## Decision

The user approved replacing the derived-one-page PDF delivery architecture with authenticated delivery of the complete immutable student-safe PDF.

The production student runtime is:

```text
private immutable student-safe PDF in R2
        -> trusted publication pins Source Version and page mappings
        -> Book Delivery verifies current student/context/entitlement
        -> governed Worker streams the complete pinned PDF
        -> normal PDF viewer opens the selected physical page
        -> Page Group/Placement metadata selects the right-panel Activities
```

Browser Run, page rasterization, PDF splitting, derived one-page PDF objects, rendition caches, and per-page resource grants are not part of the production path.

## Product reasoning

The earlier one-page architecture depended on four assumptions that are no longer accepted:

1. Exact textbook-page fidelity requires rendering. It does not; the original PDF viewer preserves the page.
2. An assigned student must be prevented from seeing the complete Book PDF. The revised product rule allows the complete student-safe PDF.
3. One-page delivery materially prevents copying. It does not prevent screenshot, print, save, screen recording, or camera capture.
4. Free-tier capacity supports Browser Run as the normal PDF primitive. It does not support the intended workload reliably, and rendering adds compute/quota work that document streaming avoids.

## Student-safe source boundary

The PDF delivered to students must contain no teacher notes, answer keys, unpublished authoring material, or other teacher-only content. Teacher-only material must be stored separately or excluded before the source is marked student-safe.

The student receives no:

- R2 key, bucket authority, or storage credential;
- unpublished or unpinned Source Version;
- teacher-only source asset;
- answer-key or authoring data;
- authority for another Book, user, or delivery context.

The app does not promise screenshot, print, save, or redistribution prevention.

## Retained capabilities

These remain valid and must not be rebuilt merely because transport changed:

- private R2 ingress and direct-object denial;
- immutable Source Version identity and replacement;
- trusted checksum, byte size, PDF validation, and page count;
- canonical one-based `physicalPageNumber` and printed-page labels;
- Page Group and Placement many-to-many page-to-Activity mapping;
- Assembly candidate/reconciliation/atomic publication;
- pinned Source/Activity/Placement versions;
- context-bound entitlement, expiry/refresh, revocation, and reload safety;
- two-column runtime, autosave, Activity submission, results, and updates;
- backup/restore, audit, idempotency, and cleanup for actual persisted resources.

## Superseded capabilities

These are removed from the production contract and cannot remain closure gates:

- Browser Run/PDF.js page rendering;
- derived one-page PDF generation;
- page-rendition identity and cache objects;
- per-page delivery grants and per-page resource refresh;
- renderer quota/billing/fidelity benchmarks;
- rendition-object backup, restore, cleanup, and mutation journals;
- publication blocked on rendition readiness;
- student navigation that requires a new PDF resource for every page.

Historical proof for those paths remains historical evidence. It does not prove or block the replacement architecture.

## Packet and task disposition

Packet 1 remains `VERIFIED`. Its Activity schema, capability registry, authoring security, immutable Activity versions, and student-safe Activity projection are unaffected. Do not reopen Packet 1 without a separate live contradiction.

Packet 2 remains `CLOSURE_BLOCKED`, but its blocker changes from renderer proof to document-stream proof. Preserve verified upload, Source Version, page-count, mapping, Assembly, and publication behavior. Reopen or replace only rows whose accepted claim depends on derived renditions, per-page grants, or one-page transport.

Affected task owners:

| Component | Strategic change |
|---|---|
| C02 | Replace renderer/rendition/cache/per-page-grant work with student-safe classification, authenticated full-document streaming, range/resume behavior, and stream authorization proof. |
| C03 | Keep Page Groups and page-to-Activity mapping; replace rendition-readiness preview/publication gates with student-safe Source Version and document-delivery readiness. |
| C04 | Keep two-column runtime and canonical page navigation; load one document resource and change page/view state without fetching a derived PDF per page. |
| C05 | Freeze the pinned student-safe Source Version and mappings, not rendition IDs or per-page resources. |
| C06 | Invalidate stale document authorization after selected Source Version changes; no rendition-cache cleanup exists. |
| C07 | Resolve one full-document resource per delivery context; keep entitlement/publication/version checks and private-authority exclusion. |
| C08 | Replace renderer/quota/fidelity proof with stream/concurrency/range/authorization/browser proof for representative 20–500-page PDFs, 100–200 uploads per day, and 2–5 simultaneous uploads/deliveries. |

## Scope and non-approval

This approval authorizes PRD/task/governance documentation changes. It does not:

- modify production code;
- deploy Workers, Firebase rules, or R2 configuration;
- close Packet 2 or later packets;
- promote old renderer proof to stream proof;
- authorize staging, commit, push, destructive Git actions, or cleanup;
- weaken private R2, entitlement, publication, version, backup, or authorization safety.

## Required authority updates

The following active authority must agree before this documentation change is complete:

- canonical PRD;
- Components 02–08 where they consume Source Delivery;
- `canonical-task-overrides.json`;
- master orchestration and packet exit gates;
- traceability and architecture;
- reconciliation ledger and authority/provenance;
- semantic governance validator.
