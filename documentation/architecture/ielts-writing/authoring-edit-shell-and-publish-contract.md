# IELTS Writing Authoring Edit Shell And Publish Contract

## Purpose

This note defines the current contract for teacher-side IELTS Writing authoring after the writing edit flow was moved off the creation wizard and into the shared edit-modal shell.

Use this document when work touches:
- writing test edit and resume flows from the teacher materials lobby
- the shared edit shell (`Modal` + `EditTestFrame`) for writing
- draft save versus publish behavior for writing tests
- writing visibility (`isPublic`) inside the shared settings tab

## Authoring Surface Split

Writing now has two distinct teacher surfaces:

- `TestCreationModal` is create-only.
- `WritingTestEditModal` is edit/resume-only.

`TeacherLobbyPage` is responsible for choosing the correct surface:

- `Create Test` opens `TestCreationModal`.
- editing a published writing material ensures an editable draft and then opens `WritingTestEditModal`
- resuming a writing draft from the drafts tab opens `WritingTestEditModal`

The writing edit flow must not route back through the creation wizard once a draft already exists.

## Shared Shell Contract

`WritingTestEditModal` must use the same outer edit shell contract as the other editors:

- outer wrapper: shared modal shell
- inner chrome: `EditTestFrame`
- visible tabs: `Questions`, `Context & Resources`, `Settings`
- hidden tab: `Answer Key`

Writing-specific editing stays inside the tab bodies:

- `Questions`: task list + task editor
- `Context & Resources`: metadata + validation summary
- `Settings`: shared shell settings, including visibility

The writing editor must not introduce a separate bespoke full-screen wrapper if the shared edit shell can host the workflow.

## Action Contract

The primary action depends on whether the writing draft already backs a published material:

### Published writing material

- primary action label: `Save Changes`
- action behavior: publish/update the linked RTDB writing test immediately
- no secondary `Publish Updates` button

### Unpublished writing draft

- primary action label: `Save Draft`
- action behavior: save Firestore draft only
- secondary action label: `Publish Test`
- secondary action behavior: publish draft to RTDB and sync draft linkage

This keeps published writing edits aligned with the other editors while preserving the draft-first workflow for unpublished writing materials.

## Visibility Contract

The shared `Settings` tab owns the writing `Public Test` toggle.

Current rules:

- `WritingTestEditModal` hydrates `isPublic` from the writing draft
- `saveWritingDraft()` persists `isPublic` to Firestore `writing_drafts/{draftId}`
- `publishWritingTest()` persists `isPublic` to RTDB `tests/{testId}`
- `ensureWritingEditableDraft()` copies `isPublic` from the published writing test back into the editable draft when needed

The settings toggle is a real persistence field, not display-only chrome.

## Layout Contract

Inside the shared shell:

- the left writing-task list may stay fixed-width-ish, but must be allowed to shrink within the frame
- the right task editor must be fluid and vertically scrollable inside the frame
- the questions row must stretch to the frame height and avoid clipping the right editor pane

The right editor pane is the scroll container for task editing. It must not rely on viewport-based height caps that can cut off the task form inside the shared shell.

## Integration Notes

- `useTeacherDrafts()` should refresh writing drafts after save or publish so the materials lobby stays current
- the teacher lobby should refresh both drafts and published tests after writing publish/update
- feature tracking for the writing edit flow remains under `FEATURE_IDS.testCreation`
- visibility changes inside settings should track through the same feature

## Current Repo Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/writing/WritingTestEditModal.tsx`
- `src/services/writingTestService.ts`
- `src/hooks/thcs/useTeacherDrafts.ts`
- `src/components/test/editor/EditTestFrame.tsx`

