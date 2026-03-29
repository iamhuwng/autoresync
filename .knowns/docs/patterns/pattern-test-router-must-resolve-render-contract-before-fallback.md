---
title: 'Pattern: Test Router Must Resolve Render Contract Before Fallback'
description: Use all required discriminators before routing to a generic test-delivery page, and guard fallback pages against incompatible payload shapes.
createdAt: '2026-03-29T07:11:36.799Z'
updatedAt: '2026-03-29T07:11:36.799Z'
tags:
  - pattern
  - routing
  - test-delivery
  - ielts
  - bug-prevention
  - interaction-boundary
---

# Pattern: Test Router Must Resolve Render Contract Before Fallback

## Problem

A router can send a valid payload to the wrong page when it stops at a broad discriminator like `testType` and falls back before resolving the narrower fields that determine the actual render contract.

This produces a specific class of bug:

- producer emits a valid payload
- router reads only part of the contract
- fallback page assumes the wrong shape
- student or user sees a hard runtime failure instead of a controlled mismatch

### Real-World Bug (2026-03-29)

In live IELTS Writing delivery:

- published tests stored `testType: 'IELTS'`
- Writing tests also stored `skill: 'Writing'`
- the Writing payload used `tasks`
- the generic IELTS page expected `passages` and `questions`

A router branch that treated the presence of `testType` as enough to choose `generic` sent a valid Writing payload to the wrong page. The page then crashed on `testData.passages.find(...)`.

## Solution

Resolve routing in layers that match the data contract.

1. Use the broad discriminator to pick the feature family.
2. Within that family, resolve the narrower discriminator(s) that determine the concrete page.
3. Only use a fallback after all required discriminators have been resolved.
4. Make fallback pages validate required fields before rendering.

### Example

```typescript
if (testType === 'THCS-THPT') {
  return <THCSTestLayout />;
}

const skill = await readSkill(testId);

if (skill === 'Writing') {
  return <WritingTestPage />;
}

return <StudentTestPage />;
```

The important point is not the exact component names. The rule is that the router must read enough of the producer contract to choose a page whose render assumptions match the payload.

## Required Rules

- Do not stop at a family discriminator like `testType` when page selection also depends on `skill` or payload shape.
- Producer and router must agree on the same render contract fields.
- Generic fallback pages must guard required arrays and fields before consuming them.
- Add a regression test for each discriminator combination that should reach a skill-specific page.
- Treat "wrong page, valid payload" as an interaction-boundary bug, not just a missing null check.

## Anti-Pattern

```typescript
if (testType === 'THCS-THPT') {
  return <THCSTestLayout />;
}

if (!testType) {
  return routeBySkill();
}

return <GenericPage />;
```

This is unsafe when multiple pages share the same top-level `testType` value but require different payload contracts.

## Self-Check

Before shipping a router change:

- [ ] Which fields actually define the render contract?
- [ ] Does publish/store write those same fields?
- [ ] Does the router read all of them before fallback?
- [ ] Can the fallback page safely reject incompatible payloads?
- [ ] Is there a regression test for the exact discriminator combination that used to fail?

## Related

- @doc/architecture/test-system-architecture
- @doc/sop/ielts-writing-grading-permission-runtime-state
- @task-nszwf2
