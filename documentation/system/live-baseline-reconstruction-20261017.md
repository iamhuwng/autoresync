# Reconstructed live-source candidate — 2026-10-17

**Subsequent qualification:** this is the initial reconstruction record. The
gateway restoration, release tooling, local Firebase correction, successful
minified build/tests/browser consumer checks, and remaining promotion gates are
recorded in [the current maintenance status](maintenance-baseline-20261017.md).
The initial limitations below are retained as history, not the final branch state.

Status: **CANDIDATE, NOT PROVEN STABLE**. This is a local historical source reconstruction for reviewing the current live application before publishing a clone baseline. It does not authorize deployment or establish exact live parity.

## Source selection

The branch starts at `422b7323f85a5b235d387cd18b25a1b9f63df46a`. Its tracked files are reconstructed from stash commit `b73eb1fa65c205fc4cdb35f22fd97414c5b86c49`, captured on 2026-10-06 at 11:06:10 +07:00. Existing tracked evidence is preserved; no historical artifact cleanup was attempted.

The three eligible untracked application files from `b73eb1fa^3` take precedence. Missing application, Worker, test, supporting-documentation, and font files are recovered from `766c2d4a^3`, captured at 10:38:42 +07:00 and restored into the historical development checkout before the later snapshot. The adjacent JSON manifest records every recovered untracked path and Git blob identity. Untracked output, artifacts, local data, runtime caches, credential exports, archives, bytecode, and unrelated IELTS grading skills are excluded.

Book/PDF source already present in these October 6 snapshots is frozen here to retain the historical application dependencies. Newer PDF Book development from the canonical checkout is excluded and remains separate. No source or secrets were copied from the current dirty checkout.

## Provenance limits

The live Hosting release was recorded as version `projects/temp-a1437/sites/kahut1/versions/10039da56ea1c0ae`, released at 2026-10-06T07:08:57.107Z (14:08:57 +07:00), with 458 files. The historical build was started around 14:01 local time. Concurrent edits between the 11:06 snapshot and that build may be absent. The live release has no source manifest establishing an exact Git revision/tree. Historical metadata and bundle-name agreement cannot prove source equality.

The secure-AI migration from the separately deployed `codex/ai-secure-hosting` line is absent from this stash lineage. In particular, the historical snapshot retains browser provider/key-loading code; this candidate is not approved for production credentials or deployment. Its deployed AI, class-management, and THCS hotfix delta must be reviewed and preserved before stabilization.

The seven origin/main-only Listening cleanup commits are also unreconciled: `db6845c5`, `6658ddf8`, `bdd35ec3`, `653f7c92`, `ba2c7835`, `69754098`, and merge `3d72f11c`. No merge or replacement was inferred during reconstruction.

## Clone and verification readiness

A future clone must use a reviewed published revision; this candidate is local-only. Use Node 22.12 or newer (the historical README's Node 18 prerequisite does not satisfy locked Vite). Package lockfiles are retained. Secrets and emulator/provider data are not clone contents and require separately configured environments.

At reconstruction time, root, Cloudflare, and backup Worker lockfiles match the canonical checkout. The root manifest differs only in scripts; dependency declarations match. No dependency installation or junction against differing manifests was performed. Build/test execution must reuse compatible existing tools while preserving this candidate's source/configuration, or run after a separately authorized clone setup.

No build, test, browser flow, production bundle equivalence, or backend compatibility is claimed by this reconstruction. Release-safety tooling is deliberately not integrated yet. Before calling a baseline stable: reconcile deployed hotfixes and Listening cleanup, verify fresh-clone setup, run focused checks and a production build, exercise representative teacher/student flows, then publish the reviewed revision. Deployment remains a separate operation.

## Reconstruction checks

All 6,972 tracked snapshot paths other than the intentional `.gitignore` edit match their donor Git blobs. The three later and 134 earlier untracked donor files also match their recorded blobs. Review found no added generated-evidence or credential-export paths. Two private-key patterns are existing test fixtures unchanged from the parent revision. UTF-8 verification passed for 640 staged text files.

`git diff --cached --check` reports six inherited whitespace findings in recovered files: five extra EOF blank lines and one trailing space in the font license. These are recorded in the manifest and retained to preserve exact donor bytes; the check is not represented as passing. No build, tests, or browser verification ran.
