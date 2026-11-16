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

The initial handoff suite passed **292 tests**, zero failed/skipped, covering release
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
reports were subsequently investigated directly and batched in the same PR.

### Read-only recovery diagnosis and correction

The live manifest was independently reread with all 443 asset hashes. Its
revision remains `8885ef7d4a5f8bd94f45c6f185cb7031afbcb77b`, manifest digest
`5cce60adb13f8e90ac2ae018032f132bc85fa9ee6c3d0fd45d499285ba2f89f8`.
The retained prior operation is
`hosting-operation-32118ca3-0810-4fd7-84b3-7ca1a122169e`; its expected manifest
matches the observed live manifest. Recovery does not depend on trusting the
supplied local intent file.

The production file SHA-256 is
`8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57`.
The historical workflow in that exact live Git revision appended eight
qualification Firebase values to the production file before fingerprinting.
Current GitHub public qualification variables matched the local QA per-key
digests. Appending that exact ordered suffix to the current production bytes
reproduced **exactly** the live fingerprint
`634fcdaa3757191f38e43c0119cd417e78937a08a1a548869973a3ace90f4f73`.
The suffix digest is
`69ec2af9fc045ba4ce9f7f90084456c36907bd811043dedbe4b2b256a49e32c5`.
No values were logged. This is the old identity scheme, not evidence of changed
production behavior or a reason to replace a protected secret.

The assessor now performs that same read-only reconstruction automatically only
for mismatched identities, validates the observed source workflow, retains both
identities, and reobserves them before publication. Unknown or changed inputs
fail closed. Live metadata is left intact; a normally authorized successor
publication naturally writes its production-only identity. No separate baseline
repair, exception flag or manual hash/path reconstruction is necessary.

Native `gcloud firestore indexes composite list` observed nine production indexes,
all `READY`. The newly declared `writing_submissions` index (`markingStatus ASC`,
`studentId ASC`, `submittedAt DESC`) exists as `CICAgNiav4AK`. An unrelated
unchanged `drafts` index is absent; this correction does not claim the whole
index file is deployed. The shared observer replaces file-blob equality with
native READY proof for added/changed composite declarations and preserves the
field-override gate. Extra active indexes remain untouched. The native REST
endpoint requires default page size; explicitly requesting 100 returned 400,
so the production observer uses the supported default and rejects pagination.

Focused recovery/assessor/workflow tests passed **86 tests**, and the complete
release suite rerun passed **294 tests**, zero failed/skipped. Negative cases include actual environment changes, missing
QA inputs, wrong historical workflow, non-READY/missing/foreign/scope/field-order
index results and changed field overrides. The actual live identities and index
inventory also passed the new pure validators in a read-only provider rehearsal,
retained locally as `tmp/recovery-diagnosis.json`.

The complete native `observeHostingDependencies` rehearsal then **verified** from
clean commit `216b796e4745c529d3ddf12ed5c37a31b58ada36`, using the current
production services, with repeated provider/source reads. It observed nine
indexes and retained the old/new environment binding. Provider fingerprint:
`ec30ea0038e3ee4ad67c8fcb51fb660931f46ed69037c4542af4316505c2baa1`;
source-bound dependency fingerprint:
`c1720ba9e34237c4cd0d297497969f92d864364e38215633484a215ca9c43550`.
The redacted result is `tmp/native-recovery-rehearsal.json`. A subsequent
executor-safety rerun passed 49 tests. This is native read-only integration proof
for that source/observation window, not a receipt reusable for a later merge or
production deployment. The release operator must refresh the exact final candidate.

These corrections clear two demonstrated procedure mismatches; they do not
qualify candidate rules/Workers, grant IAM or authorize a production publication.
A provider-wide sole-writer policy remains separately scoped/authorized.

Sol-loop: two rounds with GPT-6.1 Sol on medium, both verdict APPROVE, no blocker
or should findings. Round two covered the batched recovery correction. Usage was
not exposed. The reviewer read the connected callers and plan/audit, checked the
diff, and did not rerun the suite or remote publication. The reviewed behavior
diff was unchanged after approval. This correction is
prepared as one PR; it is not merged or remotely deployed by this record and
does not declare a new production release or unconditional Phase 3 closure.
