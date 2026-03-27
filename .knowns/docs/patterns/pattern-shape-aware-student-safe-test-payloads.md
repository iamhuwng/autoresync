---
title: 'Pattern: Shape-Aware Student-Safe Test Payloads'
description: Reusable pattern for building student-safe live-session payloads across heterogeneous test document shapes without leaking answer keys or breaking session start.
createdAt: '2026-03-24T23:04:08.508Z'
updatedAt: '2026-03-25T18:08:29.750Z'
tags:
  - pattern
  - live-session
  - test-system
  - thcs
  - data-contract
  - bug-prevention
---

# Pattern: Shape-Aware Student-Safe Test Payloads

## Problem

Live-session start often needs a student-safe copy of the full test before the session flips to `in-progress`. The failure mode is assuming every test document uses the same question container.

In this codebase:
- IELTS and legacy tests use a flat root `questions[]` array.
- THCS tests use `sections[].questions`.

A sanitizer that blindly calls `stripAnswerKeys(testData.questions)` will either crash on THCS tests or miss the real question containers.

## Solution

Treat student-safe payload generation as a shape-preserving transform:
1. Clone the full test document.
2. Detect every question container that can exist for a live-startable test type.
3. Strip answer-bearing fields only inside those containers.
4. Preserve the outer document shape expected by the student surface.
5. Keep session metadata such as `antiCheatConfig` separate from payload sanitization.

## Why This Matters

Session start is a producer-consumer contract:
- The teacher start path produces `session_test_payloads/{sessionCode}`.
- Student routes and hooks consume a shape-specific test document.

If the producer normalizes to the wrong shape, the session can fail before start or the student surface can receive a document it does not understand.

## Example

```ts
const buildStudentSafeTestData = <T extends Record<string, any>>(testData: T): T => {
  const safe = { ...testData } as T & {
    questions?: Array<Record<string, any>>;
    sections?: Array<Record<string, any> & { questions?: Array<Record<string, any>> }>;
  };

  if (Array.isArray(safe.questions)) {
    safe.questions = stripAnswerKeys(safe.questions);
  }

  if (Array.isArray(safe.sections)) {
    safe.sections = safe.sections.map((section) => ({
      ...section,
      questions: Array.isArray(section.questions)
        ? stripAnswerKeys(section.questions)
        : section.questions,
    }));
  }

  return safe;
};
```

## Rules

- Do not assume one canonical question path across all test types.
- Preserve the student-facing document shape while sanitizing answer-bearing fields.
- Do not couple `antiCheatConfig` to payload shape; it is runtime session metadata.
- When a new live-startable test type is introduced, update sanitizer logic and tests in the same change.

## Verification

Add regression coverage for each supported shape:
- Flat `questions[]` fixture
- THCS `sections[].questions` fixture
- Session-start path that caches the payload for a THCS test ID

## Related Docs

- @doc/architecture/session-test-modes
- @doc/architecture/test-system-architecture
- @doc/integration-safety-rules

## Source

Derived from the March 25, 2026 session-start bug fix in:
- `src/hooks/monitor/useMonitorControls.ts`
- `src/services/testStorage.ts`
- `src/services/testStorage.test.ts`

## Reading Canonical Display Contract (2026-03-26)

Student-safe payload logic must also be label-shape-aware for IELTS Reading.

- If a Reading question contains `labeledOptions`, render stored `label` and `text` once. Do not prepend labels from array index and do not rely on `text || label` fallbacks.
- If a Reading question contains `sectionReferences`, route it to a section-reference renderer instead of a generic labeled-option renderer.
- Canonical labeled option groups and `matching-information` section references must not be reshuffled or remapped, because the stored labels are authored source content.
- Shape-aware preflight should fail closed on malformed canonical Reading groups rather than silently coerce them into another renderer path.

See also @doc/architecture/test-system-architecture and @doc/patterns/pattern-ai-flat-text-to-structured-field-decomposition.
