# IELTS Listening Question Type Display Design

Status: Draft research for Listening V2
Last updated: 2026-05-13
Owner: IELTS Listening / Frontend Platform

## Purpose

Define Listening V2 task-type display standards before implementation.

This document mirrors the intent of:

- `documentation/samples/IELTS-question-task-type-samples.md`
- `documentation/samples/IELTS-reading-question-type-display-design.md`

It focuses on IELTS Listening only: task anatomy, recommended display mode, standard instruction text, answer control, source-data needs, and edge cases.

## Source Notes

Primary public reference:

- IELTS official Listening format page: Listening has four parts, 40 questions, answers follow recording order, recordings are heard once, and official question groups include multiple choice, matching, plan/map/diagram labelling, form/note/table/flow-chart/summary completion, sentence completion, and short-answer questions.
- IELTS official sample-test page: IELTS on computer uses the same Listening question types as IELTS on paper, including multiple choice, matching, plan/map/diagram labelling, form completion, note completion, table completion, flow-chart completion, summary completion, sentence completion, and short-answer questions.

Repo references:

- `src/services/listeningTestStorage.ts` supports `displayMode: 'text' | 'image'`, `audioSections`, `questionImages`, `questions[]`, `options`, `context`, and `acceptableAnswers`.
- `src/skills/listening/components/ListeningQuestionDisplay.tsx` currently renders text-mode completion groups with `InlineFormCompletion`, option/matching groups with an options box plus answer input, and map/diagram groups with images.
- `src/skills/listening/components/ListeningImageModeDisplay.tsx` and `src/components/test/mobile/MobileListeningImageCanvas.tsx` currently treat image mode as question-image display plus numbered answer inputs.
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md` is the active mobile audio/navigation contract.

Note: repo-wide `DESIGN.md` was required by `AGENTS.md`, but this worktree currently has no `DESIGN.md`. This document therefore uses local Listening/Reading sample docs and existing component contracts as the active design evidence.

## Global Listening V2 Principles

Listening is audio-first. The UI must help students read ahead, track current part, and answer without fighting audio controls.

Use a single-column default for text mode:

1. sticky header: timer, part, submit/menu
2. sticky audio row
3. part tabs
4. question content for current part
5. compact question navigator or answer sheet where needed

Use image mode when source material is a scanned/question-sheet image or when visual layout is too costly to reconstruct safely. Preserve `questionImages[]` with `sectionNumber` and `questionRange`; never collapse multiple images in one part into one image.

Use text mode when source can be parsed into stable structured content. Text mode gives better accessibility, keyboard use, responsive layout, and answer validation.

All text-entry task types must preserve word-limit instruction and validate over-limit locally without blocking entry before submit. Common word-limit variants:

- `ONE WORD ONLY`
- `ONE WORD AND/OR A NUMBER`
- `NO MORE THAN TWO WORDS AND/OR A NUMBER`
- `NO MORE THAN THREE WORDS AND/OR A NUMBER`

Answers should preserve student input, but scoring should normalize trim, case, repeated spaces, common punctuation spacing, and accepted alternatives. Do not autocorrect spelling; IELTS marking penalizes incorrect spelling/grammar.

## Canonical Type Set

| Canonical ID | IELTS label | Primary control | Preferred display | Image-mode fallback |
| --- | --- | --- | --- | --- |
| `listening-multiple-choice-single` | Multiple choice, one answer | radio cards | text mode | image + answer sheet with A/B/C field or radio overlay later |
| `listening-multiple-choice-multiple` | Multiple choice, multiple answers | checkbox cards with exact count | text mode | image + answer sheet with multi-letter field |
| `listening-matching` | Matching | dropdown per prompt | text mode | image + answer sheet with letter fields |
| `listening-map-plan-labelling` | Plan/map labelling | selectable letters or text inputs | hybrid visual text mode | image + answer sheet |
| `listening-diagram-labelling` | Diagram labelling | selectable letters or text inputs | hybrid visual text mode | image + answer sheet |
| `listening-form-completion` | Form completion | inline text inputs | text mode | image + answer sheet |
| `listening-note-completion` | Note completion | inline text inputs | text mode | image + answer sheet |
| `listening-table-completion` | Table completion | table-cell inputs | text mode | image + answer sheet |
| `listening-flowchart-completion` | Flow-chart completion | node inputs | text mode | image + answer sheet |
| `listening-summary-completion` | Summary completion | inline text inputs or dropdowns | text mode | image + answer sheet |
| `listening-sentence-completion` | Sentence completion | inline text inputs | text mode | image + answer sheet |
| `listening-short-answer` | Short-answer questions | text inputs | text mode | image + answer sheet |

## Shared Data Contract Proposal

Listening V2 should not rely only on flat `questions[]` plus heuristic type strings. Each task group should be first-class.

```ts
type ListeningV2TaskGroup = {
  id: string;
  partNumber: 1 | 2 | 3 | 4;
  questionRange: { start: number; end: number };
  type: ListeningV2TaskType;
  instruction: {
    prompt: string;
    constraint?: string;
    optionReuse?: 'allowed' | 'disallowed' | 'unknown';
    requiredSelectionCount?: number;
  };
  stimulus?: {
    title?: string;
    lines?: ListeningStructuredLine[];
    table?: ListeningTable;
    flowchart?: ListeningFlowchart;
    image?: ListeningVisualAsset;
    options?: ListeningOption[];
  };
  questions: ListeningV2Question[];
};
```

Minimum per-question shape:

```ts
type ListeningV2Question = {
  number: number;
  answerKind: 'text' | 'single-letter' | 'multi-letter' | 'choice' | 'mapping';
  prompt?: string;
  blankId?: string;
  optionIds?: string[];
  acceptedAnswers?: string[];
  wordLimit?: { maxWords?: number; allowNumber?: boolean };
};
```

## Display Standards By Type

### 1. Multiple Choice, One Answer

Task anatomy:

- A question or sentence stem.
- Usually three options in Listening (`A`, `B`, `C`), but imported materials may include four.
- Student chooses one letter.

Standard instruction:

```text
Choose the correct letter, A, B or C.
```

Recommended display:

- Question stem as plain text.
- Options as full-width radio cards.
- Keep answer letter visible before option text.
- No dropdown for primary mode; radio cards reduce tap errors on mobile.

Data needs:

- `options[]` with stable labels.
- `requiredSelectionCount: 1`.
- Preserve original option wording and letter labels.

Edge cases:

- Stem can be a sentence beginning; options are sentence endings.
- Options may be long and wrap across lines.
- Some source files include existing `A.` prefixes; parser must strip duplicate label for display but preserve canonical label.
- Do not assume exactly three options.
- Avoid image-mode-only MCQ if options are parseable; text MCQ gives better accessibility.

### 2. Multiple Choice, Multiple Answers

Task anatomy:

- One prompt, longer option list.
- Student chooses two or sometimes three letters.
- Usually one question range consumes multiple answer boxes.

Standard instruction:

```text
Choose TWO letters, A-E.
```

For three answers:

```text
Choose THREE letters, A-G.
```

Recommended display:

- Checkbox option cards.
- Fixed counter: `Selected 0/2`, `Selected 2/2`, `Selected 3/2 (too many)`.
- Store answers as ordered selected letters, but scoring should be order-insensitive unless source explicitly says otherwise.

Data needs:

- `requiredSelectionCount`.
- `options[]`.
- `questionNumbers[]` if one prompt maps to multiple answer numbers.

Edge cases:

- One prompt may cover `Questions 21 and 22`; data must map both numbers to one multi-select group.
- Do not duplicate full prompt as two separate single-answer MCQs.
- Student can choose too many during work; warn immediately but do not delete selections.
- Scoring must handle `A,C`, `C,A`, `A C`, and array forms consistently.

### 3. Matching

Task anatomy:

- List of prompts/items, often numbered.
- List of options, lettered.
- Student matches each numbered item to one option.
- Option reuse may be allowed or disallowed depending on instruction.

Standard instruction:

```text
What does each speaker say about each topic?
Choose the correct letter, A-E.
```

Generic fallback:

```text
Match each item with the correct option.
Choose the correct letter, A-E.
```

Recommended display:

- Sticky or nearby option bank.
- Each prompt row gets a dropdown or segmented letter chips.
- Use dropdown for large option banks; letter chips for five or fewer short options.
- Show reuse rule when known: `You may use any letter more than once.`

Data needs:

- `items[]` for prompts.
- `options[]` for answer bank.
- `optionReuse`.

Edge cases:

- Speaker matching may have names as rows and opinions as options.
- Topic matching may have places/courses/facilities as rows.
- IELTS can allow reused letters; Reading-style dedup must not be applied blindly.
- Parser must capture `NB You may use any letter more than once` when present.
- Source may use roman numerals rarely in imported non-official materials; canonical labels should support letters first, roman only when detected.

### 4. Plan / Map Labelling

Task anatomy:

- Visual plan/map.
- Labels on the visual are numbered blanks or named locations.
- Answers may be letters from a list or words from recording.

Standard instruction for letter selection:

```text
Label the map below.
Choose the correct letter, A-I.
```

Standard instruction for typed labels:

```text
Label the map below.
Write NO MORE THAN TWO WORDS for each answer.
```

Recommended display:

- Hybrid visual text mode when map asset is clean:
  - left/top visual map
  - right/below answer rows
  - optional visible option bank
- On mobile:
  - visual first with pinch zoom/pan
  - answer sheet below or slide-up sheet
  - image position must not hide labels
- If map coordinates are available, future overlay hotspots can be added. Initial V2 can keep answer rows separate.

Data needs:

- visual asset required unless source provides a reliable text-only diagram.
- `visualAnswerMode: 'letter-bank' | 'typed'`.
- optional hotspot metadata: `{ questionNumber, x, y, labelAnchor }`.

Edge cases:

- Map labels can be dense; overlay inputs can cover labels. Safer first build: image plus separate answer rows.
- North/south/left/right clues depend on visual orientation; image crop must preserve compass/entrances.
- Answer letters may refer to locations printed on map, not option bank text.
- Some tasks ask `Which building is ...?` with map letters already on image; store answer as letter.
- For image-only imports, OCR should not try to reconstruct map geometry unless confidence is high.

### 5. Diagram Labelling

Task anatomy:

- Visual diagram, equipment, process, or set of pictures.
- Student labels parts with words from recording or letters from a list.

Standard instruction for typed labels:

```text
Label the diagram below.
Write NO MORE THAN TWO WORDS for each answer.
```

Standard instruction for list labels:

```text
Label the diagram below.
Choose the correct letter, A-H.
```

Recommended display:

- Same visual shell as map/plan, but instruction copy says diagram.
- Prefer typed inline rows unless source clearly gives letters.
- Keep diagram image large; avoid shrinking to fit answer rows on small screens.

Data needs:

- visual asset.
- answer mode.
- question label positions if overlay is attempted.

Edge cases:

- Diagram labels may point to tiny parts; mobile needs zoom.
- Some diagrams contain multiple small pictures; image carousel may be better than one huge combined image if source pages split naturally.
- Typed answer limits vary; do not hardcode one word.
- Avoid converting arrows/labels to plain text if it loses spatial meaning.

### 6. Form Completion

Task anatomy:

- Structured form with fields like name, address, phone number, date, price.
- Common in Part 1.
- Answers are short factual words/numbers.

Standard instruction:

```text
Complete the form below.
Write ONE WORD AND/OR A NUMBER for each answer.
```

Recommended display:

- Form-like two-column field layout.
- Labels left, input right.
- Preserve grouping headings such as `Booking details` or `Customer information`.
- On mobile, stack label above input if label is long.

Data needs:

- structured lines with label/value/blank placement.
- `wordLimit`.
- accepted answer variants for numbers, phone numbers, dates if known.

Edge cases:

- Phone numbers may contain spaces; scoring should normalize spaces/hyphens where appropriate.
- Names and addresses need spelling exactness but may include capital/lowercase variants.
- Currency can be written with symbol or word depending source; accepted answers should include normalized variants when answer key allows.
- Email addresses are rare but need punctuation-preserving input.
- `ONE WORD AND/OR A NUMBER` permits answers like `21st` or `April`; schema must not reject mixed alphanumeric tokens.

### 7. Note Completion

Task anatomy:

- Notes with headings, bullets, indentation.
- Often used in Parts 2-4.
- Answers fill gaps inside note lines.

Standard instruction:

```text
Complete the notes below.
Write ONE WORD AND/OR A NUMBER for each answer.
```

Alternative common constraint:

```text
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```

Recommended display:

- Structured note block, not separate cards per question.
- Preserve heading hierarchy, bullet indentation, line breaks, and blank positions.
- Inputs inline with note lines.
- Avoid decorative card nesting; one unframed note surface or light bordered block is enough.

Data needs:

- `lines[]` with nested indentation.
- blank placement per line.
- `wordLimit`.

Edge cases:

- One line can contain multiple blanks.
- Some notes have colon labels (`Cost:`), bullets, or sub-bullets.
- Parser must keep blank number adjacent to input.
- Long note lines should wrap without separating label from blank.
- Some answers are numbers, measurements, or hyphenated compounds; word counting must follow IELTS-style rules.

### 8. Table Completion

Task anatomy:

- Table with row/column headers.
- Student fills missing cells.
- Used for comparisons: place, time, price, feature, problem, solution.

Standard instruction:

```text
Complete the table below.
Write ONE WORD AND/OR A NUMBER for each answer.
```

Alternative:

```text
Complete the table below.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```

Recommended display:

- Real semantic table on desktop/tablet.
- On phone:
  - keep table if 2-3 columns and labels short
  - otherwise transform each row into stacked key/value panels while preserving column headers
- Inputs inside blank cells.
- Do not render as separate unrelated questions.

Data needs:

- headers.
- rows.
- blank cell coordinates.
- optional merged cells.

Edge cases:

- Wide tables overflow on mobile; need horizontal scroll or stacked row cards.
- Merged header cells must survive import.
- Some cells include units outside blank (`$ ___`, `___ minutes`); unit text must stay outside input.
- Multiple blanks in one row/cell possible.
- Table answer order still follows recording order, but visual row order must remain source order.

### 9. Flow-chart Completion

Task anatomy:

- Sequence of steps connected by arrows.
- Student fills missing words in steps.
- Can be vertical, horizontal, or branching.

Standard instruction:

```text
Complete the flow-chart below.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```

Recommended display:

- Vertical flow on mobile by default.
- Desktop may use source orientation if simple.
- Each node is a compact step block with inline input.
- Arrows are structural connectors, not decorative icons.

Data needs:

- ordered nodes.
- edges/arrows.
- blank placement in node text.
- optional branch labels.

Edge cases:

- Branching flowcharts need explicit edge model; do not flatten into misleading sequence.
- Long process nodes wrap; arrow spacing must remain stable.
- OCR may confuse arrows with text; image fallback is acceptable when structure confidence is low.
- If flowchart is part of an image page, prefer image mode until a structured editor exists.

### 10. Summary Completion

Task anatomy:

- Paragraph summary with blanks.
- Answers may be typed words from recording or selected from a list.

Standard instruction for typed answers:

```text
Complete the summary below.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```

Standard instruction for list answers:

```text
Complete the summary below.
Choose the correct letter, A-H.
```

Recommended display:

- Flowing paragraph with inline inputs/dropdowns.
- If option list exists, show one shared option bank for the whole group.
- Do not split each blank into a separate card.

Data needs:

- summary text with blank markers.
- answer mode.
- option bank if list mode.
- reuse rule if list mode.

Edge cases:

- One paragraph may contain 5+ blanks; inputs must not break line height badly.
- List answers may not be reusable; do not apply dedup unless instruction says so or schema flags it.
- Summary can include title/subheading.
- If source uses one text block for all blanks, parser must keep group text as one object.

### 11. Sentence Completion

Task anatomy:

- Separate sentence prompts.
- Student completes each sentence with words from recording.

Standard instruction:

```text
Complete the sentences below.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```

Sometimes:

```text
Write ONE WORD ONLY for each answer.
```

Recommended display:

- One sentence per row.
- Inline input at blank position.
- If no blank marker is captured, show input at end but flag import warning.

Data needs:

- sentence text with blank placement.
- word limit.

Edge cases:

- Blank may be mid-sentence or end-of-sentence.
- Sentence may have grammatical clue after blank; input must stay inline to preserve clue.
- Some sources number the blank before sentence; display should normalize number beside input.
- Do not borrow Reading default `from the passage`; Listening source is recording/audio.

### 12. Short-answer Questions

Task anatomy:

- Direct questions.
- Student writes short answers from recording.
- Sometimes one question asks for two or three answers.

Standard instruction:

```text
Answer the questions below.
Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.
```

Recommended display:

- Prompt plus full-width text input.
- For multi-answer question, render separate numbered blanks if the answer sheet has multiple boxes.
- Keep word-limit counter per answer box.

Data needs:

- prompt.
- `answerSlots` count when question asks multiple answers.
- word limit.

Edge cases:

- One prompt can consume multiple answer numbers.
- Answers may be prices, times, dates, places, names.
- Question text can be long; avoid tiny inline input after long prompt on mobile.
- Scoring must accept alternative date/time formats only when answer key supports them.

## Image Mode Standard

Use image mode when:

- source is a real IELTS page image/PDF and visual reconstruction would risk distortion
- task is map/plan/diagram with no reliable coordinate data
- source contains complex tables/flowcharts with merged cells or branch geometry
- OCR/parser confidence is low

Image mode desktop:

- left: active question image
- right: answer panel for current part
- top: audio player stays sticky
- controls: zoom in/out/reset
- active image selected by `currentQuestionNumber` and `questionRange`

Image mode mobile:

- main area: active image canvas
- `Questions` FAB opens answer sheet below header/audio/part tabs
- image order pill uses flattened `questionImages[]`, e.g. `2/5`
- swipe can cross image and section boundaries; destination section audio must follow active image per active architecture contract

Important V2 gap:

- Current mobile image answer sheet uses plain text inputs for every question. Listening V2 should optionally use typed answer rows, letter fields, or multi-letter fields based on task group metadata, while preserving simple text fallback.

## Instruction Template Registry

Use these as canonical defaults. Parser/importer may preserve source-specific instruction if present and valid.

| Type | Prompt | Constraint |
| --- | --- | --- |
| multiple-choice-single | `Choose the correct letter, A, B or C.` | none |
| multiple-choice-multiple | `Choose TWO letters, A-E.` | `requiredSelectionCount=2` |
| matching | `Match each item with the correct option.` | `Choose the correct letter, A-E.` |
| map-labelling-letter | `Label the map below.` | `Choose the correct letter, A-I.` |
| map-labelling-text | `Label the map below.` | `Write NO MORE THAN TWO WORDS for each answer.` |
| plan-labelling-letter | `Label the plan below.` | `Choose the correct letter, A-I.` |
| diagram-labelling-text | `Label the diagram below.` | `Write NO MORE THAN TWO WORDS for each answer.` |
| form-completion | `Complete the form below.` | `Write ONE WORD AND/OR A NUMBER for each answer.` |
| note-completion | `Complete the notes below.` | `Write ONE WORD AND/OR A NUMBER for each answer.` |
| table-completion | `Complete the table below.` | `Write ONE WORD AND/OR A NUMBER for each answer.` |
| flowchart-completion | `Complete the flow-chart below.` | `Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.` |
| summary-completion | `Complete the summary below.` | `Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.` |
| sentence-completion | `Complete the sentences below.` | `Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.` |
| short-answer | `Answer the questions below.` | `Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.` |

## Parser And Import Gates

Listening V2 importer should block or flag before publish when:

- no audio section covers a question number
- question range does not stay inside part range
- multiple-choice group has no options
- multiple-select has no required selection count
- matching group has prompts but no option bank
- visual labelling group has no image or no letter/text answer mode
- completion group lost source layout: form rows, note hierarchy, table cells, or summary paragraph
- word-limit instruction is missing for typed-answer groups
- image mode has images without `questionRange`
- answers exist in teacher payload but are missing from student-safe projection checks

## Accessibility And Mobile Checklist

- Every answer control has accessible label with question number.
- Radio/checkbox options are keyboard reachable.
- Dropdowns announce option label and text.
- Inputs preserve autocomplete off and spellcheck off for exam mode.
- Word-limit warnings are text, not color only.
- Visual images include descriptive alt text: `Part 2 map for Questions 11-15`.
- Map/diagram image controls have reset zoom and do not trap vertical page scroll when not zoomed.
- Touch targets are at least 44px high for options and major controls.
- Text does not scale with viewport width.
- Long option labels wrap inside cards without layout shift.

## Open Decisions Before Build

1. Should Listening V2 support overlay hotspots for maps/diagrams in first release, or start with image plus answer rows?
2. Should image-mode answer sheet render task-specific controls, or remain text-input-only for V2 phase 1?
3. Should multiple-select store one combined array answer on group or separate answer numbers with shared group scoring?
4. Should V2 importer preserve exact source instruction text or normalize to registry templates after classification?
5. Should `completion` remain a broad legacy type, or should V2 require specific `form/note/table/summary/flowchart/sentence` IDs before publish?

## Recommended Build Order

1. Create Listening V2 taxonomy and instruction registry.
2. Add first-class task-group schema.
3. Build text-mode renderers for MCQ, multiple-select, matching, and text completions.
4. Build structured renderers for form/note/table/summary/sentence.
5. Keep visual labelling on image plus answer rows until coordinate model is stable.
6. Upgrade image answer sheet to task-aware controls.
7. Add importer gates and fixture coverage for every task type.
