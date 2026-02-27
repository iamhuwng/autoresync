# 🚫 NO MANTINE RULE — ABSOLUTE BAN (Enforced 2026-02-27)

> **STATUS: ACTIVE — ZERO BYPASS — ALL AI AGENTS**
> This rule applies to Claude, Gemini, and any other AI assistant working on this project.

## The Rule

**DO NOT import, use, or recommend ANY `@mantine/*` package for NEW code.**

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
| **Existing files being modified** | ⚠️ Do NOT add new Mantine imports. Existing usage may remain temporarily. |
| **Full rewrites/refactors** | ❌ Replace Mantine with native alternatives |

## Why

We are migrating away from Mantine to reduce bundle size, eliminate dependency lock-in, and gain full control over our component styling. Existing Mantine usage will be gradually replaced.

## Self-Check

Before writing ANY import statement, ask:
1. Does this import from `@mantine/*`? → **STOP. Use an alternative.**
2. Am I about to suggest installing a `@mantine/*` package? → **STOP. Find another way.**
3. Am I copying code from an existing file that uses Mantine? → **Replace Mantine components with native equivalents.**
