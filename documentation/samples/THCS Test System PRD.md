# Chat Conversation

Note: _This is purely the output of the chat conversation and does not contain any raw data, codebase snippets, etc. used to generate the output._

### User Input

-We are going to make a new flow for a new test type. This will be for test for THCS and THPT, we have place holder button for this in create test button in Materials tab in Teacher Lobby already.
- We need to build a test making process for teacher, test taking interface for student, grading system, connection for homework, deadline, materials, course, notification, library.
- Instead of only having one process of using text converting to code to make a test, this time, I want to build an actual test making editor. Meaning we will choose the task type, then the representation of the task type (format of how it will look in the test taking interface but with field to fill input in) will appear and we can design a test how we like from the editor. There would also be an option to text convert like ielts reading and listening test.
- use @[documentation/legacy-exercise-types-reference.md]for task type layout and design
- MUST USE @[documentation/tasks/create-prd.md]

### Planner Response

I'll start by reading the required files to understand the PRD creation process and the legacy exercise types. Let me gather all the necessary context first.

*Viewed [create-prd.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/create-prd.md) *

*Viewed [legacy-exercise-types-reference.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/legacy-exercise-types-reference.md) *

### Planner Response

Let me also check the existing project structure and relevant knowledge items.

*Listed directory [tasks](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks) *

*Listed directory [pages](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages) *

*Grep searched codebase*

*Grep searched codebase*

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

Now let me look at the existing test creation flow and the TestCreationModal to understand the current state:

*Viewed [TestCreationModal.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/test-creation/TestCreationModal.tsx) *

*Viewed [TestTypeSelectionModal.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/TestTypeSelectionModal.tsx) *

### Planner Response

Now let me check the existing test flow for context — how does the current IELTS flow work (student test page, grading, etc.):

*Analyzed [StudentTestPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentTestPage.tsx) *

*Analyzed [CreateTestPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/CreateTestPage.tsx) *

*Analyzed [TestCreationPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TestCreationPage.tsx) *

### Planner Response

Let me now check how homework, materials, and grading currently works:

*Listed directory [services](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services) *

*Listed directory [types](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types) *

### Planner Response

Now let me check the relevant conversation about documenting the legacy test project for additional context:

*Viewed [draft.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/draft.types.ts) *

*Analyzed [homework.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/homework.types.ts) *

*Analyzed [autoMarking.service.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/autoMarking.service.ts) *

### Planner Response

I now have a comprehensive understanding of the project. Let me now create the conversation log and begin the PRD process as instructed.

🤖 **Applying knowledge of `@project-planner`...**

Following the PRD creation process from [documentation/tasks/create-prd.md](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/create-prd.md:0:0-0:0), I need to **ask clarifying questions first** before writing the PRD. Let me start with the conversation log and then present my questions.

*Edited relevant file*

### Planner Response

Now, following the PRD process — here are my **clarifying questions** before generating the document:

---

## 🛑 Clarifying Questions — THCS-THPT Test System

I've reviewed the existing codebase, the legacy exercise types reference, and the current test creation flow. Before writing the PRD, I need to understand several key areas. **Please respond with the letter/number selections or brief answers:**

---

### 1. **Test Editor — Task Types to Support**

The legacy reference documents **11 exercise types**. Which should be available in the THCS-THPT visual editor?

| # | Type | Description |
|---|------|-------------|
| 1 | `mcq-standard` | Standard multiple choice (2×2 grid) |
| 2 | `mcq-underline` | Error identification (horizontal pills) |
| 3 | `mcq-buttons` | Binary choice (N-button, e.g., too/either) |
| 4 | Reading Comprehension | Two-column layout: passage + questions |
| 5 | `blank-in-text` | Fill-in-the-blank inline inputs |
| 6 | `dropdown-in-text` | Inline dropdown with word bank |
| 7 | `writing` | Standard textarea (sentence rewriting) |
| 8 | `writing-letter` | Long textarea (essays, letters) |
| 9 | `writing-inline` | Auto-expanding inline input in sentence |
| 10 | `fill-in-text` | Single correction input |
| 11 | Listening dictation | Main blank + sub-questions |

**Options:**
- a) All 11 types
- b) All except Listening dictation (#11) — handle listening as a separate skill type
- c) A subset (specify which)
- d) All 11 + additional new types I should add (specify)

---

### 2. **Visual Editor — Workflow**

You mentioned building an "actual test making editor" with task type representations. How should it work?

- a) **Block-based editor**: Teacher adds question blocks one by one, each block renders as a live preview of how it will look in the test taking interface with editable fields
- b) **Form-based editor**: Teacher fills out a form per question (type, prompt, options, answer key) with a side-by-side preview panel
- c) **Hybrid**: Drag-and-drop blocks with inline editing + optional preview toggle
- d) Something else (describe)

---

### 3. **Text Convert Option**

You mentioned there should also be a "text convert like IELTS reading and listening test." How should this complement the visual editor?

- a) Two separate entry points: "Create from Text" vs "Create with Editor" — chosen at the start
- b) One unified flow: Start with editor, with an "Import from Text" button to parse and populate the editor
- c) Both options available at any point during creation

---

### 4. **Grading System**

Currently we have [autoMarking.service.ts](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/autoMarking.service.ts:0:0-0:0) for IELTS question types. For THCS-THPT:

- a) **Fully automatic grading**: Auto-mark all objective questions (MCQ, fill-in, dropdown). Teacher manually grades writing/essay
- b) **Teacher manual grading**: Teacher sees student submissions and grades them manually with score + feedback
- c) **Hybrid**: Auto-grade objective types + manual grading panel for writing types, with teacher able to override auto-grades
- d) Same as (c) but add AI-assisted grading suggestions for writing

---

### 5. **Test Structure — Sections/Parts**

A typical Vietnamese THCS-THPT test has structured sections (e.g., "Phần I: Trắc nghiệm", "Phần II: Đọc hiểu", "Phần III: Viết"). Should the editor support:

- a) **Sectioned test**: Teacher can create named sections/parts, each containing question blocks with per-section instructions
- b) **Flat list**: Just a sequential list of questions (simpler)
- c) Let the teacher decide: optional section grouping

---

### 6. **Test & Live Session Connection**

How should the THCS-THPT test connect to the live session system?

- a) **Homework only**: Tests are assigned as homework (async, with deadline) — no live session
- b) **Session + Homework**: Can be used both in live classroom sessions AND as homework, like IELTS tests
- c) **Homework + Timed exam mode**: Homework + a new "exam mode" where teacher monitors students taking the test in real-time (but no interactive quiz features)

---

### 7. **Scoring & Results Display**

- a) **Points-based**: Each question has configurable point value (default 1), total points calculated
- b) **Vietnamese 10-scale**: Convert raw score to 10-point scale (standard in Vietnamese education)
- c) **Both**: Points-based with automatic conversion to 10-scale display
- d) **Configurable**: Teacher chooses between point-based, 10-scale, percentage, or custom

---

### 8. **Library Integration**

The Materials tab has a test library. For THCS-THPT tests:

- a) Same library system as IELTS (public library + my content), THCS-THPT tests filtered by new type tag
- b) Separate library section specifically for THCS-THPT
- c) Same system but with additional categorization (grade level: 6-12, subject filter, etc.)

---

### 9. **Scope — What Should This PRD NOT Include?**

Which of these are **out of scope** for this PRD?

- a) AI-powered question generation (auto-create questions from passage)
- b) Question bank / question pool management (reusable questions across tests)
- c) Print-to-paper exam support (PDF export)
- d) Student collaboration / group tests
- e) None — include everything above

---

### 10. **Priority / MVP Scope**

Given the scope is large, should the PRD cover:

- a) **Full system** in one PRD (everything: editor, test-taking, grading, integrations)
- b) **Phased PRDs**: Phase 1 = Editor + Data Model, Phase 2 = Student Test-Taking + Grading, Phase 3 = Integrations
- c) **MVP first**: Minimal editor (MCQ + fill-in + writing) + test-taking + basic auto-grade, then iterate

---

Please respond with your selections and I'll generate a comprehensive PRD based on your answers! 📝

### User Input

1. Agree to defer Listening Dictation, Research the samples in @[c:\Users\Sanctuary\Desktop\Homework App\kahoot\documentation\samples\THCS] to identify task types, design suitable layout for each of them, categorize and seperate logically; redesign or add if necessary | 2.c | 3.a | 4. d | 5. c | 6. b (build full interaction to other features just like IELTS test) | 7. c | 8. b | 9. a, c and d | 10. b | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 


### Planner Response

Let me research the THCS samples first to understand the actual task types used in Vietnamese middle school tests.

*Listed directory [THCS](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS) *

*Listed directory [samples](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples) *

*Listed directory [2026 - De Tu do 1](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201) *

*Listed directory [2026 - Lam Son Thanh Hoa 1](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Lam%20Son%20Thanh%20Hoa%201) *

*Listed directory [2026 - Le Hong Phong 1](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Le%20Hong%20Phong%201) *

*Listed directory [2026 - Phu Tho 1](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Phu%20Tho%201) *

### Planner Response

Now let me view the actual test images to identify all task types:

*Viewed [1.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/1.jpg) *

*Viewed [2.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/2.jpg) *

*Viewed [3.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/3.jpg) *

*Viewed [4.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/4.jpg) *

*Viewed [5.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/5.jpg) *

*Viewed [6.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/6.jpg) *

*Viewed [7.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/7.jpg) *

*Viewed [8.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20De%20Tu%20do%201/8.jpg) *

### Planner Response

Now let me view the other test samples to get a broader picture:

*Viewed [1.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Lam%20Son%20Thanh%20Hoa%201/1.jpg) *

*Viewed [2.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Lam%20Son%20Thanh%20Hoa%201/2.jpg) *

*Viewed [3.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Lam%20Son%20Thanh%20Hoa%201/3.jpg) *

*Viewed [4.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Lam%20Son%20Thanh%20Hoa%201/4.jpg) *

*Viewed [5.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Lam%20Son%20Thanh%20Hoa%201/5.jpg) *

*Viewed [1.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Le%20Hong%20Phong%201/1.jpg) *

*Viewed [2.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Le%20Hong%20Phong%201/2.jpg) *

*Viewed [3.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Le%20Hong%20Phong%201/3.jpg) *

*Viewed [4.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Le%20Hong%20Phong%201/4.jpg) *

*Viewed [5.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Le%20Hong%20Phong%201/5.jpg) *

### Planner Response

Now let me view the Phu Tho sample for even more variety:

*Viewed [1.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Phu%20Tho%201/1.jpg) *

*Viewed [2.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Phu%20Tho%201/2.jpg) *

*Viewed [3.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Phu%20Tho%201/3.jpg) *

*Viewed [4.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Phu%20Tho%201/4.jpg) *

*Viewed [5.jpg](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/samples/THCS/2026%20-%20Phu%20Tho%201/5.jpg) *

### Planner Response

Excellent! I've now thoroughly analyzed all 4 sample tests. Let me update the conversation log and then present my comprehensive analysis and follow-up questions.

*Edited relevant file*

### Planner Response

---

## 📊 THCS-THPT Sample Analysis — Complete Task Type Taxonomy

After analyzing all 4 real exam papers (Đề Tự do, Lam Sơn Thanh Hóa, Lê Hồng Phong, Phú Thọ), here is my complete categorization of task types found in Vietnamese THCS-THPT English exams:

---

### **Category A: Phonetics (Phát âm & Trọng âm)**

| # | Task Type ID | Name | Description | Legacy Mapping |
|---|---|---|---|---|
| A1 | `pronunciation` | Pronunciation — Odd One Out | "Mark the word whose underlined part differs from the other three" — MCQ with underlined letters in options | **New** (variant of `mcq-underline`) |
| A2 | `word-stress` | Word Stress — Odd One Out | "Mark the word whose stress pattern differs" — standard MCQ | Maps to `mcq-standard` |

---

### **Category B: Grammar & Vocabulary (Ngữ pháp & Từ vựng)**

| # | Task Type ID | Name | Description | Legacy Mapping |
|---|---|---|---|---|
| B1 | `mcq-grammar` | MCQ Gap-Fill (Standard) | "Mark A/B/C/D to complete each sentence" — blank in sentence, choose answer | Maps to `mcq-standard` |
| B2 | `mcq-vocabulary` | MCQ Vocabulary | Same format as B1 but testing vocabulary/phrasal verbs | Maps to `mcq-standard` |
| B3 | `verb-form` | Supply Correct Verb Form | "Supply the correct form of the verbs in brackets" — open-ended text input (e.g., "go → goes/went") | Maps to `fill-in-text` |
| B4 | `word-form` | Supply Correct Word Form | "Supply the correct form of the words in CAPITAL" (e.g., COLLECT → collector) | Maps to `fill-in-text` |
| B5 | `mcq-sign-notice` | Signs & Notices MCQ | Image of a sign/notice + MCQ "What does this sign say?" | **New** — MCQ with image prompt |
| B6 | `dialogue-response` | Dialogue Response MCQ | "Mark the most suitable response to complete the exchange" (situational/pragmatic) | Maps to `mcq-standard` |

---

### **Category C: Reading (Đọc hiểu)**

| # | Task Type ID | Name | Description | Legacy Mapping |
|---|---|---|---|---|
| C1 | `reading-cloze-mcq` | Cloze Reading (MCQ) | Passage with numbered blanks + MCQ options for each blank (e.g., Q24-28 with word bank) | Maps to Reading Comprehension + `mcq-standard` |
| C2 | `reading-cloze-wordbank` | Cloze Reading (Word Bank Fill) | Passage with blanks + word bank box, student fills blanks from word bank (Lam Son Q26-30) | Maps to `dropdown-in-text` or `blank-in-text` |
| C3 | `reading-comprehension` | Reading Comprehension (MCQ) | Long passage + MCQ questions: main idea, vocabulary-in-context, reference, inference, True/False | Maps to Reading Comprehension |
| C4 | `reading-announcement` | Advertisement/Announcement Reading | Short formatted text (notice, ad, announcement) + MCQ | Maps to Reading Comprehension |

---

### **Category D: Sentence Transformation & Arrangement**

| # | Task Type ID | Name | Description | Legacy Mapping |
|---|---|---|---|---|
| D1 | `sentence-arrangement` | Paragraph/Sentence Arrangement | Rearrange sentences a-f into a meaningful paragraph; answer is an order sequence like "c-a-b-d-e" — MCQ | Maps to `mcq-standard` (but semantically different) |
| D2 | `closest-meaning` | Sentence Closest in Meaning | "Mark the sentence closest in meaning to the original" — MCQ with full-sentence options | Maps to `mcq-standard` |
| D3 | `error-identification` | Error Identification (Underlined Parts) | "Mark the underlined part that needs correction" — sentence with 4 underlined parts | Maps to `mcq-underline` |
| D4 | `synonym-mcq` | Synonym/Closest Meaning (Word) | "The word 'X' is CLOSEST in meaning to ___" — MCQ | Maps to `mcq-standard` |
| D5 | `antonym-mcq` | Antonym/Opposite Meaning (Word) | "The word 'X' is OPPOSITE in meaning to ___" — MCQ | Maps to `mcq-standard` |
| D6 | `word-reference` | Word Reference in Passage | "The word 'it' in paragraph 2 refers to ___" — MCQ | Maps to `mcq-standard` |

---

### **Category E: Writing (Viết)**

| # | Task Type ID | Name | Description | Legacy Mapping |
|---|---|---|---|---|
| E1 | `sentence-rewrite` | Sentence Rewriting (Given Start) | "Rewrite beginning as shown, keeping same meaning" (e.g., "Camping is not ___") | Maps to `writing-inline` |
| E2 | `sentence-rewrite-keyword` | Sentence Rewriting (Using Keyword) | "Rewrite using the given word so meaning stays the same" (e.g., POSSIBLE, FOR, PREFER) | Maps to `writing-inline` |

---

### 🔑 Key Observations

1. **Overwhelmingly MCQ-centric**: ~80% of all THCS-THPT questions are MCQ (A/B/C/D). The distinction is in the *intent* (pronun, grammar, vocab, comprehension, synonym, etc.), not the *widget*.

2. **"Section instruction" is critical**: Every group of questions has a distinct instruction header in bold italic (e.g., *"Mark the letter A, B, C, or D on your answer sheet to indicate the word whose underlined part..."*). These instructions define the task type, not the widget itself.

3. **MCQ-with-image is a real type** (Signs & Notices): Questions 14-15 in Phú Thọ show an image + MCQ options.

4. **Open-ended inputs are rare and specific**: Only verb form supply (Lam Sơn Part B-I/II) and sentence rewriting (Lam Sơn Part D) use text input. Everything else is MCQ.

5. **Sentence arrangement is MCQ**: The answer is a sequence like "c-a-b-d-e" presented as MCQ options (A. c-a-b-d, B. b-d-e-a-c, etc.).

6. **Multiple mã đề (test codes)**: Lê Hồng Phong has 4 different mã đề (201-204) with shuffled questions and answer orders.

---

## 🔍 Proposed Task Type Architecture (Redesigned)

Based on this analysis, I propose **collapsing** the legacy types into a **cleaner, intent-based taxonomy** with fewer underlying widgets:

### **Widget Layer** (What the student interacts with — only 5 core widgets):

| Widget | Description | Used By |
|---|---|---|
| `mcq-4option` | Standard A/B/C/D radio selection (2×2 or 1-col grid) | A1, A2, B1, B2, B5, B6, C1, C3, C4, D1, D2, D4, D5, D6 |
| `mcq-underline` | Sentence with underlined parts, pick the error (horizontal pills) | D3 |
| `fill-text-input` | Full-width text input for typed answer | B3, B4 |
| `write-inline` | Sentence starter + auto-expanding input | E1, E2 |
| `cloze-wordbank` | Passage with numbered blanks + word bank (dropdown or drag) | C2 |

### **Intent Layer** (What the teacher selects in the editor — the "task type" label):

This is what appears in the visual editor as a category/tag alongside the widget. It determines the section instruction text and grading rubric.

---

## 🛑 Deep Follow-Up Questions (Round 2)

Now that I have the full picture, here are targeted questions to close the remaining gaps:

---

### **11. MCQ Sub-Types: Separate or Unified?**

I identified that ~14 out of 17 task types use the **exact same MCQ widget** (A/B/C/D). The only difference is the section instruction and grading intent. In the editor, should these be:

- a) **One "MCQ" block** with a dropdown for "intent" (pronunciation, grammar, vocabulary, comprehension, synonym, antonym, reference, etc.) — simpler editor, instruction auto-generated from intent
- b) **Separate blocks per intent** (e.g., "Add Pronunciation Question", "Add Grammar Question", "Add Comprehension Question") — more cluttered editor, but teacher sees exactly what they're creating
- c) **Grouped by category**: The editor sidebar shows Category A/B/C/D/E, and within each category are the sub-types — middle ground

---

### **12. Section Instructions: Auto-Generated or Custom?**

Each task group in the exam has a long instruction header (e.g., *"Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer..."*). Should these be:

- a) **Auto-generated** from the task type intent — teacher selects "pronunciation odd-one-out" and the instruction text is pre-populated
- b) **Teacher-editable templates** — auto-generated but teacher can modify the instruction text
- c) **Fully manual** — teacher writes their own instruction for each section

---

### **13. Passage-Based Questions: Attachment Model**

For reading comprehension (C1, C3, C4), the passage is shared across multiple questions. How should the editor handle this?

- a) **Section-level attachment**: Teacher creates a section, adds the passage to it, then adds questions inside that section — all questions share the passage
- b) **Passage as a standalone block**: The passage block exists in the editor, and questions below it until the next passage are auto-linked
- c) **Explicit linking**: Teacher adds questions individually and assigns them to a passage by reference

---

### **14. Image Support in Questions**

Phú Thọ Q14-15 show images (signs/notices) as part of the question prompt. Should the editor:

- a) Allow **any question type** to have an optional image attachment (flexible)
- b) Only allow images for **specific task types** (signs & notices, diagram-labeling)
- c) Allow images at both **question level AND passage level** (reading passages can have images/diagrams too)

---

### **15. Verb/Word Form Supply — Grading Model**

Questions like "Supply the correct form of the verb (go)" → `goes`/`went` (context-dependent). Multiple correct answers are possible. How should grading work?

- a) **Teacher provides all acceptable answers** at creation time (e.g., ["goes", "went"]) — auto-mark against list
- b) **Single correct answer** + AI suggestion for close-but-wrong answers — teacher reviews flagged edge cases
- c) **Hybrid**: Teacher provides primary answer(s), AI suggests additional acceptable variants, teacher approves/rejects

---

### **16. Sentence Rewriting — Grading Model**

This is the hardest grading problem. E.g.: "Camping is cheaper than staying in a hotel → Camping is not ___" has answers like "as expensive as staying in a hotel" or "as costly as staying in a hotel." How should this work?

- a) **Teacher provides model answer(s)** + all acceptable variants manually — auto-match
- b) **AI-assisted**: Teacher provides model answer, AI generates similarity score + flags for teacher review
- c) **Always manual**: Teacher grades all sentence rewriting manually with a simple score picker
- d) **Hybrid**: Attempt fuzzy auto-grade using teacher's model answer, but flag low-confidence matches for teacher review. Teacher can override any grade.

---

### **17. Mã Đề (Test Code) — Question Shuffling**

Lê Hồng Phong has 4 mã đề (201-204) with shuffled question orders. Should the system support:

- a) **No shuffling** — all students see the same question order
- b) **Auto-shuffle** at test assignment time — system generates N shuffled variants automatically
- c) **Both**: Teacher chooses between fixed order and auto-shuffle when assigning
- d) **Manual variants**: Teacher can create multiple test codes manually (like paper exams)

---

### **18. Reading Comprehension Layout in Student View**

For passages + questions, the IELTS test uses a **two-column sticky layout** (passage sticky on right). Should THCS-THPT use:

- a) **Same two-column** layout as IELTS (passage right, questions left)
- b) **Single column**: Passage first, then questions below (matches paper exam feel)
- c) **Teacher chooses per section**: Teacher selects layout mode (two-column or single-column) per reading section
- d) **Responsive**: Two-column on desktop, single-column on mobile (with toggle to show/hide passage)

---

### **19. Point Values and Scoring**

Vietnamese exams have weighted parts (e.g., Part A: 1pt, Part B: 4pts, Part C: 3pts, Part D: 2pts). The total is always 10 points.

- a) **Per-section points**: Teacher assigns total points per section, questions within are equally weighted
- b) **Per-question points**: Teacher assigns points per individual question (more flexible)
- c) **Both**: Default equal weight within section, but allow per-question override
- d) **Template-based**: Provide common Vietnamese exam scoring templates (e.g., "40Q MCQ = 0.25pts/q × 40 = 10pts")

---

### **20. "Create from Text" for THCS-THPT — Feasibility**

You chose option (a) — separate entry point for text conversion. The IELTS text parser works because IELTS has consistent formatting. THCS-THPT exams vary dramatically in format. How would you expect this to work?

- a) **Teacher pastes/uploads the exam text**, AI parses it into structured questions (like IELTS) — but accuracy may be lower due to format variety
- b) **Semi-structured import**: Teacher pastes text into a template with markers (e.g., "--- Section: Pronunciation ---\nQ1. ...") to guide the parser
- c) **Defer to Phase 2**: Build the visual editor first, add text import later once we understand the patterns better
- d) **OCR from image**: Teacher uploads photos/scans of paper exams (like the samples), system extracts questions via OCR+AI

---

### ⚠️ Potential Conflicts & Concerns I've Identified

1. **Widget reuse vs intent taxonomy conflict**: If ~14 task types all use the same MCQ widget, the editor risks feeling like "just another MCQ form" unless the intent selection provides meaningful differentiation (auto-instruction, grading context, analytics).

2. **AI writing grading scope**: You chose (d) AI-assisted grading for writing. Sentence rewriting has highly context-dependent correct answers. AI can help with fuzzy matching but will need a confidence threshold — below which the teacher MUST manually grade. This needs clear UX.

3. **Session + Homework with open-ended questions**: If THCS-THPT tests run as live sessions (like IELTS), but contain sentence rewriting that needs manual grading, the results page can't show "complete" results immediately. You need a "partially graded" state where MCQ is auto-scored but writing is "pending teacher review."

4. **Mã đề + Live Sessions**: If auto-shuffle is enabled in a live session, monitoring becomes complex — different students see different question orders, so the teacher monitor view needs to handle this.

5. **Data model divergence**: The current [DraftDocument](cci:2://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/draft.types.ts:77:0-110:1) is IELTS-shaped (passages + questions). THCS-THPT tests are section-shaped (sections contain instructions + questions/passages). This may need a different data model branch or a generalization of the existing model.

6. **Separate Library section**: You chose (b) separate library. This means duplicate UI for library browsing — consider whether the overhead of maintaining two library views is worth it vs. filtering within one unified library.

---

Please respond with your selections and any additional thoughts on the concerns raised! 📝

### User Input

11.a |12.b| 13. analyse to see if which one provide better UX for teacher and more effiecient as well as more stable for test display | 14.  c | 15.  c | 16. d | 17.c | 18. c and also make d possible | 19. c | 20.c | 'Potential Conflicts & Concerns I've Identified' is without actual solution | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 


### Planner Response

Let me first analyze Q13 (passage attachment models) by examining how the current IELTS system handles it, then I'll provide solutions for all conflicts and ask Round 3 questions.

*Viewed [document.types.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/document.types.ts) *

*Analyzed [TestReviewPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TestReviewPage.tsx) *

### Planner Response

Now let me look at how the student test page renders passages alongside questions:

*Viewed [StudentTestPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentTestPage.tsx) *

*Analyzed [testStorage.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/testStorage.ts) *

### Planner Response

Now I have a complete picture. Let me update the conversation log and deliver the comprehensive analysis.

*Edited relevant file*

### Planner Response

Great, now here's the full response:

---

## 📐 Analysis: Q13 — Passage Attachment Model

I examined how the current system works:

**Current IELTS model** (in [document.types.ts](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/document.types.ts:0:0-0:0) + [StudentTestPage.tsx](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentTestPage.tsx:0:0-0:0)):
- [Passage](cci:2://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/document.types.ts:25:0-40:1) has `questionStart` and `questionEnd` (range-based linking)
- Each [ParsedQuestion](cci:2://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/document.types.ts:73:0-113:1) has a `passageId` field (explicit linking)
- In student view, clicking a question auto-switches to its passage via `passageId`
- It's essentially a **dual-link hybrid**: passage knows its question range, AND questions point back to their passage

### Comparison for THCS-THPT:

| Approach | Teacher UX | Stability | Edge Cases | Verdict |
|---|---|---|---|---|
| **(a) Section-level** — passage belongs to section, questions inside inherit it | ✅ Intuitive: "Add passage to section, then add questions" — teacher never thinks about linking | ✅ Stable: passage-question bond is structural (parent-child), impossible to orphan | ⚠️ What if a section has NO passage (e.g., grammar MCQ)? Need "passageless sections" | **BEST for THCS-THPT** |
| **(b) Passage as standalone block** — auto-links questions "below" it until next passage | ⚠️ Confusing: if teacher reorders blocks, links silently break | ❌ Fragile: drag-and-drop reordering causes unexpected passage re-assignment | ❌ What happens when teacher drags a passage between two question groups? Silent corruption | **REJECT** |
| **(c) Explicit linking** — teacher manually assigns passageId per question | ❌ Tedious: teacher must click "attach to passage" for every question | ✅ Reliable: teacher controls exactly which passage each question references | ⚠️ Teacher forgets to link → orphaned questions with no passage context | **Too manual** |

### 🏆 Recommendation: **Option (a) — Section-level attachment**

**Why this is best for THCS-THPT specifically:**

1. Vietnamese exams are **inherently section-structured** — "Part A: Pronunciation (1pt)", "Part C: Reading (3pts)" — sections are the natural unit of organization
2. You already chose **(5c) optional section grouping** — this aligns perfectly
3. A section either HAS a passage (reading comprehension) or DOESN'T (grammar MCQ) — both are valid
4. The existing [Passage](cci:2://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/types/document.types.ts:25:0-40:1) type already has `questionStart`/`questionEnd` — section-level attachment auto-populates these
5. No orphan risk — if a question is in a section, it gets the section's passage automatically

**Data model implication**: A [Section](cci:2://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/testStorage.ts:32:0-42:1) node contains `passage?: Passage` + `questions: Question[]`. This replaces the flat `passages[]` + `questions[]` arrays from the IELTS model with a hierarchical structure.

---

## ✅ Conflict Solutions (All 6)

### Conflict 1: Widget Reuse vs Intent Taxonomy
> ~14 task types all use the same MCQ widget

**Solution**: The "intent" dropdown on the MCQ block serves three purposes:
1. **Auto-generates section instruction text** (the bold italic header like "Mark the letter A, B, C, or D...")
2. **Tags analytics** — teacher can see "your students scored 60% on pronunciation but 90% on grammar"
3. **Controls answer display logic** — for `pronunciation` intent, options render with underlined parts; for `error-identification`, the prompt renders with underlined words in the sentence

The widget is the same, but the intent modifies rendering subtleties. Teacher sees meaningful categorization without a cluttered editor.

### Conflict 2: AI Writing Grading Scope
> Sentence rewriting has context-dependent correct answers

**Solution**: Two-tier grading flow:
- **Tier 1 (Auto)**: Normalize + fuzzy match against teacher's model answer(s). Confidence threshold = 80%. Above 80% → auto-grade. Below → flag as "needs review."
- **Tier 2 (Teacher Review)**: Teacher sees all flagged answers in a "Grading Queue" panel. Each shows: student answer, model answer, AI similarity score, AI suggested grade. Teacher clicks ✅ or ✏️ to confirm/override.
- **Never-auto-grade list**: Sentence rewriting (E1, E2) defaults to "always flag" unless teacher explicitly enables auto-grading for that section.

### Conflict 3: Partially Graded State
> Live session + open-ended questions = can't show complete results immediately

**Solution**: New result state machine:
```
'submitted' → 'auto-graded' → 'partially-graded' → 'fully-graded'
```
- After submission: MCQ auto-scored immediately → result shows "Auto Score: 7/8 MCQ" + "2 writing questions pending review"
- Teacher grades writing → score updates in real-time → student sees updated score
- Student results page shows a "Pending Review" badge on ungraded questions
- Notification sent to student when teacher finishes grading

### Conflict 4: Mã Đề + Live Sessions
> Different students see different question orders during monitoring

**Solution**: 
- Teacher Monitor view shows questions by **original question number** (canonical order), not shuffled order
- Student's shuffled mapping is stored per-student (e.g., `shuffleMap: { studentQ1: canonicalQ5, studentQ2: canonicalQ12, ... }`)
- When teacher looks at a specific student's submission, the system de-shuffles to show answers in canonical order
- Auto-grading operates on canonical answers — shuffling is purely presentation-layer

### Conflict 5: Data Model Divergence
> Current DraftDocument is IELTS-shaped (flat passages + questions)

**Solution**: Generalize the draft model with a **union discriminated by `testType`**:
```typescript
// Shared base
interface DraftBase { id, userId, metadata, status, ... }

// IELTS-specific: flat passages[] + questions[]
interface IELTSDraft extends DraftBase { 
  testType: 'IELTS'; 
  passages: Passage[]; 
  questions: Question[]; 
}

// THCS-THPT-specific: sections containing questions + optional passage
interface THCSDraft extends DraftBase { 
  testType: 'THCS-THPT'; 
  sections: Section[]; 
}

type DraftDocument = IELTSDraft | THCSDraft;
```
This avoids breaking the IELTS flow while supporting THCS-THPT's hierarchical structure.

### Conflict 6: Separate Library Overhead
> Maintaining two library UIs

**Solution**: One `LibraryPage` component with a **top-level tab/filter** for test type (IELTS / THCS-THPT). Internally, they share:
- Search, pagination, sort controls
- Card component (with different metadata display)
- CRUD operations

What differs:
- THCS-THPT cards show: grade level, total points, section breakdown
- IELTS cards show: band target, skill, passage count
- THCS-THPT library has additional filters: grade (6-12), exam type (giữa kì, cuối kì, thi vào 10)

This is one page with two "modes," not two separate pages.

---

## 🔍 Round 3: Deep-Dive Questions

### **21. Section Data Model — What's in a Section?**

Based on the sample analysis, a THCS-THPT section contains:
- Section name/label (e.g., "PART A: PRONUNCIATION")
- Point value for the section (e.g., "1.0 point")
- Instruction text (e.g., "Mark the letter A, B, C...")
- Optional passage (for reading sections)
- Questions (with the intent tag)

**Is there anything else a section should contain?**

- a) **Audio attachment** (future-proofing for listening sections in Phase 2+)
- b) **Time limit per section** (some Vietnamese exams time individual sections)
- c) **Subsection support** (e.g., Part B has "I. Supply correct verb form" and "II. Supply correct word form" as subsections)
- d) **All of (a), (b), (c)**
- e) **Just (a) and (c)** — section time limits are unusual for Vietnamese exams

---

### **22. Signs & Notices (MCQ with Image) — Image Source**

Questions like Phú Thọ Q14-15 show images of signs/notices. How should the teacher provide images?

- a) **Upload from device** — teacher uploads a JPG/PNG, stored in Firebase Storage / R2
- b) **URL link** — teacher pastes an image URL
- c) **Both** with a preference for upload (more reliable, no broken links)
- d) **Built-in image library** — we provide common sign/notice images teacher can browse

---

### **23. Sentence Arrangement — Answer Input Design**

The "arrange sentences into meaningful paragraph" type (D1) is unique. Options are sequences like "a-c-b-d-e". In the student view, how should the student answer?

- a) **MCQ** — just pick A/B/C/D like the paper exam (simplest, matches exam format)
- b) **Drag-and-drop** — student drags sentences into correct order (richer UX, but different from paper format)
- c) **Both available** — teacher chooses per question whether it's MCQ or drag-and-drop

---

### **24. Editor Preview — Live vs Side-by-Side**

You chose hybrid editor (drag-and-drop blocks + inline editing + preview toggle). How should the preview work?

- a) **Side-by-side**: Editor on left, live student-view preview on right (always visible)
- b) **Toggle mode**: Full-screen editor OR full-screen preview, with a toggle button
- c) **Inline preview**: Each block in the editor already LOOKS like its student-view representation (WYSIWYG) — no separate preview needed
- d) **Preview as modal/drawer**: Click "Preview" to open a full-screen overlay showing student view

---

### **25. Test Metadata for THCS-THPT**

The current IELTS metadata includes: title, duration, targetBand, cefrLevel, difficulty. For THCS-THPT, what metadata should be collected?

- a) **Title, Duration, Grade Level (Lớp 6-12), Exam Type (giữa kì/cuối kì/thi vào 10/ôn tập), School Year**
- b) Same as (a) + **Subject variant** (Tiếng Anh 9 Global Success, Tiếng Anh 10 Friends Global, etc.)
- c) Same as (a) + **Province/School** (for organizing by origin)
- d) Minimal: just **Title, Duration, Grade Level**

---

### **26. Multiple Correct Answers for MCQ**

Some reading comprehension MCQs could theoretically have multiple correct answers (e.g., "Which of the following is TRUE?"). Should the system support:

- a) **Single correct answer only** for MCQ (Vietnamese THCS-THPT exams are always single-answer MCQ)
- b) **Support both** single and multiple correct — teacher marks one or more correct options
- c) **Single correct, but teacher can add "also acceptable" answers** that get full marks too

---

### **27. Answer Key Entry in Editor**

When the teacher creates questions in the visual editor, how should they enter the answer key?

- a) **Inline**: When creating each question, there's a "Correct Answer" field right below the options
- b) **Separate answer key panel**: Teacher builds all questions first, then fills in answers in a dedicated "Answer Key" panel (matches the paper exam workflow where answer key is separate)
- c) **Both**: Inline entry by default, but also a consolidated "Answer Key" view for bulk review/editing

---

### **28. Student View — Question Navigation**

In the current IELTS test, there's a footer navigation bar (Inspera-style) showing all question numbers. For THCS-THPT with sections:

- a) **Same flat navigation** — all question numbers in one row, color-coded by answered/unanswered
- b) **Section-grouped navigation** — questions organized by section tabs in the footer
- c) **Both**: Section tabs at top level, question numbers within each tab
- d) **Sidebar navigation** — question map as a collapsible sidebar (instead of footer)

---

### **29. Timer Behavior Differences**

You chose Session + Homework integration. For THCS-THPT specifically:

- a) **Same timer behavior as IELTS**: Global countdown, auto-submit when time expires + grace period
- b) **More lenient for homework**: In homework mode, timer is informational only (no auto-submit). In session mode, timer is strict (auto-submit)
- c) **Teacher configurable**: Teacher chooses strict/informational timer per assignment

---

### **30. Grading Queue UX — Where Does Teacher Grade Writing?**

When auto-grading flags writing questions for manual review:

- a) **Inside the test results page**: Teacher sees results, clicks "Review Writing" to expand a grading panel for each student
- b) **Dedicated "Grading" page**: Separate page showing all pending-review items across all tests/students — batch grading
- c) **Both**: Quick inline grading in results page + batch grading page for heavy workloads

---

### **31. Notification Integration — What Triggers Notifications?**

You said this should integrate with notifications. Which events should trigger notifications?

- a) Teacher assigns THCS-THPT homework → Student notified
- b) Student submits test → Teacher notified
- c) Teacher finishes grading writing → Student notified of updated score
- d) Homework deadline approaching → Student reminder
- e) All of the above
- f) All of (a-d) + **Student achieves high score → Teacher congrats notification** + **Student doesn't start assigned homework → Teacher alert**

---

### ⚠️ Additional Edge Cases & Preventions I've Identified

**Edge Case 1: Section with 0 questions**
*Scenario*: Teacher creates a section in the editor but adds no questions before saving.
*Risk*: Empty section stored in database → student sees an empty Part with just a header.
*Prevention*: Block saving/publishing if any section has 0 questions. Show validation error in editor.

**Edge Case 2: Point values don't sum to 10**
*Scenario*: Teacher sets per-section points that total 8.5 instead of 10.
*Risk*: Auto-conversion to 10-scale produces misleading scores (e.g., 8.5/8.5 = 10.0).
*Decision needed*: Should the system enforce total = 10, warn but allow, or not care?

**Edge Case 3: Auto-shuffle breaks passage-based sections**
*Scenario*: Teacher enables auto-shuffle, and the system shuffles reading comprehension questions away from their passage.
*Risk*: Student sees Q3 about Passage 2 while currently viewing Passage 1.
*Prevention*: Shuffle only WITHIN sections, never across sections. Reading sections shuffle question order within the section but all remain linked to the same passage.

**Edge Case 4: Mixed grading states in results**
*Scenario*: Student submits, MCQ auto-graded = 6/8. Teacher grades Q41 writing = 1/1. Teacher hasn't graded Q42 yet.
*Risk*: What score does the student see? 7/9? 7/10? Is the denominator the total or only graded questions?
*Decision needed*: Show `7/9 graded so far` or `7/10 (1 pending)` or `70% (partial)`?

**Edge Case 5: Teacher edits test after students started homework**
*Scenario*: Teacher assigns THCS-THPT test as homework. 5 students submit. Teacher realizes Q12 has a typo and edits it.
*Risk*: The 5 students who already submitted were graded against the old version. New students get the corrected version.
*Prevention*: Lock test editing once any student has submitted. Or: version the test and show "N students submitted against V1" warning.

**Edge Case 6: Verb/word form with diacritics and case sensitivity**
*Scenario*: Correct answer is "preservation". Student types "Preservation" (capital P) or "preservation." (with period).
*Prevention*: Normalize all answers: trim, lowercase, strip trailing punctuation. Already handled in [autoMarking.service.ts](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/autoMarking.service.ts:0:0-0:0) via [normalizeAnswer()](cci:1://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/autoMarking.service.ts:95:0-107:1), but ensure THCS grading uses the same service.

---

### 🔧 Advice: Things Currently Lacking in Your Vision

1. **No concept of "test versioning"**: If a teacher edits a published test, existing sessions/homework using it are affected. You need to decide: snapshot on publish (immutable) or live-edit?

2. **No "draft preview as student" flow**: The IELTS flow goes Editor → Publish → Assign. There's no way for the teacher to experience the test as a student before publishing. Consider a "Preview as Student" button.

3. **No rubric system for writing**: You chose AI-assisted grading for writing, but there's no concept of a "rubric" — what criteria does the AI use? For sentence rewriting, the rubric is binary (correct/incorrect). For writing-letter (if added later), it would be multi-criteria (grammar, coherence, vocabulary). Phase 1 can defer rubrics since sentence rewriting is binary, but the data model should accommodate future rubric support.

4. **No accessibility considerations**: Vietnamese students with visual impairments need screen reader support, high contrast mode, and keyboard-only navigation. Not critical for MVP but should be considered in the data model (alt text for images, semantic HTML for questions).

5. **No bulk operations**: Teacher creating a 40-question test one by one is slow. Consider: "Add 5 MCQ questions" batch action, or paste mode where teacher pastes 10 questions at once (semi-structured).

---

Please respond with your selections and I'll be ready to start generating the phased PRDs! 📝

### User Input

Q13: approve recommendation | Conflict Solutions (All 6): approve | 21. none | 22. c | 23. a | 24. c (but I still want to know if any other is a better choice based on our foundation) | 25. add unit 1-12 to Exam Type + Subject variant (optional) +  Province/School (optional) | 26. a | 27.c | 28. c and color-coded by answered/unanswered | 29. c | 30. for live session, this should happen in test monitor page and if the teacher decides to do this later, make a new 'grading' tab in teacher lobby to handing grading tasks; homework needed grading auto gets transfer to this tab | 31.e | color-coded by answered/unanswered : need to be included and further develop | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 


### Planner Response

Let me analyze Q24 (editor preview approach) by examining our existing editor foundation, and also research the teacher monitor page and lobby for the grading tab integration.

*Analyzed [TeacherTestMonitorPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherTestMonitorPage.tsx) *

*Viewed [TeacherTestMonitorPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherTestMonitorPage.tsx) *

### Planner Response

Now let me check the Teacher Lobby page to understand how tabs work there:

*Analyzed [TeacherLobbyPage.tsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherLobbyPage.tsx) *

*Searched filesystem*

*Searched filesystem*

*Analyzed [TeacherLobbyPage.jsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherLobbyPage.jsx) *

### Planner Response

Let me check the tab structure and how the lobby currently has tabs:

*Grep searched codebase*

*Grep searched codebase*

*Viewed [TeacherLobbyPage.jsx](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TeacherLobbyPage.jsx) *

### Planner Response

Good, I now have the full picture of the lobby's current structure (Quiz Mode / Test Mode tabs + My Content / Public Library filter). Let me now provide the comprehensive analysis.

*Edited relevant file*

### Planner Response

---

## 📐 Q24 Analysis: Editor Preview — WYSIWYG vs Alternatives

You chose **(c) WYSIWYG inline preview** and asked if another option might be better given our foundation. Here's my analysis:

### Current Foundation

The existing IELTS test creation uses a **3-step modal flow** (`TestCreationModal.tsx`): Upload Text → Parse → Review in [TestReviewPage.tsx](cci:7://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/TestReviewPage.tsx:0:0-0:0). The review page uses `ParseReviewPanel` which shows parsed questions in a read-only form-like layout. There is **no existing WYSIWYG editor** or visual block builder in the codebase.

### Comparison Against Our Foundation

| Approach | Build Effort | Teacher UX | Technical Risk | Matches Foundation? |
|---|---|---|---|---|
| **(a) Side-by-side** (editor left, preview right) | Medium — Need editor + renderer, but they're independent components | ✅ Teacher always sees output | ⚠️ Screen real estate issue: editor + preview + section nav = cramped on smaller screens | ❌ No existing side-by-side layout for editing (only `TwoColumnLayout` for student test view) |
| **(b) Toggle mode** (full editor OR full preview) | Low — Same components as (a) but only one visible at a time | ⚠️ Context-switching: teacher loses focus when toggling | ✅ Simplest to build, least risk | ✅ Toggle is simple, no complex sync |
| **(c) WYSIWYG inline** (each block IS the preview) | **High** — Every block must be dual-mode: editable + renderable with identical styling | ✅ Best UX: zero disconnect between editor and output | ❌ **Highest risk**: maintaining pixel-perfect parity between "editor mode" and "student view" across all 5 widgets is a significant engineering challenge | ❌ No WYSIWYG precedent in codebase |
| **(d) Preview as modal** | Low — Click "Preview" → render student view in overlay | ⚠️ Least integrated: teacher must explicitly request preview | ✅ Very low risk — just render student components in a modal | ✅ We already have modals everywhere |

### 🏆 My Recommendation: **Hybrid of (a) + (b) = "Responsive Side-by-Side with Preview Toggle"**

**Why not pure WYSIWYG (c)?**
1. **Technical complexity**: Making an MCQ block that is simultaneously editable AND renders exactly like the student view means every CSS change to student components must be mirrored in editor components. This is a maintenance nightmare.
2. **No existing pattern**: The codebase has zero WYSIWYG editors. Building one from scratch adds 2-3 weeks to Phase 1.
3. **Diminishing returns**: The teacher doesn't need to see the *exact* student rendering while editing. They need to see the *structure* — "this is an MCQ with 4 options, here's the passage, here are the questions." A clean form-like editor block with obvious structure achieves 90% of the UX benefit at 30% of the engineering cost.

**What I propose instead — "Structured Blocks + Docked Preview":**
- **Editor (left/main)**: Clean, structured blocks. Each block shows: intent tag (e.g., "Pronunciation MCQ"), question number, question text input, A/B/C/D option inputs, correct answer selector. Looks like a **well-designed form**, not like the student view.
- **Preview (right/toggle)**: Renders the *actual* student view components (`IELTSQuestionsPanel`-equivalent for THCS) as read-only. On larger screens, this can be docked as a side panel. On smaller screens, it's a toggle button.
- **Benefit**: The preview uses the exact same rendering components as the student test page — guaranteed parity with zero maintenance duplication.

**However**, if you still prefer WYSIWYG (c), it IS achievable — it will just require that Phase 1 of the PRD includes significantly more time for the editor component system. Let me know your preference.

---

## ✅ Solutions for Edge Cases Raised Previously

### Edge Case 2: Point values don't sum to 10
**Solution**: Soft validation. Show a warning banner: "⚠️ Total points: 8.5/10 — Vietnamese exams typically total 10 points." Teacher can dismiss and proceed. Auto-conversion to 10-scale uses the teacher's total as the denominator, not a hardcoded 10. So 7/8.5 = 8.24 on 10-scale.

### Edge Case 4: Mixed grading states in results
**Solution**: Display both: `"Score: 7/10 (1 question pending review)"`. The denominator is always the total possible points. Pending questions show 0 points until graded. The student sees a "Partial" badge. When teacher completes grading, the score updates and the badge changes to "Final."

### Edge Case 5: Teacher edits test after students started
**Solution**: **Snapshot on assignment.** When a test is assigned as homework or started in a session, the system creates an immutable snapshot (version). Edits to the original test don't affect active assignments. If the teacher notices an error during an active session, they can use a "Regrade Question" action (already exists as `re-marking` in the IELTS flow) to adjust scores for a specific question across all students.

---

## 🔍 Round 4: Final Deep-Dive Questions

### **32. Grading Tab in Teacher Lobby — Scope**

You said homework needing grading auto-transfers to a new "Grading" tab. I need to clarify the data flow:

- a) **Only THCS-THPT tests with open-ended questions** appear in the Grading tab (IELTS tests are fully auto-graded)
- b) **Any test with any un-gradeable question** appears in the Grading tab (future-proofing for IELTS writing tasks)
- c) **All completed tests** appear in a "Results" sub-section of the Grading tab, with a filter for "Needs Review" items

---

### **33. Grading Tab — Student Grouping**

When the teacher opens the Grading tab, how should pending items be organized?

- a) **By test**: "Midterm Exam — 15 students have pending writing grades" → click to expand
- b) **By student**: "Nguyên Văn A — 3 tests have pending grades" → click to see their submissions
- c) **By question**: "Q41 (Sentence Rewrite) — 28 student answers pending" → batch-grade same question across students
- d) A combination: default by test, with option to switch to by-question view for batch grading

---

### **34. Live Session Monitor — Writing Grade UX**

In the monitor page, you want teachers to grade writing during live sessions. When exactly should this be available?

- a) **Only after student submits**: Teacher clicks a submitted student's card → sees their writing answers → grades inline
- b) **Only after ALL students submit or time expires**: Grading panel appears at the end of the session
- c) **Real-time during test**: Teacher can see students' writing answers as they type (live stream) and prepare grades
- d) **(a) with progressive unlock**: As each student submits, their writing becomes gradeable individually

---

### **35. Color-Coded Question Navigation — Specification**

You want color-coded answered/unanswered navigation. Here's my proposed color scheme for the student's question navigator:

| State | Color | Indicator |
|---|---|---|
| Unanswered | `#e2e8f0` (light gray) | Empty circle |
| Answered | `#3b82f6` (blue) | Filled circle |
| Flagged for review | `#f59e0b` (amber) | Star/flag icon |
| Current question | `#1e293b` (dark) with ring | Bold border |
| Correct (post-submit) | `#10b981` (green) | ✓ check |
| Incorrect (post-submit) | `#ef4444` (red) | ✗ cross |
| Pending review (writing) | `#8b5cf6` (purple) | ⏳ clock |

**Questions:**
- a) Approve this scheme as-is
- b) Approve but modify specific colors (specify)
- c) Add additional states I'm missing (specify)

---

### **36. "Preview as Student" — In the Editor**

I raised the concern that there's no way for teachers to experience the test as a student before publishing. Should:

- a) **"Preview as Student" button** in the editor that opens a full-screen simulation of the student test-taking view with all interactions working (timer, navigation, etc.) but with dummy data
- b) **Simpler preview**: Just show how questions render visually, no interactivity (static HTML)
- c) **Defer to Phase 2**: Not critical for MVP

---

### **37. Test Versioning and Snapshotting**

You approved the snapshot-on-assignment approach (Edge Case 5). Where should the snapshot live?

- a) **In the session/homework record**: The assignment object stores a copy of the test data at assignment time
- b) **Separate versioned storage**: `tests/{testId}/versions/{versionId}` — each publish creates a new version, assignments reference a version ID
- c) **Both**: Session stores a version reference, version is stored centrally for deduplication (multiple homework assignments to different classes reference the same version)

---

### **38. Homework Assignment Flow**

When the teacher assigns a THCS-THPT test as homework:

- a) **From the test card**: Click "Assign as Homework" → select class → set deadline → done (same flow as IELTS)
- b) **From the Homework page**: Click "Create Homework" → browse library → select test → set deadline  
- c) **Both entry points** (consistent with current homework flow)

---

### **39. Student Dashboard — How Does THCS-THPT Test Appear?**

Currently the student dashboard shows homework items from `TeacherHomeworkListPage`. How should THCS-THPT tests appear?

- a) **Same homework feed**: THCS-THPT homework appears in the same list as IELTS homework, with a different icon/badge for test type
- b) **Separate section**: "Vietnamese Tests" section in the student view, separate from "IELTS Practice"
- c) **Same feed, different card design**: Each item's card shows test-type-specific metadata (total points, section breakdown for THCS-THPT; band target for IELTS)

---

### **40. Bulk Question Creation — "Add N Questions"**

For a 40-question exam, adding questions one by one is tedious. Should the editor support:

- a) **"Add N questions" bulk action**: Teacher clicks "Add 10 MCQ" → 10 empty MCQ slots appear in the section
- b) **Quick-paste mode**: Teacher pastes a formatted list of questions (one per line) and the system parses them into individual question blocks
- c) **Both (a) and (b)**
- d) **Defer to Phase 2**: Manual one-by-one is fine for MVP

---

### **41. Data Model Decision — RTDB or Firestore for THCS Tests?**

Currently IELTS tests are stored in RTDB (`tests/{testId}`). THCS-THPT tests have richer structure (sections, subsections, per-question points, multiple grading states). Should they:

- a) **Same RTDB path**: `tests/{testId}` with a `testType: 'THCS-THPT'` discriminator — simpler, unified
- b) **New RTDB path**: `thcs_tests/{testId}` — separate to avoid schema conflicts with IELTS tests
- c) **Firestore**: THCS tests use Firestore (better for complex nested data + querying by grade/exam type), IELTS stays in RTDB
- d) **Same RTDB but normalized**: Split into `tests/{testId}/metadata`, `tests/{testId}/sections/{sectionId}`, `tests/{testId}/questions/{questionId}` — flatter RTDB-friendly structure

---

### **42. Phase 1 Scope Confirmation**

Based on all decisions so far, here's what I believe Phase 1 should include. Please confirm or adjust:

**Phase 1: Test Editor + Data Model**
- [ ] THCS-THPT test data model (sections, questions, metadata)
- [ ] Visual editor page with section/question block management
- [ ] MCQ widget (covers ~14 task types with intent dropdown)
- [ ] Fill-text-input widget (verb form, word form)
- [ ] Write-inline widget (sentence rewriting)
- [ ] Cloze-wordbank widget (passage + word bank)
- [ ] Answer key panel (inline + consolidated view)
- [ ] Test metadata form (title, duration, grade, exam type, etc.)
- [ ] Save as draft + publish flow
- [ ] Store in RTDB/Firestore (per Q41 decision)
- [ ] THCS-THPT test type selection in `TestTypeSelectionModal`

**Phase 2: Student Test-Taking + Grading**
- [ ] Student test page for THCS-THPT (section navigation, MCQ, fill-in, writing)
- [ ] Auto-grading service (MCQ, fill-in, word form)
- [ ] AI-assisted grading for writing (with fuzzy match)
- [ ] Grading tab in teacher lobby
- [ ] Live session monitor integration (writing grading)
- [ ] Results page (with partial grading state)
- [ ] Question shuffling (mã đề)

**Phase 3: Integrations**
- [ ] Homework assignment flow
- [ ] Deadline + notification system
- [ ] Course integration
- [ ] THCS-THPT library (browse, filter, search)
- [ ] Scoring (points + 10-scale conversion)
- [ ] Student dashboard integration

**Questions:**
- a) Approve this phasing
- b) Move some items between phases (specify)
- c) Redefine phases entirely

---

### ⚠️ Additional Edge Cases & Concerns (Round 4)

**Edge Case 7: Teacher creates test with 0 sections (direct questions)**
*Scenario*: Despite the section-based model, what if a teacher just wants to create a simple 10-question MCQ test without any section structure?
*Decision needed*: Should the system require at least 1 section (auto-create a "Default" section), or allow section-free tests (flat question list)?

**Edge Case 8: Grading tab notification stacking**
*Scenario*: Teacher assigns 5 homework tests to 3 classes. Over a week, 150 students submit. Teacher opens Grading tab and sees 150 × 2 writing questions = 300 pending items.
*Risk*: Grading fatigue. Teacher ignores the tab.
*Prevention*: Grading tab shows aggregate counts ("35 new items today"), allows batch-grading by question (grade Q41 for all 150 students), and shows a progress bar ("67% graded for Midterm Exam").

**Edge Case 9: Session + Homework dual mode conflict**
*Scenario*: Teacher creates a test, assigns it as homework (7-day deadline), AND also uses it in a live session simultaneously.
*Decision needed*: Is this allowed? If so, do live session results and homework results merge into the same results pool, or are they tracked separately?

**Edge Case 10: Extremely long passages in single-column mode**
*Scenario*: Teacher chooses single-column layout for a reading section. The passage is 500 words. Student must scroll past the entire passage to reach the questions, losing context.
*Prevention*: Even in "single-column" mode, on desktop, show a "Scroll to Questions" button that auto-scrolls to questions while keeping the passage visible via a collapsible/expandable panel.

---

Please respond with your final selections and I'll begin generating the Phase 1 PRD! 📝

### User Input

 Q24 Analysis: approve recommendation | Solutions for Edge Cases Raised Previously: approve | 32. c | 34. d | 35. a) Approve this scheme as-is| 36. a (but i wonder the difference with b) | 37. elaborate and recommend the best practyice for sustainable growth | 38. c | 39. c | 40. c | 41.  elaborate and recommend the best practyice for sustainable growth | 42. self-reassess to ensure logical development | 'Additional Edge Cases & Concerns' is without solutions | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and provide preventions. 


### Planner Response

Let me research the current storage patterns and Firestore usage to make informed recommendations for Q37 and Q41.

*Grep searched codebase*

*Grep searched codebase*

*Viewed [firebase.js](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/firebase.js) *

*Analyzed [homeworkManager.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/homeworkManager.ts) *

### Planner Response

Now let me check how tests are stored and the RTDB test structure:

*Grep searched codebase*

*Viewed [draftCloudService.ts](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/draftCloudService.ts) *

### Planner Response

Now I have the full picture of the storage architecture. Let me update the log and deliver the comprehensive response.

*Edited relevant file*

### Planner Response

---

## 📐 Q36 Elaboration: Interactive Preview (a) vs Static Preview (b)

| Aspect | **(a) Interactive Preview** | **(b) Static Preview** |
|---|---|---|
| **What student sees** | Full working simulation: timer ticks, clicking options selects them, section navigation works, scroll behaves like real test | Read-only HTML rendering: questions look correct visually but clicking does nothing, no timer, no navigation |
| **Purpose** | Teacher can **experience the test as a student** — verify interactions, question flow, timer pressure, navigation UX | Teacher can **verify visual layout only** — check formatting, text readability, image positioning |
| **Build effort** | Higher — must instantiate student view components with mock data + disable submission | Lower — just render question components in read-only mode |
| **When it makes sense** | Phase 2+, when the student test-taking view exists. Before that, there's nothing to simulate | Phase 1, when only the editor exists and student view hasn't been built yet |
| **Runtime** | Opens in new tab/overlay, feels like taking a real test | Opens in a drawer/modal, scrollable static page |

### 🏆 Recommendation
**Phase 1: Build (b) static preview** (it's all you can do without a student view). **Phase 2: Upgrade to (a) interactive preview** once the student test-taking page exists — it's just rendering [StudentTestPage](cci:1://file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/pages/StudentTestPage.tsx:578:0-587:2) with the draft data in a "preview mode" flag that disables submission and uses fake session data.

This way you get preview capability immediately without waiting for the student view, and the upgrade path is straightforward.

---

## 📐 Q37 Elaboration: Test Versioning — Best Practice

### Current Architecture Pattern
From my research:
- **Drafts** → Firestore (`drafts/` collection) — mutable, edited by teacher
- **Published tests** → RTDB (`tests/{testId}`) — currently mutable (no versioning)
- **Homework** → Firestore (`homework_assignments/`) — references `materialId` (test ID)
- **Sessions** → RTDB (`game_sessions/{code}`) — references `testId`

### The Problem
When a teacher edits a published test, ALL session results and homework assignments pointing to that test ID silently get the new version. This is a **data integrity violation** — students were graded against the old version.

### 🏆 Recommended Architecture: **Snapshot-on-Publish with Centralized Versions**

```
Firestore: drafts/{draftId}           ← Mutable, teacher edits here
    ↓ (publish action)
RTDB: tests/{testId}                  ← "Latest" version metadata only
RTDB: tests/{testId}/versions/{v1}    ← Immutable snapshot of full test data
RTDB: tests/{testId}/versions/{v2}    ← Next publish creates v2

Assignments reference:
  homework.testVersionRef = "tests/{testId}/versions/{v1}"
  session.testVersionRef = "tests/{testId}/versions/{v1}"
```

**Why this is best for sustainable growth:**

1. **Immutable versions**: Once published, a version never changes. Students are always graded against the exact version they took.
2. **Centralized deduplication**: If 5 classes get the same homework, they all reference `v1` — stored once, not 5 copies.
3. **Diff-friendly**: Teacher can compare v1 vs v2 to see what changed between publishes.
4. **Backward compatible**: Existing IELTS tests without versions can be treated as `v0` (single implicit version at the test root). No migration needed.
5. **RTDB-friendly**: Versions are flat JSON snapshots under the test ID — no complex queries needed, just a direct path read.
6. **Draft ↔ Published separation**: Teacher always edits the Firestore draft. Publishing creates a new RTDB version. Clear separation of mutable vs immutable data.

**Trade-off**: Each version is a full snapshot (~50-200KB for a 40-question test). For a test published 10 times, that's ~2MB. Negligible for RTDB.

---

## 📐 Q41 Elaboration: RTDB vs Firestore — Best Practice

### Current Storage Map

| Data | Storage | Reason |
|---|---|---|
| Tests (published) | **RTDB** `tests/` | Real-time session loading, low-latency reads |
| Quizzes | **RTDB** `quizzes/` | Same as tests |
| Sessions | **RTDB** `game_sessions/` | Real-time multiplayer sync |
| Drafts | **Firestore** `drafts/` | Complex data, no real-time need, offline persistence |
| Homework | **Firestore** `homework_assignments/` | Composite queries (by teacher, by class, by student) |
| API Keys | **Firestore** | Security-sensitive, document-level security rules |

### THCS-THPT Needs Analysis

| Need | RTDB Fit | Firestore Fit |
|---|---|---|
| Store test structure (sections, questions) | ✅ Flat JSON, fast reads | ✅ Better for nested data |
| Query by grade level, exam type, province | ❌ No native composite queries — requires denormalized indexes | ✅ Native `where()` + `orderBy()` |
| Real-time loading during live session | ✅ Built-in, ultra-low latency | ⚠️ Possible but adds Firestore listener overhead |
| Library browsing with filters | ❌ Must download all tests, filter client-side | ✅ Server-side filtering |
| Draft editing + auto-save | Already Firestore | Already Firestore |

### 🏆 Recommendation: **Dual-Storage (Follow Existing Pattern)**

```
Firestore: thcs_drafts/{draftId}           ← Mutable drafts (same pattern as IELTS drafts)
Firestore: thcs_library/{testId}           ← Library metadata for browsing/filtering
                                              (title, grade, examType, subject, province, 
                                               questionCount, sectionSummary, tags)

RTDB: tests/{testId}                       ← Full test data for live session/homework loading
RTDB: tests/{testId}/versions/{vN}         ← Immutable version snapshots (per Q37)
```

**Why this is best:**

1. **Follows existing architecture**: Drafts and homework are already Firestore. Tests and sessions are already RTDB. THCS-THPT follows the same split.
2. **Library in Firestore**: The separate library section (your Q8 choice) gets Firestore's composite query power — `where('grade', '==', 9).where('examType', '==', 'giữa kì').orderBy('createdAt')`.
3. **Test data in RTDB**: When a student takes the test (live session or homework), the data is loaded from RTDB — same ultra-low-latency path as IELTS.
4. **Sync on publish**: When teacher publishes, system writes to both: (a) RTDB for runtime use + (b) Firestore library doc for discovery/filtering. This is a one-time write, not ongoing sync.
5. **No new database**: Both RTDB and Firestore are already initialized and used.

---

## 📐 Q42 Self-Reassessment: Phasing

### Problem with Original Phasing
The original Phase 1 (Editor + Data Model only) produces an **untestable artifact** — a teacher can create a test but nobody can take it until Phase 2. This violates the principle: **each phase should be end-to-end testable**.

### 🏆 Revised Phasing

**Phase 1: Foundation + End-to-End MCQ Flow** *(testable: teacher creates → student takes → auto-graded)*

| Component | Scope |
|---|---|
| Data model | Section-based test structure, all types defined |
| Editor | Section management + MCQ widget only (covers ~14 task types) |
| Answer key | Inline + consolidated panel |
| Metadata | Full form (title, duration, grade, exam type, etc.) |
| Save/Publish | Draft (Firestore) → Publish (RTDB) + Library (Firestore) |
| Student view | Section-navigated test page, MCQ only, single-column layout |
| Auto-grading | MCQ auto-grade (exact match) |
| Results | Basic score page (points + 10-scale) |
| Integration | Test type selection in TestTypeSelectionModal → editor flow |

**Phase 2: Full Widget Set + Grading System**

| Component | Scope |
|---|---|
| Fill-text-input widget | Verb form, word form (editor + student + grading) |
| Write-inline widget | Sentence rewriting (editor + student) |
| Cloze-wordbank widget | Passage + word bank (editor + student) |
| Image support | Question + passage level image attachments |
| AI grading | Fuzzy matching for fill-in + sentence rewriting |
| Grading tab | Teacher lobby "Grading" tab with pending queue |
| Monitor grading | Writing grading in live session monitor |
| Partial results | "Pending review" states, score updates |
| Two-column layout | Teacher-selectable layout per reading section |
| Test versioning | Snapshot-on-publish (immutable versions) |
| Preview as student | Static preview (Phase 2A), interactive preview (Phase 2B) |

**Phase 3: Integrations + Polish**

| Component | Scope |
|---|---|
| Homework | Assignment flow from test card + homework page |
| Notifications | All 5 event types (assign, submit, graded, deadline, reminder) |
| Question shuffling | Mã đề with within-section shuffle |
| Library | THCS-THPT library with grade/exam type/subject filters |
| Course integration | Link tests to courses |
| Timer modes | Strict vs informational per assignment |
| Bulk operations | "Add N questions" + quick-paste mode |
| Student dashboard | THCS-THPT cards in unified feed |

---

## ✅ Solutions for Edge Cases 7-10

### Edge Case 7: Teacher creates test with 0 sections
**Solution**: Auto-create a "Default Section" (`Phần 1`) when the teacher opens the editor. The editor always has at least 1 section. If the teacher tries to delete the last section, show: "A test must have at least one section. Delete individual questions instead." Additionally, block publishing if any section has 0 questions — show validation: "Section 'Phần 1' has no questions."

### Edge Case 8: Grading tab notification stacking (300 pending items)
**Solution**: 
- **Aggregate view by default**: "Midterm Exam → 35 answers pending across 18 students" (not 35 individual cards)
- **"Grade by Question" mode**: Click Q41 → see all 18 student answers for Q41 side-by-side → grade them in a batch. This is 18 clicks, not 35.
- **Progress bar**: Per-test "Grading: 67% complete (23/35 answers graded)"
- **Auto-sort**: Newest submissions first. Tests with approaching deadlines appear at top.
- **Notification digest**: Don't send 150 individual "student submitted" notifications. Send a daily digest: "15 new submissions today for Midterm Exam."

### Edge Case 9: Session + Homework dual mode
**Solution**: **Allowed, but tracked separately.** A test can be simultaneously active in a live session AND assigned as homework. However:
- Live session results go to `game_sessions/{code}/results/`
- Homework results go to `homework_submissions/{homeworkId}/{studentId}/`
- The teacher's Results Dashboard shows them separately: "Session Results (15 students)" vs "Homework Results (28 students)"
- If the same student takes the test in BOTH a session and as homework, both results are preserved. The Academic Record shows the higher score (or both, with labels).

### Edge Case 10: Long passages in single-column mode
**Solution**: 
- **"Sticky passage header"**: In single-column mode, the passage title + first line stay sticky at the top while scrolling through questions
- **"Show Passage" floating button**: When the student scrolls past the passage to reach questions, a floating button appears: "📖 Show Passage" → clicking it opens a slide-up panel with the passage (doesn't navigate away from current question position)
- **Responsive (choice d)**: On mobile, always single-column with the floating button. On desktop, respect teacher's per-section choice.

---

## 🔍 Round 5: Final Questions Before PRD Generation

### **33. Grading Tab — Student Grouping** *(skipped in Round 4)*

When the teacher opens the Grading tab, how should pending items be organized?

- a) **By test**: "Midterm Exam — 15 students pending" → expand to see students
- b) **By student**: "Nguyên Văn A — 3 tests pending" → expand to see tests  
- c) **By question**: "Q41 — 28 answers pending" → batch-grade same question across students
- d) **Default by test, with toggle to switch to by-question batch mode** *(recommended for efficiency — grading the same question across students is 3× faster than grading per-student)*

---

### **43. Editor Drag-and-Drop — Reordering Scope**

The hybrid editor supports drag-and-drop. What can be reordered?

- a) **Questions within a section** only — sections are ordered by the teacher with up/down buttons
- b) **Both questions and sections** can be dragged to reorder
- c) **Questions within a section + sections can be reordered, but questions CANNOT be dragged between sections** *(prevents accidental passage detachment)*

---

### **44. Pronunciation MCQ — Underline Rendering**

For pronunciation questions (A1), the options have underlined letters (e.g., "A. dr**i**nk, B. th**i**nk, C. br**i**ng, D. f**i**ne" where the underlined part is the vowel being tested). In the editor, how should the teacher mark which part to underline?

- a) **Markdown-style**: Teacher types `dr__i__nk` or `dr*i*nk` and the editor renders underline
- b) **Rich text**: Teacher selects the letter(s) and clicks an "Underline" button (mini toolbar per option)
- c) **Auto-detect**: System detects common Vietnamese English pronunciation patterns and auto-underlines *(unreliable)*
- d) **Simple text with convention**: Teacher just types the words. For pronunciation questions, ALL options are displayed without special formatting — students identify differences by reading *(matches some paper exam styles)*

---

### **45. Error Identification (D3) — Underlined Parts in Sentence**

For "mark the underlined part that needs correction" questions, the sentence has 4 underlined words/phrases with labels A/B/C/D. In the editor:

- a) **Teacher marks which words to underline** using rich text or markdown in the sentence field, and labels are auto-generated (A, B, C, D)
- b) **Structured fields**: 4 separate input fields for "Part A", "Part B", "Part C", "Part D" + the full sentence with placeholders
- c) **Same as MCQ**: Teacher types the sentence as the question, and uses the 4 MCQ options as the underlined parts (e.g., Option A: "study", Option B: "light enough", etc.)

---

### **46. Cloze Word Bank Widget — Student Interaction**

For reading passages with a word bank (C2), how should the student interact?

- a) **Dropdown**: Each blank in the passage is a dropdown menu; student selects a word from the bank
- b) **Drag-and-drop**: Student drags words from the bank into blanks in the passage
- c) **Type with autocomplete**: Student starts typing in the blank, gets suggestions from the word bank
- d) **Dropdown only** for Phase 1 (simplest, most reliable), add drag-and-drop in Phase 2

---

### **47. Test Duration — Configuration Granularity**

Vietnamese exams are typically 50 or 60 minutes. How should the duration be configured?

- a) **Free number input**: Teacher types any number of minutes (e.g., 45, 50, 60, 90)
- b) **Preset buttons + custom**: Quick buttons for common durations (45, 50, 60, 90 min) + custom input field
- c) **Only predefined options**: Dropdown with 15, 30, 45, 50, 60, 90, 120 min

---

### **48. Auto-Save in Editor**

The IELTS draft system auto-saves to Firestore. Should the THCS-THPT editor:

- a) **Auto-save every 30 seconds** if changes detected (same as IELTS)
- b) **Auto-save on every change** (debounced 2 seconds) — more aggressive but prevents data loss
- c) **Manual save only** with "unsaved changes" indicator
- d) **(b) with offline fallback**: Auto-save to Firestore, but if offline, save to localStorage and sync when reconnected

---

### ⚠️ Final Concerns & Advice

**Concern 1: Editor complexity for Phase 1**
Even with "MCQ only" in Phase 1, the editor needs: section management (add/remove/reorder), MCQ block with intent dropdown, per-section instruction templates, per-question point configuration, image upload support, answer key panel. This is substantial. 

**Advice**: Consider having the Phase 1 editor be a **form-based builder** (not drag-and-drop). Add drag-and-drop reordering in Phase 2. Form-based is faster to build and just as functional for content creation. Drag-and-drop adds flair but delays Phase 1 delivery.

**Concern 2: Missing — Teacher role permissions for THCS-THPT**
Who can create THCS-THPT tests? Currently the system has `super_admin` and `teacher` roles. Should any teacher create THCS-THPT tests, or only those teaching certain courses?

**Concern 3: Missing — Test duplication**
Can a teacher duplicate an existing test to create a variant? This is common for Vietnamese teachers creating multiple "mã đề" manually. The editor should have a "Duplicate Test" button.

**Concern 4: Answer normalization scope**
The current `autoMarking.service.ts` normalizes answers (trim, lowercase, strip punctuation). For THCS-THPT fill-in answers, we also need to handle:
- Vietnamese diacritics in English words (accidental input of Vietnamese keyboard)
- Extra spaces between words
- Hyphenated alternatives ("hasn't" vs "has not")
- Verb form alternatives ("has spoken" vs "hasn't spoken" for negative forms)

---

After this round, I believe we'll have enough detail to generate the Phase 1 PRD. Please respond with your final selections! 📝

### User Input

Q36: Phase 2: Upgrade to (a) interactive preview | Q37: I want another approach, I want each edit to only record seperate changes to a single additional file for version management, and ther versions can be view within original test through a dropdown menu. I expect this to maintain all of the aspects you mentioned (Diff-friendly, Backward compatible and  Published separation) while keeping the storage at minimum | 41. approve |  42. approve | Solutions for Edge Cases 7-10: approve |  33.d  | 43. c | 44. b | 45. a | 46. a | 47. b | 48. b | Concern 1:  approve advice | Concern 2:  any teacher create THCS-THPT tests | Concern 3: approve | Concern 4: approve | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 


### Planner Response

Let me process the Q37 delta-based versioning approach — this is a significant architectural decision that needs careful design.

*Edited relevant file*

### Planner Response

---

## 📐 Q37 Redesign: Delta-Based Versioning (Changelog Approach)

Your approach is essentially **event-sourcing** — the current version is always the full document, and a single changelog file records only what changed per edit. Here's the detailed design:

### Architecture

```
RTDB: tests/{testId}/                    ← Full current data (always latest, always readable)
RTDB: tests/{testId}/_changelog/         ← Single changelog node with ordered entries
  {
    "v_1708900000": {                    ← Entry when v1 was superceded by v2
      "publishedAt": 1708900000,
      "publishedBy": "teacher-uid",
      "label": "Fixed Q3 answer + Q5 typo",
      "previousValues": {               ← ONLY the fields that CHANGED
        "sections~0~questions~2~answer": "B",
        "sections~0~questions~4~questionText": "She go to school every day."
      }
    },
    "v_1708986400": {                    ← Entry when v2 was superceded by v3
      "publishedAt": 1708986400,
      "publishedBy": "teacher-uid",
      "label": "Added Q41-42 writing section",
      "previousValues": {
        "sections~3": null,              ← null means section didn't exist before
        "metadata~questionCount": 40     ← was 40, now 42
      }
    }
  }
```

### How It Works

| Action | Operation | Storage Cost |
|---|---|---|
| **View current version** | Read `tests/{testId}` directly | 0 extra reads |
| **View version dropdown** | Read `tests/{testId}/_changelog` keys + labels | 1 small read |
| **Reconstruct v2** | Take current data → overlay `v_1708986400.previousValues` | Compute on client |
| **Reconstruct v1** | Take current → overlay v3 changelog → then overlay v2 changelog (reverse chronological) | Compute on client |
| **Teacher publishes edit** | Diff current vs edited → store changed fields in new changelog entry → overwrite current | ~1-5 KB per edit |
| **Student takes test (active assignment)** | Assignment stores `{ testId, versionKey: "v_1708900000" }` → reconstruct at load time | Compute on client |

### Storage Comparison

| Approach | 40Q test, 10 versions | Storage |
|---|---|---|
| Full snapshots (previous proposal) | 10 × ~100KB = ~1MB | 1MB |
| **Delta changelog (your approach)** | 1 × 100KB + 10 × ~2KB = ~120KB | **120KB (~88% smaller)** |

### Properties Checklist

| Property | Status | How |
|---|---|---|
| ✅ Diff-friendly | Each changelog entry IS the diff | `previousValues` shows exactly what changed |
| ✅ Backward compatible | Tests without `_changelog` are implicitly "v0" (original) | No migration needed for existing IELTS tests |
| ✅ Published separation | Drafts in Firestore, published in RTDB | Same as before |
| ✅ Single additional file | One `_changelog` node per test | Not one file per version |
| ✅ Dropdown viewable | List changelog entries by timestamp + label | Teacher selects, client reconstructs |
| ✅ Minimum storage | Only changed fields stored per version | ~2KB per edit vs ~100KB per full snapshot |

### ⚠️ Trade-Offs (Transparent)

| Trade-off | Impact | Mitigation |
|---|---|---|
| **Reconstruction latency** | Viewing old versions requires client-side computation (apply N deltas backward) | For <20 versions, this is <50ms — negligible. Cache reconstructed versions in memory. |
| **Homework/session load** | When student takes an assigned test, version must be reconstructed from changelog | Pre-compute the version at assignment time and cache it in the assignment record (lightweight copy of just the `previousValues` overlay). Alternatively: reconstruct once on first student load, cache in session node. |
| **Changelog corruption risk** | If one changelog entry is corrupted/deleted, ALL older versions become unrecoverable | RTDB has automatic backups. Additionally, changelog entries are append-only (never modified), reducing corruption risk. |
| **Structural changes are complex** | Adding/removing entire sections or questions produces large `previousValues` entries | For structural changes (add/remove sections), store the removed section data as the `previousValue`. These entries will be larger (~5-10KB) but still much smaller than a full snapshot. |

### Assignment Integration

When a test is assigned as homework or started in a session:

```typescript
// Assignment record stores:
{
  testId: "test_abc123",
  versionKey: "v_1708900000",   // Which version the students should see
  // Optional: pre-computed overlay for fast reconstruction
  _cachedVersion: { ... }       // Computed at assignment time, not on every student load
}
```

The `_cachedVersion` is computed once (at assignment time) by applying deltas backward from current to `versionKey`. This eliminates the reconstruction cost at student load time.

---

## 📐 Q36 Clarification: Phase Plan

- **Phase 1**: No preview (editor is form-based; WYSIWYG-enough that teacher sees the structure)
- **Phase 2A**: Static preview (renders student view components in read-only drawer)
- **Phase 2B**: Interactive preview (full student simulation — timer, clicks, navigation)

---

## ✅ All Round 5 Decisions Recorded

All answers processed. Now here are the final-round questions to close the remaining gaps:

---

## 🔍 Round 6: Closing the Last Gaps

### **49. Subsection Support — Confirmed or Not?**

In Q21, you said "none" for additional section fields. But the Lam Sơn Thanh Hóa sample clearly has subsections within a section:

```
Part B (4.0 points)
  I. Supply the correct form of the verbs (1.0pt)     ← Subsection
  II. Supply the correct form of the words (1.0pt)     ← Subsection
  III. Read the passage and fill in the blanks (2.0pt) ← Subsection
```

Should the system support:
- a) **No subsections**: Every task group is a flat section. "Part B-I" and "Part B-II" are separate sections at the same level (e.g., "Part B-I: Verb Form", "Part B-II: Word Form")
- b) **One level of subsections**: A section can contain subsections, each with its own instruction and questions *(matches the paper exam structure exactly)*
- c) **Subsections as visual labels only**: Teacher can add a "subsection heading" text block within a section — no structural impact, just display

---

### **50. Section Instruction Templates — Language**

Section instructions should be auto-generated from intent (approved Q12b). The Vietnamese THCS-THPT exams use English instructions. Here are the templates I'd pre-build:

| Intent | Auto-Generated Instruction |
|---|---|
| `pronunciation` | "Mark the letter A, B, C, or D on your answer sheet to indicate the word whose underlined part differs from the other three in pronunciation." |
| `word-stress` | "Mark the letter A, B, C, or D on your answer sheet to indicate the word that differs from the other three in the position of primary stress." |
| `mcq-grammar` | "Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions." |
| `error-identification` | "Mark the letter A, B, C, or D on your answer sheet to indicate the underlined part that needs correction in each of the following questions." |
| `closest-meaning` | "Mark the letter A, B, C, or D on your answer sheet to indicate the sentence that is closest in meaning to each of the following questions." |
| `reading-comprehension` | "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions." |

**Questions:**
- a) Approve these templates — I'll generate the full set for all 17 intents
- b) Approve but I prefer Vietnamese instructions (e.g., "Đánh dấu chữ cái A, B, C hoặc D...")
- c) Both English and Vietnamese — teacher chooses language per section
- d) Approve, but also let teacher fully customize (as per Q12.b — editable templates)

---

### **51. UI Language — Editor & Student View**

The IELTS interface is fully in English. For THCS-THPT:

- a) **All English**: Editor and student view both in English (matches current codebase)
- b) **Editor in English, student view bilingual**: Editor stays English. Student view labels (navigation, submit button, timer label) can be in Vietnamese
- c) **Both bilingual**: Editor and student view have a language toggle (English/Vietnamese)
- d) **Student view in Vietnamese only**: Navigation labels, buttons, headers are all in Vietnamese for THCS-THPT tests (since the exams are for Vietnamese students)

---

### **52. Point Auto-Calculation**

You chose (c) default equal weight within section, with per-question override. When the teacher has a section with 10 questions worth 2.0 points total:

- a) **Auto-distribute**: Each question = 0.2 points. If teacher overrides Q3 to 0.5 points, remaining 9 questions auto-adjust to share the remaining 1.5 points (0.167 each)
- b) **Fixed after override**: Each question starts at 0.2. If teacher overrides Q3 to 0.5, the section total becomes 2.3 points (no auto-adjustment). Teacher sees a warning: "Section total exceeded: 2.3/2.0"
- c) **Override replaces auto**: Once ANY question has a manual override, ALL questions in that section must be manually set (auto-distribution turns off)

---

### **53. Real-Time Sync During Live Session — THCS Specifics**

For IELTS live sessions, student answers sync to RTDB in real-time (teacher sees progress). For THCS-THPT:

- a) **Same behavior**: Real-time sync for all question types (MCQ answers visible to teacher immediately)
- b) **Selective sync**: MCQ syncs in real-time. Writing answers sync only on submit (to avoid teacher seeing incomplete sentences mid-typing)
- c) **Same as (a)** but with a configurable delay for writing questions (sync every 10 seconds instead of on every keystroke)

---

### **54. Results Page — THCS-THPT Specific Design**

The current IELTS results page shows Band Score, correct/total, and per-question review. For THCS-THPT, what should the results page show?

- a) **Score breakdown by section**: "Part A: 0.8/1.0 | Part B: 3.5/4.0 | Part C: 2.5/3.0 | Part D: 1.5/2.0 = Total: 8.3/10.0"
- b) Same as (a) + **per-question review** with correct/incorrect/pending indicators
- c) Same as (b) + **analytics**: "Weakest area: Grammar (60%)", "Strongest: Reading (90%)"
- d) Same as (c) — full breakdown *(recommended for educational value)*

---

### **55. Homework Deadline Behavior for Partially-Graded Tests**

When the homework deadline passes:

- a) **Deadline closes submission only**: Students can no longer submit. Teacher can still grade pending writing items after deadline.
- b) **Deadline closes everything**: No more submissions AND teacher is prompted to finish grading within X days
- c) **Deadline is soft**: Late submissions are accepted but marked as "Late." Teacher always has unlimited time to grade.
- d) Same as (c) but teacher can configure late submission policy (accept/reject/penalty) per homework

---

### ⚠️ Final Edge Cases & Concerns

**Edge Case 11: Delta changelog ordering race condition**
*Scenario*: Two teachers with super_admin access edit the same test simultaneously. Both publish, creating overlapping changelog entries.
*Risk*: Conflicting deltas corrupt version history.
*Solution*: Use RTDB transactions for changelog writes. Additionally, implement an optimistic lock: before publishing, check if `_changelog` has been modified since the teacher started editing. If yes, show "This test was modified by another teacher. Please refresh and re-apply your changes."

**Edge Case 12: Section point values = 0**
*Scenario*: Teacher creates a section but forgets to set point values. Default is 0 points.
*Risk*: Students complete the section but get 0 points regardless of answers.
*Solution*: Default section points to "auto" (equally distribute total test points across sections). Teacher sees "Auto: ~2.5pts" as a calculated default. Only shows 0 if teacher explicitly sets it to 0.

**Edge Case 13: Rich-text underline in pronunciation options — pasting from external source**
*Scenario*: Teacher copies questions from a Word document. The underlined parts don't transfer.
*Risk*: All pronunciation options appear without underlines — useless for the question type.
*Solution*: When intent is `pronunciation`, show a validation warning: "⚠️ No underlined parts detected in options. Pronunciation questions require underlined portions. Click each option to mark the pronunciation-target letters." Provide a "Quick Underline" mode: teacher clicks individual characters to toggle underline.

**Edge Case 14: Dropdown word bank with duplicate words**
*Scenario*: Teacher creates a cloze passage where two blanks have the same correct answer (e.g., "the" appears twice in the word bank).
*Risk*: Student selects "the" for blank 1, and it disappears from available options for blank 2.
*Solution*: Word bank counts — if "the" needs to appear twice, the word bank should contain "the (×2)." Alternatively: words are NOT removed from the bank when selected (reusable), and the teacher specifies a strict match count during creation.

---

### 🧠 Advice: What I Believe is Still Lacking

1. **No "test template" system**: Vietnamese teachers often reuse the SAME exam structure repeatedly (e.g., "THCS Lớp 9 — Standard Format: 4 parts, 40 questions, same point distribution"). Rather than creating from scratch each time, a "Save as Template" feature would let teachers save a test's structure (sections, intents, point distribution) without the actual questions. Future tests can start from a template. **Should this be Phase 3?**

2. **No concept of answer explanations**: Vietnamese teachers often want to provide "giải thích đáp án" — explanation of why A is correct and B is wrong, shown to students after submission. The IELTS system doesn't have this. **Should THCS-THPT support it?**

3. **No difficulty tagging per question**: The system tags difficulty at the test level, not per question. Vietnamese standardized exams have difficulty distribution requirements (e.g., 40% easy, 40% medium, 20% hard). **Should questions support difficulty tags for analytics?**

4. **No academic record integration**: When a student takes a THCS-THPT test, where does the score go long-term? Currently IELTS results are in session data. Should THCS-THPT scores aggregate into a student's academic record (GPA tracker, progress over time)?

---

I believe we're nearing PRD-ready completeness. This round should close the last significant gaps. Please respond with your selections! 📝

### User Input

49. a | 50. d (add option for teacher to create new Section Instruction) | 51. a | 52. c | 53. c | 54. d | 55. d | Final Edge Cases & Concerns: approve | Advice 1: appprove | Advice 2: approve: AI suggestions based on answer key | Advice 3: not now | Advice 4: seperate record from IELTS (IELTS results contributing to IELTS progression, THCS/THPT results contributing to their progression) | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 
you can stop and start compiling if you think there is nothing more you need, the plan you make will leave no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate.

### Planner Response

I have enough information to compile. Let me check the PRD numbering convention and the create-prd template one more time, then start generating the Phase 1 PRD.

*Searched filesystem*

*Viewed [create-prd.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/create-prd.md) *

### Planner Response

Good. Next PRD number is `0027`. Let me also look at an existing PRD for format reference:

*Viewed [0026-prd-backup-disaster-recovery-system.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/0026-prd-backup-disaster-recovery-system.md) *

### Planner Response

Now I have the format and level of detail expected. This is a comprehensive, battle-tested PRD format. Let me compile the Phase 1 PRD now.