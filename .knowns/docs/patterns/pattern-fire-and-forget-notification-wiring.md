---
title: 'Pattern: Fire-and-Forget Notification Wiring'
createdAt: '2026-02-28T03:52:49.793Z'
updatedAt: '2026-02-28T03:53:19.324Z'
description: >-
  How to wire notification service functions at their call-sites using
  non-blocking fire-and-forget patterns, with checklist for identifying missing
  call-sites
tags:
  - pattern
  - notifications
  - services
  - integration
---
# Pattern: Fire-and-Forget Notification Wiring

## Problem

Notification functions are defined in a centralized service (`notificationService.ts`) but never called anywhere. This is a common "dead code" bug class where the functions **exist** but are missing their **call-sites** — the places in the codebase where events actually occur.

### Symptoms
- `grep` for function name returns only the definition + export — zero imports
- Users never receive notifications for events that have notification functions
- No build errors (the code compiles fine — it's just never invoked)

## Solution

Wire notification calls at the **event source** (the function/handler where the triggering action actually occurs), using a **non-blocking fire-and-forget** pattern so the notification never delays or blocks the primary operation.

### Key Principle
> **Notifications are side-effects** — they must NEVER block or delay the primary user action (submit, grade, save, etc.). A failed notification should be silently logged, not surfaced to the user.

## Code Pattern

### ✅ Correct: Non-blocking with `.catch()`

```typescript
// In the event handler (e.g., handleSubmit)
await createSubmission(submission);  // Primary action — MUST succeed

// Fire notification (non-blocking)
notifyWritingSubmitted(
    studentId,
    resultId,
    testTitle,
    'solo-practice'
).catch(err => console.warn('[Component] Notification failed:', err));

// Continue with RTDB writes, navigation, etc.
```

### ❌ Wrong: Blocking with `await`

```typescript
// DON'T DO THIS — notification failure would block/delay the submit flow
await notifyWritingSubmitted(studentId, resultId, testTitle, 'solo-practice');
```

### ❌ Wrong: No error handling

```typescript
// DON'T DO THIS — unhandled promise rejection if notification fails
notifyWritingSubmitted(studentId, resultId, testTitle, 'solo-practice');
```

## Checklist: Finding Missing Call-Sites

1. **List all `notifyXxx` exports** from the notification service
2. **For each, grep for imports** outside the definition file:
   ```bash
   grep -r "notifyWritingSubmitted" src/ --include="*.ts" --include="*.tsx" | grep -v "notificationService"
   ```
3. **If zero imports → missing call-site.** Find the event source:
   - `notifyXxxSubmitted` → the submit handler in the student's page/view
   - `notifyXxxGraded` → the grading submit handler in the teacher's page
   - `notifyXxxReopened` → the reopen handler (teacher or service)
4. **Wire at event source, not in the service** — the service function just creates the notification; the call-site knows the context (who, what, when)

## Anti-Pattern: Link Validation

When creating notifications with links (e.g., `link: '/student/records'`), **always verify the route exists** in `App.jsx` / router config. Stale or misspelled routes cause 404s when the user clicks the notification.

**Real-world example (caught in this session):** All 5 `notifyWriting*` functions used `/student/records` but the actual route was `/student/academic-record`.

## Mapping Table

| Notification Function | Event Source | Component/Service |
|---|---|---|
| `notifyXxxSubmitted` | Student submits work | Student's submit handler |
| `notifyXxxGraded` | Teacher submits grading | Teacher's grading page |
| `notifyXxxPartiallyGraded` | Teacher grades one task of multi-task | Grading page (partial save) |
| `notifyXxxReopened` | Teacher reopens for revision | Reopen handler |
| `notifyXxxReGraded` | Teacher updates existing grade | Second-pass grading handler |

## Source

Discovered during IELTS Writing notification audit — all 5 `notifyWriting*` functions existed but had zero call-sites. Fixed by wiring in:
- `WritingPracticeView.tsx` → `notifyWritingSubmitted`
- `writingSubmissionService.ts` → `notifyWritingSubmitted` (auto-submit)
- `WritingGradingPage.tsx` → `notifyWritingGraded`

## Related

- @doc/patterns/pattern-prd-integration-audit-checklist — Section 2 (Service Function Call-Sites)
- @doc/integration-safety-rules — Rule 11 (Restore Guard Middleware)
