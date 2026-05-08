---
title: IELTS Writing Authoring Edit Shell And Publish Contract 2026-04-03
description: Architecture note for the teacher-side IELTS Writing authoring flow after moving edit and resume onto the shared edit-modal shell, including save/publish behavior and visibility ownership.
createdAt: '2026-04-02T19:23:34.562Z'
updatedAt: '2026-04-02T19:23:34.562Z'
tags:
  - architecture
  - ielts
  - writing
  - authoring
  - editor
  - visibility
---

# IELTS Writing Authoring Edit Shell And Publish Contract 2026-04-03

## Status

Current source of truth for teacher-side IELTS Writing authoring after the edit flow was moved off the creation wizard and into the shared edit-modal shell.

## Surface split

- `TestCreationModal` is create-only.
- `WritingTestEditModal` is edit/resume-only.
- `TeacherLobbyPage` decides which surface to open:
  - `Create Test` -> creation modal
  - editing a published writing material -> ensure editable draft, then open `WritingTestEditModal`
  - resuming a writing draft -> open `WritingTestEditModal`

Existing writing drafts must not be routed back through the creation wizard.

## Shared shell contract

`WritingTestEditModal` uses the shared edit-shell contract:

- outer shell: shared modal wrapper
- inner chrome: `EditTestFrame`
- visible tabs: `Questions`, `Context & Resources`, `Settings`
- hidden tab: `Answer Key`

Writing-specific behavior stays inside the tab bodies:

- `Questions`: task selector + task editor
- `Context & Resources`: metadata + validation summary
- `Settings`: shared settings, including visibility

## Action contract

### Published writing material

- primary action label: `Save Changes`
- action behavior: publish/update the linked RTDB writing test immediately
- no secondary `Publish Updates` action

### Unpublished writing draft

- primary action label: `Save Draft`
- action behavior: save Firestore draft only
- secondary action label: `Publish Test`
- secondary action behavior: publish to RTDB and sync draft linkage

## Visibility contract

The shared `Settings` tab owns the writing `Public Test` toggle.

Required persistence path:

- `WritingTestEditModal` hydrates `isPublic` from the draft
- `saveWritingDraft()` persists `isPublic` to Firestore `writing_drafts/{draftId}`
- `publishWritingTest()` persists `isPublic` to RTDB `tests/{testId}`
- `ensureWritingEditableDraft()` copies `isPublic` from the published test back into the draft when needed

The writing visibility toggle is real persistence state, not decorative shell chrome.

## Layout contract

Inside the shared shell:

- the left task list may stay constrained but must be shrinkable
- the right editor pane must stay fluid and vertically scrollable inside the frame
- the questions row must stretch to the frame height and avoid clipping the editor pane

The right editor pane is the scroll container for task editing.

## Integration notes

- `useTeacherDrafts()` refreshes writing drafts after save or publish
- the teacher lobby refreshes both drafts and published tests after writing publish/update
- feature tracking stays under `FEATURE_IDS.testCreation`
- visibility changes inside settings track through the same feature

## Repo anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/writing/WritingTestEditModal.tsx`
- `src/services/writingTestService.ts`
- `src/hooks/thcs/useTeacherDrafts.ts`
- `src/components/test/editor/EditTestFrame.tsx`
