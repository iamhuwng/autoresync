---
title: AI Test Extraction Prompt
createdAt: '2026-02-27T15:25:24.554Z'
updatedAt: '2026-02-27T15:25:25.855Z'
description: AI prompt templates for extracting test content from documents
tags:
  - ai
  - extraction
  - prompt
  - test-creation
---
# AI Test Extraction Prompt — PDF Images → Structured Text

> **Purpose**: Copy-paste this prompt into ChatGPT, Gemini, or Claude along with your test PDF/images.
> The output will be perfectly formatted text ready to paste into the THCS Test Editor's "Paste Text" feature.

---

## Usage Instructions

1. Open ChatGPT / Gemini / Claude
2. Upload your test PDF (or screenshots of each page)
3. Copy the entire prompt below and paste it BEFORE or AFTER the images
4. The AI will output clean, structured text you can paste directly into the editor

---

## THE PROMPT (copy everything below the line)

---

```
You are a Vietnamese THCS-THPT English test document extractor. I am providing images of a test paper. Extract ALL content into a STRICT TEXT FORMAT that a regex parser can process.

## OUTPUT FORMAT RULES (CRITICAL — follow EXACTLY)

### 1. METADATA HEADER (first 5 lines)
Write exactly these lines at the top, filling in values from the document:

TITLE: [Full test title, e.g., "ĐỀ KIỂM TRA GIỮA HỌC KÌ 1 — TIẾNG ANH 9"]
GRADE: [number only, e.g., 9 or 10]
DURATION: [number] minutes
EXAM TYPE: [one of: giữa kì, cuối kì, thi vào 10, ôn tập, or unit N]
TEST CODE: [mã đề if visible, otherwise omit this line]

### 2. SECTION HEADERS
Each section MUST start with a Roman numeral header on its own line:

I. [SECTION NAME IN UPPERCASE]
II. [SECTION NAME IN UPPERCASE]
III. [SECTION NAME IN UPPERCASE]

Use EXACTLY these section names based on the content type:

| Test Content | Section Name |
|---|---|
| MCQ grammar/vocabulary fill-the-blank | MULTIPLE CHOICE QUESTIONS |
| Pronunciation (underlined parts differ) | PRONUNCIATION |
| Word stress | WORD STRESS |
| Sentence transformation / closest meaning | SENTENCE TRANSFORMATION |
| Synonym (closest meaning to underlined word) | CLOSEST MEANING |
| Antonym (opposite meaning to underlined word) | OPPOSITE MEANING |
| Error identification/correction | ERROR CORRECTION |
| Reading comprehension with passage | READING COMPREHENSION |
| Reading cloze (fill blanks in passage) | READING CLOZE |
| Verb form supply | VERB FORM |
| Word form supply | WORD FORM |
| Sentence rewrite | SENTENCE REWRITING |
| Sentence arrangement | SENTENCE ARRANGEMENT |
| Dialogue / communication response | COMMUNICATION |
| Sign / notice interpretation | SIGNS AND NOTICES |

### 3. INSTRUCTION TEXT
Immediately after each section header, write the instruction text (italicized text in the original) on a new line. Write it as plain text, no markdown.

Example:
I. MULTIPLE CHOICE QUESTIONS
Mark the letter A, B, C or D on your answer sheet to indicate the correct answer to each of the following questions.

### 4. QUESTIONS FORMAT
Each question MUST follow this EXACT pattern:

Question [N]. [question text]
A. [option A text]
B. [option B text]
C. [option C text]
D. [option D text]

RULES:
- "Question" must be capitalized with a period and space after the number
- Each option on its OWN line, starting with "A. ", "B. ", "C. ", "D. "
- Blank spaces in sentence = use 6 underscores: ______
- Underlined words in question = wrap with double braces: {{word}}
- Do NOT add answer annotations to options (no asterisks, no "correct" markers)
- Keep all original Vietnamese diacritics exactly as shown
- One blank line between questions

### 5. PRONUNCIATION QUESTIONS (Special format)
For pronunciation questions where ONE word has different underlined pronunciation:

Question [N]. A. {{a}}ccept  B. {{e}}ducate  C. {{a}}chieve  D. {{a}}pply

Note: Wrap the UNDERLINED letters/syllables in {{double braces}}.
If options are single words on separate lines, use standard format:
Question 19. 
A. educ{{a}}te
B. perf{{e}}ction
C. prev{{e}}ntion
D. enc{{ou}}rage

### 6. ERROR CORRECTION QUESTIONS (Special format)
The question text should have underlined parts marked with {{double braces}}:

Question 24. He should {{study}} in a quiet place with {{light enough}} and a {{comfortable}} chair.
A. study
B. light enough
C. comfortable
D. quiet place

### 7. READING SECTIONS (Special format)
For reading comprehension, include the passage BEFORE the questions:

III. READING COMPREHENSION
Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer.

PASSAGE:
[Full passage text here, preserve paragraph breaks]

Question 27. What is the main idea of the passage?
A. ...
B. ...
C. ...
D. ...

### 7b. READING CLOZE (Special format)
For cloze reading (fill blanks in a passage with MCQ options), include the FULL passage with numbered blanks BEFORE the questions:

IX. READING CLOZE
Read the following passage and mark the letter A, B, C, or D to indicate the correct word for each blank.

PASSAGE:
Solar energy is a long-lasting source of energy which can be (36)______ almost anywhere in the world. It is the process of using sunlight to generate electricity or heat. To generate solar energy, we only need solar cells and the (37)______. Solar cells can easily be installed on house roofs, so we do not need to worry about finding space for them.

Question 36.
A. used
B. using
C. use
D. to use

Question 37.
A. moon
B. sun
C. stars
D. wind

### 8. FILL-IN / VERB FORM / WORD FORM (Non-MCQ sections)
For sections where students write answers (not MCQ), format as:

V. VERB FORM
Supply the correct form of the verbs in brackets.

Question 31. The children ______ (play) in the garden when it started to rain.
Question 32. This book ______ (write) by a famous author last year.

### 9. SENTENCE REWRITING
VI. SENTENCE REWRITING
Rewrite each sentence so that it has the same meaning, beginning with the given words.

Question 35. "Does she see her tutor every Thursday?" asked Thanh.
=> Thanh asked ...
Question 36. It is necessary to develop environmentally friendly buildings.
=> Developing ...

### 10. ANSWER KEY (CRITICAL — MUST INCLUDE)
The answer key MUST be the LAST section. Format with the header "ANSWER KEY" followed by one answer per line:

ANSWER KEY
1. B
2. C
3. D
4. C
5. D
6. C
7. C
8. B
9. C
10. B
11. C
12. A
13. A
14. D
15. D
16. C
17. B
18. D
19. D
20. D
21. C
22. B
23. C
24. B
25. A
26. D

Alternative compact format (also accepted):
ANSWER KEY
1.B  2.C  3.D  4.C  5.D  6.C  7.C  8.B  9.C  10.B

### 11. GENERAL RULES
- Do NOT add markdown formatting (no #, **, *, ---, |, etc.)
- Do NOT add your own commentary or explanations
- Do NOT skip or summarize questions — extract ALL questions VERBATIM
- Do NOT reorder questions — keep original numbering
- If a question spans multiple lines in the original, join it into one line
- If an option is cut off between pages, combine it into one complete option
- If an image/figure is referenced, write: [Figure: description of the image]
- Vietnamese characters must be preserved exactly with all diacritics
- Empty lines between sections are ok (the parser ignores them)
- If you see "Mã đề" (test code), only extract ONE variant (the first one)

### 12. COMPLETE EXAMPLE OUTPUT

TITLE: ĐỀ THI VÀO 10 THPT LÊ HỒNG PHONG 2025-2026
GRADE: 10
DURATION: 60 minutes
EXAM TYPE: thi vào 10
TEST CODE: 201

I. MULTIPLE CHOICE QUESTIONS
Mark the letter A, B, C or D on your answer sheet to indicate the correct answer to complete each of the following questions.

Question 1. We all wanted to ______ in the English Speaking Day activities.
A. take off
B. take part
C. take out
D. take over

Question 2. His doctor suggested not ______ too much juice because it is too sugary.
A. drank
B. to drink
C. drinking
D. is drinking

II. SENTENCE TRANSFORMATION
Mark the letter A, B, C, or D on your answer sheet to indicate the sentence that is closest in meaning to the original one.

Question 14. Developing environmentally friendly buildings is necessary.
A. It is necessary to be developing environmentally friendly buildings
B. It is necessary to developing environmentally friendly buildings
C. It is necessary to be developed environmentally friendly buildings
D. It is necessary to develop environmentally friendly buildings

III. OPPOSITE MEANING
Mark the letter A, B, C or D on your answer sheet to indicate the word(s) OPPOSITE in meaning to the underlined word(s).

Question 17. The waiters {{turned off}} the stoves before leaving the restaurant.
A. looked for
B. turned on
C. turned out
D. got over

IV. PRONUNCIATION
Mark the letter A, B, C or D on your answer sheet to indicate the word whose underlined part differs from the other three in pronunciation.

Question 19.
A. educ{{a}}te
B. perf{{e}}ction
C. prev{{e}}ntion
D. enc{{ou}}rage

V. ERROR CORRECTION
Mark the letter A, B, C, or D on your answer sheet to indicate the underlined part that needs correction.

Question 24. He should {{study}} in a quiet place with {{light enough}} and a {{comfortable}} chair.
A. study
B. light enough
C. comfortable
D. quiet place

ANSWER KEY
1. B
2. C
3. D
4. C
5. D
6. C
7. C
8. B
9. C
10. B
11. C
12. A
13. A
14. D
15. D
16. C
17. B
18. D
19. D
20. D
21. C
22. B
23. C
24. B
25. A
26. D

Now extract the test from the provided images following this EXACT format. Output ONLY the structured text, nothing else.
```
