# Phase 3 Hosting publication and recovery experiment

Status: **VERIFIED for the disposable qualification surface only** on 14 November 2026 (Asia/Bangkok). This is infrastructure evidence; it is not production authorization or application browser qualification.

The experiment used the retained artifact from Release Promotion run `43595251093` without rebuilding or changing its bytes:

- source revision: `339969143196275fa30bb6958aaa5594db982bfd`
- source tree: `d65ca625058fe62aa403b817a1f6898a98f11154`
- artifact manifest digest: `4056c4358f109db33631b66eb12cbff739561ddb7f4fe585f94ac2d88268b4e6`
- manifest-listed assets: 443 (all locally matched their recorded SHA-256)

The disposable target was Firebase project/site `luyentap-pdf-qa-20261021`. The exact artifact was published to channel `phase3-hosting-exp-20261114-b1`, which finalized as version `756e0819e27f0b60`. Independent HTTPS readback from `https://luyentap-pdf-qa-20261021--phase3-hosting-exp-20261114-5u3u59q2.web.app` matched the manifest digest and all 443 listed asset hashes, including the source revision and tree.

Firebase native `hosting:clone` copied that channel to `phase3-hosting-exp-20261114-b1-recovery`. Independent readback from `https://luyentap-pdf-qa-20261021--phase3-hosting-exp-20261114-u8gtfqve.web.app` matched the same manifest digest, source revision, tree and 443 asset hashes.

Both exact disposable channels were deleted. A final provider channel listing contained only the permanent `live` channel. No production Hosting channel, database, Worker, or Backblaze resource was changed.

An earlier attempt in the same rehearsal was correctly rejected before publication because the local harness had written its config, verifier and live logs into the artifact's public directory. Firebase saw extra files and returned `content hash doesn't match content`. The artifact itself matched its manifest; the retry moved all harness files outside the public directory and published the unchanged 444-file artifact successfully. This failure is retained as harness evidence, not product evidence.

This closes the disposable publication, exact readback, native Hosting recovery and cleanup portion of Phase 3 criterion 3. Production publication and application/browser qualification remain separate gates.
