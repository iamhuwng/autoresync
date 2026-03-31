# Academic Record Progression Model

## Purpose

Academic Record should represent progression, not just storage.

This document defines the progression semantics the page should reflect so future UI and recommendation work use the same model.

## Core Principle

A result is a historical event.
A progression signal is a derived interpretation of many results over time.

Academic Record must preserve that distinction.

## Progression Entities

### Attempt

A single submission or reviewed result event.

Minimum meaning:
- when the student did the work
- what assessment it belonged to
- which course, class, or module context applied
- what the scoring outcome was
- whether the result is final or still pending review

### Test

A reusable assessment identity that may have multiple attempts over time.

Why it matters:
- overview surfaces often need the latest meaningful result per test
- progression should not be distorted by counting every retry as if it were a separate skill area

### Lens

A lens reorganizes the same result set for interpretation.

Current approved lenses in the domain:
- course
- skill
- THCS-specific progression
- writing-aware IELTS progression

The `type` lens remains a valid derived lens conceptually, but it is not currently surfaced in the main page IA.

A lens does not create new data. It changes the way the student reads the same history.

## Derived Progression Levels

### 1. Raw History

Shows all attempts in chronological order.

Used for:
- auditability
- exact historical review
- result reopening

### 2. Latest Meaningful Result

Shows the latest relevant result per test or learning object.

Used for:
- overview summaries
- recent-results surfaces
- top-level IELTS and Course browsing views
- simplified progress reading

### 3. Lens-Level Progression

Aggregates results by course or skill without inventing synthetic scores that hide the underlying record.

Used for:
- browsing the record
- spotting repeated weakness or strength areas
- future recommendation inputs

### 4. Track-Specific Progression

Specialized domains such as THCS and manual-review writing states may define dedicated progression interpretations when a generic lens is insufficient.

Used for:
- THCS-specific interpretation
- writing review and performance history inside the IELTS surface

## Score Normalization Guardrails

The page may use shared convenience metrics such as percentage for lightweight summaries, but it must not pretend all scoring systems are identical.

Required guardrails:
- keep IELTS-native scoring semantics visible where relevant
- keep THCS-native scoring semantics visible where relevant
- treat percentage as a convenience metric, not the full truth
- preserve pending-review states instead of collapsing them into final scores
- avoid single blended analytics that imply full equivalence between IELTS and THCS

## Current Approved Progression Surfaces

### Overview

Overview progression may include:
- total tests
- average score
- best score
- recent results
- progressive feedback summary

### THCS

THCS progression remains specialized because the domain has its own reading patterns and learning expectations.

### IELTS

IELTS is currently expressed as a skill-organized progression view over latest meaningful results, with writing-specific review and band semantics integrated into the writing skill group.

### Course

Course is currently expressed as a course-organized progression view over latest meaningful results.

## Presentation Contract For Progression

Progression surfaces should expose their derived meaning through a consistent record-reading pattern.

Current UI contract:
- progression surfaces use a two-layer hierarchy: calm summary cards first, stronger browse rows second
- the Course browse treatment is the reference pattern for grouped progression views
- secondary explanatory copy is avoided unless it carries actual result data
- small secondary lines inside IELTS skill cards may show real data such as highest band or test count; instructional helper text is not part of the pattern
- specialized tabs may add lightweight summary panels, but they should not turn into analytics dashboards

## Progressive Feedback

Progressive feedback is a narrative interpretation layer on top of result history.

It should:
- summarize recent momentum
- describe strengths and weaknesses in explainable language
- remain grounded in actual result evidence

It should not:
- replace raw result access
- become the only expression of progression
- hide uncertainty when the available data is thin

## Future Consumers

This progression model is expected to support:
- proficiency estimation
- material suggestions
- targeted skill recommendations
- intervention prompts for weak or declining areas
- teacher and student study prioritization

Those systems should consume stable derived metrics, not page-local UI state.

