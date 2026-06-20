# Teacher Test Creation Parsing And Review

## Purpose

This document defines the teacher-side parsing and review contract for IELTS Reading test creation.

It exists so future work on the upload modal, parser pipeline, draft persistence, and review route shares one failure-handling model instead of rediscovering it from incidents.

## Scope

This architecture applies to the teacher Reading creation flow rendered by:
- `src/components/test-creation/TestCreationModal.tsx`
- `src/services/test-creation/index.ts`
- `src/services/test-creation/ai-extractor.service.ts`
- `src/services/test-creation/offline-parser.service.ts`
- `src/services/draftCloudService.ts`
- `src/pages/TestReviewPage.tsx`

It does not define student Reading delivery or Reading passage rendering behavior.

Reading V2 and Listening authoring may reuse neutral presentation primitives for loading, error, empty, and validation-summary display. That shared presentation boundary is canonical in `documentation/architecture/ielts-reading-v2-listening-unification.md`. This document continues to own the legacy Reading parser, draft, and review workflow; shared UI must not generalize Listening audio, parser, storage, or live-session behavior into this pipeline.

## Teacher Lobby Entry Boundary

Teacher Lobby creation starts in `TestCreationModal`; it must not route to a separate creation page before the teacher chooses test family and skill.

Current rules:

- `TeacherLobbyPage` opens `TestCreationModal` for `Create New Test`.
- IELTS Reading uses this modal as the parser/draft/review entry.
- THCS-THPT branches into its setup/editor surface inside the same modal shell.
- Reading V2 uses the same modal entry to collect/forward metadata and start mode into Studio.

Do not reintroduce page-first lobby creation, a second THCS-only lobby creation modal, or lobby-owned canonical authoring state. The broader lobby UI and navigation contract lives in `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.

## Pipeline Contract

The current teacher Reading creation flow is:

`TestCreationModal`
-> `testDraftService.createDraft()`
-> `testCreationService.parseDocument()` / `parseText()`
-> AI extraction or offline/rules fallback
-> validator merge
-> `testDraftService.saveParsedContent()`
-> review route

Required rules:
- the parser owns the success contract for extracted review content
- the modal owns the transition contract into the review route
- draft persistence is part of success, not a best-effort side effect

## Failure-Handling Contract

### AI Extraction

Required rules:
- non-success AI extraction results are failures, not usable partial output
- provider failures such as Gemini `403` referrer blocks or Groq `429` exhaustion may degrade into offline/rules fallback
- provider failure must never materialize as a silent empty success

### Offline Fallback

Required rules:
- offline/rules fallback may satisfy the parse only if it produces reviewable passages and questions
- fallback output must be mapped into the same question and passage structures consumed by the validator and review flow
- fallback that produces zero questions is not a partial success

### Zero-Question Guard

Required rules:
- parser success requires at least one merged question
- blank review content is a terminal parse failure
- the modal must remain in error/retry state instead of navigating to review

## Reviewability Invariants

Teacher review requires:
- one or more merged questions
- persisted draft content written successfully

Allowed:
- passages from AI extraction
- passages from offline parsing

Not allowed:
- passage-only success with no questions
- `review` drafts that contain empty `questions`
- route transition when `saveParsedContent()` fails

## Draft Persistence Contract

`saveParsedContent()` is the final write gate before review.

Required rules:
- the modal must check the returned `success` flag
- a failed draft write blocks the success transition
- parse completion messaging is only valid after the draft write succeeds

## Provider Interaction Notes

Provider availability is an upstream concern. The parser contract is narrower:
- return a real AI result
- return a real offline/rules fallback result
- or fail closed with a visible error

The parser must not turn provider instability into blank drafts or blank review pages.

## Verification Anchors

Current regression anchors:
- `src/services/test-creation/index.test.ts`
- `src/components/test-creation/TestCreationModal.test.tsx`

Key runtime anchors:
- `src/services/test-creation/index.ts`
- `src/components/test-creation/TestCreationModal.tsx`
- `src/services/draftCloudService.ts`

## 2026-04-10 Amendment - Gemini Key Pool Hygiene

Standalone Gemini probes on April 10, 2026 confirmed that the numbered Gemini browser keys succeed on both `https://mstu.work` and `https://kahoot.mstu.work`, while the legacy `VITE_GOOGLE_API_KEY` remains expired and returns `API_KEY_INVALID`.

Required rules:
- Gemini rotation must load only `VITE_GEMINI_API_KEY_1..5` plus active Firestore Gemini keys
- `VITE_GOOGLE_API_KEY` must not be counted as a Gemini fallback, health-check key, or admin Gemini env key
- the legacy Google key is not part of any supported upload feature; remaining Google Drive browser-service code/config is obsolete residue pending separate removal

Operational consequence:
- teacher IELTS Reading creation must no longer fail because an expired legacy Google key was included in Gemini round-robin selection
- if Gemini fails after this point, treat it as a real provider or prompt-size issue, not legacy-key contamination

## 2026-05-13 Amendment - Structured JSON Gemini Rotation

Reading V2 Auto import uses `geminiProvider.generateStructuredJson(...)` directly through `src/services/reading-v2/readingV2AutoImport.service.ts`, not the generic AI router.

Operational finding on May 13, 2026:
- `generativelanguage.googleapis.com` is enabled for the active Google Cloud project.
- `VITE_GEMINI_API_KEY_1` maps to Cloud API key `Gemini API Key` in project `171016256749`.
- `VITE_GEMINI_API_KEY_3` maps to Cloud API key `Generative Language API Key` in project `983020888101`.
- `VITE_GEMINI_API_KEY_2` did not resolve through the active gcloud account/project lookup and is the likely problematic slot for the observed `API_KEY_INVALID` / "API key expired" Reading V2 Auto failure.
- `VITE_GOOGLE_API_KEY` is not part of the Gemini key pool or any supported upload contract. Any remaining Google Drive use is obsolete implementation residue.

Required rules:
- `generateStructuredJson(...)` must rotate across available Gemini keys for invalid, expired, forbidden, blocked, quota, rate-limit, and transient availability errors.
- Expired/invalid Gemini keys must be benched through `key-cooldown.service` so the next Reading V2 Auto chunk can skip them.
- Error logs and docs may use masked key previews, env slot names, Cloud display names, or key resource IDs, but must never print raw API key strings.

Operational consequence:
- Reading V2 Auto should continue with another configured Gemini key when one configured key expires.
- A final Auto failure after this point means all available structured-generation keys failed or were unavailable, not just the first selected key.

Deployment evidence:
- May 13, 2026: committed as `c984e37` (`fix(ai): rotate structured gemini keys`).
- `cmd /c npm run deploy:hosting` built the app and released Firebase Hosting target `kahut1` for project `temp-a1437`.
- Hosting URL: `https://kahut1.web.app`.

## 2026-05-13 Amendment - Reading V2 Auto Answer-Key Binding

Reading V2 Auto answer-key binding now treats top-level `answerKeyText` as the effective Studio handoff field for copied answer-key rows.

Root-cause finding on May 13, 2026:
- Studio diagnostics showed `structured_json_payload_detected`, `answer_key_missing`, and `missing-scoring-response-shape` even though Gemini returned structured questions.
- The Auto service previously passed only local `extractedAnswerKeyText` into `createReadingV2ImportCandidateFromText(...)`.
- If local raw-text extraction missed a visible answer-key format, Gemini evidence was discarded and Studio received zero answer-key rows.

Required rules:
- Auto must preserve locally extracted rows plus Gemini-returned top-level `answerKeyText` rows.
- Gemini prompt contracts must ask for complete numbered answer-key rows in top-level `answerKeyText`, copied only from visible source answer-key text.
- `questions[].answer` from Gemini is not independently trusted. It may be converted into `answerKeyText` only when the raw source has a visible answer-key heading and no row carrier was otherwise produced.
- If the raw source has no visible answer-key section, Gemini answers are still stripped before Studio handoff.

Obsolete wording retired 2026-05-13:
- "extracted answer key" must not be read as "only rows detected by local preflight extraction." It now means effective trusted `answerKeyText` rows passed into Studio after the guarded merge.

Verification:
- `cmd /c npx vitest run src/services/reading-v2/readingV2AutoImport.service.test.ts src/services/reading-v2/readingV2AutoImportPrompt.test.ts src/services/reading-v2/readingV2ExternalAiPrompt.service.test.ts --reporter=basic` passed in `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- UTF-8 check passed for the touched code/test files.
- `git diff --check` passed.

## 2026-05-14 Amendment - Reading V2 Auto Source Ledger And Repair

Reading V2 Auto import now treats local source topology as the authority before trusting Gemini structure.

Required rules:
- build a redacted source ledger before Gemini runs, including strict passage boundaries, question ranges, visible question numbers, answer-key row numbers/hashes, reference-bank labels, and clipped-source issue codes
- send Gemini source-ledger expectations and require extraction evidence hints instead of canonical Reading V2 IDs
- verify Gemini output against the ledger before Studio handoff, including passage coverage, question coverage, answer-key binding, instruction semantics, option/reference banks, and structured-layout anchors
- retry only failing source ranges during bounded repair; preserve valid ranges and rerun full verification after repair
- fail closed in the modal when verifier errors remain and the draft is not safely reviewable
- carry only redacted Auto diagnostics into Studio candidates; never store raw prompt text, raw source text, raw answer-key text, or provider payloads in teacher diagnostics, student payloads, or session payloads

Obsolete wording retired 2026-05-14:
- answer-key binding alone must not be described as solving Auto import fidelity
- Gemini structured output must not be described as Studio-ready until local source-ledger verification and canonical validation pass

Operational consequence:
- a partial Gemini extraction that drops Q14-26 or Q27-40 must fail or repair before Studio opens
- invented extra passages/questions from loose instructional prose must fail before Studio opens
- accepted Auto drafts carry source/generated summaries and publish-blocking diagnostics when the content remains reviewable but incomplete

Durable companion:
- `documentation/architecture/reading-v2-auto-source-ledger-and-repair.md`

## 2026-04-10 Amendment - Question Extraction Resilience

The Reading creator now has a stricter stage-local recovery contract for the question extraction step.

Required rules:
- transient Gemini availability failures such as `503` or `high demand` MUST retry across the remaining Gemini keys before the system degrades to Groq
- Groq `413` or `request too large` failures during question extraction MUST be treated as prompt-budget failures, not key exhaustion
- when Groq hits an oversized question-extraction request, it MUST retry with a reduced output budget before rotating or benching any key
- offline fallback MUST recognize markdown-numbered IELTS question text such as `**35.**`, bulleted numbered items, and `Question 35.`

Operational consequence:
- a temporary Gemini spike should no longer force an immediate provider switch
- a large Groq question-extraction prompt should shrink and retry before the system concludes that provider capacity is exhausted
- pasted IELTS content that uses markdown numbering should remain recoverable by the offline parser instead of collapsing into a zero-question failure

## Related Docs

- `documentation/tasks/0020-prd-automated-ielts-reading-test-creation.md`
- `documentation/tasks/0022-prd-test-creation-modal-with-drafts.md`
- `documentation/ai-system-research-report.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`

## 2026-04-10 Amendment - Staged Parse Job Artifacts

The Reading creator now uses an explicit internal parse-job model inside `src/services/test-creation/index.ts` while preserving the existing modal-facing contract.

Current internal stages:
- normalized source
- extraction
- classification
- validation
- review draft assembly

Required rules:
- `parseDocument()` and `parseText()` MUST continue to return the existing teacher-facing contract: `documentText`, `passages`, `validationResult`, and fail-closed metadata
- internal stage artifacts MAY evolve, but they MUST preserve the canonical Reading question shape before any draft persistence boundary
- stage-local data MUST remain explicit enough for future resume, diagnostics, and provider-specific recovery work
- review payload assembly MUST happen before success is reported so passage/question completeness is checked in one place
- the modal and review page remain consumers of the final assembled draft payload, not of provider-specific intermediate results

Operational consequence:
- future parser work can add stage-local recovery, audit logging, or resumable artifacts without rewriting the teacher modal or review page contracts
- extraction, rules classification, validation, and review payload assembly are now separable boundaries instead of one opaque orchestration block

## 2026-04-12 Amendment - Legacy Chunking Config Retirement

The live teacher Reading creation path no longer treats chunking as part of the environment contract.

Required rules:
- the current reading creator MUST use the staged AI/offline extraction pipeline without reading `VITE_CHUNK_SIZE`, `VITE_CHUNK_OVERLAP`, or `VITE_MAX_DOCUMENT_SIZE`
- legacy chunking utilities MAY remain as isolated helpers, but they MUST carry their own internal defaults instead of extending the shared env schema
- parser or review work MUST NOT reintroduce chunking env variables unless a real runtime consumer is restored and documented first

Operational consequence:
- removing the chunking env keys from local setup should not change the current teacher Reading creation flow
- future parser cleanup can delete or refactor the legacy chunking services without touching the app-level env contract
