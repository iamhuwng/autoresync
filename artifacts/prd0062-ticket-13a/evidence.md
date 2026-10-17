# PRD0062 13A (#55) evidence

Status: retained implementation gates passing; ready for #55 closure after live
issue contract verification. Deployed route and assembled-rules proof remain
open under #59 and #118.

## Scope and ownership

- Assembly candidate commands bind actor, Mode 2 Book, immutable Source Set
  revision, Unit stable key, candidate revision, and operation ID.
- Worker owns trusted validation, authorization, scoped persistence, pointer
  update, idempotency ledger, CAS, owner-safe load, and mutation rollback flag.
- `cloudflare/src/upload-worker/book-rules/fragments/13A.json` owns only the
  Assembly RTDB fragment. Ticket #118 owns generated `database.rules.json`,
  assembled emulator proof, deployment readback, active hash, and rollback
  artifact.
- Ticket #59/09D owns top-level Worker composition. #55 changes no top-level
  Worker file.
- 50A remains all-six-deny/default-deny. 03B remains disabled.

## Passing local proof

Commands run from the dedicated PRD0062 worktree:

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js cloudflare/src/upload-worker/book-assembly cloudflare/test/book-assembly-worker.test.ts cloudflare/test/book-assembly-repository.test.ts src/services/book-assembly src/__tests__/security/bookAssemblyRuleFragment.test.ts
node node_modules/vitest/vitest.mjs run src/services/book-assembly/assemblyClient.browser.test.ts src/services/book-assembly/ticket11-manifestCandidate.service.test.ts src/services/book-assembly/ticket11-sourceAuthority.matrix.test.ts
node node_modules/vitest/vitest.mjs run src/services/book-assembly
node node_modules/vitest/vitest.mjs run src/__tests__/security/bookAssemblyRuleFragment.test.ts
node node_modules/vitest/vitest.mjs run --config C:\Users\The Lord\Desktop\prd0062-ticket55-vitest.config.mjs
npm run build
```

Results:

- TypeScript: PASS.
- Ticket-scoped ESLint: PASS.
- Book Assembly service/security tests: 24 tests PASS.
- Isolated Worker/repository harness: 6 tests PASS.
- Production build and bundle budget: PASS.
- Worker package's configured ARM64 harness cannot start `workerd`; it fails
  before test loading with `Unsupported platform: win32 arm64 LE`. No product
  assertion is inferred from that failure. The isolated Node/Vitest harness
  executes the affected tests successfully.
- x64 retry reaches a separate pre-test Rollup optional-dependency failure:
  `Cannot find module @rollup/rollup-win32-x64-msvc`. No dependency files or
  application files were changed to repair either harness.

Coverage includes:

- first save/reload/validate/replace;
- stale revision and no-write snapshot;
- cross-owner and Mode 1 denial;
- invalid Source Set binding;
- exact replay and conflicting replay;
- authority change immediately before CAS write;
- scoped Firebase REST path, ETag CAS retry, broad-path rejection;
- browser redirect/token/response fail-closed behavior;
- candidate-only Unit Assembly repository delegation and no-publish surface;
- root/book ancestor deny and scoped service-fragment assertions.

## Destination-owned proof remains open

Destination-first transfer moved deployed composition and assembled-rules proof
out of #55 only after equivalent gates were added to live #59 and #118. An
isolated Wrangler dry-run passed for the existing Worker:

```text
Total Upload: 302.46 KiB / gzip: 56.97 KiB
--dry-run: exiting now.
```

Its route manifest does not contain the #55 Assembly descriptor because live
top-level composition belongs to #59/09D. This is not a #55 closure gate after
the transfer.

Current deployed Worker readback also lists no Assembly-scoped secret or
identity name. Existing names are limited to the general Google service account
and Listening/upload secrets. No secret values were read or recorded. Active
deployment readback at this checkpoint is deployment
`5212423c-c869-45e0-9179-883df6c5db4f`, version
`1cb4452a-3efd-4822-9156-2490196a3acf`; this is current-state evidence only and
does not prove #55 behavior.

Owner/action: #59/09D must compose and deploy the canonical Assembly route and
prove route reachability, identity integration, Worker readback, disposable
save/reload, and route rollback. #118/09E must compose/deploy/read back the
generated rules and prove assembled emulator enforcement, hash/rollback, and
legacy preservation.

Impact: those destination gates remain open for #59/#118. No production route,
generated ruleset, 50A capability, or 03B capability is enabled as a
workaround.

## #55 closure decision

Close #55 only against its retained API, handler, repository, exact RTDB path,
fragment/static-security, query-budget, and local mutation-disabled rollback
gates. Do not claim deployed composition or assembled-rules proof from #55.
Recompute the 112-ticket graph after formal closure.
