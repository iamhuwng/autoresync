# Release foundation: authorized GitHub rehearsal

Date: 11 November 2026, Asia/Bangkok. Result: GitHub archive and receipt-recovery
scope passed; integration and Hosting promotion/recovery remain unqualified.

The owner authorized one temporary tag/draft and its asset uploads, retrieval,
restoration and exact cleanup in `iamhuwng/autoresync`. No branch push, merge,
settings change or Firebase/Cloudflare deployment was authorized or performed.

| Evidence | Observed identity/result |
|---|---|
| Operation/tag | `b41742e2-75aa-4fea-8ca2-e8cbaeb94531` / `hosting-operation-b41742e2-75aa-4fea-8ca2-e8cbaeb94531` |
| Draft release ID | `440926053` |
| Existing source commit | `3c6d5734f56d0740c1f20746e0827f46fb498a9c` |
| Reconstructed parent tree | `de01dbf8b4584a3576dac99575c29c2333243f4e` |
| Intent SHA-256 | `a6c32fb176d6ebcd4ee29f7d98c212486c1ceb21808a1ee19b23ec5ba205d4f7` |
| Source asset | `source.tar.gz`, ID `732991807`, 179,848,817 bytes |
| Artifact asset | `artifact.tar.gz`, ID `732991813`, 514 bytes |
| Intent asset | `intent.json`, ID `732991810`, 5,193 bytes |
| Reused receipt asset | ID `732997677`; one asset, no overwrite or duplicate |
| Cleanup | Independently authenticated 404s for draft and tag; remote main unchanged |
| Deployment calls | Zero |

The real client exercised GraphQL draft discovery, numeric REST retrieval,
archive upload/download and source/artifact hash/tree validation. A fresh reader
process succeeded with the candidate directory unavailable. Client
acknowledgement was deliberately interrupted after a real receipt upload;
repeating the update retrieved and reused the deterministic existing asset.
The receipt kept Hosting `unconfirmed/unverified`: the inert HTML artifact and
schema-shaped assessment/provider inputs were rehearsal fixtures, not evidence
of production compatibility or publication.

Actual-source preflight found about 302 MB of tracked blobs and five Gitlinks.
The material correction uses gzip, a bounded 512 MiB expanded-source limit and
pinned Gitlink index entries when reconstructing the parent tree. Compressed
assets remain limited to 256 MiB, artifact extraction to 256 MiB and each file
to 32 MiB. Linked repository contents were not fetched or recovered.

Selected committed candidate checks passed 14/14. After the correction, the
archive suite passed 23/23; the final affected archive, verification and deploy
suites passed 72/72 with zero failures/skips. Whitespace and UTF-8 checks passed.

The controlled rehearsal ran approximately 04:19:12–04:24:57 Bangkok, about
5 minutes 45 seconds. This includes duplicate restoration for qualification;
it is not production release latency. Full-source retention is a material cost
to measure in subsequent workflow work, not a reason to add a cache framework
in this phase.

Sanitized API IDs, timestamps, digests, fresh-reader proof and independent
cleanup observations are retained in the calling chat's local artifacts under
`phase1-github-rehearsal-evidence`. The temporary remote assets were deleted as
approved, so they are not an ongoing backup. Draft storage and this tool's
append-only behavior are not provider-enforced immutability.

Close this bounded GitHub milestone. Preserve/review the corrected implementation
for integration under the applicable source-publication/merge authorization.
No genuine Hosting publication/rollback, fresh-machine setup, main convergence
or CI artifact promotion is established by this record.
