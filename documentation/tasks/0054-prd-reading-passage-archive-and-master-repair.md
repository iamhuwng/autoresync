# PRD-0054: Reading Passage Archive And Master Repair

> **PRD Number:** 0054
> **Status:** Discovery Draft
> **Created:** 2026-06-09
> **Author:** Codex via planning session
> **Audience:** Junior developer implementing only after a tasklist is created and approved
> **Primary surfaces:** Teacher Materials, Reading Passage tab, Edit Test Modal, single-passage Reading V2 Studio, Book tab, Book Edit Modal, Reading V2 publish and assignment guards

---

## 1. Introduction / Overview

### 1.1 Problem Statement

PRD-0052 introduced Reading Passages as reusable standalone materials and full Reading V2 tests as compositions that should reference those passages.

The current product gap is deletion and repair safety:

- teachers need a safe way to remove Reading Passages from the library
- master tests and Books can reference passages that later become archived, missing, inaccessible, or invalid
- broken refs must not crash Edit Test Modal, single-passage Studio, Book views, or material cards
- teachers need clear repair actions when a referenced passage is gone
- existing homework, attempts, and saved results must keep working from frozen snapshots

This PRD defines the delete/archive, broken-ref detection, repair, restore, duplicate-check, and composition-first alignment required to make Reading Passage reuse safe.

### 1.2 Goal

Build a safe lifecycle for Reading Passage materials:

- teachers can remove own Reading Passages from the library without breaking historical snapshots
- master tests and Books show broken refs clearly
- Edit Test Modal, single-passage Studio, and Book editor provide repair actions without requiring teachers to guess
- existing assigned work and results keep working from frozen snapshots
- new publish and assignment flows block unresolved broken refs
- future new full-test publishes align with PRD-0052 Part 2 composition-first behavior

### 1.3 Relationship To Existing PRDs

This PRD is separate from PRD-0052.

It extends PRD-0052 by adding:

- Reading Passage archive and restore behavior
- master delete options for linked passages
- broken-ref UI and repair flows
- Book broken-ref repair behavior
- duplicate guard for manually remade passages
- audit and observability requirements
- alignment plan for new composition-first publishes

Relevant existing docs:

- `documentation/tasks/0052-prd-teacher-materials-books-and-reading-passage-library.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/ui-design-standards.md`

### 1.4 Current Codebase Reality

Current Reading V2 full-test publish is additive:

- it can create standalone Reading Passage entities on publish
- the full-test material can still keep embedded passage payloads for compatibility
- old tests are not guaranteed to be thin composition-only masters
- Reading Passage archive behavior exists partially, but the broader delete/repair lifecycle is incomplete

This PRD must not assume old content has already been migrated.

### 1.5 Alignment With PRD-0052 Part 2

PRD-0052 Part 2 changes the master editing model for published Reading V2 full tests:

- unpublished new full-test drafts may still use full-test Studio before first publish
- first publish splits content into standalone Reading Passage entities and a ref-only master composition
- after publish, `Edit Test` opens Edit Test Modal, not full-test Studio
- each passage slot opens single-passage Studio in another browser tab

This PRD must follow that model. Wherever this PRD says a broken master is repaired "in Studio", read it as:

- Edit Test Modal handles master composition repair, such as add existing, remove passage, replace ref, and broken-slot state
- single-passage Studio handles passage authoring, manual remake, and passage-version editing
- single-passage Studio is not full-test Studio; it must hide `Add Passage` and any passage-collection remove controls because a Reading Passage entity contains exactly one passage
- no full-test Studio is used for already published master tests

---

## 2. Definitions

### 2.1 Reading Passage

A standalone Reading V2 material containing one passage plus its questions, answer rules, scoring rules, metadata, and safe projections.

### 2.2 Master Test

A Reading V2 full-test material that should reference ordered Reading Passage materials by id/version/order.

### 2.3 Composition Ref

A reference from a master test or Book to a Reading Passage material and version/snapshot.

### 2.4 Remove From Library

Teacher-facing label for removing a Reading Passage from active library surfaces.

Implementation behavior:

- archive the material
- hide it from active `Private` and `Public` Reading Passage lists
- keep frozen snapshots/history safe

### 2.5 Archive

Backend state for a removed Reading Passage.

Archived passages:

- appear in the `Archive` subtab for the owner
- are read-only until restored
- do not appear in active pickers
- can make master tests and Books show broken refs

### 2.6 Broken Ref

A composition ref is broken when any of these are true:

- referenced passage material is missing
- referenced passage material is archived
- referenced version or snapshot is missing
- current user lacks permission to read the referenced passage
- replacement/test type compatibility fails
- referenced content was permanently deleted by backend maintenance

### 2.7 Replacement Draft

Manual remake content created inside single-passage Studio to replace a broken passage ref.

It becomes a standalone published Reading Passage when the teacher uses normal single-passage Studio `Publish`. The originating master or Book ref must update atomically with that publish result.

### 2.8 Frozen Snapshot

A snapshot/projection pinned at assignment or result time.

Frozen snapshots must keep existing assigned homework, started attempts, and saved results working even if the source Reading Passage is later archived.

---

## 3. Locked Product Decisions

1. UI label for teachers is `Remove from library`, not hard delete.
2. Backend behavior is archive in V1.
3. Normal teachers do not get hard delete UI in V1.
4. Backend/admin maintenance may hard-delete later outside this feature.
5. Only the owner can remove/archive a Reading Passage.
6. Super admin can archive a Reading Passage with audit.
7. `Reading Passage` tab gets a third scope subtab named `Archive`.
8. Archive tab rows support view read-only, restore, and used-elsewhere flag.
9. Archive tab rows do not expose permanent delete.
10. Restoring archived passage uses the same passage id/version and makes broken refs to that id/version work again.
11. Restore modal lets the owner restore as `Private` or `Public`.
12. Non-owner teachers do not see archived public passages in their Archive tab.
13. Master delete modal supports `Remove master only`, `Remove master and linked passages`, and `Cancel`.
14. `Remove master and linked passages` is allowed only when all linked passages are owned by the teacher.
15. If one linked passage is not owned by the teacher, block linked-passage removal and allow master-only removal.
16. If linked passages are used elsewhere, still allow archive after warning and checkbox.
17. Master delete cannot select individual linked passages; individual passage removal is done from that passage's card/page.
18. Broken master tests cannot be assigned.
19. Broken master tests cannot be published until unresolved broken refs are repaired or removed.
20. Preview/open outside the editor for broken master shows blocked state with `Repair in Edit Test`.
21. Existing assigned homework with frozen snapshot keeps working.
22. Started attempts can finish from frozen snapshot.
23. Saved results behave normally from saved result/snapshot data.
24. A master test can intentionally have any number of passages.
25. Do not hard-block IELTS masters only because they have fewer or more than 3 passages.
26. Passage count changes require warning/numbering review, not automatic rejection.
27. Book cards show a broken-link icon when any ref is broken.
28. Book broken icon opens the Book Edit Modal / Book Editor Workspace focused on broken refs.
29. Book editor shows the same three repair options as Edit Test Modal for broken Reading Passage refs.
30. If Book repair chooses manual remake, it opens single-passage Reading V2 Studio in another browser tab instead of turning Book editor into a passage authoring surface.
31. Manual remake starts blank.
32. Manual remake carries metadata only: source full test id, passage order slot, source question range, and test type.
33. Manual remake has no separate publish button. Teacher uses normal Studio `Save Draft` and `Publish`.
34. Single-passage Studio publish atomically creates/publishes replacement Reading Passage and updates the originating master ref.
35. Replacement passage visibility inherits master visibility.
36. Duplicate check warns at 80% similarity.
37. Duplicate comparison uses passage body and question text equally.
38. Duplicate formula is deterministic: normalize text, compare hashed word-shingle sets with Sorensen-Dice similarity, compute body similarity and question similarity separately, and calculate combined similarity as `round((bodySimilarity * 0.5 + questionSimilarity * 0.5) * 100)`.
39. Passage body comparison uses normalized five-word shingles.
40. Question comparison uses normalized three-word shingles from visible prompts, instructions, choices, labels, and table/diagram visible text only.
41. Duplicate check must not use answer keys, scoring rules, hidden provenance, AI evidence, or full canonical payload downloads.
42. Duplicate check compares only passages the teacher can access: active accessible passages and the teacher's own archived passages.
43. Duplicate warning shows title, similarity percent, `Use existing`, and `Create new anyway`.
44. Archived duplicate match offers `Restore and use` and `Create new anyway`.
45. Add-existing replacement attaches latest published version by default.
46. Normal add-existing picker does not show archived passages.
47. Archive restore is done from `Reading Passage > Archive`, not from normal picker.
48. Duplicate index path is `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`. It stores the current passage-material duplicate row and includes `currentVersionId`.
49. Audit records are readable by super admin only in V1. This PRD does not add a super-admin archive/restore UI or a super-admin audit-management UI; future UI requires a separate PRD.
50. PRD-0054 audit events use `reading_v2/audit_events/{eventId}` and the contract in `documentation/architecture/reading-v2-audit-trail.md`, not legacy `audit_logs`.
51. No AI remake in V1.
52. No auto-repair of broken refs in V1.
53. No student runtime layout changes in this PRD.
54. Old full tests are not migrated in V1.
55. New publishes must align with PRD-0052 Part 2 composition-first behavior in the later alignment phase of this PRD.
56. Broken master repair for published masters happens in `ReadingV2MasterEditModal`, not full-test Studio.
57. Manual remake from a broken master opens single-passage Studio in another browser tab.

### 3.1 Implementation Clarifications

1. `Add from existing Reading Passages` should default to same Test Type matches first, but a Test Type mismatch is allowed with explicit teacher confirmation and a warning. This aligns repair with PRD-0052 Part 2, where mixed-Test-Type masters are allowed with warning.
2. Broken-ref manual remake is a special replacement flow. When the teacher launches remake from a broken master or Book ref and publishes the replacement passage, the originating broken ref updates as part of that replacement workflow and does not open the normal `Update references?` modal.
3. Normal healthy passage edits still follow PRD-0052 Part 2: publish a new passage version, leave existing master/Book refs pinned, and show `Update references?` only for owned refs that can be selected.
4. `Remove master only` is a V1 soft removal from active master lists. V1 does not add a master Archive tab or master restore UI unless a later PRD explicitly requests it.
5. Archive, restore, visibility-change, repair, and reference-update services own broken-ref recompute for safe master/Book summaries. Student launch paths and read-only card rendering paths must not write broken-ref state.
6. Audit logs are for state-changing actions. Broken-ref viewed events are observability/analytics events, not append-only audit-log records, unless super-admin audit policy later requires that expansion.
7. PRD-0054 state-changing audit uses the Reading V2 path `reading_v2/audit_events/{eventId}` through `src/services/reading-v2/readingV2AuditTrail.service.ts`. Legacy `audit_logs` must not be extended for these events.
8. The duplicate threshold is already approved at 80 percent. The approved formula is the deterministic hashed-shingle Sorensen-Dice formula in decisions 38-40. Implementation must not stop to re-ask for a threshold or formula unless the index cannot be built safely.
9. The duplicate index path is approved as `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}` for V1. Store `currentVersionId` inside the row; do not add version-row indexing unless a later PRD requires old-version duplicate checks.
10. Published-master repair UI owner is `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`. It may reuse existing `EditTestFrame` internals only after Phase 0 findings prove those internals support ref-only composition without embedded-payload editing.
11. V1 has no super-admin archive/restore UI and no super-admin audit-management UI. Service/rules/audit support only; any super-admin UI requires a future PRD.

---

## 4. Goals

1. Let teachers safely remove own Reading Passages from active library surfaces.
2. Prevent broken Reading Passage refs from crashing Studio, Book editor, material cards, assignment, or publish.
3. Give teachers clear repair options for broken refs.
4. Preserve existing homework, attempts, and saved results from frozen snapshots.
5. Block new assignment/publish when unresolved broken refs remain.
6. Add restore support through `Reading Passage > Archive`.
7. Add duplicate warning before manually remade passages create unnecessary duplicates.
8. Capture audit and observability for destructive and repair actions.
9. Align new full-test publish with PRD-0052 Part 2 composition-first behavior without migrating old tests.

---

## 5. Non-Goals

This PRD does not include:

1. AI remake of deleted passages.
2. Normal-user hard delete UI.
3. Automatic repair of broken refs.
4. Public marketplace dependency logic.
5. Student runtime layout changes.
6. Migration of old embedded full-test materials.
7. Detailed teacher-visible where-used lists.
8. Permanent delete from Archive tab.
9. Direct manual Reading Passage creation from the Reading Passage tab as a primary CTA.

---

## 6. User Stories

1. As a teacher, I want to remove an old Reading Passage from my library so that my active list stays clean.
2. As a teacher, I want to restore an archived Reading Passage so that I can use it again.
3. As a teacher, I want to delete a master test without accidentally deleting shared passages.
4. As a teacher, I want to delete a master test and all linked passages when I own them so that cleanup is fast.
5. As a teacher, I want a clear warning when a passage is used elsewhere so that I understand other materials may need repair.
6. As a teacher, I want Edit Test Modal to show a removed passage as broken instead of silently hiding it.
7. As a teacher, I want to add an existing passage to repair a broken master slot.
8. As a teacher, I want to remove a broken passage slot from a master test when I no longer need it.
9. As a teacher, I want to manually remake a missing passage from scratch when no suitable existing passage exists.
10. As a teacher, I want a duplicate warning before creating a similar replacement passage.
11. As a teacher, I want Books to show broken passage refs and repair options.
12. As a student, I want already assigned work to keep working from its saved snapshot even if the teacher later archives a source passage.
13. As a super admin, I want audit records for archive, restore, delete, and repair actions.

---

## 7. Functional Requirements

### 7.1 Reading Passage Remove From Library

FR-RP-ARCH-1. The system must show `Remove from library` for owner-owned Reading Passage rows/cards/pages.

FR-RP-ARCH-2. The system must not show `Remove from library` to non-owners.

FR-RP-ARCH-3. Super admins may archive Reading Passages through admin-capable surfaces with audit.

FR-RP-ARCH-4. Removing from library must archive the Reading Passage material, not hard-delete it.

FR-RP-ARCH-5. Archived Reading Passages must disappear from active `Private` and `Public` Reading Passage lists.

FR-RP-ARCH-6. Archived Reading Passages must disappear from normal add-existing pickers.

FR-RP-ARCH-7. Archiving a passage must mark the whole passage material as archived. It must not archive only one version while leaving other versions active in active lists.

FR-RP-ARCH-8. Archiving must preserve frozen snapshots and projections required by already assigned homework, started attempts, and saved results.

FR-RP-ARCH-9. If the passage is used elsewhere or active homework exists, the confirmation modal must show a generic warning and require a checkbox before archive.

FR-RP-ARCH-10. The generic warning text must not list every dependent item. It should communicate that the passage is used elsewhere.

FR-RP-ARCH-11. The backend must re-check ownership and usage/broken-impact state at confirm time to prevent race conditions.

### 7.2 Reading Passage Archive Subtab

FR-RP-ARCHTAB-1. The Reading Passage scope control must include `Private`, `Public`, and `Archive`.

FR-RP-ARCHTAB-2. `Archive` shows only archived Reading Passages owned by the current teacher.

FR-RP-ARCHTAB-3. Non-owner users must not see archived public passages in their own Archive tab.

FR-RP-ARCHTAB-4. Archive rows must support `View read-only`.

FR-RP-ARCHTAB-5. Archive rows must support `Restore`.

FR-RP-ARCHTAB-6. Archive rows must show a used-elsewhere flag when known.

FR-RP-ARCHTAB-7. Archive rows must not expose permanent delete in V1.

FR-RP-ARCHTAB-8. Archived content must be read-only. Editing requires restore or repair workflow.

FR-RP-ARCHTAB-9. Restore modal must offer `Restore as Private`, `Restore as Public`, and `Cancel`.

FR-RP-ARCHTAB-10. Restoring must use the same passage material id and make refs to that id/version work again when the referenced version/snapshot exists.

FR-RP-ARCHTAB-11. Restored passages must return to active lists according to the selected visibility.

### 7.3 Master Delete

FR-MASTER-DEL-1. Master test delete modal must show three choices: `Remove master only`, `Remove master and linked passages`, and `Cancel`.

FR-MASTER-DEL-2. The modal must show linked passage count.

FR-MASTER-DEL-3. The modal must show a generic used-elsewhere warning if any linked passage is used elsewhere.

FR-MASTER-DEL-4. The modal must require a checkbox before removing linked passages.

FR-MASTER-DEL-5. `Remove master only` must archive/remove the master while leaving linked passages unchanged.

FR-MASTER-DEL-5A. Removed masters disappear from active Teacher Materials master lists in V1. They remain available only through frozen assignment/result references and admin-level data access. V1 does not provide a normal teacher restore surface for removed masters.

FR-MASTER-DEL-6. When master-only removal happens, linked passages must keep their source metadata snapshots.

FR-MASTER-DEL-7. If the original source master is gone, linked passage source display may show `Source master removed`.

FR-MASTER-DEL-8. `Remove master and linked passages` must be allowed only when every linked passage is owned by the teacher.

FR-MASTER-DEL-9. If any linked passage is not owner-owned, the system must block linked-passage removal and allow master-only removal.

FR-MASTER-DEL-10. If linked passages are used elsewhere, the system may still archive them after warning and checkbox.

FR-MASTER-DEL-11. Other masters and Books using archived linked passages must show broken refs after archive.

FR-MASTER-DEL-12. The master delete modal must not allow selecting individual linked passages. Individual passage cleanup belongs on the passage row/card/page.

### 7.4 Broken Ref Detection

FR-BROKEN-1. A ref must be treated as broken when the passage material is missing.

FR-BROKEN-2. A ref must be treated as broken when the passage material is archived.

FR-BROKEN-3. A ref must be treated as broken when the referenced version/snapshot is missing.

FR-BROKEN-4. A ref must be treated as broken when current user lacks permission to read the referenced passage.

FR-BROKEN-5. A ref must be treated as broken when the replacement/test type is incompatible.

FR-BROKEN-6. A ref must be treated as broken when backend maintenance permanently removed the referenced data.

FR-BROKEN-6A. A ref must be treated as broken or incompatible when a previously public/shareable referenced passage becomes private or otherwise non-shareable while a public master or public Book still depends on it.

FR-BROKEN-7. Broken ref detection must return a reason code safe for teacher display.

FR-BROKEN-8. Broken ref detection must not hydrate answer keys or heavy canonical passage payloads just to render material cards.

FR-BROKEN-9. Broken-ref summary writes for master and Book rows must be performed by archive, restore, visibility-change, repair, and reference-update services. Listing/card reads must not repair or mutate broken-ref summary state as a side effect.

### 7.5 Broken Master Test UX

FR-MASTER-BROKEN-1. Master test cards must show a red broken-link icon when unresolved broken passage refs exist.

FR-MASTER-BROKEN-2. Opening or previewing a broken master outside the editor must show a blocked state with a `Repair in Edit Test` action.

FR-MASTER-BROKEN-3. Broken master tests must not be assignable.

FR-MASTER-BROKEN-4. Broken master tests must not publish while unresolved broken refs remain.

FR-MASTER-BROKEN-5. Existing assignments created before the source was archived must keep working from frozen assignment snapshots.

FR-MASTER-BROKEN-6. Started attempts must be able to finish from frozen snapshots.

FR-MASTER-BROKEN-7. Saved results must behave normally from saved result/snapshot data.

### 7.6 Edit Test Modal Broken Ref UX

FR-STUDIO-BROKEN-1. Edit Test Modal must keep the passage slot visible for a broken ref.

FR-STUDIO-BROKEN-2. The broken passage slot must show the snapshot/order label if known and the status `Removed`.

FR-STUDIO-BROKEN-3. Selecting the broken slot must blur and disable the passage preview/editor region.

FR-STUDIO-BROKEN-4. Selecting the broken slot must blur and disable the entire detail/action panel except repair controls.

FR-STUDIO-BROKEN-5. The repair panel must show these actions: `Add from existing Reading Passages`, `Remove this passage from test`, and `Re-make this passage manually`.

FR-STUDIO-BROKEN-6. The broken state must explain the reason using safe text, for example removed, unavailable, missing version, or permission lost.

FR-STUDIO-BROKEN-7. A master with unresolved broken refs must stay blocked for publish and new assignment.

FR-STUDIO-BROKEN-8. `Re-make this passage manually` must open single-passage Studio in another browser tab.

FR-STUDIO-BROKEN-9. The single-passage Studio opened by repair must not expose `Add Passage`; replacement authoring edits one passage and publishes one replacement Reading Passage.

### 7.7 Edit Test Modal Repair: Add Existing

FR-STUDIO-ADD-1. `Add from existing Reading Passages` must open a picker of readable, published, non-archived passages.

FR-STUDIO-ADD-2. The picker must sort same-Test-Type matches first. A different-Test-Type replacement is allowed only after explicit teacher confirmation with a mixed-Test-Type warning.

FR-STUDIO-ADD-3. The picker must include owner-private passages and readable public passages.

FR-STUDIO-ADD-4. The picker must attach the latest published version by default.

FR-STUDIO-ADD-5. The replacement must keep the same passage order slot.

FR-STUDIO-ADD-6. If replacement question count differs from the previous slot, the system must show the numbering modal before completing the replacement.

FR-STUDIO-ADD-7. The system must warn when source labels or Test Types differ. The warning must not hard-block replacement unless another validation rule makes the master invalid.

### 7.8 Edit Test Modal Repair: Remove Passage From Test

FR-STUDIO-REMOVE-1. `Remove this passage from test` must remove only the master composition ref.

FR-STUDIO-REMOVE-2. Removing the ref must not archive or delete the source passage.

FR-STUDIO-REMOVE-3. Removing a passage must show the numbering modal.

FR-STUDIO-REMOVE-4. A master may intentionally have any number of passages after removal.

FR-STUDIO-REMOVE-5. Do not hard-block publish solely because an IELTS master has fewer or more than 3 passages.

FR-STUDIO-REMOVE-6. Publish may still block for invalid numbering, invalid data, unresolved broken refs, or missing required fields.

### 7.9 Edit Test Modal Repair: Re-Make Manually

FR-STUDIO-REMAKE-1. `Re-make this passage manually` must start a blank manual replacement editor inside single-passage Reading V2 Studio.

FR-STUDIO-REMAKE-2. The replacement flow must carry metadata only: source full test id, passage order slot, source question range, and Test Type.

FR-STUDIO-REMAKE-3. The replacement flow must not copy hidden answer keys or inaccessible archived content into the editor.

FR-STUDIO-REMAKE-4. Teacher uses normal Studio `Save Draft` for draft persistence.

FR-STUDIO-REMAKE-5. Teacher uses normal Studio `Publish` to finalize.

FR-STUDIO-REMAKE-6. There must not be a separate replacement publish button.

FR-STUDIO-REMAKE-7. Studio publish for a broken-ref remake must create/publish the new Reading Passage and update the originating master composition ref in one replacement commit plan. If the originating ref cannot be updated, the replacement publish must fail and leave the broken ref unchanged.

FR-STUDIO-REMAKE-7A. Broken-ref remake publish does not show the normal PRD-0052 Part 2 `Update references?` modal. That modal is reserved for healthy passage version edits where existing refs remain valid and pinned by default.

FR-STUDIO-REMAKE-8. Replacement passage visibility must inherit master visibility.

FR-STUDIO-REMAKE-9. Auto remake is out of scope.

### 7.10 Numbering Review

FR-NUM-1. When passage removal or replacement changes question count, show a modal with `Keep current numbering`, `Auto-renumber from this passage forward`, and `Cancel`.

FR-NUM-2. If the teacher keeps current numbering, the system must preserve existing numbering where possible.

FR-NUM-3. If the teacher auto-renumbers, the system must renumber from the changed passage forward.

FR-NUM-4. The Edit Test Modal top banner must show a numbering-review warning with an `X item` pill.

FR-NUM-5. The system must block publish only when numbering is invalid or unresolved, not merely because passage count differs from the traditional exam format.

### 7.11 Duplicate Guard

FR-DUP-1. Duplicate check must run on draft save/checkpoint for manual remake.

FR-DUP-2. Duplicate check must run again on publish to prevent race conditions.

FR-DUP-3. Duplicate warning threshold is 80% similarity.

FR-DUP-4. Similarity comparison must use passage body and question text equally.

FR-DUP-4A. The approved deterministic formula is:
1. normalize body and question text with Unicode NFKC, lowercase, punctuation removal, whitespace collapse, and stable token splitting;
2. create a set of SHA-256 hashes for contiguous five-word body shingles;
3. create a set of SHA-256 hashes for contiguous three-word question shingles from visible prompts, instructions, choices, labels, table visible text, and diagram visible text;
4. compute `bodySimilarity` and `questionSimilarity` with Sorensen-Dice: `2 * intersectionSize / (leftSetSize + rightSetSize)`;
5. compute `combinedSimilarityPercent = round((bodySimilarity * 0.5 + questionSimilarity * 0.5) * 100)`;
6. warn when `combinedSimilarityPercent >= 80`.

FR-DUP-4B. The lightweight searchable data source is a Reading V2 duplicate index row at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`. The row is keyed by current passage material, includes `currentVersionId`, metadata, and hashed shingle sets only, and must not store passage body, canonical payload, answer keys, scoring rules, hidden provenance, AI evidence, or import evidence.

FR-DUP-4C. Duplicate detection must not scan or hydrate full canonical Reading V2 payloads across the database during UI typing or publish validation.

FR-DUP-5. Duplicate check must compare only active passages the teacher can access plus the teacher's own archived passages.

FR-DUP-6. Duplicate check must not include non-owned archived passages, even if they were public before archive.

FR-DUP-7. Duplicate check must not use answer keys for public or non-owner comparisons.

FR-DUP-8. Duplicate warning must show matching title and similarity percent.

FR-DUP-9. Duplicate warning must show `Use existing` and `Create new anyway`.

FR-DUP-10. If the match is archived and owned by the teacher, warning must show `Restore and use` and `Create new anyway`.

FR-DUP-11. Choosing `Use existing` must require confirmation before replacing the broken ref.

### 7.12 Book Broken Ref UX

FR-BOOK-BROKEN-1. Book cards must show a broken-link icon in the top-right when any Book ref is broken.

FR-BOOK-BROKEN-2. Clicking the broken-link icon must open the Book Edit Modal / Book Editor Workspace focused on broken refs.

FR-BOOK-BROKEN-3. If multiple refs are broken, Book editor should show a broken-refs filter/list rather than only scrolling to the first one.

FR-BOOK-BROKEN-4. Book editor must not crash when a referenced passage is missing, archived, inaccessible, or missing a version.

FR-BOOK-BROKEN-5. Book broken refs must show the same three repair options as Edit Test Modal: `Add from existing Reading Passages`, `Remove this passage from Book`, and `Re-make this passage manually`.

FR-BOOK-BROKEN-6. `Add from existing Reading Passages` in Book editor must replace the broken Book ref with a readable published passage.

FR-BOOK-BROKEN-7. `Remove this passage from Book` must remove only the Book ref and must not archive/delete any source passage.

FR-BOOK-BROKEN-8. `Re-make this passage manually` from Book editor must open single-passage Reading V2 Studio in another browser tab.

FR-BOOK-BROKEN-9. Book editor must not become a passage authoring surface.

FR-BOOK-BROKEN-10. Manual remake launched from Book editor must start blank and carry safe metadata where available: Test Type, source title snapshot, original order/label, and source question range.

FR-BOOK-BROKEN-11. After Studio publish creates the new Reading Passage, the Book ref must update to the new passage.

### 7.13 Assignment And Publish Guards

FR-GUARD-1. New assignment from a broken master must be blocked.

FR-GUARD-2. Publish of a master with unresolved broken refs must be blocked.

FR-GUARD-3. Preview/open outside the editor for a broken master must be blocked with `Repair in Edit Test`.

FR-GUARD-4. Existing assignment with frozen snapshot must continue to launch.

FR-GUARD-5. Started attempt must continue to finish from frozen snapshot.

FR-GUARD-6. Saved result must continue to show normal result content from saved result/snapshot data.

FR-GUARD-7. Assignment and publish guards must not fetch hidden answer keys into client UI.

### 7.14 Audit And Observability

FR-AUDIT-1. The system must record audit events for archive, restore, master delete, linked-passage archive, broken ref repaired, duplicate warning decisions, and super-admin archive.

FR-AUDIT-2. Audit event must include actor id.

FR-AUDIT-3. Audit event must include timestamp.

FR-AUDIT-4. Audit event must include action type.

FR-AUDIT-5. Audit event must include material id and version/snapshot id when available.

FR-AUDIT-6. Audit event must include title snapshot.

FR-AUDIT-7. Audit event must include used-elsewhere boolean and usage categories if available.

FR-AUDIT-8. Audit event for repair must include before/after composition refs.

FR-AUDIT-9. Audit event must include admin override flag when super admin acts.

FR-AUDIT-10. Audit records are readable by super admin only in V1. This PRD does not create a super-admin audit-management UI; future UI requires a separate PRD.

FR-OBS-1. The system must emit `reading_passage_removed_from_library`.

FR-OBS-2. The system must emit `reading_passage_restored`.

FR-OBS-3. The system must emit `master_delete_requested`.

FR-OBS-4. The system must emit `master_linked_passages_remove_requested`.

FR-OBS-5. The system must emit `studio_broken_passage_ref_viewed`.

FR-OBS-6. The system must emit `studio_broken_passage_repaired`.

FR-OBS-7. The system must emit `book_broken_passage_ref_viewed`.

FR-OBS-8. The system must emit `book_broken_passage_repaired`.

FR-OBS-9. The system must emit `reading_passage_duplicate_warning_shown`.

### 7.15 Composition-First Publish Direction

FR-COMP-1. New Reading V2 full-test publishes must align with PRD-0052 Part 2 composition-first storage.

FR-COMP-2. Old embedded full-test records must not be migrated in V1.

FR-COMP-3. Phase 4 work must make new publishes store master composition refs as the source of truth.

FR-COMP-4. Compatibility with existing runtime, assignment, and result review must be preserved.

FR-COMP-5. Do not change old embedded full-test records; verify runtime and review paths against composition refs for new publishes.

---

## 8. Design / UI Requirements

### 8.1 Global Teacher UI

- Follow `documentation/architecture/ui-design-standards.md`.
- Do not add new `@mantine/*` imports.
- Keep Teacher Materials inside existing teacher shell/chrome.
- Broken icons must be clear but not visually noisy.

### 8.2 Labels

Use these labels:

- Row/card action: `Remove from library`
- Reading Passage scope subtab: `Archive`
- Broken passage tab badge: `Removed`
- Master/card status: `Needs repair`
- Book ref status: `Unavailable`
- Broken repair action for published masters: `Repair in Edit Test`

### 8.3 Broken Icons

- Master card: red broken-link icon.
- Book card: broken-link icon in top-right.
- Book icon opens Book Edit Modal / Workspace focused on broken refs.

### 8.4 Confirmation Text

Individual passage archive modal title:

`Archive Reading Passage?`

Individual passage archive modal must include:

- teacher-facing explanation that the passage leaves active library surfaces
- warning when used elsewhere
- checkbox when used elsewhere or active homework exists

Master linked-passage removal modal must include:

- `Some linked passages are used elsewhere.`
- checkbox acknowledgement before archiving linked passages

---

## 9. Data Requirements

### 9.1 Reading Passage State

Reading Passage metadata/material should support:

- `state: 'published' | 'draft' | 'archived'`
- `archivedAt`
- `archivedBy`
- `restoredAt`
- `restoredBy`
- visibility state for restore as private/public

### 9.2 Broken Ref Summary

Master and Book summary/index rows should be able to expose safe broken-ref state:

- `hasBrokenRefs`
- `brokenRefCount`
- `brokenRefKinds[]` or safe reason summary
- no passage bodies
- no answer keys
- no hidden provenance

### 9.3 Archive Indexes

Archive tab needs a lightweight owner-scoped index or query path for archived Reading Passages.

Index rows must not contain heavy canonical content, answers, scoring rules, import evidence, or hidden provenance.

### 9.3A Duplicate Index

Duplicate guard uses the owner-scoped current-material index path:

```text
reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}
```

Rows store only metadata, `currentVersionId`, active/archive state, and hashed body/question shingle sets. V1 does not create per-version duplicate index rows. Old-version duplicate checks require a future PRD.

### 9.4 Audit Records

Audit record must be append-only and safe for admin review.

Do not rely only on console logs for destructive actions.

Use the Reading V2-specific RTDB path:

```text
reading_v2/audit_events/{eventId}
```

Implementation must follow `documentation/architecture/reading-v2-audit-trail.md`. Do not reuse legacy `audit_logs` for PRD-0054 archive, restore, repair, remove, or duplicate-decision events. View-only events such as `studio_broken_passage_ref_viewed` and `book_broken_passage_ref_viewed` belong to observability tracking, not audit logs.

---

## 10. Edge Cases And Required Handling

1. **Passage used by another master:** allow archive with checkbox; other master shows broken ref.
2. **Passage used by Book:** allow archive with checkbox; Book shows broken-link icon.
3. **Passage used in assigned homework:** allow archive with checkbox; frozen assignment still launches.
4. **Passage used in started attempt:** attempt can finish from frozen snapshot.
5. **Passage used in saved result:** result remains normal from saved result/snapshot.
6. **Master includes non-owned passage:** block `Remove master and linked passages`; allow master-only removal.
7. **Owner archives public passage:** other teachers cannot find it for new use; existing refs may show broken; frozen assignments/results keep working.
8. **Permission lost:** treat ref as broken and show repair options.
9. **Referenced version missing:** treat ref as broken and block new assignment/publish.
10. **Archived passage restored:** refs to same id/version become active again.
11. **Duplicate similar archived passage:** show `Restore and use` and `Create new anyway`.
12. **Question count mismatch:** show numbering modal.
13. **Race condition between modal and confirm:** backend re-checks and blocks/adjusts safely.
14. **Old embedded tests without composition refs:** do not migrate; apply composition-first behavior only to new publishes/refs.
15. **Book manual remake:** open single-passage Studio in another browser tab; do not author passage inside Book editor.

---

## 11. Success Metrics

Feature is successful when:

1. Teachers can archive and restore own Reading Passages.
2. Archived Reading Passages disappear from active library/pickers.
3. Archive tab shows archived owner-owned passages.
4. Broken master test cards show red broken-link state.
5. Broken Book cards show broken-link state.
6. Edit Test Modal shows broken passage slots without crashing.
7. Edit Test Modal repair actions work: add existing, remove from test, remake manually.
8. Book repair actions work: add existing, remove from Book, remake manually through single-passage Studio.
9. New assignment from broken master is blocked.
10. Publish with unresolved broken refs is blocked.
11. Existing frozen homework/attempt/result flows still work after source archive.
12. Duplicate warning appears for 80%+ similar manual remake.
13. Archive/restore/delete/repair audit events are written.
14. New composition-first publish path is verified for new publishes when Phase 4 is reached.

---

## 12. Acceptance Criteria

### 12.1 Archive / Restore

- Given a teacher owns a Reading Passage, when they choose `Remove from library`, then the passage moves to `Archive`.
- Given a passage is archived, it no longer appears in active Private/Public lists.
- Given a passage is archived, it no longer appears in normal add-existing pickers.
- Given a passage is archived, the owner can view it read-only in `Archive`.
- Given a passage is archived, the owner can restore it as Private or Public.
- Given a restored passage uses the same id/version, broken refs to that id/version become normal again.

### 12.2 Master Delete

- Given a master has linked passages, delete modal shows master-only and master-plus-linked options.
- Given any linked passage is non-owned, linked-passage removal is blocked.
- Given linked passages are used elsewhere, modal shows generic warning and requires checkbox.
- Given master-only removal, linked passages remain active.
- Given master-plus-linked removal, owned linked passages archive and other refs become broken.

### 12.3 Broken Master

- Given a master references archived passage, the master card shows a red broken-link icon.
- Given a teacher opens broken master outside the editor, they see blocked state and `Repair in Edit Test`.
- Given a teacher opens broken master in Edit Test Modal, broken slot remains and shows `Removed`.
- Given a broken slot is selected, passage preview/editor region and detail panel are blurred/disabled except repair controls.
- Given unresolved broken refs remain, assignment is blocked.
- Given unresolved broken refs remain, publish is blocked.

### 12.4 Edit Test Modal Repair

- Given teacher adds existing passage, broken ref updates to latest published version and keeps order slot.
- Given teacher removes broken passage, only the master ref is removed.
- Given question count changes, numbering modal appears.
- Given teacher remakes manually, editor starts blank and carries metadata.
- Given teacher publishes master with replacement draft, new passage and master update publish atomically.

### 12.5 Book Repair

- Given a Book references archived passage, Book card shows broken-link icon.
- Given teacher clicks broken icon, Book Edit Modal opens focused on broken refs.
- Given teacher adds existing from Book editor, Book ref updates.
- Given teacher removes broken ref from Book editor, source passage is untouched.
- Given teacher chooses manual remake from Book editor, single-passage Reading V2 Studio opens in another browser tab and Book ref updates after publish.

### 12.6 Existing Work Safety

- Given homework was assigned before archive with frozen snapshot, student can still launch.
- Given attempt started before/archive after, student can finish.
- Given saved result exists, result review behaves normally.
- Given a new assignment is attempted from unresolved broken master, system blocks it.

### 12.7 Duplicate Guard

- Given manual remake is 80%+ similar to accessible passage, duplicate warning appears.
- Given duplicate warning appears, teacher can use existing or create new anyway.
- Given duplicate is archived and owned, teacher can restore and use or create new anyway.
- Given teacher chooses use existing, confirmation is required before replacement.

---

## 13. Implementation Phases

### Phase 1: Data And Archive Services

Build:

- archive/restore Reading Passage services
- Archive subtab data reader
- ownership rules
- usage flag detector
- audit writer
- race-safe backend re-checks
- focused service tests

Do not implement Edit Test Modal repair yet in Phase 1.

### Phase 2: Broken Ref Detection And UI Shells

Build:

- broken ref detection for masters and Books
- master card broken-link icon
- Book card broken-link icon
- Edit Test Modal broken slot state
- blurred disabled panels
- repair action shell
- assignment/publish guards

Do not implement manual remake yet in Phase 2.

### Phase 3: Repair Flows

Build:

- Edit Test Modal add-existing repair
- Edit Test Modal remove-passage repair
- numbering modal
- manual remake in single-passage Studio
- duplicate guard
- Book add-existing repair
- Book remove-ref repair
- Book manual-remake-to-Studio flow
- atomic publish for replacement passage + master/Book ref update

### Phase 4: Composition-First New Publishes

Build:

- new full-test publishes are composition-first
- master references become source of truth for new publishes
- old embedded tests remain untouched
- runtime/assignment/review verified against composition refs

---

## 14. Verification Requirements

Required test coverage:

1. archive owned Reading Passage
2. block archive for non-owner
3. super admin archive writes audit
4. archive removes active index rows
5. archive appears in Archive tab
6. restore as Private
7. restore as Public
8. master-only delete leaves passages unchanged
9. master-plus-linked blocks when non-owned passage exists
10. master-plus-linked archives owned linked passages
11. broken master card icon appears
12. broken Book card icon appears
13. Edit Test Modal broken slot remains visible
14. assignment blocked for broken master
15. publish blocked for broken master
16. existing frozen homework launch still works after source archive
17. started attempt still finishes after source archive
18. saved result still opens after source archive
19. add-existing repair updates ref
20. remove-passage repair removes only ref
21. numbering modal appears on question count mismatch
22. manual remake creates replacement through single-passage Studio and master publish/update flow
23. duplicate warning appears at 80%+
24. Book broken ref add-existing repair
25. Book broken ref remove repair
26. Book manual remake opens single-passage Studio and updates Book ref after publish
27. audit events written for archive/restore/repair/delete

Required UI verification:

- Teacher Materials Reading Passage `Private | Public | Archive`
- Archive tab read-only row
- Master red broken-link card icon
- Book broken-link card icon
- Edit Test Modal broken slot blur state
- Edit Test Modal repair action panel
- Book editor broken refs focus/list
- duplicate warning modal

Required guard verification:

- no student answer keys exposed in list/picker/card payloads
- no heavy canonical payload loaded just to show cards
- no new Mantine imports in touched teacher UI
- `npm run check:utf8 -- <changed files>`
- targeted Vitest for touched services/components

---

## 15. Open Questions

No core product direction remains open from the planning session.

Resolved decisions:

1. Duplicate warning threshold is 80 percent and uses the deterministic hashed-shingle formula in FR-DUP-4A.
2. PRD-0054 audit uses `reading_v2/audit_events/{eventId}` and `documentation/architecture/reading-v2-audit-trail.md`.
3. Removed full-test masters do not get a teacher restore UI in V1. Soft removal remains reversible in data only for future/admin recovery work.
4. Duplicate index path is `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`.
5. V1 has no super-admin archive/restore UI or audit-management UI. A future PRD is required for any super-admin UI.

Before implementation, create a separate tasklist that decomposes this PRD into junior-executable steps with exact files, expected tests, and verification commands.
