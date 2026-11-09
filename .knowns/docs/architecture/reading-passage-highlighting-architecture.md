---
title: Reading Passage Highlighting Boundary
description: Reading V2 text selection boundary; legacy passage-highlighting implementation retired.
createdAt: '2026-11-09T00:00:00.000Z'
updatedAt: '2026-11-09T00:00:00.000Z'
tags:
  - architecture
  - reading-v2
---

# Reading Passage Highlighting Boundary

The retired Reading passage renderer and its legacy preference/offset contract are no longer active product guidance. Reading V2 runtime rendering is projection-owned and must follow the current Reading V2 runtime contract in `documentation/architecture/reading-v2-runtime-integrations.md`.

Do not add imports, wrappers, persistence keys, or migration work for the removed legacy passage-highlighting files. If Reading V2 adds text annotation later, define that behavior in the V2 projection/runtime contract and tests first.
