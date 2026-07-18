# PRD0062b Approval Record — Conversation Decision Reconciliation

Date: 2026-07-14

Status: `APPROVED_AUTHORITY_EDIT`

Primary discussion record:

- Codex session `019f2325-1297-7461-b287-938fd0a68be0`
- Uploaded rollout log: `rollout-2026-07-02T21-04-25-019f2325-1297-7461-b287-938fd0a68be0.jsonl`

## Approved corrections

The user approved editing the canonical PRD and affected PRD0062b task authority to preserve the final accepted decisions from the detailed product-grilling conversation.

1. Reopen the exact teacher correction mechanism for a wrongly generated or uncertain `presentationMode`.
   - The earlier JSON-re-import-only statement was not approved.
   - Until a separate product decision is made, unresolved mode blocks publication.
   - Neither JSON-re-import-only nor an independent Placement/UI override is authoritative.
   - Any later mechanism must retain one Activity-content authority.

2. Make `Copy Unit JSON Prompt` and `Copy Revision Prompt` required product capabilities when their required context is available.
   - Teacher use remains optional.
   - Direct JSON file/drop import remains independent.
   - Clipboard failure requires the labelled manual-copy fallback.

3. Require a versioned IELTS Reading and Listening task-type coverage matrix before schema/runtime closure.
   - Every researched task type must be classified as structurally supported, source-assisted, explicitly unsupported and release-blocking, or separately approved as deferred.
   - Generic interaction-family names and isolated examples are not sufficient closure proof.

4. Restrict source labels to citations and exact response-control correspondence.
   - They may identify a page question, blank, diagram, exercise, part, or source location.
   - They may not become competing Activity headings, navigator/progress numbering, identity, or a second visible order.

5. Retain the optional student-controlled personal SVG timer as Full V1 scope.
   - It may follow the foundation prototype/pilot but must close before Full V1.
   - It is never teacher-enforced or teacher-visible.
   - It produces no timer telemetry and has no effect on deadlines, submission, grades, attempts, autosave authority, integrity, or completion.
   - It requires accessible state preservation across navigation and layout changes.

6. Remove residual multi-page terminology from active PRD interfaces, projections, tests, and superseded decisions.
   - The complete Unit/Page Group set remains authorization/navigation metadata.
   - Each cache/transport request returns one matching sanitized physical-page artifact.
   - Optional byte ranges may apply only within the already authorized one-page artifact.

## Files governed by this approval

- `prd-book-based-interactive-activity-runtime-and-assembly.md`
- `canonical-task-overrides.json`
- Components 02, 03, 04, 07, and 08
- `traceability-book-activity-v1.md`
- `check-canonical-plan.mjs`
- `reconciliation-ledger.md`
- `authority-and-provenance.md`
- `README.md`

## Scope boundary

This approval authorizes documentation and governance reconciliation only.

It does not:

- approve an implementation mechanism for `presentationMode` correction;
- close or check any additional task row;
- verify the IELTS task-type matrix;
- prove production one-page processing or delivery;
- authorize deployment, cloud mutation, staging, commit, push, or cleanup;
- change the current packet from P2;
- remove the existing P2 `CLOSURE_BLOCKED` state.
