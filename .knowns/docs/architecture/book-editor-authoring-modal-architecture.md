---
title: Book Editor Authoring Modal Architecture
description: Canonical PRD-0052 Book editor shell, Content layout, floating tree menu, save, visual, and accessibility contract.
createdAt: '2026-06-06T00:00:00.000Z'
updatedAt: '2026-06-06T00:00:00.000Z'
tags:
  - architecture
  - teacher-lobby
  - book-editor
  - prd0052
  - authoring-modal
---

# Book Editor Authoring Modal Architecture

Canonical repo source: `documentation/architecture/book-editor-authoring-modal-architecture.md`.

## Current Contract

- Normal `Open Book` stays on `/lobby` and opens `BookEditorModal`.
- `/teacher/materials/books/:bookId` is compatibility-only and redirects into the Lobby modal.
- Modal owns title, actions, tabs, focus, scroll lock, and dirty-close confirmation.
- Workspace owns editor state/body and renders no `TeacherHeader`.
- Tabs are exactly `Overview`, `Content`, and `Settings`; peer `Assign` is retired.
- `Content` uses a left outline navigator and right selected-item workspace.
- Left rows expose one real three-dot actions menu. The menu is portaled to `document.body`, crosses panel boundaries without resizing rows, and closes on outside interaction or `Escape`.
- Right-panel structure and selected-material actions use compact SVG icon buttons with accessible names/tooltips.
- Header save always saves the active domain and flushes dirty non-active-domain edits.
- Book modal shell uses neutral frame colors plus violet/indigo accents; legacy teal/green Book-modal chrome is retired.
- Body labels/chips/statuses use regular/medium weight; bold is reserved for actual hierarchy.
- No whole-Book homework/start action, no new Mantine imports, no source-material mutation from Book refs.

## Retired

- route-first normal Book editing;
- four peer tabs or `Contents` label;
- decorative tab rail plus workspace tabs;
- body-level save/footer strip;
- inline/clipped tree menus;
- fake action trigger that only selects;
- visible text command dumps on every row;
- full-text compact right-panel action rows;
- paused-redesign and current-gap statements from pre-closure PRD0052 notes.

## Verification Baseline

As of 2026-06-06, the targeted Book editor suite passes 6 files / 62 tests. Browser QA proved the menu is outside the tree, extends past the panel without changing card height, closes before discard confirmation, and the Book modal slice contains no legacy teal/green shell colors.
