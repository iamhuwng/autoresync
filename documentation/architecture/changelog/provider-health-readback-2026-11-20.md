# Provider health and version-bound readback

Changelog ID: `CL-20261120-PROVIDER-HEALTH-READBACK`
Master entry: [Master Changelog](../master_changelog.md)

The release tooling now aggregates independent Firebase and Cloudflare
read-only failures, reports bounded provider status codes, and provides
best-effort Google token scope and lifetime diagnostics without logging
credentials or raw response bodies.

Release Promotion has a protected-main `health` operation using the existing
preflight federation and a separate read-only concurrency group. A local
readiness doctor reports pinned-runtime, checkout, Git operation, dependency,
and GitHub CLI prerequisites. Git index access remains advisory.

Hosting dependency evidence hashes Worker modules from the active,
version-addressed Cloudflare response and validates the returned version ID.
Deployment and production authorization remain unchanged.

This change affects release tooling and operator documentation only. It requires
no website deployment or backend rollout.

[Release safety procedure](../../system/release-safety.md#provider-checks-and-credentials)
