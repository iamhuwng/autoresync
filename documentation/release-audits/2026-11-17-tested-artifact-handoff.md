# Tested artifact handoff — 17 November 2026

Scope: deployment-procedure correction on `codex/release-procedure-improvements`,
based on protected main `056b298485863da95aac4f25bcbc8c3e34f2cf96`.
No production publication, configuration repair, data mutation or IAM change.

## Evidence inspected

The latest completed spare-site run in thread
`01a1d579-41f7-7960-b395-a11bcd754ea3` explicitly reports that production was
not deployed. Its retained evidence is the immutable verification release
[`verification-056b2984…-6728a17d`](https://github.com/iamhuwng/autoresync/releases/tag/verification-056b298485863da95aac4f25bcbc8c3e34f2cf96-6728a17d-63cf-4432-a883-80584b1c6160),
bundle SHA-256 `bbc563d70dc81cb5594e79c25ab2fd82277ab67d7c76dbe37b5cf965e41d2166`.
The published release, tag source and exact bundle bytes were independently
read back using the bundle reader during this investigation; it confirmed that
the old bundle contains result artifacts but no retained Hosting archive.
Local retained results were independently reread in
`tmp/login-qa-clean-20261117/{build-proof,readback,browser-proof,cleanup,retained}.json`.

They record 437 verified assets, 44 frontend tests, nine Worker tests, selected
student Auth/RTDB/Worker/browser behavior, no production browser requests, and
verified temporary-account/profile/private-mapping cleanup. The run's manifest
digest is `679dbbd59fddf33490866dd0348d5737e1a310375a8ea3cd70766fae406d101e`.
The build proof explicitly names `esbuild` and a dedicated QA environment.

The thread's build failures and cleanup retries exposed two general patterns:
resource-heavy checks need serial execution and retained failure logs; provider
side effects need a durable cleanup target before creation and project-bound Auth
context during recovery. These are not evidence that a production release passed.

## Correction and qualification

The existing immutable bundle optionally carries a production-format Hosting
artifact. Its build identity becomes the manifest digest and retains production
and build-input fingerprints. Prepare verifies the source and restores the
validated archive before assessment/card generation; it does not rebuild.
The card rejects different manifest/environment/build-input bindings. Existing
archive traversal, type, file-hash and size guards remain active. Production
authorization, final baseline readback and executor publication/recovery remain.

The synthetic rehearsal creates a Git application candidate, builds a small page
from its exported behavior, runs an actual Node assertion against source and page,
retains that result with the artifact, exercises immutable-provider readback via
a provider fixture, invokes the workflow's real restore CLI, validates the card,
and exports the unchanged artifact digest to the executor boundary. It rejects
missing/altered archives, stale evidence, another source/environment and changed
manifest/build bindings. This is local integration proof, not a remote publication.

The focused Node suite passed **292 tests**, zero failed/skipped, covering release
assessment, dependency observation, bundles, archives, cards/workflow, verification,
deployment safety, operation journals, selected service qualifications and QA
health contracts. The synthetic handoff is part of that run. UTF-8 checks and
`git diff --check` passed. An unnecessary additional invocation of a Node-test
file through Vitest reported “No test suite found”; the same 16 journal tests
passed under their intended Node runner in the focused suite.

## Boundaries and follow-through

Source-only evidence keeps the CI build route and makes no built-site byte claim.
Worker/external-service isolation still must be established for the selected
preview journey; Firebase hostname selection alone does not isolate those services.
Artifacts remain bounded to 32 MiB compressed within a 64 MiB bundle. Larger
artifacts fail closed. No dependency, service or storage system was added.

The feature thread separately reports stale live environment metadata and a
changed-index source equality gate despite native READY index evidence. Those
reports require current native configuration/provider comparison before changing
the shared baseline or index qualification. They are not repaired by this handoff.
Full production qualification, production baseline reconciliation and a true
provider-wide sole-writer policy remain separately scoped/authorized.

Sol-loop: one round with GPT-6.1 Sol on medium, verdict APPROVE, no blocker or
should findings. Usage was not exposed. The reviewer read the connected callers
and plan/audit, checked the diff, and did not rerun the suite or remote publication.
The reviewed behavior diff was unchanged after approval. This correction is
prepared as one PR; it is not merged or remotely deployed by this record and
does not declare a new production release or unconditional Phase 3 closure.
