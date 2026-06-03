---
title: Reading V2 Auto V4 Provider Review Contract
description: Reading V2 Auto V4 provider split, Groq self-repair loop, key inventory, Cloudflare backend boundary, and Studio review philosophy.
createdAt: '2026-05-23T21:41:01.704Z'
updatedAt: '2026-06-03T00:00:00.000Z'
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

## Pipeline

Raw source -> local source ledger and line index -> Gemini topology marker and answer-key witness -> local passage packages -> Groq per-passage question-area structured JSON normalizer -> transcript verifier -> Groq self-repair retry when coverage is low or unsafe -> bounded local audit/repair -> guarded Studio draft or fail-closed diagnostics.

## Ownership

Gemini owns full-source topology, passage/group coordinates, and visible answer-key row normalization.

Groq owns question-area normalization, strict JSON transcript shape, task group/question coverage, source-proof fields, and visible layout preservation for notes, tables, flowcharts, and diagrams.

Local code owns source ledger, package construction, key inventory, verifier diagnostics, bounded source-proof equivalence, canonical Reading V2 assembly, Studio review blockers, and publish safety.

## Philosophy

Do not turn local code into a brittle parser for every messy source format. If provider output is incomplete, feed precise coverage/verifier feedback back to Groq first. Local repair is allowed only after that and must remain source-proof bounded.

A successful Auto V4 import may still be `needs_review`. Import success means an editable Studio draft exists. Publish readiness requires clean validation and no unresolved review blockers.

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

## Current Evidence

The live Clippings gold E2E for `Practice Cam 10 Reading Test 04.md` used `gemini-groq`, loaded 4 Gemini keys and 7 Groq keys in the trusted harness, produced 3 passages, 8 task groups, 40 questions, and 40 answer rows, with 0 answer mismatches and 0 canonical validation blockers. Studio remained `needs_review` because provider output needed source-proof repair/review blockers.
