# Handoff: PRD0062 Packet 2A Source PDF Delivery Discovery

Status: PASS
Phase: PLANNED
Created: 2026-07-10
Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Branch/HEAD: `main` / `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`

## Live Contract

`contracts-book-activity-packet-2.md` is current Packet 2 authority. Decision: RTDB canonical source/rendition metadata under `book_source/*`; Worker-only opaque short-lived delivery capabilities; no Firestore grant store; no native R2 presigned URL.

Packet 2A changed docs only:

- `documentation/tasks/PRD0062/contracts-book-activity-packet-2.md`
- `documentation/tasks/PRD0062/handoff-book-activity-packet-2A.md`
- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md`
- `documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md`

No production source upload, rendition, grant, rules, Worker/R2 config, Assembly UI, runtime UI, or Packet 3 work was written. Packet 1 remains CLOSED.

## Dirty Paths

Full pre-edit inventory/classification is in `contracts-book-activity-packet-2.md`. Preserved unrelated work includes `AGENTS.md`, `README.md`, `package.json`, `playwright.config.js`, test setup/config, Packet 1 implementation/docs, Packet 3+ task docs, master orchestration, PRD, `documentation/rules/infrastructure.md`, existing rules, and backup/restore changes. `documentation/rules/infrastructure.md` was already dirty at Packet 2A start, was read as required infrastructure authority, and was not edited by Packet 2A. No files staged at start.

## Discovery Decisions

- Current generic R2 upload path returns public `r2.dev` URLs. It is forbidden for source PDFs.
- Current primary bucket `kahoot-media` public configuration cannot prove direct-private-R2 denial. Packet 2B must first prove a separate private bucket/binding or reject this deployment path.
- Existing Listening delivery is only an architectural analog: Firebase-authenticated issuance, opaque HMAC token, Worker content proxy, expiry/refresh, range response. Do not reuse its assets/metadata graph.
- Current backup media delta scans only `audio/`, `images/`, `avatars/`. Packet 2 must add source/rendition prefix coverage or establish a separate private-bucket backup lifecycle.
- PDF engine is unselected. Contract contains candidate matrix and rejection/proof requirements.

## Commands And Evidence

Exit `0`:

- `rtk git status --short --branch`
- `rtk git status --short --untracked-files=all`
- `rtk git rev-parse HEAD`
- `git diff --name-only`
- `git diff --cached --name-only`
- targeted `rg`/`Get-Content` owner, rules, Worker, R2, backup, package, and parser scans
- `rtk git diff --check`
- `git diff --cached --name-only` (empty)
- `git diff --name-status`
- final `rtk git status --short --untracked-files=all`

Additional verification:

- Proposed production-owner forbidden-parser scan => exit `0`: no proposed Packet 2 production owner exists yet.
- Packet 3+ taskbox scan => `rg` exit `1` by design: no checked Packet 3-8 taskbox found.
- Stale-claim scan => exit `0`; matches are intentional `PLANNED`/`BLOCKED` gates and this packet's explicit docs-only scope, not stale production claims.

No tests run: this packet adds no production code. No remote evidence collected. Local discovery cannot claim deployed Worker version/bindings, live R2 privacy/object state, deployed capability expiry/refresh, or live Firebase/Cloudflare permissions.

## Blocked Before Packet 2B

1. Private R2 deployment decision: prove private bucket/binding and direct-object denial remotely. Current generic public path is unsafe.
2. Packet 2C spike must identify a deployable PDF engine with fixture results before rendition code.
3. Student grants cannot become production-ready before Packet 3/4 supplies immutable Unit/Page Group and Book Delivery authorization inputs. Packet 2B may create teacher-side immutable metadata/upload skeleton only; no student delivery.
4. Rules/security, backup media-prefix coverage, and remote proof remain Packet 2E gates.

## Next Prompt

`Start PRD0062 Packet 2B only: implement immutable Source Version metadata and a private upload skeleton after reading contracts-book-activity-packet-2.md. Do not add rendition/grant/runtime/UI. First prove or explicitly block private R2 bucket/binding. Preserve Packet 1 CLOSED and Packet 3+ unstarted.`

Alternative spike prompt:

`Start PRD0062 Packet 2C only: execute isolated PDF excerpt engine spike from contracts-book-activity-packet-2.md. Use disposable non-production paths and fixture PDFs. Do not select or wire a production engine without recorded evidence.`
