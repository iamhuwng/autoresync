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
  editor. Parser-created form headings and context lines survive editing and
  publication.
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

Published versions remain immutable. New source edits must not switch the
content or audio used by an existing assignment.

## Private homework reads

The student launch reads the assignment's `contentRef.version` through
`POST /listening-delivery/homework-document`. The Worker reuses the existing
homework delivery checks for membership, scheduling, the in-progress attempt,
the exact test/version, and retained asset references. It returns the same
student-safe projection used for publication. The runtime receives the whole
pinned document and does not reload the mutable current test over it.

This reads existing immutable versions for existing and future assignments;
it adds no snapshot database, migration or data backfill. Audio issuance
continues through the existing authorized delivery route.

Submission loads grading questions from the same authorized immutable version
through the separate homework-questions route. The display-document route
always strips answer keys. Existing client-side marking and result storage
remain in use; this repair does not establish trusted server-side scoring.
Homework saves use the existing student-private result-writer option. The
student cannot claim resolved teacher ownership from a client-side assignment
lookup; the existing trusted result authority owns that resolution.

## Deployment order

Deploy the Upload Worker with the strict question-field validation and both
authorized homework-read routes before deploying the frontend. The new
frontend depends on those routes. Deployment remains a separate release gate.

## Existing UI residue

`QuestionEditorPanel`, `BaseEditorLayout` and `EditTestFrame` still contain
Mantine internals. Their existing layout and controls are retained by this
bounded repair; replacing those shared panels would expand into Reading and
other authoring workflows. The touched `AudioResourceEditor` uses native HTML
and shared repository primitives. No new Mantine dependency or provider is
introduced.
