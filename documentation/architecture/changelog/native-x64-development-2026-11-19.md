# Native Windows x64 Development

Changelog ID: `CL-20261119-NATIVE-X64-DEVELOPMENT`
Master entry: [Master Changelog](../master_changelog.md)

## Change

The default development command starts Vite with the spare Firebase project and spare upload Worker. The spare build and preview use a dedicated Vite configuration that ignores environment files. The emulator workflow remains available for disposable data and rules checks.

Each checkout resolves tools from its own lockfiles and dependencies. The transition removes the Windows ARM64 and WSL launch paths and documents native setup, diagnostics, audit evidence, and cleanup.

The Hosting release workflow keeps publication evidence required and handles changelog reconciliation as a follow-up. The recovery workflow records the observed operation outcome.

## Release state

Firebase Hosting published protected main `696a0f36` in version `7837f61bba14f975` on 2026-11-19. The live source, all 438 manifest assets, and the login route were independently verified.


## Recorded release outcomes

<!-- release-operation:ef4170b3-a5d4-43b4-83b4-4e15144a1c5c:outcome-729f57ec5227471d3305a05caa6873ad5b2519991b0867a01669441aef797a2c.json -->

- Recorded: 2026-11-19T00:13:52.295Z; operation: `ef4170b3-a5d4-43b4-83b4-4e15144a1c5c`.
- Source: `696a0f36d1ac8eac98a4ada8a3c05ed2fc79fa43`; target: `firebase:temp-a1437:hosting:kahut1`; action: deploy.
- Publication: **published**; verification: **passed**; provider: `projects/temp-a1437/sites/kahut1/versions/7837f61bba14f975@2026-11-19T00:10:55.587Z`.
- [Verification run](https://github.com/iamhuwng/autoresync/actions/runs/44427117913) · [Retained operation outcome](https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-ef4170b3-a5d4-43b4-83b4-4e15144a1c5c#outcome-729f57ec5227471d3305a05caa6873ad5b2519991b0867a01669441aef797a2c.json)
