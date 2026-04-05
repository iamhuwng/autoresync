---
id: poykhe
title: Fix teacher lobby route load failure and Aurora theme provider regression
status: done
priority: high
labels:
  - teacher
  - runtime
  - vite
  - theme
createdAt: '2026-04-05T19:23:05.688Z'
updatedAt: '2026-04-05T19:33:59.056Z'
timeSpent: 628
---
# Fix teacher lobby route load failure and Aurora theme provider regression

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resolve localhost TeacherLobbyPage dynamic import failures caused by heavy eager route dependencies and replace the new Mantine-only AuroraThemeProvider with a native wrapper that preserves the global provider boundary contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AuroraThemeProvider no longer imports or mounts @mantine/* and remains compatible with ThemeContext's global provider boundary.
- [x] #2 TeacherLobbyPage initial route chunk no longer eagerly imports heavy optional editor/modal components that pull dnd-kit into the page load.
- [x] #3 Teacher quick-login reaches TeacherLobbyPage without dynamic import failure, and build/test verification passes for the changed surfaces.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigating localhost TeacherLobbyPage lazy import failures (`504 Outdated Optimize Dep` on dnd-kit prebundles) and runtime Rule 15 warning for the new AuroraThemeProvider Mantine import. Root-cause plan: keep global Mantine bootstrap in ThemeContext, replace AuroraThemeProvider with native wrapper, and lazy-load optional teacher-lobby editor/modals so the route chunk does not eagerly depend on dnd-kit.
Implemented the root-cause fix in two parts: (1) replaced the new `AuroraThemeProvider` nested Mantine wrapper with a native token shell, preserving the single global provider boundary in `ThemeContext`; (2) changed `TeacherLobbyPage` so the heavy editors/modals are lazy overlays behind `Suspense` instead of direct route imports. Also removed new direct-router coupling from the edited lobby paths by using `navigateTo(...)` for THCS draft/edit and test-review navigation.

Verification:
- `cmd /c npm run check:utf8 -- src/components/theme/AuroraThemeProvider.jsx src/components/theme/AuroraThemeProvider.test.jsx src/pages/TeacherLobbyPage.jsx`
- `cmd /c npx vitest run src/components/theme/AuroraThemeProvider.test.jsx --reporter=basic`
- `cmd /c npm run build`
- Real Vite dev verification at `http://127.0.0.1:4173`: `/lobby` loaded with 0 console errors, the old `TeacherLobbyPage.jsx` lazy import failure no longer appeared, and opening a THCS editor loaded `@dnd-kit/*` requests as `200 OK` on demand instead of failing the route import.

Residual note: there are still older Rule 15 warnings in legacy/newer teacher files such as `TeacherLobbyPage.jsx`, `ClassSelectionModal.jsx`, `UseAsIsModal.jsx`, and test-creation files because they still use existing Mantine components. This fix intentionally removed the new Aurora nested-provider violation and the route-chunk regression without attempting a broad Mantine migration in this pass.
<!-- SECTION:NOTES:END -->

