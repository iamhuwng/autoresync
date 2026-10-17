# THCS import flow

This prototype represents the approved user-facing flow. Production implementation should match its hierarchy, states, wording, and interaction model while using the repository's existing components, state management, accessibility patterns, and design standards.

Reference: `thcs-import-flow-approved-mockup.html` (design reference only).

| Mockup state | Production owner |
| --- | --- |
| Test Setup | `THCSSetupStep.tsx` |
| Paste Test | `THCSTestEditorPage.tsx`, Step 1 subview |
| Parsing… | `THCSTestEditorPage.tsx`, inline pending state |
| Import needs attention | `THCSImportAttentionPanel.tsx` |
| Build Test | `THCSQuestionsStep.tsx` |
| Needs review | `THCSQuestionsStep.tsx` / `THCSSectionBlock.tsx` |
| Answer Key | `THCSAnswerKeyStep.tsx` |
| Review & Publish | `THCSReviewStep.tsx` |

The canonical wizard always has four steps. Clean imports enter Build Test automatically; mechanical content loss requires a safe keep-source decision first. Missing answers and parser confidence never interrupt import. Setup metadata remains authoritative.

Production continues to use the existing parser, converter, draft/autosave, validation, rendering and publication services. Import outcomes use the shared toast system; action reporting uses the existing testCreation feature. No recipient inbox notice is needed for a teacher editing their own draft.

Acceptance includes clean import, attention/keep/discard, parse failure/retry, authoritative metadata, Answer Key correction, final validation, persistence, keyboard/mobile behavior, and visual comparison with the approved reference. No prototype timers, samples, Shift-click behavior, state machine or simulated publication belong in production.

Existing THCS edits were preserved in place; the pre-edit tracked diff is saved in ignored `output/thcs-import-flow-baseline/pre-existing.patch`.

## Adaptation and verification

The approved reference is preserved byte-for-byte (SHA-256: `13E047E4DD6A29A6BDA0B6FD17E79157ACB8F184778F43D883F1F522A39DD7D8`). Setup uses 620px, Paste/Answer Key/Review use up to 940px, and Studio uses 95vw. The existing shared modal header, four progress indicators, toast system and question controls remain authoritative. The modal scrolls content while keeping navigation reachable. Narrow screens stack Studio and Review columns and wrap footer actions.

The attention resolution preserves the complete original input because parser AI line ranges can refer to rewritten text. Guessing a discarded source slice could lose content. This preserved section has explicit review acknowledgement in Build Test and cannot publish before acknowledgement. It uses the existing raw-text runtime renderer and text editor, without fabricated MCQ controls. Missing answers remain in Answer Key.

Browser evidence at `http://localhost:5173/lobby`: real clean parsing stayed inside Step 1, then automatically entered Build Test with one section/two questions; Answer Key changed Q1 from B to A; Review retained Setup title/Grade 9/45 minutes/giữa kì despite conflicting pasted metadata. Save Draft and private Publish succeeded. Reopening the published test from My Content loaded the THCS editor with the changed answer intact. A shared catalog adapter mapping was corrected to use the existing THCS test-type contract.

The initial browser attention/keep-source transition exposed two corrected issues: heading-plus-inline-type parsing created an empty section; the raw carrier rendered duplicate MCQ controls. Classifier, keep/discard, retry, metadata, review acknowledgement, answer grid and raw preview are covered by focused automated regressions. Final live exception acceptance used valid extraction-format metadata and a five-option question: inline parsing opened Import needs attention, Keep as editable text preserved the exact full input, and Continue to Studio showed Needs review. Review blocked publication until the source was edited and acknowledged with Use edited text. Afterwards the badge and publication blocker cleared; raw source was excluded from missing-answer counts. Evidence: exception-attention.png and exception-reviewed.png.

The published-test editor modal is a separate existing surface (`THCSTestEditorModal.tsx`) with Mantine imports; it was not rewritten as part of the creation wizard. The touched creation wizard and direct Answer Key inputs contain no Mantine imports. No dependencies, backend simulations, mock parsing delays, commits or deployment were added.

Evidence screenshots and command logs are in `output/thcs-import-flow-baseline/`. Initial final suite: 109 tests in 11 files passed; catalog mapping: 17 tests in 2 files passed. Focused ESLint and the 14-file Mantine boundary passed. The final production build passed after the responsive correction (9525 modules, 5m 21s). The public-entry bundle budget passed at 249KB. The affected page/review suites passed 12 tests with one thread after an initial worker IPC-channel failure. UTF-8 validation passed for 24 files; scoped diff checks passed.

Final narrow browser proof used 390×844: the Studio sidebar stacked at 298px, the Next action ended at x=344 (inside the viewport), and Review used one 298px column. Missing answers were visibly counted in Answer Key and corrected there. Temporary viewport overrides were reset. Desktop Paste and Review were compared with the approved reference. The shared modal header and Studio editing controls deliberately follow existing application primitives; the prototype's standalone header, fake sample preview and metadata-proposal wording were not copied. The true mechanical-loss exception parse/keep/edit/acknowledge flow also passed on the same teacher account. Earlier invalid QA samples lacked a required metadata marker and were rejected before parser API calls; attributing that rejection to a separate Firebase permission log was incorrect. No account, credential, or permission change was required.

Answer Key uses the existing native radio controls rather than prototype selects; this keeps answer editing consistent with Studio and supports all production question types. Prototype AI-inferred/source answer labels are omitted because the current persisted question model does not carry reliable answer provenance. Review retains the production summary card's title/metadata arrangement, shared modal chrome and existing validation messages instead of prototype sample rows; its concerns remain summary, validation, preview, visibility, template and publication only. Studio retains existing section/question controls, with restrained source-review signals replacing parser reporting.

Final AI-provider readiness check (2026-09-30) used the built application on localhost:5173 with the same teacher account. Groq and Cloudflare connection attempts failed, then the existing Gemini rotation succeeded; the parser logged AI confidence 95 and automatically entered Build Test with the correct question and answer. This proves live AI restructuring, not merely local regex fallback. Evidence: ai-readiness.log and ai-readiness.png. This is local integration proof; Hosting deployment and post-deployment smoke verification remain separate release actions.

## Hosting deployment — 2026-09-30

Current state supersedes the earlier local-only deployment notes above. Human authorization conveyed from the Teacher Lobby task allowed this THCS release to temp-a1437 / kahut1. Hosting-only deployment completed successfully; no rules, indexes, backend, credentials, access permissions or data repairs were deployed.

Release source: `C:\tmp\thcs-release-candidate-20260930`, selectively integrated into the exact preceding live source at `C:\tmp\lobby-release-candidate-20260930`. The previous source and dist are retained for rollback. Live parser source-identity repairs, provider proxy/key rotation and its public THCS worker endpoint were preserved. Only the nine-line heading/type-tag fix was added to the live parser. Unrelated clipboard, caption-only validation and question-editor changes in the canonical dirty checkout were excluded; image-required instructions were aligned with the retained editor. Seven shared image/clipboard/student-renderer/Book/Lobby source surfaces match the preceding release by SHA-256.

Integrated checks: 114 tests in 12 files passed; the affected page rerun passed 11 tests after the instruction correction. Scoped ESLint, 14-file Mantine boundary, 22-file UTF-8 and source diff whitespace checks passed. Production build passed in 1m 46s; public root entry is 247KB and within budget. The release uses only approved public environment settings; no provider keys, emulator settings, QA fixtures or prototype source were embedded in the browser build. The real Tailwind scan input `output/stitch-book-editor-tabs/book-editor-tabs-stitch.html` was retained.

Deployment command ran from the isolated candidate using local Firebase CLI 15.11.0: `node node_modules/firebase-tools/lib/bin/firebase.js deploy --only hosting:kahut1 --project temp-a1437 --config firebase.hosting-candidate.json --non-interactive`. Hosting reported 441 files, release complete and Deploy complete. Both `https://hocthem.net` and `https://kahut1.web.app` serve `/assets/index-COE19Bur.js`, 253269 bytes, SHA-256 `8AE00CA874D8ACE79C2494D15C2A826F9EDA52E61D2D6F302B172CBF31EEFD41`, matching the verified dist.

Live browser smoke at `https://hocthem.net/lobby` with the existing Teacher Test session passed canonical four-step setup, Paste under Step 1, inline Parsing, automatic Build Test transition, Answer Key correction and final Review with Setup metadata authoritative. Groq key rotation handled an invalid first configured key and a second key returned a real AI response (parser AI confidence 95). This is actual deployed AI proof, not only regex fallback. No key or permission change was needed.

Live mechanical-loss fixture with a fifth MCQ option opened Import needs attention. Keep as editable text preserved the exact complete input in Studio. Publication was disabled until source review; editing and Use edited text cleared Needs review and the publication blocker. Raw source did not generate missing-answer requirements. These smoke checks did not publish an additional test or perform data repair.

Release evidence is in `output/thcs-import-flow-baseline/`: `release-source.patch`, `release-tests.log`, `release-page-retry.log`, `release-build-final.log`, `release-lint.log`, `release-manifest.json`, `hosting-deploy.log`, `live-hosting-proof.json`, `protected-surface-proof.json`, `release-local-ai.json`, `live-ai-proof.json`, `live-ai-build.png`, `live-review.png`, `live-attention.png`, and `live-source-reviewed.png`. No commit or staging was performed. The canonical worktree remains dirty; the isolated release source is authoritative for this deployed version.
## Scoped commit — 2026-09-30

The user authorized committing only this import-flow task after later changes had landed. The commit delta was reconstructed from the preserved before/after release sources and merged into current HEAD, retaining subsequent visual-prompt, setup-validation, homework-access and bounded-Lobby commits. Earlier unrelated nested-dialog, bulk-paste, template and publisher changes remain outside the commit. Review retains the native controls required by the repository's Mantine boundary. The answer-completeness regression is isolated from the earlier nested-dialog test.

The proposed commit source was checked in an isolated export of current HEAD with shared dependencies. This is commit-scope verification, distinct from the deployed release and canonical dirty worktree. No redeployment or push is part of this commit request. The committed source is not a wholesale replacement of the isolated Hosting release or later working files.
Scoped commit verification: 63 tests in 10 files passed against the assembled import-flow delta plus current committed shared-source changes. Scoped ESLint, the 20-file Mantine boundary and UTF-8 checks passed. Initial split verification exposed two tests dependent on excluded pre-existing save edits and a missing test-only Firebase environment; the tests were narrowed to task ownership, dummy test configuration supplied, and affected checks rerun successfully. Later Reading V2 and tooling commits touch separate paths and are retained in the commit ancestry.

Staged source/docs pass whitespace checks. The approved reference intentionally retains three original whitespace-only lines to preserve its verified byte-for-byte SHA-256; the reference-specific check ignores only blank-at-end-of-line whitespace. The shared card-label regression test was already included in the later Lobby commit, so it has no new staged delta here.
