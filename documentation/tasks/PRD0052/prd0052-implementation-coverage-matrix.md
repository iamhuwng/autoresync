# PRD-0052 Implementation Coverage Matrix

Created: 2026-06-01
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Source PRD: `documentation/tasks/0052-prd-teacher-materials-books-and-reading-passage-library.md`
Tasklist: `documentation/tasks/tasks-0052-prd-teacher-materials-books-and-reading-passage-library.md`

## Rule

No PRD-0052 code task is complete until its row below has code coverage, automated test coverage, or an explicit out-of-scope note tied to V1 non-goals.

## Functional Requirements

| PRD IDs | Task IDs | Planned proof |
|---|---:|---|
| FR-TAB-1 through FR-TAB-18 | 7.1-7.30, 12.1-12.27, 16.1-16.18, 20.5-20.23 | TeacherLobbyPage, ContentTabs, SearchFilterBar, MaterialListView, BookCardGrid tests; browser screenshots at required widths; indexed-list assertions. |
| FR-FILTER-1 through FR-FILTER-24 | 3.17-3.22, 7.9-7.18, 12.6-12.22, 17.6-17.10, 20.8-20.15 | testTypeConfig and preference service tests; TestTypeBlockModule and preference modal tests; action-tracking tests; visual QA. |
| FR-ADMIN-TT-1 through FR-ADMIN-TT-13 | 3.1-3.27, 11.1-11.16, 17.1, 17.24, 19.1, 19.15-19.25 | Test Type service tests; AdminSettingsPage/TestTypeAdminPanel tests; RTDB rules/manual validation for super-admin-only writes. |
| FR-RP-1 through FR-RP-28 | 4.1-4.17, 5.1-5.24, 6.1-6.20, 7.1-7.30, 8.1-8.24, 16.6-16.18, 18.1-18.11 | Reading Passage extraction, metadata, library, publish pipeline, adapter, and projection tests; no hidden-field assertions. |
| FR-RP-HW-1 through FR-RP-HW-14 | 8.1-8.24, 9.1-9.25, 10.1-10.20, 17.14-17.15, 17.21-17.23 | HomeworkCreateModal/homeworkManager tests; StudentHomeworkList/Detail/Practice/TestPageRouter tests; result adapter tests; safe projection checks. |
| FR-BOOK-1 through FR-BOOK-29 | 13.1-13.35, 14.1-14.30, 15.1-15.37, 16.15-16.18, 17.11-17.20 | Book validation/service tests; Book grid/card/modal/editor tests; ref display tests; no whole-Book assignment assertions. |
| FR-BOOK-MODAL-1 through FR-BOOK-MODAL-10 | 14.1-14.30, 17.11-17.13, 20.17-20.21 | CreateBookModal tests; Book service tests; TeacherLobbyPage CTA tests; browser QA. |
| FR-NODE-1 through FR-NODE-22 | 13.7-13.24, 15.1-15.37 | bookValidation service tests; BookNodeTree/editor tests for depth, cycles, self-parent, orphan, delete confirmation, duplicate refs. |
| FR-BOOK-EDITOR-1 through FR-BOOK-EDITOR-20 | 15.1-15.37, 17.16-17.20 | BookEditorPage, BookNodeTree, BookMaterialPicker tests; action tracking tests; browser QA. |
| FR-REF-1 through FR-REF-15 | 13.15-13.35, 15.12-15.37, 16.16-16.18 | Book validation/service tests; picker tests excluding drafts; broken/private/newer-version ref display tests. |

## Acceptance Criteria

| PRD section | Task IDs | Planned proof |
|---|---:|---|
| 15.1 Teacher Materials | 7, 12, 16, 17, 20, 21 | TeacherLobbyPage/component tests plus browser screenshots. |
| 15.2 Admin Test Types | 3, 11, 17, 19, 21 | Service/admin/rules tests. |
| 15.3 Reading Passage | 4, 5, 6, 7, 8, 9, 10, 16, 17, 18, 19, 21 | Extraction, publish, homework, student runtime, projection, result tests. |
| 15.4 Book | 13, 14, 15, 16, 17, 19, 20, 21 | Book service/UI/editor/ref tests and browser QA. |

## Forbidden Patterns

| PRD forbidden pattern | Task IDs | Planned proof |
|---|---:|---|
| Book copies payloads, whole-Book assignment, student Book runtime, marketplace/public sales | 13-15, 16, 19, 21 | Book service/editor tests prove refs only and no whole-Book assignment/start actions. |
| Student sees canonical drafts, answer keys, import evidence, provenance, or Book organizer data | 4, 6, 8-10, 17, 19, 21 | Projection/rules/result tests assert forbidden fields absent. |
| Broad material scans for lists | 4, 7, 13, 16, 19, 21 | Service tests and code review assert indexed/summary reads only. |
| Reading Passage homework hidden under legacy full-test assumptions | 8-10, 17, 19, 21 | Homework/list/detail/router/result tests use explicit Reading Passage material kinds. |
| Duplicate mutable passage payloads inside each full test, silent shared mutation | 5, 6, 18, 21 | Composition/ref tests, fork/new-version tests, backfill compatibility tests. |
| Book structure encoded in strings, deleting source material when removing refs, homework mutation after Book changes | 13, 15, 16, 21 | Book validation/ref tests and homework snapshot tests. |
| IELTS-only assumptions or hardcoded source-order labels/Test Type list | 3-5, 7, 11, 21 | Test Type config tests, non-IELTS source-order tests, admin config tests. |
| Direct blank/manual Create Reading Passage in V1 | 7, 8, 12, 20, 21 | TeacherLobbyPage/SearchFilterBar tests and browser QA prove no primary create CTA. |
| Non-super-admin Test Type mutation | 3, 11, 19, 21 | Admin UI tests and RTDB rules/manual validation. |

## Edge Cases

| PRD edge-case section | Task IDs | Planned proof |
|---|---:|---|
| 12.1 Test Type edge cases | 3, 7, 11, 17, 19, 21 | Alias, inactive, fewer-than-4, default fallback, collision, and permission tests. |
| 12.2 Reading Passage edge cases | 4-10, 17-19, 21 | Missing boundary, missing answer key, unknown order, version mismatch, stale assignment, and hidden-field tests. |
| 12.3 Book edge cases | 13-16, 17, 19, 21 | Empty draft, placeholder-only draft, draft-ref rejection, private-ref public blocking, duplicate refs, depth/cycle/orphan/move tests. |
| 12.4 Homework edge cases | 8-10, 17, 19, 21 | Missing projection, malformed response, republish result binding, mixed material kind tests. |
| 12.5 UI edge cases | 7, 12, 14, 15, 16, 17, 20, 21 | Long labels/titles, no-overflow, empty states, CTA unavailable, and settings icon propagation/focus tests. |

## Visual Locks

| Area | Locked source | Proof |
|---|---|---|
| Shell/header/page spacing | Live Teacher Lobby plus PRD-0050 visual artifacts | Browser screenshots; no TeacherHeader placement change. |
| Tabs and toolbar | Existing ContentTabs and SearchFilterBar styling | Component tests; screenshot comparison. |
| Normal material rows | PRD-0050 compact MaterialListView contract | Unit tests and no-overflow browser probes. |
| Test Type blocks | PRD-0050 square-card/Book-card language | TestTypeBlockModule tests and visual QA. |
| Book grid | Book-specific cover/default-name cards | BookCardGrid/Card tests and visual QA. |
