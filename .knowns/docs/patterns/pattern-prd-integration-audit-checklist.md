---
title: 'Pattern: PRD Integration Audit Checklist'
createdAt: '2026-02-28T03:44:06.356Z'
updatedAt: '2026-02-28T16:41:20.583Z'
description: >-
  Reusable checklist for verifying that a PRD is fully integrated into the
  codebase — covers routes, service call-sites, type alignment, navigation
  state, and cross-component wiring.
tags:
  - pattern
  - audit
  - prd
  - integration
---
# Pattern: PRD Integration Audit Checklist

> **Source:** PRD-0030 IELTS Writing audit session (2026-02-28)
> **Problem:** Components can be fully built but completely unreachable or broken due to missing integration wiring.

## Problem

After implementing a large PRD with many components, it's easy to miss the "glue" — the integration points that connect components to each other and to the rest of the app. Common missed integration points include:

- Route registrations in App.jsx
- Service function call-sites (functions defined but never called)
- Navigation state not being read by target pages
- Firestore query fields not matching TypeScript interfaces
- Placeholder values that were never filled in

## Audit Checklist

### 1. Route Registration
- [ ] All route constants in `routes.ts` have matching `<Route>` entries in `App.jsx`
- [ ] Routes use correct `PrivateRoute` wrappers with `allowedRoles`
- [ ] Routes wrap components with `<ErrorBoundary>` where appropriate
- [ ] Router components (e.g., `TestPageRouter`, `TestBuilderRouter`) handle the new skill/type

### 2. Service Function Call-Sites
- [ ] Every exported service function has at least one import/call-site outside its own file
- [ ] Notification functions (`notifyXxx`) are called at the correct event points
- [ ] All service functions wrapped with `withRestoreGuard` where they write to RTDB/Firestore

### 3. Type Alignment (Firestore Queries)
- [ ] Every `where('field', '==', 'value')` uses the **exact** field name from the TypeScript interface
- [ ] Every `where()` value matches the **exact** enum value from the type (e.g., `'pending-review'` not `'pending'`)
- [ ] `orderBy()` fields exist in the interface

### 4. Navigation State Handoff
- [ ] If page A navigates with `{ state: { key: value } }`, page B reads `location.state?.key`
- [ ] Default state values are correct (e.g., don't default to wrong tab)
- [ ] Navigation targets use routes from `routes.ts` constants, not hardcoded strings

### 5. Cross-Component Wiring
- [ ] Dashboard widgets query the correct collection/field
- [ ] "See all" / "View details" links target existing routes
- [ ] Tab navigation arrays include all new tabs
- [ ] Lazy-loaded components have correct default exports

### 6. Placeholder Detection
- [ ] Search for `undefined : undefined` ternary patterns
- [ ] Search for `TODO`, `FIXME`, `placeholder` comments
- [ ] Check that homework/context props pass real values, not hardcoded `undefined`

## Anti-Pattern: Grep False Negatives

> ⚠️ Ripgrep can return false negatives on certain file types (`.jsx`, `.md` with Unicode). When auditing:
> - Always verify critical findings by **viewing the actual file** with `view_file`
> - Don't trust "no results found" on JSX/MD files without confirmation
> - Use `Includes: ["*.tsx", "*.ts"]` explicitly when grepping

## Example

From PRD-0030 audit:
```typescript
// BUG: PendingReviewsWidget used wrong field name AND wrong value
where('status', '==', 'pending')      // ❌ Wrong
where('markingStatus', '==', 'pending-review')  // ✅ Correct (matches WritingSubmission type)

// Result: Widget was permanently invisible — returned 0 results
```



### 7. Data Path Coverage (Rule 17 — Producer-Consumer Contract)
- [ ] If new code writes to RTDB/Firestore, identify ALL existing read paths for that data type
- [ ] Trace each reader's full lookup chain (e.g., index → main record two-step)
- [ ] Verify new write path populates ALL locations existing readers expect
- [ ] Check what happens when a read returns `null` — silent drop = invisible bug
- [ ] Cross-reference with canonical write function (e.g., `saveTestResult()` for test results)

**Source:** PRD-0030 gap where `writingSubmissionService` only wrote to `test_results_by_student` (index) but not `test_results/{resultId}` (main record), causing academic records to silently drop writing results.

## Related

- @doc/integration-safety-rules — Rules 3 (Pattern-First), 12 (New Collection Security), 17 (Producer-Consumer Contract)
- @doc/patterns/pattern-rtdb-multi-path-write-obligation — RTDB-specific instance of Producer-Consumer Contract
