# Rule: Feature Tracking Registration (MANDATORY)

When creating a new page, modifying feature actions, or changing routes:

1. **READ** `src/config/featureRegistry.ts` first - find the relevant feature entry
2. If feature does NOT exist: add a new `FeatureDefinition` entry with id, name, routes, actions, description
3. If feature EXISTS but actions changed: update the `actions` array to reflect new/removed/renamed actions
4. If feature EXISTS but routes changed: update the `routes` array
5. If feature was DELETED: remove the entry from the registry (old reports remain in RTDB under the old ID)
6. Ensure the page component calls `useFeatureTracking(featureId)` hook
7. Ensure ALL user-facing action handlers (button clicks, form submits, workflow transitions) call `trackAction(actionName, metadata?)` from the hook's returned function
8. Do NOT use hardcoded feature ID strings - always reference `FEATURE_REGISTRY` constants
9. When adding `trackAction()` to a new action, ALSO add the action name to the feature's `actions` array in the registry

Self-check (MUST complete all before marking work done):
- [ ] Feature exists in `featureRegistry.ts` with correct id, name, description
- [ ] All routes for this feature are listed in the `routes` array
- [ ] All user-facing actions are listed in the `actions` array
- [ ] `useFeatureTracking()` hook is called in the page component
- [ ] Every button, form, and workflow step calls `trackAction()`
- [ ] No hardcoded feature ID strings exist - all reference the registry

Reading V2 PRD-0054 note:
- State-changing archive, restore, repair, remove, and duplicate-decision actions must also write to `reading_v2/audit_events/{eventId}` through the contract in `documentation/architecture/reading-v2-audit-trail.md`.
- View-only events such as broken-ref viewed or duplicate warning shown remain observability events only unless a later audit policy explicitly changes that.
