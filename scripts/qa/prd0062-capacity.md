# PRD0062 bounded capacity preparation

Canonical Windows checkout; use existing root dependencies. No installation,
deployment or remote mutation is part of this runner. Default mode creates
deterministic text-only 20/100/500-page fixtures and their SHA-256 manifest.

```powershell
node scripts/tooling-where.mjs --exec vite-node --mode test scripts/qa/prd0062-capacity.ts
```

After the root allocates the heavy slot, execute one bounded cell at a time:

```powershell
$env:PRD0062_CAPACITY_MODE = 'measure'
$env:PRD0062_CAPACITY_PAGES = '20' # then 100, 500
$env:PRD0062_CAPACITY_CONCURRENCY = '1' # then 2, 5
$env:PRD0062_CAPACITY_SAMPLES = '3'
node scripts/tooling-where.mjs --exec vite-node --mode test scripts/qa/prd0062-capacity.ts
Remove-Item Env:PRD0062_CAPACITY_MODE, Env:PRD0062_CAPACITY_PAGES, Env:PRD0062_CAPACITY_CONCURRENCY, Env:PRD0062_CAPACITY_SAMPLES
```

Sidecars live under `artifacts/prd0062-capacity/`. Each includes source commit,
dirty status, command/runtime, fixture identity, successful/error rows,
concurrency, total p50/p95 latency, per-row composition/count latency, aggregate
process CPU and sampled RSS. Three batches means 3/6/15 operations for
concurrency 1/2/5; it does not mean 100–200 uploads/day were measured.

The runner uses the actual `composeComponentPdfBytes` implementation and
`createBookSourceDirectPdfPageCountAdapter`, with immutable in-memory range
reads. It exercises installed PDF.js count logic, but measures Node function
execution with cooperative concurrent promises. It does not measure browser
Worker isolation, Cloudflare CPU/memory, actual provider/storage, uploads,
Delivery, quota or billing. A 10ms RSS sampler can miss short peaks; aggregate
process RSS includes fixtures, caches and all concurrent tasks. These facts
remain explicit in every sidecar. It does not create provider authority.

## Remaining actual-path qualification

1. Use the same manifest fixtures through real teacher picker/composition at
   `http://localhost:5173`, then ordinary Source Upload completion and trusted
   stored-byte count. Capture each exact Source identity and hash. Run real
   authenticated student Delivery GET/HEAD/range at `http://localhost:5174`
   using its issued document request, never a private provider URL. Use disposable
   Books/contexts only; protected identities in plan §5 are read-only.
2. Before remote workload, capture exact active Worker version/config/bindings,
   Firebase Spark status, provider reconciliation totals, free-tier usage and
   billing snapshots. Reuse the current ordinary-flow producer/Delivery clients;
   do not mint injected authority, synthesize provider proof or deploy a probe.
3. Least useful remote matrix: one batch at each size (20/100/500) and concurrency
   (1/2/5), 24 upload operations total. This is a smoke matrix, not stable p95
   evidence. For sampled p50/p95 use three batches/cell, 72 uploads total; run
   sequential cells and reuse each real uploaded source for authenticated
   Delivery concurrency 1/2/5. Stop on quota headroom/error before expanding.
4. Add bounded scanned/image-heavy, encrypted, malformed and truncated genuine
   fixtures. Generated text PDFs do not qualify those classes or the 50MiB input
   /100MiB output ceilings. Existing unit rejection cases qualify guards only.
5. Capture actual operations/bytes/range requests and before/after counters.
   Project 100/200 daily uploads from measured per-operation demand separately;
   label that projection. An observed whole-day workload is required to call
   daily volume measured. Account zero billed use requires provider/Firebase/
   Cloudflare billing snapshots, not absence of local network requests.
6. No automatic cleanup is included: identify only disposable run objects and
   use existing exact cleanup/retirement flow after its authority review. Record
   capacity settlement and protected-state before/after hashes separately.

Remote measurements and backup/restore remain Q/release evidence. Local runner
success cannot establish current deployed behavior or full capacity acceptance.
