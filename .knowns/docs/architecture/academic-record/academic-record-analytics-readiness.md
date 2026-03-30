---
title: Academic Record Analytics Readiness
description: Defines the analytics and data-quality contract that Academic Record should satisfy before future proficiency and material-suggestion systems are added.
createdAt: '2026-03-30T14:53:47.319Z'
updatedAt: '2026-03-30T16:13:42.338Z'
tags:
  - architecture
  - academic-record
  - analytics
  - recommendations
  - results
---

# Academic Record Analytics Readiness

## Purpose

Academic Record is the future input layer for proficiency inference, study recommendations, and material suggestions.

This document defines:
- which analytics are safe to expose now
- which analytics should wait for stronger metric contracts
- which data-quality rules must hold before future recommendation systems depend on this feature

## Product Position

Academic Record is not yet an analytics dashboard product.

It is a trusted student record surface with a small set of decision-useful summaries.

That means the page should favor:
- interpretable metrics
- stable definitions
- clean context preservation
- room for future recommendation systems

It should avoid:
- chart sprawl
- decorative analytics
- premature scoring models that collapse different test families into a single synthetic number

## Analytics Layers

### Layer 1: Raw Result Data

Foundational result data should preserve:
- result id
- test identity
- student identity
- timestamp
- score outcome
- scoring system
- course or class or module context
- assessment type
- skill mapping when available
- review status when manual grading exists

Without this layer, progression and recommendation logic becomes unreliable.

### Layer 2: Stable Derived Metrics

These metrics are mature enough for lightweight Academic Record use now:
- total tests completed
- average score across visible results
- best score
- latest result per test
- recent activity ordering
- skill-grouped latest-result browsing
- course-grouped latest-result browsing
- progressive-feedback narrative windows
- lightweight THCS summary metrics
- lightweight writing summary metrics

These are suitable because they are explainable and easy to verify against the result history.

The type lens remains derivable from the stored data, but it is intentionally not surfaced in the current page IA.

### Layer 3: Future Recommendation Inputs

These are appropriate future inputs once definitions are stabilized:
- proficiency trajectory by skill cluster
- consistency and volatility measures
- recency-weighted weakness detection
- repeated failure or stall patterns
- course-level completion confidence
- writing improvement trajectory
- THCS topic mastery estimates

These should feed recommendation services, not automatically become top-level UI widgets.

## Readiness Levels

### Ready Now

Safe to expose today:
- simple summary stats
- recent results
- IELTS skill grouping over latest results
- Course grouping over latest results
- progressive feedback summaries
- THCS dedicated progression surface
- Writing dedicated progression surface

### Next Phase

Safe after metric contracts are documented and validated:
- per-skill trend summaries
- weak-area clustering
- teacher-facing intervention signals
- recommendation evidence cards

### Later Phase

Only after enough confidence and explainability exists:
- proficiency prediction
- automatic material suggestions
- adaptive next-best-action recommendations
- personalized study plans driven by record history

## Data Quality Requirements

Future analytics quality depends on these invariants:
- results keep their academic context
- retries remain traceable to a stable test identity when applicable
- pending manual reviews do not masquerade as final proficiency evidence
- scoring-system differences remain preserved
- missing skill mappings are treated as missing data, not guessed silently

## UI Guardrails

When analytics features expand, Academic Record should still remain readable on first load.

Required rules:
- keep the default view understandable in under one screen
- promote only metrics that lead to action
- use a shared flat row language across result surfaces
- use tonal separation instead of nested bordered card stacks
- move deep analytics into progressive disclosure or dedicated follow-up surfaces
- never let future recommendation widgets replace direct access to the underlying results

## Recommendation-System Guardrails

Any future system that uses Academic Record as input should:
- state which evidence window it used
- distinguish between practice frequency and mastery
- avoid high-confidence recommendations on sparse histories
- preserve traceability back to concrete results and lenses

## Related Docs

- @doc/architecture/academic-record/academic-record-page-architecture
- @doc/architecture/academic-record/academic-record-progression-model
- @doc/architecture/results-academic-record
- @doc/prd/prd-academic-record
