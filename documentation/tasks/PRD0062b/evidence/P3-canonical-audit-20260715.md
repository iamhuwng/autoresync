# PRD0062b Packet 3 Canonical Audit — 2026-07-15

Verdict: `REVIEW_BLOCKED`

Component: C04 — Activity Runtime
Audit type: fresh row-by-row audit of inherited checked work against the current canonical PRD, current task wording, live source, and fresh direct proof.
Implementation changes: none. This audit changes evidence/task authority only.

## Mission and boundary

- Treat M1–M5 reports and prior M3/M4 closure claims as evidence leads only.
- Retain a checked C04 row only when its complete current wording is supported by current source and fresh direct proof.
- Reopen rows satisfied only by old contracts, mocked behavior, controls without functional integration, partial implementation, or tests that prove a narrower behavior.
- Do not enter P3 implementation while P2 remains open.
- Do not deploy, mutate cloud state, commit, stage, or push.

## Result

Before audit:

- checked executable leaf rows: `72 / 95` (`75.8%`)
- checked total rows: `76 / 107` (`71.0%`)

After audit:

- checked executable leaf rows: `42 / 95` (`44.2%`)
- checked total rows: `44 / 107` (`41.1%`)
- reopened leaf rows: `30`
- reopened checked parent rows: `9.0`, `10.0`

The post-audit percentage is verified local checklist coverage, not Packet 3 closure readiness. P2 still blocks formal P3 entry, and all browser, pilot, deployed, performance/quota, and retained timer gates remain open.

## Fresh proof executed

Command:

```text
npx vitest run src/components/book-runtime/BookRuntimeShell.test.tsx src/hooks/book-runtime/useBookActivityRuntime.test.tsx src/services/book-delivery/bookDelivery.service.test.ts src/services/book-delivery/bookDelivery.browser.test.ts src/services/book-activity/activityRuntimeAttempt.service.test.ts src/pages/StudentPracticePage.test.tsx src/services/book-activity/bookActivityDependencyBoundary.test.ts --reporter=dot
```

Working directory:

```text
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased
```

Result:

```text
exit 0
7 files passed
105 tests passed
```

Accepted scope: local delivery projection/service, browser projection parser, launcher regression, runtime shell, autosave hook, attempt/result service, and dependency-boundary proof.

Omitted scope: real authenticated student browser flow, production Worker/R2, deployed resource refresh, remote Firebase rules, representative Unit pilot, performance/quota/billing readback, screen-reader/200% zoom proof, and Full V1 timer.

Passing tests did not override source/contract contradictions described below.

## Reopened rows

### Delivery and projection boundary

| ID | Classification | Audit finding |
|---|---|---|
| `1.1` | `PARTIAL` / `FALSE_CHECKED` | Core service types accept `preview`, but the browser projection parser and Student Practice launcher accept only `solo`/`homework`. No usable preview launch path exists. |
| `1.4` | `OFF_SPEC` / `FALSE_CHECKED` | `assertBookRuntimeDeliveryProjection` accepts a legacy placement shape missing current `bindingRevision`, `placementPathLabel`, and `sourcePageLabel`, then mutates/synthesizes those fields. Current authority requires missing required projection sections to fail closed. |
| `1.6` | `IMPLEMENTED_UNVERIFIED` / `FALSE_CHECKED` | Fresh tests prove local Solo behavior and malformed-projection rejection, but not a real Solo/preview path. No preview test or authenticated runtime proof exists. |

### Shared renderer and presentation

| ID | Classification | Audit finding |
|---|---|---|
| `3.1` | `PARTIAL` | Instructions and text stimulus render. Image/audio stimulus references render only as text such as `Image reference:` / `Audio reference:` rather than usable supported media. |
| `3.2` | `OFF_SPEC` | The canonical PRD requires interaction `family` plus `variant`. The editable, normalized, and student-safe schemas contain no `variant`; choice behavior is inferred from free-text `responseShape`. |
| `3.3` | `OFF_SPEC` | Text-entry variants are absent from the schema and runtime. The shell renders one generic input and has no faithful fill-blank/table-compatible layout contract. |
| `3.9` | `PARTIAL` | Tests touch all five current families but do not exercise an unsupported-family fail-closed path. Required variants cannot be tested because the schema omits them. |
| `4.1` | `PARTIAL` | Structured controls render, but complete supported stimulus does not because image/audio references are placeholders. |
| `4.2` | `PARTIAL` | Required context blocks response when unavailable. Optional/none context-specific messaging and full launch behavior are not implemented or directly tested. |

### One-page navigation and Page-to-Activity behavior

The P2/P3 contract requires one authorized page artifact at a time. The P3 host must request a new page-specific projection/resource and change the Activity set only after successful reauthorization/loading. Current `BookRuntimeShell` derives `sourcePages` as an array containing only the already requested page. It has no page-change callback to the launcher.

| IDs | Classification | Audit finding |
|---|---|---|
| `5.1`, `5.2` | `FALSE_CHECKED` | Previous/Next and page-input controls exist, but they cannot request another authorized page; Previous/Next are disabled and Go accepts only the current page. |
| `5.4`, `5.5` | `PARTIAL` / `FALSE_CHECKED` | The shell refuses pages outside its one-item local array, but does not implement bounded Unit navigation through trusted reauthorization. This is not proof of functional in-Unit navigation or server rejection of a page transition. |
| `5.6` | `PARTIAL` | Physical input and printed label are shown, but a complete current-allowlist/page-position indication and page-transition identity behavior are not implemented/proven. |
| `5.8` | `FALSE_CHECKED` | No successful asynchronous page transition exists, so the Activity-set-after-success guarantee is not implemented. |
| `5.9` | `FALSE_CHECKED` | Current tests explicitly prove that navigation cannot leave the single requested resource. They do not prove page 58 transition, multi-page Activity continuity, Previous/Next reauthorization boundaries, or successful page switching. |
| `6.2`, `6.3` | `FALSE_CHECKED` | Moving between pages and opening another page from an Activity cannot occur under the current shell contract. |
| `6.5` | `IMPLEMENTED_UNVERIFIED` / `FALSE_CHECKED` | Native buttons and sticky CSS exist, but no direct focus/scroll/non-obscuration proof exists for the required navigator behavior. |
| `6.6` | `FALSE_CHECKED` | Component tests do not exercise pill focus, shared Activity state through actual page transitions, or navigator state changes. |
| `7.3` | `PARTIAL` / `FALSE_CHECKED` | Unit/page-group buttons remain visible in PDF focus, but buttons for non-requested pages are inert. The Unit navigator is not functionally available. |

### Autosave and conflict preservation

| ID | Classification | Audit finding |
|---|---|---|
| `8.4` | `PARTIAL` | Page/Activity switches call a flush. Component unmount starts an asynchronous save from effect cleanup, but does not prove completion before unmount or navigation disposal. The test is correctly named only as an attempted final flush. |
| `8.9` | `IMPLEMENTED_UNVERIFIED` | Refs reduce stale-closure risk, but no direct negative proof covers stale delivery/binding callbacks and undefined-field serialization across the full request path. |
| `8.12` | `PARTIAL` | Stale writes are rejected and manual reload exists. Old-version draft/attempt readability after conflict resolution is not directly proven. |
| `8.13` | `PARTIAL` | Tests cover debounce, retry, local recovery, reload, and stale rejection, but not the full old-work-preservation requirement or real page-navigation flush. |
| `8.15` | `PARTIAL` | Retry/discard/reload controls and local answer preservation exist. The required proof that the old draft/attempt remains readable after conflict resolution is absent. |

Adjacent off-spec finding: `useBookActivityRuntime.ts` still contains nonzero USD-per-write planning assumptions and cost estimates inherited from the old plan. Current PRD authority permits performance/quota/zero-billed-usage evidence, not a nonzero monetary budget. C04 `8.14` remains open; this code must be reconciled before that row can close.

### Submission/results and mobile

| ID | Classification | Audit finding |
|---|---|---|
| `9.3` | `PARTIAL` | Attempts store Solo/Homework context, ownership, timestamps, versions, and placement. Types contain no Course or class-linked Course context despite the current row wording. |
| `9.7` | `OFF_SPEC` / `FALSE_CHECKED` | Runtime opens a custom modal and renders one button per attempt. The PRD requires the existing student-plus-Activity result convention with an attempt dropdown and complete attempt review context. |
| `10.4` | `PARTIAL` | Mobile touch sizes and horizontal overflow CSS exist, but the underlying sticky Activity/question navigator is incomplete and lacks the required state/focus behavior. |
| `10.6` | `IMPLEMENTED_UNVERIFIED` / `FALSE_CHECKED` | Component tests pass. No fresh real student-browser verification exists; earlier route-mocked E2E is UI regression evidence only. |
| `9.0`, `10.0` | `FALSE_CHECKED_PARENT` | Reopened because required child rows are open. |

## Retained checked leaf rows

Fresh audit retains these rows at `VERIFIED_LOCAL_FAITHFUL` scope only:

```text
1.2, 1.5,
2.1–2.5,
3.4–3.6,
4.3, 4.5, 4.7,
6.1,
7.1, 7.2, 7.4,
8.1–8.3, 8.5–8.8, 8.11, 8.16,
9.1, 9.2, 9.4–9.6, 9.8,
10.1–10.3, 10.5,
11.5,
12.1–12.4,
1.7
```

Their accepted boundary is local source plus the fresh 105-test run. They do not imply browser, pilot, remote, deployed, performance, quota, billing, public, Course/Class, Homework implementation, or Packet closure proof.

## Required correction lanes after P2 exit

1. Strict current projection parser: reject legacy/incomplete placement shapes; do not synthesize trusted binding fields in the browser.
2. Complete preview launch contract and tests.
3. Add the canonical interaction `variant` contract and implement/test required choice/text-entry variants and supported media stimulus rendering.
4. Implement host-owned page transition: request one new authorized page projection/resource, retain last good state while loading, reject failures without changing the Activity set, and preserve shared Activity/save state.
5. Complete navigator focus/state/mobile behavior and real browser accessibility proof.
6. Complete autosave identity row `8.10`, unmount/navigation durability, old-version draft/attempt preservation proof, and remove nonzero monetary assumptions.
7. Align result UX with the existing Activity attempt dropdown/review convention and preserve future Course/Class context without moving Course authority into C04.
8. Run the representative Integration Pilot only after P2 is accepted and the corrected P3 producer-consumer contract is implemented.

## Status decision

- C04 remains `IMPLEMENTING`, with execution blocked by P2 entry authority.
- P3 may not start formally until P2 exits.
- The audited inherited implementation is useful salvage, but only `44.2%` of C04 executable leaf rows remain accepted.
