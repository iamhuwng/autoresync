# Book Editor Tabs Mockup

Stitch project: `projects/10653178060668333917`

Screen: `projects/10653178060668333917/screens/2487004b4c4a47a7ab186e1b195d76c0`

## Visual Schema

```text
TeacherHeader
└─ Book workspace header
   ├─ Breadcrumb: Books / Testing Book
   ├─ Title + chips: Draft-empty, Private, IELTS
   ├─ V1 constraint note
   └─ Actions: Preview, Save, Request review

Tabs
├─ Overview
├─ Contents (active)
├─ Assign
└─ Settings

Contents tab
├─ Book structure panel
│  ├─ Toolbar: Add section, Add material
│  ├─ Section 1
│  │  ├─ Reading Passage A
│  │  └─ Writing Task 1 (selected)
│  └─ Section 2
│     └─ Empty add-material row
└─ Inspector panel
   ├─ Selected material fields
   ├─ Save item / Remove from book
   └─ Assign selected

Bottom status strip
└─ 2 materials in book | 1 selected | Unsaved changes
```

## UX Intent

- Tabs split the editor into one job per view: status, contents, assignment, settings.
- `Contents` becomes the primary workflow, not metadata.
- The inspector keeps edits in context without navigating away.
- Assignment stays material-selection based, matching V1 constraints.
- Metadata moves to `Settings` so it remains available but stops dominating the first screen.
