# Listening authoring and editing

Listening keeps its existing teacher editor and its own publication contract.
Reading V2 is a capability reference; its passage and task-group storage are
not Listening's document model. The shared boundary is defined in
[Reading V2 and Listening unification](ielts-reading-v2-listening-unification.md).

## Publication modes

- Image mode presents question images and answer fields to students. Teachers
  replace image files, adjust question ranges, and edit answer keys.
- Text mode presents numbered questions with interactive answer controls.
  Teachers edit prompts, choices, and answer keys in the existing question
  editor. The same native context editor in the maker and Materials Edit edits
  form headings, subheadings and context lines. Prompt edits synchronize their
  numbered context line across the shared form. Student delivery renders that
  form once, with each numbered blank bound to its own answer.
- The generic `+ Text` resource is a Reading passage, not the Listening text
  publication mode. Listening does not publish that passage resource.

## Question contract

Each native Listening question has a number, section, type, prompt, points and
canonical `answer`. Optional content includes string choices, question image,
form context, explanation, accepted answers, timer metadata and option labels.
The maker, editor adapter and strict backend validator must preserve the same
fields. Student publication removes answer keys, explanations and accepted
answers. Choice-bank labels and submitted matching values use the same label
helpers.

Per-question timer metadata does not introduce a Listening countdown; the
runtime continues to use the test duration.

Broad structured form/group authoring remains under construction. Generic
Reading structures such as passage groups, summary ASTs, grouped matching
items and separate `answers` maps cannot be silently converted or discarded.
An unsupported structure is rejected before the legacy first-edit transition
or a save. No question-number mapping is guessed.

## Audio and publication

The editor uses the existing owner-authorized upload session and asset grant.
It verifies the upload before replacing local resource state. Temporary upload
previews and signed committed-asset previews remain separate from canonical
audio references. Save stays blocked until every pending upload finishes.
While a save is pending, the editor blocks changes and dismissal until the
operation finishes.
Failed or cancelled replacement leaves the prior selection and publication
intact.

An unavailable original preview does not block the owner's editor. It produces
a shared warning and permits replacement. Ownership, conflict checks and the
backend asset-commit barrier still apply to save and publication.

Published text and answer keys remain immutable. A new homework attempt selects
the latest published text through trusted start and stores `listeningVersionId`;
started attempts keep that version. Existing started rows without the pin keep
their original assignment version. Solo/course resume stores a student-safe text
snapshot beside its existing browser progress; a fresh attempt loads current text.
Grading always reads the matching canonical server version.

The owner's October 28 storage decision supersedes historical audio retention:
replacement recordings apply everywhere, including older attempts and results.
After verified new publication and projections commit, old asset records retain
small replacement receipts. Delivery authorizes the original test/attempt first,
then resolves its section to verified current physical bytes. Issue, refresh and
already-issued content tokens use that resolver. Only then are the exact old
temporary and durable objects deleted, with retryable cleanup receipts. Earlier
attempts/results show a small recording-replacement note. No text hashes, grading
keys or historical results are rewritten. Ambiguous cross-test/section shared
assets fail closed rather than deleting another test's recording.

Publication finalizes each asset once before synchronizing the runtime and
catalog projections. Synchronization reuses that verification only for the
same immutable version; a newer concurrent version is verified separately.
An idempotent retry repairs projection failures after the version was committed.

## Private homework reads

The student launch reads its trusted attempt text version through
`POST /listening-delivery/homework-document`. The Worker reuses the existing
homework delivery checks for membership, scheduling, the in-progress attempt,
the exact test/version, and retained asset references. It returns the same
student-safe projection used for publication. The runtime receives the whole
pinned document and does not reload the mutable current text over it. Audio may
resolve to a replacement under the owner's heavy-file policy.

This reads existing immutable versions for existing and future assignments;
it adds no snapshot database, migration or data backfill. Audio issuance
continues through the existing authorized delivery route.

Submission sends typed answers to `POST /listening-delivery/submit`. The Worker
loads the authorized immutable version, grades with the shared pure matcher
and Listening band conversion, then persists the existing canonical result and
indexes. Browser totals, teacher ownership and answer keys are never grading
authority. The answer-key-bearing homework-questions route is removed.

Homework submission validates its assignment, student, schedule and version;
completion and statistics use Firestore update-time preconditions. Retrying the
same attempt repairs missing side effects without grading a second result.
Self-study requires a public active version; course delivery checks enrollment
and the actual material placement. Trusted result ownership drives teacher
discovery through the existing result authority and notification ports.

Live start first calls `POST /listening-delivery/live-pin` as the session owner.
The Worker binds a protected test/version/run marker and its safe session
payload before the teacher starts the timer. Student submission and teacher End
grade that pin; teacher End reads saved participant answers server-side. A
delayed completion cannot update a different run. Reload reads the saved result
instead of grading the student-safe payload. Browser rules reserve Listening
result totals, completion, protected projections and score indexes for trusted
writes while preserving answer autosave and teacher reset.

## Deployment order

Deploy the Upload Worker, reconcile existing Listening runtime projections to
the safe document, deploy both RTDB and Firestore rules, then deploy Hosting.
Use the functional release profile's postrules gate. Existing open clients must
reload after cutover; the old client cannot submit under the tightened rules.
A Hosting-only rollback to the old client does not restore submission. Release
and live acceptance remain separate from this implementation contract.

## Existing UI residue

`QuestionEditorPanel`, `BaseEditorLayout` and `EditTestFrame` still contain
Mantine internals. Their existing layout and controls are retained by this
bounded repair; replacing those shared panels would expand into Reading and
other authoring workflows. The touched `AudioResourceEditor` uses native HTML
and shared repository primitives. No new Mantine dependency or provider is
introduced.
