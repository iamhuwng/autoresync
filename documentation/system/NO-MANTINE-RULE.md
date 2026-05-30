# 🚫 NO MANTINE RULE — ABSOLUTE BAN (Enforced 2026-02-27)

> **STATUS: ACTIVE — ZERO BYPASS — ALL AI AGENTS**
> This rule applies to Claude, Gemini, and any other AI assistant working on this project.

## The Rule

**DO NOT import, use, or recommend ANY `@mantine/*` package for NEW code.**

This applies to both student-facing and teacher-facing surfaces. The student-view rule is not a special carveout; teacher view follows the same no-Mantine migration rule.

This includes but is not limited to:
- `@mantine/core` (Button, Modal, TextInput, Select, Stack, Group, Text, Badge, etc.)
- `@mantine/hooks` (useMediaQuery, useDisclosure, etc.)
- `@mantine/form`
- `@mantine/notifications`
- `@mantine/dates`
- `@mantine/dropzone`
- `@mantine/carousel`
- Any other `@mantine/*` package

## What To Use Instead

| Need | Use Instead |
|------|-------------|
| **Components** | Plain HTML + CSS, or build custom React components |
| **Styling** | Vanilla CSS, CSS Modules, or inline styles |
| **Icons** | `@tabler/icons-react` (still allowed), SVG, or emoji |
| **Modals** | Native `<dialog>` element or custom portal-based modal |
| **Forms** | Native `<form>`, `<input>`, `<select>`, `<textarea>` |
| **Notifications** | Custom toast/notification system |
| **Date Picker** | Native `<input type="date">` / `<input type="datetime-local">` with custom calendar UI |
| **Hooks** | Write custom hooks or use browser APIs directly |

## Scope

| Scope | Rule |
|-------|------|
| **New files** | ❌ ZERO Mantine imports allowed |
| **New components** | ❌ ZERO Mantine components allowed |
| **Existing files being modified** | Do NOT add new Mantine imports. Replace Mantine encountered in the touched UI component or touched region. |
| **Full rewrites/refactors** | ❌ Replace Mantine with native alternatives |

If replacing encountered Mantine would expand beyond the requested surface, document the deferred residue with file path, component name, and reason. Do not add new Mantine while deferring old Mantine.

## Why

We are migrating away from Mantine to reduce bundle size, eliminate dependency lock-in, and gain full control over our component styling. Existing Mantine usage will be gradually replaced.

## Self-Check

Before writing ANY import statement, ask:
1. Does this import from `@mantine/*`? → **STOP. Use an alternative.**
2. Am I about to suggest installing a `@mantine/*` package? → **STOP. Find another way.**
3. Am I copying code from an existing file that uses Mantine? → **Replace Mantine components with native equivalents.**
4. Am I editing a teacher UI area that already uses Mantine? → **Replace the encountered Mantine in the touched area or document the explicit deferred residue.**
