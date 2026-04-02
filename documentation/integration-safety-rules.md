# Integration Safety Rules — Index

> 20 active rules from real production bugs. **DO NOT read the full rule files upfront.**
> Only load the relevant category file when a trigger condition is met.
> Updated 2026-04-01: Added Rule 4 (session existence validation before navigation from stored refs).

## Quick Trigger Table

| # | When you are... | Load this file |
|---|----------------|----------------|
| 1 | Writing `navigate()`, links, or redirect URLs | `documentation/rules/navigation.md` |
| 2 | Navigating to a page that reads prerequisite state | `documentation/rules/navigation.md` |
| 3 | Writing a new nav handler, auth flow, or session entry | `documentation/rules/navigation.md` |
| 4 | Navigating to session pages from stored/cached references | `documentation/rules/navigation.md` |
| 6 | Writing `useEffect` with `setInterval`/`setTimeout` + state deps | `documentation/rules/react-patterns.md` |
| 7 | Creating state initialized as `'pending'`, `'loading'` | `documentation/rules/react-patterns.md` |
| 8 | Creating a new component intended for use in another page | `documentation/rules/react-patterns.md` |
| 9 | PRD says "replace ALL", "every", or "replaces existing" | `documentation/rules/codebase-hygiene.md` |
| 10 | Before any `git pull`, `git fetch + merge`, or sync op | `documentation/rules/infrastructure.md` |
| 11 | Creating a service that writes to RTDB/Firestore on data events | `documentation/rules/infrastructure.md` |
| 12 | Adding a new RTDB node or Firestore collection | `documentation/rules/infrastructure.md` |
| 13 | Building or modifying Cloudflare Workers (R2, backup, etc.) | `documentation/rules/infrastructure.md` |
| 14 | Using an ID shared between creator and consumer | `documentation/rules/infrastructure.md` |
| 15 | Writing ANY `import` — `@mantine/*` is banned | `documentation/rules/codebase-hygiene.md` |
| 17 | Writing new data to a path where existing code reads | `documentation/rules/codebase-hygiene.md` |
| 18 | Writing `localStorage.*` or `sessionStorage.*` | `documentation/rules/mobile-portability.md` |
| 19 | Writing hooks using `window.*`, `document.*`, `navigator.*` | `documentation/rules/mobile-portability.md` |
| 20 | Writing `dangerouslySetInnerHTML` | `documentation/rules/mobile-portability.md` |
| 21 | Writing `useNavigate()` from react-router-dom directly | `documentation/rules/mobile-portability.md` |
| 22 | Writing `window.innerWidth` or `window.matchMedia()` in components | `documentation/rules/mobile-portability.md` |

## Category Files

| File | Rules | Topic |
|------|-------|-------|
| `rules/navigation.md` | 1, 2, 3, 4 | Routes, page-entry handshakes, pattern-first research, session validation |
| `rules/react-patterns.md` | 6, 7, 8 | Intervals, state machines, component integration |
| `rules/infrastructure.md` | 10, 11, 12, 13, 14 | Git sync, DB rules, CF Workers, shared IDs |
| `rules/codebase-hygiene.md` | 9, 15, 17 | Grep audits, Mantine ban, data contracts |
| `rules/mobile-portability.md` | 18, 19, 20, 21, 22 | Storage, platform hooks, HTML injection, navigation, responsive |

## Retired Rules

| # | Rule | Reason | Knowledge location |
|---|------|--------|-------------------|
| 5 | No setPointerCapture | Only 2 files, already fixed | Inline comments in `THCSDndSectionsContainer.tsx` |
| 16 | WebMCP tool registration | Fully removed 2026-03-14 | `documentation/archive/webmcp-final-backup-2026-03-14/` |
