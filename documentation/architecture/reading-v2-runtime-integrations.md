# Reading V2 Runtime Integrations

Status: current runtime integration contract. Detailed history lives in
[`documentation/architecture/changelog/reading-v2-runtime-integrations.md`](changelog/reading-v2-runtime-integrations.md).

## Runtime Authority

Reading V2 student delivery launches from student-safe projections, not teacher
canonical material payloads.

Runtime integrations must preserve these boundaries:

- launch uses the assigned/public material id plus snapshot/version id
- student-safe projection contains no answer keys, teacher provenance, import
  evidence, or hidden review data
- trusted submit validates against server-side or trusted projection data
- result review uses review projection data under teacher/admin policy

## Scoring Authority

Trusted submission and local scoring use the same pure answer matcher and
review-answer formatting in
`src/services/reading-v2/readingV2AnswerScoring.ts`. This resolves option IDs
against the snapshot's option labels and applies the judgement vocabulary's
canonical aliases. Scalar answers and multi-select arrays retain their distinct
response shapes. Multi-select uses the snapshot's exact-set/order policy except
when `reviewLabel.answerSlotCount` preserves multiple numbered answer slots:
each correct selected answer earns one mark, independent of selection order.

Both result writers use `calculateIELTSReadingBandScore` from the shared scoring
configuration, with earned/possible points and an explicit zero-total guard.
The conversion uses Academic Reading thresholds; shorter practice tests scale
to 40 questions and produce an estimated band, not a certified exam score.
Neither path derives an IELTS band by dividing percentage by ten. Scoring still
uses trusted, pinned snapshots; this shared module does not expose answer keys
to student projections.

## Multiple-Answer Authoring

AutoV4, legacy Auto and external AI prompts preserve every raw answer number.
For one choose-two prompt, the first record holds the prompt and the second
is an empty continuation slot. Import normalization combines these into one
canonical interaction; a single source record with separately numbered key
rows is also supported. Manual authoring creates the same two-slot shape.

New editable revisions and publication repair unambiguous legacy duplicates.
Selected-passage tests create private repaired copies and atomically pin their
new snapshot references, so the aggregate projection and trusted constituent
grading agree. Existing source snapshots and pinned attempts remain immutable.

## Homework And Solo Practice

- Homework launch must bind the assignment/submission context and return path.
- Trusted homework submission loads the saved assignment and validates its ID
  and material binding. Result ownership comes from `homework.createdBy`, even
  when a different teacher owns the assigned public material.
- Teacher discovery writes `teacher_result_keys/{teacherId}/{resultId}: true`,
  matching the shared result reader and active Worker. Do not restore the older
  denormalized teacher-result index when rebuilding this service.
- Solo practice must not be treated as teacher-owned work.
- Retry/idempotent submit behavior may treat already-submitted homework as soft
  success only when the saved submission already exists and ownership matches.

## Anti-Cheat And Feedback

- Reading V2 anti-cheat state is runtime scoped and must not weaken legacy IELTS
  Reading, Listening, or Writing behavior.
- AI feedback payloads must use saved-result/review contracts and must not leak
  teacher-only source proof into student-safe payloads.

## Related Docs

- [`documentation/architecture/student-test-delivery-projections.md`](student-test-delivery-projections.md)
- [`documentation/architecture/homework-solo-practice-architecture.md`](homework-solo-practice-architecture.md)
- [`documentation/architecture/reading-v2-material-publish-and-passage-library.md`](reading-v2-material-publish-and-passage-library.md)
