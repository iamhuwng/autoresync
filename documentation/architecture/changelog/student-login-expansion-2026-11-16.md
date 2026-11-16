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


## Recorded release outcomes

<!-- release-operation:d6a77949-5e94-4d58-a9b3-2a56dc296e1a:outcome-048201a39abbae800a6db53aa91a83f793cffca0e2dc940d5cb005ba9db38e3a.json -->

- Recorded: 2026-11-16T22:58:54.581Z; operation: `d6a77949-5e94-4d58-a9b3-2a56dc296e1a`.
- Source: `162a3763d7b8a937fdc22a2a368b5f57dcf8bf6c`; target: `firebase:temp-a1437:hosting:kahut1`; action: deploy.
- Publication: **published**; verification: **passed**; provider: `projects/temp-a1437/sites/kahut1/versions/e67bbace411e37c9@2026-11-16T20:52:41.706Z`.
- Retained evidence: [operation outcome](https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-d6a77949-5e94-4d58-a9b3-2a56dc296e1a#outcome-048201a39abbae800a6db53aa91a83f793cffca0e2dc940d5cb005ba9db38e3a.json).
- This is a scoped historical observation; it does not establish current activation or completion of excluded services. Earlier implementation notes remain dated history.
