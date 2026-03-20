---
name: observability-tracking
description: Enforce feature tracking registration when creating or modifying pages, actions, or routes
---

# Observability Tracking

## When to Load

Load this skill when you are:
- Creating or modifying a page component
- Adding or changing routes
- Adding buttons, forms, workflow actions, or other user-facing interactions
- Renaming, moving, or deleting a feature

## What To Do

1. Check `src/config/featureRegistry.ts` before you add or change anything user-facing.
2. If the feature is missing, create a new registry entry with `id`, `name`, `routes`, `actions`, and `description`.
3. If the feature already exists, update the `routes` and `actions` arrays in the same change whenever the UI contract changes.
4. Ensure the page is instrumented with `useFeatureTracking(featureId)` or already wrapped by `TrackedRoute` for page-view coverage.
5. Add `trackAction(actionName, metadata)` for every user-facing button, form submit, workflow transition, or admin control you introduce.
6. Keep the registry and the page instrumentation in sync when features evolve.

## Before / After

### Before

```tsx
export default function AdminReportsPage() {
  return <div>Reports</div>;
}
```

### After

```tsx
import { useFeatureTracking } from '../hooks/useFeatureTracking';

export default function AdminReportsPage() {
  const { trackAction } = useFeatureTracking('adminPanel');

  return (
    <div>
      <button onClick={() => trackAction('purgeReports')}>Purge</button>
    </div>
  );
}
```

## Validation

Run a quick coverage check after changes:

```bash
grep -rn "useFeatureTracking\|trackAction\|resolveFeatureFromRoute" src/
grep -rn "onClick\|onSubmit" src/pages src/components
grep -rn "path:" src/config/routeSecurity.ts src/constants/routes.ts
```

Then verify:
- every route you touched maps to a registry entry
- every new or changed `onClick` / `onSubmit` handler has a matching `trackAction()`
- every new `trackAction()` name is listed in the registry `actions` array

## Auto-Keep-Up Rule

If you modify an existing feature, update the registry in the same change. Do not ship route changes, renamed actions, or new interactions without matching registry updates.
