# Native Windows x64 Development

Changelog ID: `CL-20261119-NATIVE-X64-DEVELOPMENT`
Master entry: [Master Changelog](../master_changelog.md)

## Change

The default development command starts Vite with the spare Firebase project and spare upload Worker. The spare build and preview use a dedicated Vite configuration that ignores environment files. The emulator workflow remains available for disposable data and rules checks.

Each checkout resolves tools from its own lockfiles and dependencies. The transition removes the Windows ARM64 and WSL launch paths and documents native setup, diagnostics, audit evidence, and cleanup.

The Hosting release workflow keeps publication evidence required and handles changelog reconciliation as a follow-up. The recovery workflow records the observed operation outcome.

## Release state

Production Hosting publication is pending independent verification of the release candidate.
