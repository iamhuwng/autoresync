# Cloudflare Workers 50-Subrequest Ceiling — Runbook & Scaling Guide

> **When you hit this error in `wrangler tail` or Worker logs:**
> ```text
> Too many subrequests by single Worker invocation.
> To configure this limit, refer to https://developers.cloudflare.com/workers/wrangler/configuration/#limits
> ```
> **Or see these user-facing symptoms on Cloudflare Workers Free:**
> - **Component PDF Publish (`POST /book-assembly/component-pdf-publications`)** returns `500 book_component_pdfs_publication_failed` or `503 book_assembly_activity_binding_unavailable`.
> - **Book Homework Assign (`POST /book-homework/assignments/:id/commands`)** returns `"Book Homework assignment committed, delivery sync pending. Retry synchronization..."` or `500` during multi-student fanout (`book_homework_committed_projection_pending`).

---

## 1. Why This Happens (Plain English)

Cloudflare Workers **Free** enforces a hard cap of **50 outbound HTTP subrequests per single Worker invocation** (counting every Firebase RTDB read/write, Firestore REST call, Google OAuth token exchange, Firebase `signInWithCustomToken` exchange, JWKS lookup, and OCI S3 call). At subrequest #51, Cloudflare kills the invocation immediately.

Two Book PDF workflows scale linearly with Units / Activities / Students and therefore hit this ceiling first on Workers Free:

### A. Component-PDF Publication (`POST /book-assembly/component-pdf-publications`)
Formula (after all safe single-invocation optimizations already applied):
- Request-side planning + live TOCTOU checks: `~7 + 2S + 5U` RTDB reads (`U` = units, `S` = source PDFs)
- Canonical activity version writes (`null_etag` write-first): `2A` writes (`A` = total activities)
- Publication repository transaction (`null_etag` write-first): `7 + (2 + 3A + U)` calls
- Plus cold-start Firebase/OAuth token exchanges (`~6–10` calls) and post-commit `recordPublishedBindings` (`~2–4` calls)

| Book Size | Approximate Subrequests | Behavior on Workers Free (50 cap) |
|---|---:|---|
| **2 Units, 2 Activities** | ~46–51 | Commits all publication records on click 1; if post-commit binding hits #51 (`503`), clicking **Publish** a 2nd time replays idempotently in ~6 calls and finishes cleanly. |
| **3–4 Units, 4–6 Activities** | ~60–75 | Cannot finish in 1 invocation on Free. |
| **5+ Units, 10+ Activities (full textbook)** | ~93–150+ | Will reliably hit 50-subrequest limit on Free. |

### B. Book Homework Assignment & Fanout (`POST /book-homework/assignments/:id/commands`)
- Creating the assignment authority + canonical resolution + committing 1 recipient takes **~51 subrequests** on a cold isolate (`~31` per recipient fanout + `~20` setup/authority).
- **1 student:** click 1 commits `fanout_pending`, clicking **"Retry delivery synchronization"** (or **"Retry exact assignment"**) finishes in ~16 calls.
- **5–30 student class:** easily **150–900+ subrequests** in a single invocation; cannot complete in one click on Workers Free.

---

## 2. Immediate Recovery Today (While Still on Workers Free)

Both flows are **idempotent and resumable** — do **NOT** create duplicate books or restart the wizard from scratch:

1. **Component-PDF Publish hit `500` / `503`:**
   - Click **"Publish approved Units"** one more time (within the 5-minute preview approval window).
   - Already-written immutable children (`versions`, `activity_versions`, `activity_safe_projections`, etc.) are skipped via `alreadyPersisted` and `null_etag` replay.
   - If the 5-minute preview approval expired (`422 component_pdfs_preview_approval_invalid`), re-open and approve each Unit preview in the Preview tab, then click **Publish** again.
2. **Book Homework Assign paused at delivery sync:**
   - Click **"Retry delivery synchronization"** (or **"Retry exact assignment"**) — do **NOT** click `"Confirm preview"` again, which generates a new assignment ID.
   - The saga preserves `record.createdAt` and resumes cleanly without `idempotency-conflict`.

---

## 3. Permanent Fixes: Decision Guide (Pros & Cons)

Do **not** waste time chasing tiny 2–3 subrequest micro-optimizations — the easy wins (`null_etag` create-if-absent in `publication-repository.ts` & `canonical-activity-version-repository.ts`, per-request `createRequestScope` in `production-composition.ts`, `saga.ts` resume fix, and single-invocation scope memoization in `canonical-resolver.ts` & `book-delivery/worker.ts`) are **already implemented**.

Choose one of these two real fixes when you start publishing 3+ Unit books or assigning to multi-student classes:

### Option A — Upgrade Cloudflare Workers to Paid (**$5/month**) *(Fastest & Recommended for Pre-Launch / Launch)*
- **What changes:** Cloudflare Workers Paid raises the per-invocation limit from **50 → 1,000 subrequests** (20× higher), plus includes 10M requests/month. **Zero code changes required** for 2–15 Unit textbooks or 15–25 student classes.
- **Pros:**
  - Immediately fixes **both** Component-PDF Publish and Book Homework Fanout in one shot.
  - Keeps single-request atomic backend logic simple (no partial client-side multi-step state machines).
  - Flat $5/month vs days of engineering + testing complexity.
- **Cons:**
  - Costs $5/month (not strictly $0).
  - Still bounded at 1,000 subrequests/invocation — very large classes (e.g., 50+ students in one click) or huge books (30+ Units) will eventually still benefit from Option B batching.

### Option B — Client-Driven Multi-Step Chunking (Stay **$0/month Free**, or Scale Beyond 1,000 Subrequests)
- **What changes:** Follow [Rule 13 in `documentation/rules/infrastructure.md`](../rules/infrastructure.md#rule-13--client-driven-multi-step-for-heavy-serverless-workloads):
  - **Component-PDF Publish:** Split into discrete idempotent client-driven calls behind a progress bar:
    1. Prepare canonical activity versions (1–2 activities per call)
    2. Prepare immutable publication families (batched per unit)
    3. Final live TOCTOU verification + atomic `current` pointer CAS commit + post-commit bindings
  - **Book Homework Fanout:** Cap `processRecipient` to `1` recipient per invocation (returning `status: 'in_progress'` with `processedCount / totalCount`) and have the client automatically re-send the exact same `operationId` until `state === 'committed'`.
- **Pros:**
  - **$0/month** on Cloudflare Workers Free.
  - Scales to arbitrarily large books (20+ Units) and classes (100+ students).
  - Enables real progress bars (`Publishing unit 3 of 8...` / `Assigning 4 of 25 students...`) and clean Wi-Fi drop recovery.
- **Cons:**
  - Requires backend endpoint/state-machine changes + client retry/progress UI + additional partial-failure tests.
  - Multiple browser ↔ Worker round trips add minor latency.

---

## 4. Key Source Files Already Optimized (Reference Map)

- Component-PDF Publish per-request caching & fresh TOCTOU guard:
  - [`cloudflare/src/upload-worker/book-assembly/production-composition.ts`](../../cloudflare/src/upload-worker/book-assembly/production-composition.ts)
  - [`cloudflare/src/upload-worker/book-assembly/publication-route-handlers.ts`](../../cloudflare/src/upload-worker/book-assembly/publication-route-handlers.ts)
- Write-first `If-Match: null_etag` & partial-write `alreadyPersisted` resume:
  - [`cloudflare/src/upload-worker/book-assembly/publication-repository.ts`](../../cloudflare/src/upload-worker/book-assembly/publication-repository.ts)
  - [`cloudflare/src/upload-worker/book-assembly/canonical-activity-version-repository.ts`](../../cloudflare/src/upload-worker/book-assembly/canonical-activity-version-repository.ts)
- Book Homework saga resume & scope memoization:
  - [`cloudflare/src/upload-worker/book-homework/saga.ts`](../../cloudflare/src/upload-worker/book-homework/saga.ts)
  - [`cloudflare/src/upload-worker/book-homework/canonical-resolver.ts`](../../cloudflare/src/upload-worker/book-homework/canonical-resolver.ts)
- Book Delivery per-unit candidate scope memoization:
  - [`cloudflare/src/upload-worker/book-delivery/worker.ts`](../../cloudflare/src/upload-worker/book-delivery/worker.ts)
