---
title: Reading Staged Parse Job
description: Internal staged parse-job model for teacher IELTS Reading creation, including artifact boundaries, compatibility rules, and future extension points.
createdAt: '2026-04-10T09:07:00.744Z'
updatedAt: '2026-04-12T00:39:47.886Z'
tags:
  - architecture
  - ielts-reading
  - test-creation
  - ai-parser
---

# Reading Staged Parse Job

## Overview
The teacher IELTS Reading creator now uses an explicit internal parse-job model inside `src/services/test-creation/index.ts`.

The public contract stays stable:
- `parseDocument()` / `parseText()` still return `documentText`
- `passages[]` still carry full passage content
- `validationResult.mergedQuestions[]` remains the modal-facing question source
- parse success still fails closed when zero merged questions are produced

## Stages
1. `normalized-source`
2. `extraction`
3. `classification`
4. `validation`
5. `review-draft`

## Artifact Boundaries
### Normalized Source
Holds the converted `documentText`, filename, MIME type, and optional document hash.

### Extraction
Holds the chosen extraction source, AI/offline raw outputs, normalized passages, and canonical AI-question inputs for validation.

### Classification
Holds the independent rules results and validator-ready `RulesQuestionResult[]`.

### Validation
Holds the merged validation result produced by `compareAIvsRules()`.

### Review Draft
Holds the final reviewable passage/question payload and `sectionInstructions` object expected at the draft boundary.

## Compatibility Rules
- The modal must continue to treat parse success as "review payload exists and draft save succeeds".
- Draft persistence remains the success gate before review navigation.
- Canonical Reading question fields such as `labeledOptions`, `optionLabelFormat`, `sectionReferences`, `answer`, `passageId`, and `wordLimit` must survive the staged pipeline.
- Internal artifact changes must not force the review page or draft service to consume provider-specific shapes.

## Why This Exists
This staged model creates clean extension points for:
- stage-local retries and recovery
- richer diagnostics and telemetry
- resumable parsing for long documents
- future provider-specific repair steps

## Related Docs
- @doc/architecture/ai-parsing-extraction
- @doc/architecture/test-system-architecture
- @doc/specs/ai-pipeline-redesign

## 2026-04-12 Amendment - Legacy Chunking Config Retirement
The live teacher IELTS Reading creation path no longer exposes chunk sizing through the shared Vite environment contract.

Current runtime rule:
- the staged parse job MUST not read `VITE_CHUNK_SIZE`, `VITE_CHUNK_OVERLAP`, or `VITE_MAX_DOCUMENT_SIZE`
- any surviving chunking helpers are legacy internals and must carry local defaults instead of extending app setup
- future parser work must restore and document a real runtime consumer before reintroducing chunking env keys

Operational consequence:
- removing the chunking env keys does not change the live teacher Reading creation flow
- cleanup can continue pruning legacy chunking utilities without changing teacher setup requirements
