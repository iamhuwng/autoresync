---
title: Reading V2 Auto V4 Provider Review Contract
description: Reading V2 Auto V4 provider ownership, source-proof audit, Studio review handoff, publish safety, and Review Issues routing.
createdAt: '2026-05-23T21:41:01.704Z'
updatedAt: '2026-06-08T00:00:00.000Z'
tags:
  - architecture
  - reading-v2
  - auto-v4
  - gemini
  - groq
  - cloudflare
  - studio-review
---

# Reading V2 Auto V4 Provider Review Contract

## Purpose

Reading V2 Auto V4 is a safe assistant, not an autonomous judge. AI owns broad interpretation of messy Reading source. Local code owns source evidence, diagnostics, validation, and Studio handoff.

## Active Pipeline

Reading V2 Auto V4 default parsing is Gemini-only staged extraction with raw teacher input as source truth. Whole-test V3/Groq fallback is retired. Groq is reserved only for future teacher-triggered or verifier-triggered repair of one weak question group, using the smallest useful source slice.

## Ownership

V4/Gemini owns the main full-document structure extraction.

Raw teacher input and the local source ledger own source truth.

Local code owns source ledger, verifier diagnostics, bounded source-proof equivalence, canonical Reading V2 assembly, Studio review blockers, and publish safety.

## Philosophy

Do not turn local code into a brittle parser for every messy source format. If provider output is incomplete but canonical-safe and localizable, Studio may open with review blockers. If output is unsafe or non-editable, Auto V4 fails closed before Studio.

A successful Auto V4 import may still be `needs_review`. Import success means an editable Studio draft exists. Publish readiness requires clean validation and no unresolved review blockers.

## Studio Review Issues

Teacher-facing review UI is owned by `documentation/architecture/reading-v2-studio-review-issues-contract.md`.

Warning content must route through a click-stable Review Issues panel with compact rows such as `Question 23: Wrong Judgement Vocabulary`. Hover-only tooltip text, backend diagnostic wording as row labels, and generic deduplication that hides question-level issues are obsolete.

## Publish Handoff

Auto V4 hands an editable draft to Studio. It does not publish directly and does not get a separate material pipeline.

After teacher review, validation, and publish:

- full Reading V2 tests use the shared Reading V2 publish plan
- generated Reading Passage materials are extracted from full-test source order
- each generated passage gets canonical material/version data, a published snapshot, student-safe/review projections, and Material Catalog summary rows
- the master full-test material keeps ordered passage material/snapshot refs

Do not add Auto V4-only publish shortcuts that bypass Reading Passage extraction, Material Catalog indexes, or student-safe projection checks.

Detailed reference: @doc/architecture/reading-v2-material-publish-and-passage-library.

## Key Inventory

Reading V2 Auto V4 must use `.env` keys, numbered env keys, and admin-site key registry entries. Trusted Node harness reads the admin registry only when `READING_V2_TRUSTED_ADMIN_KEYS=true`. Browser code must not use this trusted Node fallback.

## Backend Boundary

Cloud Functions are off-limit for new Reading V2 work. The approved trusted backend boundary is Cloudflare Worker, currently `r2-backup-worker`, or another explicitly approved small backend service. Historical Firebase Functions wrappers may remain until retired, but must not be expanded or treated as production fallback.

## Historical Evidence

The May 24 live Clippings gold E2E for `Practice Cam 10 Reading Test 04.md` used historical `gemini-groq`, loaded 4 Gemini keys and 7 Groq keys in the trusted harness, produced 3 passages, 8 task groups, 40 questions, and 40 answer rows, with 0 answer mismatches and 0 canonical validation blockers. Studio remained `needs_review` because provider output needed source-proof repair/review blockers. This is historical evidence, not the active provider-routing contract.
