---
title: AI Parsing And Extraction Boundaries
description: Current Reading V2 Auto import and non-Reading extraction boundaries.
createdAt: '2026-11-09T00:00:00.000Z'
updatedAt: '2026-11-09T00:00:00.000Z'
tags:
  - architecture
  - ai
  - reading-v2
---

# AI Parsing And Extraction Boundaries

Reading V2 Auto import is owned by src/services/reading-v2/ and feeds the Studio draft workflow. The provider layer may classify and normalize messy source text, but canonical V2 structure, answer binding, validation, projection safety, and publish readiness stay in code.

## Current Reading V2 Auto flow

1. Build a local source ledger and line index.
2. Ask Gemini for topology markers and normalized answer-key rows.
3. Split exact local source into passage packages.
4. Ask Groq to normalize each passage question area without passage-body text.
5. Assemble canonical V2 task groups and interactions deterministically.
6. Verify source fidelity and fail closed on missing or ambiguous structure.
7. Hand a guarded draft to Reading V2 Studio for repair, preview, validation, and publish.

Provider output is never a publish authority and must not be stored in student-safe or session-safe projections.

## Non-Reading extraction

Listening audio parsing and THCS extraction remain skill-owned. They must not import Reading V2 Studio internals or infer Reading task groups from generic question records.

## Removed legacy boundary

The former flat IELTS Reading parser/review pipeline and its staged-parser notes are retired. Do not add imports, route links, persistence contracts, or migration work for removed parser/review files. Use the current Reading V2 contracts:

- documentation/architecture/reading-v2-runtime-integrations.md
- documentation/architecture/reading-v2-material-publish-and-passage-library.md
- documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md
