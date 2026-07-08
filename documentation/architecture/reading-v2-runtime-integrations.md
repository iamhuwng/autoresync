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

## Homework And Solo Practice

- Homework launch must bind the assignment/submission context and return path.
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
