---
title: Security Architecture
createdAt: '2026-02-27T17:10:41.019Z'
updatedAt: '2026-02-27T17:11:10.143Z'
description: >-
  5 security layers, known vulnerabilities, RTDB rules patterns, integration
  safety rules, guest user security.
tags:
  - architecture
  - security
  - vulnerabilities
  - rules
  - core
---
# Security Architecture

## Overview

Comprehensive security architecture covering authentication, authorization, route protection, database rules, known vulnerabilities, and integration safety rules.

## Security Layers

```
Layer 1: Firebase Authentication
  → Email/password login
  → UID-based identity
  → Auth state managed by AuthContext.jsx

Layer 2: Route Protection (Client)
  → PrivateRoute.jsx wraps protected routes
  → routeSecurity.ts defines role → route mapping
  → Redirects unauthorized users to /login

Layer 3: Database Security Rules (Server)
  → RTDB rules in database.rules.json
  → Per-node read/write rules
  → Role checks via root.child('users').child(auth.uid).child('role')

Layer 4: Service Layer Scoping (Client)
  → Teacher-scoped queries (getTeacherStudents vs getAllUsers)
  → Ownership validation on data access
  → AccessControlWrapper periodic rechecks

Layer 5: Integration Safety Rules (Developer)
  → 12 rules preventing common security/integration bugs
  → Enforced via documentation/integration-safety-rules.md
```

## Known Vulnerabilities (from Security Audit)

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| V-001 | ✅ Fixed | Route names exposed app structure | Fixed with route renaming |
| V-002 | 🔴 HIGH | Student session routes lack PrivateRoute | Open |
| V-003 | 🔴 HIGH | Backend services lack role validation | Open |
| V-004 | 🔴 HIGH | Demo routes publicly accessible | Open |
| V-005 | ✅ Fixed | Assignment permissions denied for teachers | Fixed (DB rules) |
| V-006 | 🟡 MED | Result page allows cross-student viewing | Open |
| V-007 | 🟡 MED | Teacher can view any student's history | Open |

## RTDB Security Rules Pattern

```json
{
  "node_name": {
    ".read": "root.child('users').child(auth.uid).child('role').val() === 'super_admin'",
    "$itemId": {
      ".read": "data.child('ownerId').val() === auth.uid",
      ".write": "!data.exists() || data.child('ownerId').val() === auth.uid"
    }
  }
}
```

### Common Pitfall
Teachers need collection-level `.read` to query by teacherId, but this gives them read access to ALL items in the collection (filtered client-side). See @doc/sop/security-fix-assignment-permissions for the trade-off discussion.

## Integration Safety Rules Summary

| # | Rule | Trigger |
|---|------|---------|
| 1 | Route/Path Registry Validation | Writing navigate(), links |
| 2 | Page-Entry Prerequisite Handshake | Navigating to stateful pages |
| 3 | Pattern-First Research | New nav/auth handlers |
| 6 | Hot Values → Refs in Intervals | useEffect + setInterval |
| 7 | Guaranteed Resolution for All Branches | State init as 'pending' |
| 10 | Git Sync Safety Protocol | Before git pull/merge |
| 11 | Restore Guard Middleware | Services writing as side effects |
| 12 | Backup Coverage Check | Adding new RTDB nodes |

Full rules: @doc/integration-safety-rules

## Guest User Security

- Guest users created with `startsWith('guest_')` UID prefix
- Guest results stored in `/guest_results/` (separate bucket)
- **Bug fixed:** Guest detection was using `.includes('guest')` which matched non-guest UIDs containing "guest"
- See @doc/sop/test-end-flow-debug-retrospective

## Related Docs
- @doc/architecture/auth-rbac-architecture — Auth flow and RBAC details
- @doc/sop/security-audit-rbac — Full security audit
- @doc/sop/security-fix-assignment-permissions — Permission fix
- @doc/integration-safety-rules — Full 12 rules
- @doc/conventions — Security conventions
- @doc/architecture/database-schema-reference — RTDB security rules per node
