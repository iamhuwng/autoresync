# IELTS Writing Architecture Pack

This folder is the architecture front door for the IELTS Writing domain.

Use it when work touches:
- Writing test creation or delivery
- teacher grading and re-grade flows
- student Writing result surfaces
- Writing-specific persistence, compatibility, or visibility rules
- teacher-only AI assistance inside grading

This pack does not replace the detailed PRD/spec/audit documents. It gives the shortest reading path and points to the detailed source-of-truth docs.

## Reading Order

1. `lifecycle-and-surfaces.md`
2. `authoring-edit-shell-and-publish-contract.md`
3. `contracts-and-governance.md`
4. `grading-editor-state-and-compatibility.md`
5. `essay-editor-tool-contract-and-mark-composition.md`
6. `ai-suggestions-and-injection.md`

## What This Pack Covers

- the active Writing lifecycle from submit to published result
- the current teacher authoring and shared edit-shell contract
- the current teacher and student surfaces
- the canonical storage contract
- the grading editor's task-state, draft, lock, and AI-suggestion cache contract
- the essay editor tool contract, mark-composition boundary, and suggestion-focus command
- how teacher-only AI suggestions are generated, reviewed, cached, diagnostically captured, and injected into existing grading tools
- how Writing relates to the generic result-view shell and visibility systems
- which older assumptions are now superseded

## Domain Rules

- IELTS Writing is a manual-grading domain, not an auto-graded result flow.
- Firestore `writing_submissions/{submissionId}` is canonical for grading state.
- Firestore `writing_grading_ai_cache/{submissionId}` is teacher-private helper state, not a grading artifact.
- RTDB `test_results` remains a discovery, release, and compatibility layer.
- Pure Writing post-submit flow is acknowledgement-first, not immediate result review.
- Writing result readers are dedicated Writing surfaces, not generic score/review/feedback shells.
- AI suggestions do not publish, save, or apply feedback automatically.

## Source Documents

Primary references:
- `../../tasks/0030-prd-ielts-writing-test-system.md`
- `../../tasks/0042-writing-result-redesign.md`
- `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
- `../../../.knowns/docs/specs/ielts-writing-result-surfaces-2026-03-30.md`
- `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
- `../../../.knowns/docs/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29.md`
- `../../../.knowns/docs/architecture/ielts-writing/ielts-writing-ai-suggestions-and-injection-2026-04-02.md`

Related shared architecture docs:
- `../result-view/README.md`
- `../results-academic-record.md`
- `../result-visibility-ownership-governance.md`
- `../result-view-permission-matrix.md`

## Update Rules

- If a Writing lifecycle state or host surface changes, update `lifecycle-and-surfaces.md`.
- If the writing edit/resume shell, save/publish flow, settings-tab ownership, or shared-shell layout contract changes, update `authoring-edit-shell-and-publish-contract.md`.
- If storage, release gating, ownership, teacher-private helper state, or compatibility rules change, update `contracts-and-governance.md`.
- If grading-editor task state, draft behavior, suggestion-cache behavior, or result compatibility metadata changes, update `grading-editor-state-and-compatibility.md`.
- If essay-editor tools, selection routing, focus commands, or mark-composition rules change, update `essay-editor-tool-contract-and-mark-composition.md`.
- If AI run scope, review workflow, cache normalization, diagnostic artifacts, or injection rules change, update `ai-suggestions-and-injection.md`.
- If the source-of-truth spec moves, update the links in this README.
