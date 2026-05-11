# Reading V2 TaskGroup Object

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`

`TaskGroup` is the canonical grouped unit of Reading behavior.

If a junior does not understand `TaskGroup`, they must stop implementation and read this file before writing any authoring or runtime code.

---

## 1. Plain-Language Definition

A `TaskGroup` is one coherent Reading exercise that students experience as one grouped block.

It combines:

- shared instruction
- shared answer rule
- one official task type
- one engineering family
- one ordered set of interactions
- explicit links to the shared stimulus or anchors those interactions depend on

It is not:

- a whole test
- a whole passage asset
- one individual scored answer slot
- a freeform box of arbitrary question cards

---

## 2. Visual Schema

Use this mental model when building the object:

```text
+----------------------------------------------------------------------------------+
| TaskGroup                                                                        |
+----------------------------------------------------------------------------------+
| Identity                                                                         |
| - taskGroupId                                                                    |
| - officialTaskType                                                               |
| - engineeringFamily                                                              |
| - sectionId                                                                      |
+----------------------------------------------------------------------------------+
| Shared Meaning                                                                   |
| - group title or label                                                           |
| - instructions                                                                   |
| - answer rule                                                                    |
| - local layout hint                                                              |
+----------------------------------------------------------------------------------+
| Stimulus Linkage                                                                 |
| - primary stimulus refs                                                          |
| - anchor refs                                                                    |
| - option-set refs if needed                                                      |
+----------------------------------------------------------------------------------+
| Ordered Interactions                                                             |
| - interaction 1                                                                  |
| - interaction 2                                                                  |
| - interaction 3                                                                  |
| - ...                                                                            |
+----------------------------------------------------------------------------------+
| Derived Behavior                                                                 |
| - visible question range                                                         |
| - mobile family contract                                                         |
| - preview/runtime render contract                                                |
| - review grouping                                                                |
+----------------------------------------------------------------------------------+
| Validation                                                                       |
| - unresolved placeholders                                                        |
| - orphan anchors                                                                 |
| - missing scoring shape                                                          |
| - import uncertainty                                                             |
+----------------------------------------------------------------------------------+
```

---

## 3. What TaskGroup Owns

`TaskGroup` owns:

- grouped Reading meaning
- official task type
- engineering family
- grouped instruction block(s)
- answer-rule block
- ordered interaction membership
- references to relevant stimuli and anchors
- local task-specific layout hints
- grouped validation state

`TaskGroup` does not own:

- global document metadata
- passage asset lifecycle
- student-safe payload rows
- session-safe payload rows
- saved results
- scoring history after submission

---

## 4. Required Conceptual Fields

This is a conceptual field matrix, not a TypeScript contract.

| Concept | Required | Meaning | Notes |
|---|---|---|---|
| `taskGroupId` | yes | stable identity | never reused for another semantic group |
| `sectionId` | yes | owning section | group order is section-scoped |
| `officialTaskType` | yes | canonical slug from taxonomy index | must be one of the 16 official slugs |
| `engineeringFamily` | yes | V2 family | must match the taxonomy index |
| `groupTitle` | optional | teacher-facing or student-facing local label | often omitted for IELTS-style groups |
| `instructionBlocks` | yes | shared instructions for the group | may contain formatted text |
| `answerRule` | yes | answer vocabulary and constraints | word limit, option label format, selection limit, reuse rule |
| `stimulusRefs` | yes | shared content dependencies | references stimulus nodes and optional anchors |
| `optionSetRefs` | conditional | visible choices or banks | required for choice and some matching groups |
| `interactionIds` | yes | ordered scored answer slots | one interaction belongs to exactly one group |
| `layoutHint` | conditional | render hint for grouped presentation | must not override system-owned layout rules |
| `validationState` | yes | grouped publish readiness | errors block publish |
| `importEvidenceRefs` | conditional | evidence from AI import | required when the group came from import |

---

## 5. Ownership Rules

### 5.1 Identity Rule

`taskGroupId` is stable during:

- reorder
- renumber
- copy within the same draft revision path
- teacher edits that keep the same semantic group

`taskGroupId` changes when:

- the group is extracted into a separate material
- the group is duplicated into a new independent unit
- the source group is intentionally replaced by a new semantic group

### 5.2 Interaction Rule

One interaction belongs to exactly one task group.

Forbidden:

- one scored interaction referenced by multiple task groups
- one task group depending on another group's scoring shape

### 5.3 Stimulus Rule

One stimulus may support multiple task groups.

Allowed:

- one passage supporting multiple groups in one section
- one passage asset version reused across multiple materials

Forbidden:

- using passage duplication as the default way to express shared context

### 5.4 Anchor Rule

Anchors belong to stimuli, not task groups.

Task groups only reference the anchors they need.

---

## 6. Numbering Law

`TaskGroup` does not store visible IELTS numbers as immutable truth.

It owns:

- ordered interaction membership
- local interaction order

The system derives:

- visible question range
- final displayed number labels

Rules:

1. Reorder within a group changes displayed numbering, not identity.
2. Reorder of whole groups changes displayed numbering, not identity.
3. Draft placeholders remain unnumbered.
4. Unnumbered placeholders block publish.

Example:

```text
TaskGroup A
- interactionId: i-1
- interactionId: i-2
- interactionId: i-3

Standalone material view:
- Q1, Q2, Q3

Full test assembly view:
- Q14, Q15, Q16
```

The group stayed the same. Only numbering context changed.

---

## 7. AnswerRule Responsibilities

Every `TaskGroup` must carry an explicit `answerRule` concept.

At minimum it must answer:

- how students respond
- what limits apply
- what option vocabulary applies
- whether options may be reused
- whether order matters
- whether casing or punctuation matters in scoring

Examples:

- sentence completion: `wordLimit: 2`
- summary from list: `selectionMode: single-choice-from-bank`
- matching features: `optionReuse: allowed`
- matching sentence endings: `optionReuse: disallowed`
- binary judgement: `judgementVocabulary: TFNG` or `YNNG`

Forbidden:

- inferring answer rule from renderer label text
- burying answer-rule logic inside interaction components only

---

## 8. Family-Specific Shape Expectations

### 8.1 Completion Family

Expected:

- free-text interactions
- grouped blanks or direct prompts
- shared word-limit rule when relevant

### 8.2 Choice Family

Expected:

- visible option bank
- selection limits
- often no anchor dependency except prompt positions

### 8.3 Binary-Judgement Family

Expected:

- locked judgement vocabulary
- one selected state per interaction
- strong instruction visibility

### 8.4 Matching Family

Expected:

- one option or reference set
- one target set
- explicit option reuse law

### 8.5 Structured-Layout Family

Expected:

- explicit anchors
- explicit shell structure such as table, flowchart, or diagram
- mobile fallback contract

---

## 9. Import, Review, And Publish Lifecycle

### 9.1 Manual Creation

Teacher creates:

- instructions
- answer rule
- stimulus links
- interactions

The group is born in a valid or incomplete draft state.

### 9.2 AI Import

Importer may create the group with:

- tentative type classification
- import evidence
- confidence markers
- unresolved issues

Import must never silently force the group into a false-valid state.

### 9.3 Draft Review

Teacher may:

- confirm type
- fix instructions
- repair anchors
- add or remove interactions
- replace unsupported structures

### 9.4 Publish

Publish is allowed only if:

- all required interactions exist
- anchors are resolvable
- answer rule is explicit
- numbering derives cleanly
- group-level validation has zero errors

---

## 10. Extraction And Reuse Behavior

When a teacher extracts `passage + task group` into a new material:

- create new group identity
- keep hidden provenance metadata
- preserve official task type and family unless the teacher intentionally changes them
- preserve interaction order semantics
- rebase visible numbering in the new material

If the teacher materially rewrites the extracted content, that new material may diverge fully from the source. Provenance stays historical only.

---

## 11. Result And Review Expectations

Every saved result must be able to point back to the originating `TaskGroup` semantics.

Minimum result linkage:

- `taskGroupId`
- `interactionId`
- `officialTaskType`
- `engineeringFamily`
- `displayNumber`

Teacher review defaults to task-group-first because `TaskGroup` is the semantic truth of grouped Reading behavior.

Flat-number review is utility navigation, not the semantic origin.

---

## 12. Edge Cases And Preventive Rules

### 12.1 One Passage, Many Groups

Allowed.

Preventive rule:

- never duplicate the passage just to make group ownership easier

### 12.2 One Group, Mixed Families

Forbidden in phase 1.

If a source chunk looks mixed, split it into multiple task groups.

### 12.3 Anchor Deleted After Interactions Exist

Publish-blocking error until:

- anchor is restored
- interaction is retargeted
- interaction is removed

### 12.4 Teacher Changes Type Mid-Draft

Allowed only if the current interaction and answer-rule shape can still support the new type safely.

If not, the studio must require a controlled conversion or a rebuild.

### 12.5 Reusing Options Across Wrong Boundaries

Forbidden:

- one shared option bank behaving like shared scored interactions across separate groups

Allowed:

- one option bank reused inside one matching or choice task group

---

## 13. Junior Implementation Checklist

Before implementing any Reading runtime or editor behavior against a `TaskGroup`, verify all of the following:

1. I know the official task type.
2. I know the engineering family.
3. I know the answer rule.
4. I know the ordered interaction set.
5. I know the linked stimuli and anchors.
6. I am not using visible numbering as the identity.
7. I am not using a projection object as the source of truth.
8. I am not flattening structured-layout groups into sentence-like fallbacks.

If any answer is "no", stop and repair the model first.
