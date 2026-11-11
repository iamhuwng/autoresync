# Material Profile edit — second normal Hosting release

## Candidate and scope

- Source: protected `main` `147b264fc7193c4e8db809aa96f8777fe658a886`.
- Tree: `1b6869ef0978252f2f1fb454e441bc918d16bed6`.
- Baseline: verified live `5981a4da170986f62866410f59ca0f20e5fefe3c`.
- Change: `CL-20261112-MATERIAL-PROFILE-EDIT`.
- Scope: Firebase Hosting `temp-a1437/kahut1` only. No Worker, Firebase rules,
  Functions, storage policy, authentication or application-data publication.

The exact-source assessment passed with the historical successor obligations
bound to their differing paths. Guarded verification executed 164/164 Node tests
across seven release-safety suites with zero failures or skips. The non-mutating
production build passed, including the 257 KB root-entry bundle budget. Protected
CI for the candidate and final main also passed, including `LuyenTap integration`;
the Material Profile routing test is in the required application-test list.

## Publication and verification

Operation: `d5c212c0-6419-4fa6-bf91-3c183a78b997`.

The guarded workflow retained source, artifact, intent and evidence before
publication. Firebase accepted one publication as Hosting version
`e897b078505d3df2` at `2026-11-11T20:58:00.004Z` UTC. The first immediate provider
response was rejected as not yet finalized; the operation was resumed through
`--verify-existing`, without rebuilding or republishing. The resumed readback
confirmed the provider identity, exact manifest source/tree and all 443
manifest-listed asset hashes. The append-only remote outcome was uploaded and
read back, and the local release ledger is `live`, `published`, `passed`.

The retained outcome is [operation-specific evidence](https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-d5c212c0-6419-4fa6-bf91-3c183a78b997#outcome-aec9040585ae3260293a5c5ccf637a305e9a7ebf0543e02610835c3e3a0a0a85.json).
Fresh post-settlement Hosting observation read back source `147b264f`, tree
`1b6869ef`, and 443 manifest assets at `https://kahut1.web.app`.

This is the second consecutive qualified normal production release from protected
`main`. Hosting rollback was neither needed nor authorized; no excluded service
was changed.
