# PRD0062b dormant decision archive — 2026-07-18

Status: DORMANT_AFTER_CODE_RESET

This directory was restored from Git object `d373e0d0ef01db0e2eb5bad29098750d4d9427e1` for future reimplementation against code baseline `a5059a7d4292062af8de82c5d0c04152645288fd`.

The dated product decision in `approval-record-2026-07-17-student-safe-full-pdf-streaming.md` remains retained design intent. It is not evidence that the baseline implements it. Every checkbox, status, implementation, test, browser, deployment, remote, route, version, binding, secret, credential, endpoint, or rollback claim in this directory is dated historical evidence only—not current state, task closure, or authorization to mutate or deploy.

On revival, first compare every claim to the live baseline and obtain fresh proof before changing status or reusing implementation.

The dormant checker intentionally tolerates two Component 02 evidence links into the retired external `documentation/tasks/PRD0062` tree. They remain historical references, not a reason to restore that tree. Active-plan validation will reject them again unless a future documentation cleanup replaces them with revalidated self-contained evidence.

## Retained full-PDF invariant

- One private immutable student-safe complete PDF is pinned per Source Version.
- The Worker authenticates user, context, entitlement, publication, and Source lifecycle before repository, ledger, or R2 access.
- One opaque resource supports full, `HEAD`, and bounded single-range streaming and is reused while the viewer selects `physicalPageNumber`.
- Page Groups map Activities only; they are not PDF transport objects.
- Never revive Browser Run, rasterization, splitting, page renditions or caches, per-page grants, public R2, query or cookie token authority, blob buffering, or copying-prevention promises.
- Teacher-only content, answer keys, authoring data, and unpublished or unpinned sources remain excluded.

## Stop boundary

No taskbox promotion or remote, deployment, credential, cleanup, rollback, or product-decision action is authorized without separate approval and fresh live proof. Root Components 02–03 remain the future plan owners for the next Source Delivery and Assembly slice; they own no current implementation status while this archive is dormant.
