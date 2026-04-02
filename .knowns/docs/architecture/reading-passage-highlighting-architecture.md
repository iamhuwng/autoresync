---
title: Reading Passage Highlighting Architecture
description: Renderer ownership, highlight offset contract, and solo preference defaults for reading passage highlighting.
createdAt: '2026-04-02T04:50:17.752Z'
updatedAt: '2026-04-02T04:50:32.916Z'
tags:
  - architecture
  - reading
  - highlighting
  - solo
  - homework
---

# Reading Passage Highlighting Architecture

## Overview

Reading passage highlighting is rendered from one canonical implementation:
- `src/skills/reading/components/PassageRenderer.tsx`

Legacy callers may still import:
- `src/components/PassageRenderer_v2.jsx`

That legacy file is now a compatibility wrapper and must continue delegating to the skill-owned renderer so Reading, solo practice, and homework flows all share the same highlight behavior.

## Source Of Truth

Highlights are stored against the original passage text, not against rendered paragraph fragments.

Required invariants:
- each highlight stores passage-level start and end offsets
- rendered paragraph boundaries are presentation-only and must not change the stored offsets
- a single logical highlight may render as multiple `<mark>` segments when it crosses paragraph boundaries

## Selection Mapping Contract

The renderer may split passage content into multiple paragraphs and text spans for display, but selection capture must map DOM selections back to source passage offsets before saving a highlight.

Required rules:
- each rendered text span must carry enough metadata to recover its source-text range
- selection start and end offsets must be computed relative to the full passage text
- selections that begin in one paragraph and end in the next paragraph are valid
- highlight rendering must use the saved source offsets to recreate the correct marked ranges on every render

This contract prevents the interparagraph highlight bug where a cross-paragraph selection could not be reconstructed correctly from paragraph-local offsets.

## Preference Contract

Solo Reading preferences are stored under:
- `solo_student_prefs_{studentId}`

Required default:
- `highlighterEnabled: false`

Implications:
- the highlighter tool is off by default for new preference records
- the student must explicitly enable the tool before text selection creates highlights
- existing persisted preferences may still retain older values until the student changes them

## Regression Coverage

The current contract is covered by focused tests:
- `src/skills/reading/components/PassageRenderer.test.tsx` verifies a highlight can span adjacent paragraphs
- `src/types/practice.types.test.ts` verifies new solo preferences default the highlighter to off
