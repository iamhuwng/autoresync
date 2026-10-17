# THROWAWAY result

Status: bounded local-R2 range-count mechanics PASS; production adoption remains blocked on near-limit resource proof.

## Runtime and bundle

- Runtime: isolated WSL ARM64 Wrangler/Workerd `4.103.0`, Durable Object RPC, local Miniflare R2 binding only.
- PDF.js: `5.4.296`, `legacy/build/pdf.mjs`, in-process fake worker, count-only identity `DOMMatrix` shim.
- Fresh dry-run bundle: `3378.00 KiB` raw / `616.07 KiB` gzip.
- Browser Rendering/Puppeteer calls: none.
- Cloud deployment, remote R2, Firebase, and product integration: none.

## Final cases

| Case | Input | Outcome | Parser elapsed | R2 ranges | R2 bytes read | Cleanup |
|---|---:|---|---:|---:|---:|---|
| supplied standard PDF | `17,273,446` B | HTTP `200`, `180` pages | `52 ms` | `2` | `1,544,806` | exact key absent |
| encrypted generated fixture | `3,411` B | HTTP `422`, `PasswordException` / `pdf_password_required` | n/a | bounded | bounded | exact key absent |
| malformed generated fixture | `41` B | HTTP `422`, `InvalidPDFException` / `pdf_invalid` | n/a | bounded | bounded | exact key absent |
| derived near-limit PDF | `51,380,224` B (`49 MiB`) | HTTP `200`, `180` pages | `36,311 ms` | `34` | `35,651,584` | exact key absent |

Independent `pypdf` readback also counted the supplied source as `180` pages. Near-limit fixture inserts a large legal PDF comment before final `startxref`; it stays parseable and preserves expected page count without writing a fixture file.

## Learned constraints

- Standard PDF demonstrates useful random access: PDF.js read about `1.47 MiB`, not all `16.47 MiB`.
- Near-limit fixture stayed under `64` requests and `50 MiB` aggregate-read cap, but took `36.3 s` inside local Workerd. That is too close to or beyond the default `30 s` Durable Object active-CPU boundary to accept without deployed CPU/memory evidence.
- The prototype's `10 s` JavaScript timer did not interrupt near-limit parsing. Synchronous PDF.js work can block timer-based cancellation; a Promise timeout is not a hard CPU kill switch.
- TypedArrays passed to PDF.js range transport are transferred/detached. Record size before delivery and never reuse chunks.
- Expected PDF.js custom exceptions lose useful identity across DO RPC unless normalized inside the DO.
- Workerd isolate peak memory remains unavailable. Local success cannot prove the `128 MB` production memory bound.
- Legacy PDF.js warns that Node `require`, `ImageData`, and `Path2D` are unavailable. Page counting passed; rendering remains intentionally untested.

This prototype supports direct PDF.js/DO counting for ordinary PDFs. It does not yet support an honest claim that every accepted file up to the current `50 MiB` ingress limit will complete safely within Cloudflare free-tier CPU/memory limits.
