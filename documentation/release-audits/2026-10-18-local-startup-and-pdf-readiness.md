# Stable local startup and PDF release boundary — October 18

Source inspected: stable main `a3ebc0419f55eed45ff5e129b2e459150c504fdf`.
This follow-up changes documentation only. It performs no production deployment,
provider upload, source publication or historical-data repair.

## Configured-machine startup

The initial stable checkout lacked its ignored `cloudflare/tmp/.dev.vars`,
and the shared local Auth service was stopped. Existing root and Cloudflare
dependencies and shared environment were available. The tooling doctor also
reported missing backup-package dependencies; they were not installed because
they are not required for this app/Book Worker startup check. Their separate
clean-runner rebuild proof is recorded in the service release inventory.

The existing reviewed local Worker secret file was copied from the preserved
feature checkout to the stable checkout's ignored path without printing values.
Before recovering the local stack, a read-only RTDB comparison and local
Firestore export proved that the entire running database and all 672 Firestore
records matched validated recovery generation
`afcfa047-8d17-4a35-b5dd-1cfc00ca59f9`. Its five Auth identities matched current
profiles. The owning checkout's explicit recovery restored that exact generation;
no bootstrap, seeding or live-to-local sync was used.

Terminal-owned Auth and dev processes stopped at a turn boundary. A named
Windows task now owns Auth, using the validated saved identities only; no
additional RTDB/Firestore import was needed for that restart. The existing
owning checkout's checkpoint task resumed saving complete generations. Named
temporary teacher/student tasks ran the unchanged stable `local-dev.mjs`
orchestrator sequentially, with `--port 5173` and `--port 5174`. Each starts the
local Book Worker at port 8787. `--force` refreshed stale Vite dependency output;
the first browser harness also required normal localhost resolution instead of
an IPv4-only override. These were local harness/runtime issues, not product fixes.

Teacher verification entered `http://localhost:5173/login`, revealed dev quick
login and used Teacher. The lobby loaded 17 materials, including Reading V2
entries and the Book tab. Create New Test opened the test-type dialog without
a reload. No test was saved. Student verification entered
`http://localhost:5174/login`, revealed dev quick login and used Student. The
student workspace rendered its classes and 20 activity-feed entries after the
loading indicator disappeared. Neither flow had a page error. Student rendering
emitted one existing React shorthand/padding styling warning; it remains unfixed.

Fresh Playwright contexts used the installed package and blocked every
non-local browser request. Fonts and public media requests were deliberately
blocked and appear as resource errors.
The existing browser profile and its IndexedDB PDF authoring draft were unused.

One checkpoint overlapped normal login writes and correctly rejected the export
without advancing its selected generation. After browser checks stopped, a
complete save succeeded at `2026-10-18T12:47:14.729Z`, generation
`bc16c9c7-ad1b-4329-be97-8d5a41023471`. Temporary teacher/student tasks and their
Vite/Worker processes were stopped and removed; ports 5173/5174/8787 are free.
Local Auth remains owned by `LuyenTap-stable-qa-auth`, while the existing
`LuyenTap-firebase-checkpoint` and database/Firestore tasks remain running.
Those machine-local tasks, ignored secrets and snapshots are not clone contents.

October 19 reinspection: the local service ports are no longer listening, and
the last checkpoint status reports all three emulators unavailable. The checks
above establish the October 18 acceptance only. A new browser session must first
recover the local runtime through its owning checkout; this record does not
assert that local services stay running indefinitely or restart after reboot.

The preserved dataset remains degraded: three historical homework records
reference missing Books, and `book_b2_primary` plus the old acceptance capacity
ledger report provider drift. Successful checkpointing preserves those issues;
it does not reconcile provider objects or repair old records. Current local
rules come from the owning feature checkout's recovery, so this is startup and
login proof, not exact-main-rules qualification of every workflow. Existing
isolated exact-rules tests remain separate evidence.

Ignored local evidence:

- `tmp/stable-startup-qa-20261018/teacher.json` and `teacher.png`.
- `tmp/stable-startup-qa-20261018/student.json` and `student.png`.
- `tmp/stable-startup-qa-20261018/` named-task logs. Browser report paths contain
  the final successful run; initial browser failures are described above.
- The owning feature checkout's
  `tmp/stable-startup-recovery-comparison-20261018/comparison.json` and registered
  `tmp/local-firebase-recovery/status.json`.

## Confirmed PDF catalog integration gap

A read-only check ran the actual stable `assertMaterialSummary` against all four
saved local PDF Book summaries. The two private rows pass. These two rows fail:

| Local Book ID | Stored `bookVisibility` | Stable contract result |
| --- | --- | --- |
| `book-4c20c875-a922-4359-81af-eb1d1868a317` | `public` | rejected |
| `book-695762c9-eaf5-4174-9ff3-b9ac61415213` | `public` | rejected |

Both originating canonical Books also have `visibility: public`. The feature
producer reduces visibility to `public/private`; stable main preserves the
reviewed `private | public-library-pending-review | public-library-published |
public-library-rejected` contract. Changing only `bookVisibility` to a valid
published enum in an in-memory diagnostic makes each row pass. That establishes
the failing field; it neither approves publication nor changes a stored row.
Evidence: ignored `tmp/pdf-summary-contract-check-20261018.{ts,json}`.

Do not weaken stable validation or automatically declare old `public` records
reviewed/published. Reconcile the PDF producer, canonical metadata and intended
publication workflow together in the separate PDF integration branch, with
their affected finalizer/catalog checks.

The feature checkout remains separate at `422b7323` with extensive uncommitted
work. Its current execution authority is the component-PDF recovery plan and
PRD0063 authoring-lifecycle task document; the execution ledger's October 5
blockers are historical until refreshed. A release candidate needs an exact-path
delta reconciled onto main, then fresh full/component source upload, finalization,
recovery/retry, publication and student/teacher lifecycle acceptance. Provider
capacity must be freshly reconciled from the actual restricted prefix before a
real upload; this follow-up does not establish credential health or capacity.
Keep Listening cleanup and retained feedback/design work separate as requested.
