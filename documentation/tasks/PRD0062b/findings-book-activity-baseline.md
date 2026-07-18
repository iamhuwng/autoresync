# PRD0062b Packet P1 Findings And Evidence

Status: `VERIFIED`

Historical mapping: this file is the PRD0062b-local execution/evidence owner corresponding to historical `documentation/tasks/PRD0062/findings-book-activity-baseline.md`. Historical content is non-execution evidence and remains unmodified.

## Current findings

| ID | Severity | Requirement | Live finding and correction | State |
|---|---|---|---|---|
| P1-F-001 | Blocking | 10.12 / 1.3 | Production registry had `operationalPlacementReady: true` and launch/placement/resolver adapters from later dirty work. Reopened checked 10.12; production row now structural/projection only, all later operational adapters unsupported; injected coherent row remains test-only. | Corrected; accepted by ordered reviews |
| P1-F-002 | Blocking security | 5.6 / 7.2 / 7.3 / 10.1 | RTDB allowed any authenticated UID, including students, to create self-owned Activity material metadata; owner reads lacked active-teacher role gate. Materials are now trusted-write-only; owner reads require active unfenced teacher, super-admin override; operation ledgers explicit super-admin-read/browser-denied. | Corrected; accepted by ordered reviews and final emulator 5/5 |
| P1-F-003 | High | 1.3 / Amendment §4.1 | Activity producer was `legacy-bridge`; Test Type defaults, canonical summary adapter/index producer allowlist, and Book picker loading omitted Activity. Added summary-v1 producer contract/adapter, Test Type default, private summary rules contract, canonical picker index loading, capability-driven filtering. | Corrected; accepted by ordered reviews |
| P1-F-004 | High | 1.3 / 8.2 | Book attachment/persistence crossed `bookEditor.service.ts` and `materialBooks.service.ts` `// @ts-nocheck` seams without typed capability gate. Added typed `materialBookCapabilityAdapter.service.ts`; workspace filters/attaches/repairs/persists through it; Book validation rejects unsupported kinds. | Corrected; accepted by ordered reviews and final strict focused TSC exit 0 |
| P1-F-005 | Medium | 9.2 | Reading V2/Listening isolation relied on manual scan. Added executable recursive dependency-boundary test. | Corrected; accepted by ordered reviews and final 2/2 boundary proof |
| P1-F-006 | Governance | Packet contract / 9.4 | Required PRD0062b storage, traceability, findings, and P1 handoff owners were absent; authority lacked mandatory sections and status contradicted closure prose. Added local owners/sections and reconciled stale claims. | Corrected; accepted by ordered reviews |
| P1-F-007 | Blocking security | 1.3 / 7.2 / 7.3 | Specification review found public or producer-mismatched Activity summaries could enter `by_id`/`by_owner`. All five canonical summary indexes now enforce private Activity producer/kind/surface/version/projection coherence; 25 emulator mutation attempts fail. | Corrected; accepted by spec re-review and Material Catalog emulator 24/24 |
| P1-F-008 | Blocking | 1.3 / 9.3 / 10.1 | Specification review found prop/index candidates could lose projection/version metadata and exported legacy ref helpers could bypass typed filtering. Workspace and picker re-filter centrally; registry-owned attach/replace require safe projection plus immutable version. | Corrected; accepted by spec re-review and focused 37/37 assertions |

## Owner and proof map

| Boundary | Source owner | Test owner and exact titles | Negative/mutation proof | Classification |
|---|---|---|---|---|
| Capability decisions | `materialCapabilityRegistry.service.ts` | `materialCapabilityRegistry.service.test.ts`: “keeps Activity structurally attachable and projection-ready while later operational adapters fail closed”; “accepts a fully coherent injected later-packet row without changing production readiness”; contradiction matrix | adapter/boolean/readiness mismatch, incomplete registry, unsupported launch/assignment/result | `VERIFIED_LOCAL_FAITHFUL` |
| Producer/summary/index | `bookActivityMaterialSummary.service.ts`; `materialIntegrationRegistry.ts`; shared summary port | “builds private canonical Activity summary and every required index row through the shared port”; “fails closed for missing projection, missing Test Type, or mismatched immutable lineage” | missing projection/test type; lineage mismatch; public Activity summary denied | `VERIFIED_LOCAL_FAITHFUL` |
| Book picker/attach/publish | typed Book capability adapter; Book validation; workspace | “keeps legacy picker kinds stable and adds structural Activity without enabling unsupported kinds”; “loads canonical private Activity summaries through capability-driven Book picker filtering”; “keeps structurally attached Activity assignment fail-closed until its adapter exists” | video/unsupported kind rejected; assignment disabled; invalid typed shapes | `VERIFIED_LOCAL_FAITHFUL` |
| Activity authoring/publish/projection | Activity schema/authoring/publish/projection services; authoring Worker | existing exact schema/CAS/immutability/projection nested allowlist tests; Worker 14 tests | malformed/unknown fields, owner/lineage/CAS/idempotency/authority-removal/partial-publish failures | `VERIFIED_LOCAL_FAITHFUL` |
| RTDB security | `database.rules.json` | Book Activity emulator tests named in traceability; Material Catalog universal summary emulator | student self-owned create, two-student reads, cross-owner, parent/ancestor, direct trusted writes, unsafe nested projection | `VERIFIED_LOCAL_FAITHFUL` |
| Typed boundaries | typed Activity/Material services and typecheck fixture | strict focused TSC; `@ts-expect-error` invalid kind/missing actor | invalid compile shapes; zero `@ts-nocheck` in new modules | `VERIFIED_LOCAL_FAITHFUL` |
| Legacy/regression | Material Book/editor/picker/dependency tests | Book create/update/tree/public approval; legacy picker; explicit Reading V2/Listening isolation | unsupported attachment and dependency import scans | `VERIFIED_LOCAL_FAITHFUL` |
| Backup/restore | R2 backup and restore inventory | exact titles in traceability/storage file | missing required node fails backup; restore inventory exactness | `VERIFIED_LOCAL_FAITHFUL` |

## Dirty-path classification

- P1-owned/reconciled in this execution: capability/producer/summary/Test Type/Book typed adapter/workspace/validation; Activity authoring/publish/projection/dependency boundary; RTDB rules/security tests; PRD0062b-local authority/evidence; architecture current-state lines.
- Pre-existing user-owned overlap preserved: all other dirty Activity domain, Material Catalog, Book UI, backup/restore, Worker, later Assembly/runtime/source, PRD0062, and unrelated workspace paths.
- Forbidden paths untouched: `documentation/tasks/PRD0062/**`; `documentation/tasks/PRD0062b/recovered/**`.
- No stage, commit, push, reset, restore, clean, stash, rebase, deployment, cloud mutation, or worktree removal.

## Residual risks after verification

- Ordered specification/boundary and code-quality reviews passed; reviewer methods and findings are recorded below.
- Consolidated packet-exit proof and final localhost teacher Book-picker browser proof passed.
- Remote/deployed rules, Worker, backup, and readback remain outside P1 claims.
- Full-root Activity CAS history-growth risk remains later operational work.
- Later Assembly/runtime source remains dirty and outside P1; production registry keeps it inactive.


## Review method and result

Specification/boundary reviewer inspected the live tracked/untracked P1 diff against amendment, baseline, reconciliation authority, canonical Component 01, rules, source, tests, and evidence. Risk model emphasized capability contradictions, public/private summary leakage, missing projection/version pins, direct-kind drift, malicious owner/student access, and later-packet readiness. Initial verdict was BLOCKED on P1-F-007/P1-F-008; two re-reviews accepted the fixes. Independent code-quality reviewer then inspected registry, rules, domain/Worker CAS, Book seams, backup/restore, tests, and dirty overlap. Verdict PASS; tests were not rerun by that reviewer.

Nonblocking quality risks: broken Activity refs are not yet generalized into the Reading-Passage repair panel; the public replacement adapter could be misused outside its constrained workspace caller; legacy `bookEditor.service.ts` remains `@ts-nocheck` behind typed guards. These do not authorize P2 behavior or operational placement readiness.
