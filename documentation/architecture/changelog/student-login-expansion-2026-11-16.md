# Student Login Expansion

Changelog ID: `CL-20261116-STUDENT-LOGIN-EXPANSION`
Master entry: [Master Changelog](../master_changelog.md)

## Change

Expanded authentication so students can register and sign in with email/password or student ID/password while retaining Google sign-in. Public registration remains student-only and requires first name, last name, email, student ID, password, and Firebase email verification; the development teacher and student fixtures remain available as verified exceptions.

Google-only students receive a generated student ID on successful sign-in and can use the one-time setup flow in `/profile` to keep their assigned ID, confirm their name, and add a password. Login, registration, and profile setup expose accessible password visibility controls. The retired `/profile/complete` route, guard, page, and obsolete E2E suite were removed.

## Verification

- 44 focused root authentication, login, and feature-registry tests passed.
- 9 Cloudflare student-auth Worker tests passed.
- TypeScript `tsc --noEmit` passed.
- Sol review completed with `APPROVE` after five rounds.

## Release state

Committed and merged locally into `main` on 2026-11-16. Production publication is pending the release-safety compatibility, dependency, and environment evidence gates; no production deployment is claimed by this record.
