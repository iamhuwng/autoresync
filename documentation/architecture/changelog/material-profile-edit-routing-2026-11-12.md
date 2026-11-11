# Material Profile edit routing

Changelog ID: `CL-20261112-MATERIAL-PROFILE-EDIT`
Master entry: [Master Changelog](../master_changelog.md)

## Problem

The owner-only **Edit Material** action on the registered Material Profile page
sent an existing material to `/create-test?edit=...`, but that route only selected
the create-by-skill builder. It did not load the existing material, so the action
could not open an edit workflow.

## Correction

The existing query entry now hands the material ID to the Teacher Lobby's canonical
edit dispatcher. That dispatcher already owns the supported family boundaries:

- Reading V2 uses its revise route or published-master editor.
- Writing prepares an editable draft before its writing editor route.
- THCS opens the existing THCS editor workflow.
- Listening loads the source-bound canonical Listening editor.
- Retired or unsupported material remains explicitly blocked with the existing
  warning; no generic legacy editor is restored.

The handoff consumes its router state after loading and normalizes the raw stored
IELTS `type` field to the dispatcher's existing `testType` input. No new authoring
workflow, session behavior, data path or compatibility layer was added.

## Qualification boundary

This is a normal frontend candidate based on protected `main` `67cab04b`. Local
focused routing proof passed; production publication and independent Hosting
readback remain separately authorized. If published, the retained operation must
associate this CL with its Hosting target and reconcile the dated outcome through
the existing release workflow.
