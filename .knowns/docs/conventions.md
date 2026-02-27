---
title: CONVENTIONS
createdAt: '2026-02-27T15:56:55.248Z'
updatedAt: '2026-02-27T15:57:19.654Z'
description: >-
  Coding conventions, naming patterns, critical rules (No Mantine, Integration
  Safety, Student Design). MUST READ before writing code.
tags:
  - core
  - rules
  - conventions
---
# Project Conventions

## Critical Rules (ZERO BYPASS)

### 1. No Mantine (@doc/system/no-mantine-rule)
- **NEVER** import from `@mantine/*` in new code
- Use native HTML + CSS, or custom React components
- Existing Mantine usage may remain temporarily in unmodified files
- Alternatives: `<dialog>` for modals, `<input type="date">` for pickers, custom toast for notifications

### 2. Integration Safety Rules (@doc/integration-safety-rules)
12 rules derived from production bugs. **Read the full doc before coding:**

| # | Trigger | Rule |
|---|---------|------|
| 1 | Writing `navigate()`, link, or redirect | Validate against route registry |
| 2 | Navigating to page needing prerequisite state | Page-Entry Prerequisite Handshake |
| 3 | New nav handler, auth flow, session entry | Pattern-First Research |
| 4 | Layout shift during dnd-kit drag | Force re-measurement after paint |
| 5 | Custom pointer handlers on dnd-kit draggables | No setPointerCapture |
| 6 | `useEffect` with `setInterval` + state deps | Hot Values → Refs in Intervals |
| 7 | State initialized as 'pending'/'loading' | Guaranteed Resolution for All Branches |
| 8 | New component for another page | Component Exists ≠ Integrated |
| 9 | "Replace ALL" or "every" in requirements | Codebase-Wide Grep Audit |
| 10 | Git pull/fetch/merge | Git Sync Safety Protocol |
| 11 | Service writing to RTDB as side effect | Restore Guard Middleware |
| 12 | New RTDB node or Firestore collection | Backup Coverage Check |

### 3. Student View Design Standard (@doc/design/student-view-design-standard)
All student-facing pages must follow the design standard:
- Fixed layout structure with header, sidebar, content area
- Specific color palette (dark theme with accent colors)
- Typography rules (font sizes, weights)
- Component patterns (cards, buttons, badges, modals)

## Naming Conventions

### Files
| Type | Pattern | Example |
|------|---------|---------|
| Pages | `{Role}{Feature}Page.tsx` | `TeacherClassesPage.tsx` |
| Components | `PascalCase.tsx` | `ClassCard.tsx` |
| Services | `camelCase.ts` | `classManager.ts`, `userService.ts` |
| Hooks | `use{Name}.ts` | `useTestSession.ts` |
| Types | `{domain}.types.ts` | `class.types.ts` |
| Constants | `camelCase.ts` | `routes.ts` |

### Service naming
- `*Manager.ts` — CRUD operations (classManager, courseManager)
- `*Service.ts` — Utility/processing (userService, profileService)

### Component folders
- Feature folders with `index.ts` barrel exports
- Tests co-located: `Component.test.tsx` next to `Component.tsx`

## Code Style

- **TypeScript** for all new files (no new .jsx)
- **React 19** functional components with hooks
- **Zustand** for global state, React Context for auth/nav
- **CSS Modules** or vanilla CSS (no Mantine, no Tailwind)
- **@tabler/icons-react** for icons

## Route Security

All routes are protected via `src/config/routeSecurity.ts`:
```typescript
// Route-role matrix enforced by RouteGuard component
{ path: '/teacher/classes', roles: ['teacher', 'admin'] }
```

New routes MUST be added to both `routes.ts` and `routeSecurity.ts`.

## Firebase RTDB Patterns

- Path format: `/{collection}/{id}` (e.g., `/tests/abc123`)
- Listeners: Use `onValue`/`onChildAdded` for real-time, `get` for one-shot
- Writes: Always use `update()` over `set()` for partial updates
- Security: RTDB rules must match routeSecurity patterns

## Testing

- **Unit tests**: Vitest + React Testing Library
- **E2E tests**: Playwright
- **Run**: `npm test` (unit), `npm run test:e2e` (e2e)
