# Localhost-first Hosting promotion

Changelog ID: `CL-20261119-LOCALHOST-HOSTING-PROMOTION`
Master entry: [Master Changelog](../master_changelog.md)

Routine application checks use localhost with isolated spare Firebase and Worker
services. Checks that depend on a deployed Hosting origin use a disposable
channel. The shared spare project keeps its existing RTDB rules during those
checks.

Before requesting production approval, Release Promotion serves the candidate
artifact over localhost and checks the home page, the manifest, and each listed
file. Publication uses the retained files, checks the downloaded manifest bytes,
and reports the verified live revision, artifact digest, and operation ID.

This change affects release tooling and operator documentation only. It requires
no Hosting publication or backend rollout.

[Release procedure](../../system/release-safety.md#routine-hosting-release)
