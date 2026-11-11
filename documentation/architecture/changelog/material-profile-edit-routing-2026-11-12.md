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

This was a normal frontend candidate based on protected `main` `147b264f`. The
guarded operation `d5c212c0-6419-4fa6-bf91-3c183a78b997` published only Firebase
Hosting `temp-a1437/kahut1` as version `e897b078505d3df2`. The retained operation
associated this CL with the Hosting target; exact source/tree and all 443
manifest-listed asset hashes passed independent readback. The first immediate
provider response was inconclusive, so the same operation resumed and settled
without a second publication or rollback.


## Recorded release outcomes

<!-- release-operation:d5c212c0-6419-4fa6-bf91-3c183a78b997:outcome-aec9040585ae3260293a5c5ccf637a305e9a7ebf0543e02610835c3e3a0a0a85.json -->

- Recorded: 2026-11-11T21:01:40.201Z; operation: `d5c212c0-6419-4fa6-bf91-3c183a78b997`.
- Source: `147b264fc7193c4e8db809aa96f8777fe658a886`; target: `firebase:temp-a1437:hosting:kahut1`; action: deploy.
- Publication: **published**; verification: **passed**; provider: `projects/temp-a1437/sites/kahut1/versions/e897b078505d3df2@2026-11-11T20:58:00.004Z`.
- Retained evidence: [operation outcome](https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-d5c212c0-6419-4fa6-bf91-3c183a78b997#outcome-aec9040585ae3260293a5c5ccf637a305e9a7ebf0543e02610835c3e3a0a0a85.json).
- This is a scoped historical observation; it does not establish current activation or completion of excluded services. Earlier implementation notes remain dated history.
