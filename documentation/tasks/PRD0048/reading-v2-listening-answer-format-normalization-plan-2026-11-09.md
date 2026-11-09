# Reading V2 and Listening answer-format normalization plan

Date: 2026-11-09
Status: Approved plan; report and recommendations consolidated; no implementation in this document
Branch: `codex/reading-student-runtime-review-impl`

## Purpose

Auto V4 must turn the raw answer key into the complete set of answers that the
test accepts before the data reaches Studio. Studio should receive a clean list
of accepted answers for every question. The raw answer-key row remains stored as
source evidence for review.

This work covers active Reading V2 and Listening. Legacy Reading is being
removed and is deliberately out of scope.

## Rules established by the IELTS research

The official IELTS guidance establishes these constraints:

- Completion and short-answer responses must use words or numbers from the
  passage or recording and must obey the stated word/number limit.
- Spelling matters. Capitalization does not.
- Hyphenated words count as one word.
- Reading short answers may use numbers as figures or words.
- Accepted alternatives are question-specific; IELTS does not provide a
  universal â€œremove punctuation and compare everythingâ€ rule.
- British and American spelling variants can both be accepted, for example
  `flavour` and `flavor`.

Sources:

- [IELTS Academic Reading format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading)
- [IELTS Academic Listening format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening)
- [British Council Listening guidance](https://takeielts.britishcouncil.org/prepare/ielts-academic/listening)
- [British Council spelling guidance](https://takeielts.britishcouncil.org/blog/british-or-american-english-ielts)

The Cambridge 18 Urban Farming answer materials provide the concrete cases
that exposed this gap: `1,000 kg` / `1000 kg` and `flavour` / `flavor`.

## Desired behavior

The AI must interpret each raw answer-key row and return every accepted form in
the format Studio already uses: `acceptableAnswers: string[]`.

Examples:

| Raw answer key | Studio accepted answers |
|---|---|
| `7. flavour / flavor` | `['flavour', 'flavor']` |
| `20. recognise / recognize` | `['recognise', 'recognize']` |
| `22. journey / trip` | `['journey', 'trip']` |
| `2. 1,000 kg` | `['1,000 kg', '1000 kg']` |
| `5. pesticides` | `['pesticides']` |
| `1/3` | `['one third', '1/3']` |

The AI must not invent forms that the test would reject:

- `1000kg` is not an automatic variant of `1000 kg`; the unit boundary is
  missing.
- `1.000` is not an automatic variant of `1,000`.
- `1,5` is not an automatic variant of `1.5`.
- A literal `km/h` must not be split into `km` and `h`.
- A literal compact token such as `A/B` must not be split unless the source
  context clearly identifies two alternatives.

A slash can therefore have two meanings. `flavour / flavor` expresses two
  alternatives, while `1/3`, `km/h`, and `A/B` can be literal answers. The AI
  must use the answer meaning and the question context, not a blind slash split.

## Grouped multiple-answer findings

Some IELTS multiple-choice tasks assign several numbered answer boxes to one
shared question. The numbers are separate scoring slots, but they draw from one
candidate pool. A student may use each candidate once in any order. For example,
if one shared prompt has three answer slots and the source key expresses the
same pool in several ways:

```text
8. A/B/C
9. a,b,c
10. a or b or c
```

the Studio scoring representation must be one grouped interaction with:

```json
{
  "questionRange": "8-10",
  "selectionLimit": 3,
  "answerSlotCount": 3,
  "acceptableAnswers": ["A", "B", "C"],
  "orderMatters": false,
  "maxScore": 3
}
```

`8=A, 9=B, 10=C`, `8=B, 9=C, 10=A`, and any other permutation receive full
credit. `8=A, 9=A, 10=C` receives two marks because `A` cannot be used twice.
The result view must still expand the grouped score into the individual
question numbers so the repeated answer is visibly attached to the incorrect
slot.

The current runtime scorer already has the required one-to-one matching and
partial-mark behavior in `src/services/reading-v2/readingV2AnswerScoring.ts`.
The student runtime submits an array for a multi-select interaction, and local
scoring plus trusted submission share that matcher. Existing tests cover
order-independent full credit and partial credit.

The current import path is the gap. `parseReadingV2AcceptedAnswerText()` only
has reliable explicit splitting for `|`; it intentionally preserves compact
tokens such as `A/B`, which is correct for ordinary completion answers but
wrong when the surrounding task is a shared multiple-answer group. Auto V4 also
lets a complete extracted raw key take precedence over the AI interpretation,
so raw expressions can reach Studio without becoming a candidate pool.

The normalizer must use task-group context before deciding what a separator
means:

- In a shared `multiple-select` group, split `/`, comma, and `or` only when the
  resulting tokens match the printed option labels. Merge the rows into one
  deduplicated candidate pool and normalize labels to the Studio option form.
- Outside that context, preserve literal values such as `1/3`, `km/h`, and
  `A/B` unless the source explicitly marks them as alternatives.
- Bind every numbered slot in the group. If an instruction says `8-11` but the
  key only supplies 8-10, or the slot count conflicts with `Choose THREE`, mark
  the import for teacher review instead of guessing or silently changing the
  range.
- Require the candidate pool, selection count, and answer-slot metadata to be
  internally consistent before publication.

## Current gap

Auto V4 currently gives the raw answer key priority when it appears complete:

```ts
const answerKeyText = extractedAnswerKeyIsComplete
  ? extractedAnswerKeyText
  : (copiedV4AnswerKeyText ?? extractedAnswerKeyText);
```

That means a complete raw row can bypass the AIâ€™s answer interpretation. The
current prompt also asks for a plain `answerKeyText` string, so the pipeline can
carry `flavour / flavor` forward as one literal answer instead of producing two
Studio alternatives.

## Proposed architecture

### 1. Keep two representations

For every answer-key row, retain:

- `rawAnswerText`: the exact source row, for evidence and teacher review.
- `acceptedAnswers`: the complete normalized list used by Studio and grading.

Raw text must never be used as the final scoring representation when the AI has
successfully interpreted the row.

### 2. Extend the Auto V4 answer result

Change the Auto V4 question/answer contract so each question can return a
structured answer record, conceptually:

```json
{
  "questionNumber": 7,
  "rawAnswerText": "flavour / flavor",
  "acceptedAnswers": ["flavour", "flavor"]
}
```

The AI should return the full accepted set even when the raw row contains only
one notation, such as `1/3`.

### 3. Validate and normalize locally

The application must still validate the AI result locally:

- trim and deduplicate answers;
- enforce question-number binding;
- enforce the response type and word limit;
- preserve literal slash tokens;
- reject malformed or contradictory variants;
- retain the raw row and emit a teacher-review diagnostic when interpretation
  is ambiguous.

The existing deterministic parser remains useful as a validator and fallback
for explicit syntax such as `A|B`, parenthesized optional words, and clearly
spaced alternatives. It must not replace the AIâ€™s semantic expansion.

### 4. Build the Studio document from accepted answers

`normalizeReadingV2ImportCandidate` should consume the structured accepted list
when it builds `scoringRule.acceptableAnswers`. Studio answer editors should
show the separate values, not the raw slash expression. The source evidence
panel can continue to show the original row.

### 5. Share the scoring contract

Reading V2 trusted submission and Listening trusted submission must use the same
answer-format policy for:

- number grouping and number-word variants;
- unit spacing and unit preservation;
- spelling variants supplied by the answer key;
- literal versus alternative slash handling;
- word-limit counting.

Legacy Reading is excluded from this shared change.

### 6. Grouped multiple-answer contract

Add explicit group metadata to the Auto V4-to-Studio adapter rather than
encoding shared-pool meaning in a flat answer string:

- `questionRange` identifies every numbered answer slot owned by the prompt.
- `selectionLimit` records how many distinct options the student must choose.
- `answerSlotCount` records how many numbered boxes receive one mark each.
- `acceptableAnswers` is the deduplicated candidate pool shared by all slots.
- `orderMatters: false` makes permutations equivalent.

The AI should return the normalized candidate pool for the group even when each
raw row repeats the pool in a different notation. Raw rows remain source
evidence. A group with duplicate, missing, non-option, or contradictory
candidate data must produce a diagnostic and remain editable for teacher review.

## Implementation phases

1. **Contract and fixtures**
   - Add the structured Auto V4 accepted-answer result shape.
   - Add raw fixtures covering the examples above and ambiguous slash literals.
   - Document which values are source evidence and which values are scoring data.

2. **Auto V4 prompt and adapter**
   - Update the AI instructions to return all accepted forms, not only copied
     `answerKeyText`.
   - Prefer structured AI answers over raw complete-key text.
   - Preserve raw rows separately.
   - Add diagnostics when AI output is missing, contradictory, or ambiguous.

3. **Import-to-Studio normalization**
   - Convert structured accepted answers into `acceptableAnswers`.
   - Keep explicit parser behavior for bars, optional words, and safe literals.
   - Ensure Studio editors receive separate alternatives.
   - Add context-aware grouped multiple-answer normalization for slash, comma,
     and `or` forms; never apply that splitting globally.
   - Merge repeated per-number candidate rows into one distinct candidate pool
     while preserving every numbered slot and its raw source row.

4. **Shared grading policy**
   - Apply the same restricted numeric and spelling policy to Reading V2 and
     Listening scoring authorities.
   - Keep `1000kg` incorrect unless the answer key explicitly includes it.
   - Keep decimal punctuation distinctions and literal units intact.

5. **Snapshot and result handling**
   - Ensure new publications store normalized accepted lists.
   - Identify already-published snapshots that stored slash expressions as one
     literal answer and provide a controlled republish/rescore path.
   - Do not silently change historical results without an explicit rescore.

## Verification matrix

### Auto V4 and Studio

- `flavour / flavor` becomes two accepted answers.
- `recognise / recognize` becomes two accepted answers.
- `journey / trip` becomes two accepted answers.
- `1/3` becomes `one third` and `1/3`.
- `1,000 kg` becomes `1,000 kg` and `1000 kg`.
- `km/h` remains one literal answer.
- `A/B` remains one literal answer unless the source explicitly identifies
  alternatives.
- A shared multiple-select group with rows such as `A/B/C`, `a,b,c`, and
  `a or b or c` becomes one candidate pool `['A', 'B', 'C']`.
- Every permutation of the candidate pool across the numbered slots receives
  full credit.
- Reusing one candidate in two slots receives only the marks for the distinct
  matches; the duplicate slot is incorrect.
- A missing row, extra row, range mismatch, or candidate outside the printed
  option bank is flagged for teacher review.
- Duplicate answer rows remain bound by question number and do not duplicate
  values.
- Raw answer rows remain available as evidence.

### Scoring

- Every value in the Studio accepted list earns credit.
- Capitalization differences do not affect credit.
- Spelling variants only earn credit when supplied or generated under the
  accepted-answer policy.
- `1000 kg` and `1,000 kg` match.
- `1000kg` does not match unless explicitly authored as accepted.
- `1,000` does not match `1.000`.
- `1.5` does not match `1,5`.
- Unit text cannot be silently dropped.
- Word limits remain strict.
- Grouped multiple-answer scoring is one-to-one: each selected candidate can
  satisfy at most one numbered slot.

### End-to-end paths

- Auto V4 raw input â†’ AI structured answers â†’ Studio â†’ published snapshot â†’
  Reading V2 trusted submission.
- Listening authoring answer key â†’ student-safe publication â†’ Listening trusted
  submission.
- Result review displays the normalized accepted answers clearly.

## Risks and safeguards

- **AI over-generation:** require source/context evidence and local validation;
  block or flag uncertain rows instead of silently accepting them.
- **Slash ambiguity:** classify literal fractions, units, and compact tokens
  before treating slash as an alternative separator.
- **Grouped-key ambiguity:** only split slash/comma/`or` forms when group
  context and the printed option bank prove they are answer alternatives.
- **Topology mismatch:** block or flag missing slots and selection-count
  conflicts; never repair a questionable question range by inference.
- **Published data already affected:** republish or explicitly rescore; do not
  mutate historical results invisibly.
- **Engine drift:** keep Reading V2 and Listening on one tested format policy;
  do not modify legacy Reading.
