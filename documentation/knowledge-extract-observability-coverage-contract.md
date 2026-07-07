# Knowledge Extract: Observability Coverage Contract

> **Session:** 2026-03-18
> **Scope:** Reusable implementation contract for keeping feature routes, tracked actions, admin entry points, and reporting surfaces synchronized
> **Source:** `documentation/tasks/0037-prd-production-reporting-observability.md` and the PRD-0037 implementation files

---

## 1. Problem

Observability drifts when feature work changes only one layer of the system.

Typical failure modes:
- A new page exists, but the route is missing from `featureRegistry.ts`, so reports show `unregistered`
- A page is wrapped correctly, but new buttons/forms are not instrumented, so page views appear without meaningful action history
- Admin settings expose config toggles, but the operator has no direct path to the dedicated reports workspace for diagnostics and purge workflows
- Admin pages gain a new route, but navigation/security maps are not updated consistently

The core lesson from PRD-0037 is that observability is not a single hook. It is a multi-file contract.

---

## 2. Contract

### 2.1 Registry Is the Source of Truth

`src/config/featureRegistry.ts` is the canonical mapping between:
- feature ID
- tracked routes
- tracked actions
- human-readable description

Route-level tracking depends on the registry for feature resolution. Action-level tracking depends on the registry for ongoing coverage discipline.

Example shape:

```typescript
{
  id: 'adminPanel',
  name: 'Admin Panel',
  routes: ['/admin/*'],
  actions: [
    'viewDashboard',
    'updateReportingMode',
    'toggleReportingCategory',
    'saveReportingRetention',
    'viewReports',
  ],
  description: 'Super admin management panel',
}
```

Rule:
- If a route changes, update `routes`
- If a user-facing action changes, update `actions`
- If the feature no longer exists, remove the registry entry instead of leaving stale observability metadata behind

Teacher Materials selected-material actions follow the same registry rule. Use generic action names for the shared toolbar surface (`assignSelectedMaterials`, `deleteSelectedMaterials`, `archiveSelectedMaterials`) and keep type-specific workflows as separate action names when the user sees a distinct path (`assignSelectedReadingPassages`, `createReadingFullTestFromSelectedPassages`, `teacher_materials_reading_passage_archived`, `master_delete_requested`, `archiveBook`).

### 2.2 Page Views Should Be Automatic at the Route Boundary

`src/components/TrackedRoute.tsx` is intentionally thin:

```tsx
export function TrackedRoute({ children, featureName }: TrackedRouteProps) {
  useFeatureTracking(featureName);
  return <>{children}</>;
}
```

`src/App.jsx` wraps authenticated routes with `TrackedRoute`, which means page views are captured once on mount without per-page boilerplate:

```jsx
<Route
  path="/admin/reports"
  element={
    <PrivateRoute allowedRoles={['super_admin']}>
      <TrackedRoute>
        <AdminReportsPage />
      </TrackedRoute>
    </PrivateRoute>
  }
/>
```

Rule:
- Prefer route-level wrapping over page-local `trackPageView()` calls
- Keep guest/public routes intentionally excluded if tracking is not appropriate there

### 2.3 Action Tracking Stays Explicit

`useFeatureTracking()` and `reportingService.trackAction()` exist because page views alone are not enough to explain failures.

For reusable page-level instrumentation:

```typescript
const { trackAction } = useFeatureTracking('homework');

const handleSubmit = () => {
  trackAction('submitHomework', { homeworkId });
  // existing workflow
};
```

For shared admin sections where wiring already lives above the control:

```typescript
const trackAdminAction = useCallback(
  (actionName: string, metadata?: Record<string, unknown>) => {
    reportingService.trackAction('adminPanel', actionName, metadata);
  },
  []
);
```

Rule:
- Instrument every meaningful user-facing action, not just destructive actions
- Include small metadata payloads that help reconstruction (`source`, IDs, toggled state, mode, days, etc.)

### 2.4 Root Initialization Must Happen Once

`src/App.jsx` initializes both reporting and breadcrumbs once at app startup:

```jsx
useEffect(() => {
  reportingService.init(auth, database);
  initBreadcrumbs();
}, []);
```

This keeps observability infrastructure centralized and prevents duplicate listeners or duplicate queue flush timers.

### 2.5 Settings and Workspace Should Split Responsibilities

PRD-0037 exposed a useful UX pattern:
- `AdminSettingsPage.tsx` owns lightweight configuration controls
- `AdminReportsPage.tsx` owns heavy operational workflows such as diagnostics review and purge actions

That split only works if Settings provides a tracked handoff to the dedicated workspace:

```typescript
<Button
  variant="primary"
  onClick={() => {
    onTrackAction('viewReports', { source: 'admin_settings' });
    onOpenReports();
  }}
>
  Open Reports Workspace
</Button>
```

Rule:
- Do not duplicate complex operational UI into Settings just because Settings hosts the config
- Add a direct, tracked management handoff from Settings to the specialized page

### 2.6 Admin Routes Need Four-Way Synchronization

For new admin pages, observability coverage is not complete until all four are aligned:

1. `src/App.jsx` route exists and is wrapped with `TrackedRoute`
2. `src/config/routeSecurity.ts` includes the same route and role policy
3. Admin navigation maps/sidebar include the page
4. `featureRegistry.ts` covers the route and actions

Missing any one of these creates drift between runtime behavior, security, and reporting.

---

## 3. End-to-End Example

The reporting flow added in PRD-0037 is the reference example:

1. `src/App.jsx` initializes `reportingService` and `initBreadcrumbs()`
2. `src/App.jsx` exposes `/admin/reports` behind `PrivateRoute` and `TrackedRoute`
3. `src/config/routeSecurity.ts` mirrors the same admin-only restriction
4. `src/config/featureRegistry.ts` includes reporting-related admin actions
5. `src/pages/AdminSettingsPage.tsx` tracks reporting mode/category/retention changes and exposes `Open Reports Workspace`
6. `src/pages/AdminReportsPage.tsx` provides the operational surface for diagnostics, health review, and purge flows

This is the reusable pattern for future admin observability work: config in Settings, operations in the dedicated workspace, both tied together by tracked actions.

---

## 4. Working Checklist

Use this before closing any feature/page change that affects observability:

1. Update `src/config/featureRegistry.ts` for route and action changes
2. Ensure the route is wrapped with `TrackedRoute` in `src/App.jsx`
3. Instrument each new user-facing button, form, or workflow step with `trackAction()`
4. If the route is admin-only, update `src/config/routeSecurity.ts`
5. If the page is reachable from admin navigation, update sidebar and per-page admin route maps
6. If Settings owns configuration but another page owns the heavy workflow, add a tracked handoff CTA
7. For large operational pages, create a dedicated CSS file before inline styles sprawl across the whole screen

---

## 5. Lessons Learned

### 5.1 Route Coverage Is Easier Than Action Coverage

`TrackedRoute` makes page-view coverage cheap. Action coverage still requires deliberate handler instrumentation, which is where drift is most likely.

### 5.2 "Settings Owns Config, Workspace Owns Operations" Scales Better

The admin reporting feature worked better once Settings exposed controls and the dedicated Reports page handled the complex workflows. The missing piece was the explicit handoff, not more duplicated UI inside Settings.

### 5.3 PRD Completion Needs FR-Level Auditing, Not Just Box-Checking

The missing `AdminReportsPage.css` and the Settings-to-Reports handoff were not architecture failures. They were integration gaps that remained after most subtasks looked complete. Future closeout should re-check the PRD's functional requirements, not only the generated checklist.

---

## 6. When Not to Extract a Template

No code-generation template was created for this pattern.

Reason:
- the contract is highly dependent on the specific feature ID, route map, role policy, navigation surface, and action names
- generating boilerplate would not remove the need for manual synchronization checks
- the higher-value artifact is the checklist and example above, not a scaffold that could still drift
