# Release evidence review and spare preview freshness

Changelog ID: `CL-20261119-RELEASE-EVIDENCE-REVIEW`
Master entry: [Master Changelog](../master_changelog.md)

Release checks now retain screenshots or short videos for browser-impacting
changes. Each journey records the candidate identity before and after the
capture. The spare preview rejects a rebuild while it is running, and
disposable Hosting channel readbacks must match the retained artifact.

Codex or a reviewing agent evaluates the evidence against the requested
outcome. Deviations, incorrect results, and unintended effects return the
candidate for correction and fresh verification. Guarded application Hosting
promotion requires a passing review in the source-bound evidence bundle.

This change affects local verification and release tooling. It requires no
website deployment or backend rollout.

[Release procedure](../../system/release-safety.md#codex-verification-handoff)
