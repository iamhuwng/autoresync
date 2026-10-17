# Create New Test reload: before/after release comparison

Prepared 2026-10-17 UTC from recorded provider evidence, direct public HTTP probes at 18:05–18:10 UTC, source, and the user's browser result. No deployment or cache mutation was performed for this comparison.

## What changed in our deployment

| Evidence | Before / rollback | Our failed promotion |
| --- | --- | --- |
| Hosting version | `projects/temp-a1437/sites/kahut1/versions/10039da56ea1c0ae` | `projects/temp-a1437/sites/kahut1/versions/caa2ab5da3911495` |
| Recorded promotion time | Rollback released 17:28:58.392Z | Promoted 17:20:30.758Z |
| Provider file count | 458 | 456 |
| `/index.html` provider uploaded hash | `b6f0ef080a90105f0b059dc3c6a430521557b76df032fe2ed069d2a4b153986d` | `ac125ad5129004d51fb5d452dfcc6342088f43608bcf24fcfcd4c3c570fb4b0e` |
| Teacher lobby chunk | `TeacherLobbyPage-C9iAz8WV.js` | `TeacherLobbyPage-GzCwNd-1.js` |
| Creation modal chunk | `TestCreationModal-Dj-RQ-B5.js` | `TestCreationModal-BGwLcZ7b.js` |

The promotion replaced 289 old-only paths with 287 new-only paths. Of 193 asset references in the old entry `index-CCrorz1s.js`, 111 paths are absent from the promoted manifest. The old lobby references its old modal; 114 of its 175 asset references are absent from the promoted manifest. A browser retaining an old module graph therefore cannot complete every lazy import after promotion. The reverse transition during rollback also invalidates promoted chunk paths.

Both provider versions specify the same header and rewrite policy: JavaScript caches for 300 seconds, CSS for 3600 seconds, and only `/` and `/index.html` explicitly prohibit HTML caching. Missing JavaScript rewrites to `/__asset_missing__.js`. The deployment changed asset identity while retaining that policy; the policy comparison does not excuse the deployment-triggered regression.

## Direct observations after rollback

- Current `kahut1.web.app/` bytes reproduce the original `/index.html` uploaded hash above. Both domains serve entry `index-CCrorz1s.js` for `/lobby`, both user-reported `asset_refresh` URLs, and a fresh query.
- All 438 rollback JS/CSS URLs serve actual content. Across 393 JavaScript files, all 7,299 parsed relative/Vite-map asset references exist in the rollback manifest. No current missing rollback edge was found.
- Current modal `Dj-RQ-B5.js` returns real JavaScript on both domains: body SHA256 `3f20435a8eadf77680beb1e875253d36aaeee825532a09397599067424458093`.
- Promoted modal `BGwLcZ7b.js` now returns the 263-byte reload fallback on both domains: SHA256 `c7ed020f99b41a33b2ef30c7a68849c711086e311d0f70487173cd1d993c4481`.
- `/lobby` responses advertise `Cache-Control: max-age=3600`. Cloudflare reports `DYNAMIC` for HTML, including the fresh query; these probes do not show a different stale entry caused by ignoring queries.
- Cloudflare changes JavaScript response caching to `public, max-age=14400, must-revalidate`, including the fallback, versus 300 seconds on `kahut1.web.app`. This permits cached fallback bytes to survive restoration of the same path.
- `public/__asset_missing__.js` executes `location.replace()` with a new `asset_refresh` value. It bypasses the retry limit in `src/utils/lazyWithRetry.ts`. No service-worker implementation was found in current source or matching filename history.
- The user reports that enabling DevTools **Disable cache** makes the modal open without `asset_refresh`; the root agent independently reproduced a working modal in a fresh session.

## Conclusion and correction scope

Our promotion changed the chunk graph and is the likely trigger for the user's cache-dependent reload regression. Disabling cache restoring the modal directly supports cache involvement. The exact asset body retained by the affected browser was not captured, so stale document, stale module, and cached fallback contributions cannot be separated conclusively.

The candidate `firebase.json` diff adds a first `**` no-store header and retains later JS/CSS overrides, replacing the two narrowly matched document headers. This directly covers rewritten document routes such as `/lobby`. Source review found no issue with that scope. It does not by itself remove already-cached responses or override Cloudflare's observed four-hour JavaScript policy. Deployment/header verification and affected-browser acceptance remain the root agent's work.

## Evidence paths

- `hosting-files.json`: original/rollback file manifest.
- `stable-hosting-provider-files-20261018.json`: promoted file manifest.
- `stable-hosting-deployed-observation-20261018.json`: promoted provider version/config and source manifest.
- `reading-v2-rollback-observation-20261018.json`: rollback provider version/config.
- `hosting-before-promotion-20261018.json`: pre-promotion provider observation.

All paths above are relative to `C:/Users/The Lord/repos/luyentap-prd0062/tmp/deployment-audit-20261017/`. Current HTTP observations were gathered directly during this review; no secrets or bundle key values were retained.

## Subsequent reproduction and candidate correction

The root agent reproduced the deployment/rollback sequence on localhost with the
exact checked-in missing-asset script, the observed old/new modal filenames,
and the observed four-hour JavaScript cache lifetime. HTML was deliberately
`no-store` during the reproduction. The browser cached the missing-file script
once and then reloaded on both subsequent modal clicks after the original modal
was restored. Disabling browser cache opened the modal. This demonstrates that
fixing document headers alone is insufficient.

The current candidate additionally changes the JavaScript header to
`no-cache, no-store, must-revalidate`; CSS keeps its existing policy. Repeating
the same browser sequence with that policy opens the restored modal without
disabling cache and with zero repeated reloads. This deliberately trades some
JavaScript caching performance for reliable release transitions. It does not
purge previously cached browser responses. The new headers require actual
Hosting/custom-domain verification after release, especially because the current
Cloudflare credential cannot read the zone's cache settings or rules.

Local evidence: `rollback-asset-cache-reproduction.json`,
`rollback-asset-cache-correction.json`, and
`reproduce-rollback-asset-cache.mjs` in the evidence directory above. These are
controlled browser reproductions; the affected user's exact cached response was
not captured. No additional live deployment was made during diagnosis.
## Qualified replacement — October 18

The replacement is now deployed and verified as Hosting `61721e91a13201ae`,
source `83d794d4`, tag `stable-2026-10-18-reading`. All 453 deployed manifest
hashes match. Live teacher creation/Reading setup/passage-library and student
Library/Reading runtime/passage navigation passed without saving or submitting.
The live Submit control is available. Route and new JavaScript responses return
no-store through both domains, including a missing-script probe; Cloudflare
reports BYPASS for the tested scripts. See [the release record](2026-10-18-stable-reading-hosting-release.md)
for exact identities, backend readback, acceptance limits and rollback history.
Earlier pending statements above describe the preceding qualification stage.