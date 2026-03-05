---
title: 'Pattern: Presentation-Mode Feature Toggle'
createdAt: '2026-03-05T09:22:08.924Z'
updatedAt: '2026-03-05T09:22:27.950Z'
description: >-
  Pattern for temporarily exposing dev-only UI (quick-login buttons, debug
  panels) in production builds for demos and presentations, then locking it back
  down afterward.
tags:
  - pattern
  - auth
  - presentation
  - demo
  - deployment
---
# Pattern: Presentation-Mode Feature Toggle

## Problem

Dev-only UI (quick-login buttons, debug panels, test accounts) is gated behind `import.meta.env.DEV` so it never appears in production. Before a **live demo or presentation**, you need these controls visible on the deployed app so the audience can log in quickly — but you don't want to build a full "demo mode" system for a one-time event.

## Solution

**Temporarily remove the `import.meta.env.DEV` guard** for the specific feature, relabel it for a public audience, redeploy, then restore the guard afterward.

### Steps

1. **Find the guard**
   ```tsx
   {import.meta.env.DEV && (
     <DevQuickLoginPanel />
   )}
   ```

2. **Remove the guard + relabel**
   ```tsx
   {/* Demo Quick-Login Buttons */}
   <DemoQuickLoginPanel />
   ```
   - Change label from "Dev Quick Login" → "Demo Quick Login"
   - Remove any dev-only footnotes ("Only visible in development mode")

3. **Build + deploy** (see @doc/sop/development-workflows → "Building for Production")

4. **After the presentation, restore the guard**
   ```tsx
   {import.meta.env.DEV && (
     <DevQuickLoginPanel />
   )}
   ```
   Redeploy.

## Example — LoginPage Quick-Login Buttons

In `src/pages/LoginPage.jsx`, the Teacher/Student quick-login buttons were gated:

```jsx
// BEFORE — only shown in dev
{import.meta.env.DEV && (
  <div style={{ marginTop: '1.5rem' }}>
    <span>Dev Quick Login</span>
    {/* Teacher + Student buttons */}
    <p>Only visible in development mode</p>
  </div>
)}

// AFTER — visible in all environments for presentation
<div style={{ marginTop: '1.5rem' }}>
  <span>Demo Quick Login</span>
  {/* Teacher + Student buttons */}
</div>
```

## When to Use

| Scenario | Use This Pattern? |
|----------|-------------------|
| Live demo / classroom presentation | ✅ Yes |
| Staging environment for QA | ❌ Use env vars instead |
| Permanent public feature | ❌ Build a real feature |
| One-off debug session | ❌ Just use dev server |

## Anti-Patterns

- **Don't commit this as the permanent state.** This is always a temporary change. Use a git branch or immediately restore after the demo.
- **Don't expose credentials or admin tools** this way — only UX shortcuts like login buttons.
- **Don't forget to redeploy** after restoring the guard.

## Checklist

- [ ] Guard removed for the specific component only
- [ ] Label updated to be audience-friendly (no "Dev" branding)
- [ ] Any dev-only footnotes removed
- [ ] Built and deployed before presentation
- [ ] Guard restored + redeployed after presentation

## Source

Extracted from session: March 5, 2026 — exposing quick-login buttons on `https://kahut1.web.app` for classroom presentation.
