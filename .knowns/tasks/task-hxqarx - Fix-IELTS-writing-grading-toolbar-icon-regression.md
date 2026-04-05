---
id: hxqarx
title: Fix IELTS writing grading toolbar icon regression
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - writing-grading
  - docs
  - deploy
createdAt: '2026-04-05T06:57:05.085Z'
updatedAt: '2026-04-05T07:21:34.541Z'
timeSpent: 1462
---
# Fix IELTS writing grading toolbar icon regression

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Patch the teacher IELTS writing grading page regression where essay toolbar icons render as text and undo/redo appear missing after the April 4 toolbar rewrite. Update architecture docs and Knowns, verify with tests/build, then commit and deploy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Patched EssayEditor toolbar to replace Material Symbols ligature text with Tabler SVG icons and added a regression assertion so the sticky grading toolbar cannot silently fall back to text again.
Production build now passes again. I fixed the CSS import ordering issue on WritingGradingPage.css and gated the Rollup visualizer in vite.config.js behind VITE_BUNDLE_ANALYZE=true so the normal hosting build path can complete without loading the analyzer plugin.
Production verification completed. `cmd /c npm run build` now passes after moving the WritingGradingPage font `@import` to the top of the CSS file and making the Rollup visualizer opt-in via `VITE_BUNDLE_ANALYZE=true`, which removes the production-only build blocker from the default path. The toolbar fix remains scoped to replacing font-ligature controls with Tabler SVG icons and adding a regression assertion for rendered SVG controls.
Hosting deployment completed successfully via `cmd /c npm run deploy:hosting`. Firebase Hosting released the updated build to `https://kahut1.web.app` after the rebuilt production bundle passed the existing bundle-budget check.
<!-- SECTION:NOTES:END -->

