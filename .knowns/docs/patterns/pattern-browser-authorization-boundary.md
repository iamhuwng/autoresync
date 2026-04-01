---
title: 'Pattern: Browser Authorization Boundary'
description: Reusable security pattern for keeping auth and privilege decisions out of browser-controlled env vars and storage.
createdAt: '2026-03-30T23:18:21.960Z'
updatedAt: '2026-03-30T23:39:12.660Z'
tags:
  - pattern
  - auth
  - security
  - firebase
  - frontend
---

# Pattern: Browser Authorization Boundary

## Problem

Frontend code runs in a hostile environment. Browser users control DevTools, storage, network requests, and all values embedded into the shipped bundle.

That means these are not valid authorization primitives:

- `VITE_*` frontend env secrets
- `sessionStorage`, `localStorage`, IndexedDB, or other browser-controlled storage
- client-side role booleans derived only from browser state

Using those values for privilege creates an auth bypass even if the UI looks correct.

## Solution

Treat the browser as a presentation layer, not a trust boundary.

Privilege decisions must come from trusted sources such as:

- Firebase Auth session state
- backend role/profile data loaded for the authenticated user
- route guards driven by trusted auth state
- Firebase Security Rules or other server-enforced authorization checks

Browser storage may cache UX state, but it must never grant access.

## Firebase-Specific Guidance

In Firebase web apps, keep these responsibilities separate:

- browser API key website restrictions: origin allowlist only
- Firebase Auth authorized domains: auth-domain allowlist only
- Firebase Auth session + role data: actual authentication and authorization path
- Firebase Security Rules: final backend enforcement

API key referrer restrictions can fail closed and block valid users, but they are not a substitute for RBAC.

## Anti-Pattern

```ts
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
const isAdmin = sessionStorage.getItem('isAdmin') === 'true';

if (inputPassword === adminPassword || isAdmin) {
  allowPrivilegedAccess();
}
```

This is insecure because both the env value and the storage flag are browser-controlled from the attacker's perspective.

## Preferred Pattern

```ts
const { user, profile } = useAuth();
const canAccessAdmin = !!user && profile?.role === 'super_admin';

if (!canAccessAdmin) {
  denyOrRedirect();
}
```

Then enforce the same role boundary in backend rules or trusted services.

## Verification Checklist

When cleaning up a legacy browser-auth path, grep for these classes of bugs:

- `VITE_ADMIN_`
- `sessionStorage.getItem('isAdmin')`
- `localStorage.getItem('isAdmin')`
- direct role checks that bypass AuthContext or trusted profile state

Also verify that the live route still works with real authenticated users after the cleanup.

## Source

Extracted from the March 31, 2026 remediation that:

- fixed Firebase custom-domain auth failures caused by browser API key referrer restrictions
- removed a legacy client-side admin modal that relied on browser-exposed env credentials and `sessionStorage.isAdmin`

## Related Docs

- @doc/architecture/auth-rbac-architecture
- @doc/guides/guide-dev-quick-login-and-hosted-firebase-referrer-troubleshooting


## Repository Hygiene Note

After removing a browser-auth anti-pattern, clean up stale logout or reset code that still references the old privilege flag so future searches accurately reflect the live boundary.
