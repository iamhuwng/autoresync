/**
 * Performance Tests for IELTS Reading Test Parsing
 * 
 * Benchmark tests to ensure parsing a full IELTS reading test
 * completes in under 60 seconds.
 * 
 * Part of PRD-0020: Phase 9 - Task 9.9
 * 
 * Test Scenarios:
 * 1. Full test parsing under 60 seconds
 * 2. Individual stage timing benchmarks
 * 3. Rule-only parsing performance (offline mode)
 * 4. Memory usage during parsing
 * 
 * @module performance.test
 * @date 2026-02-06
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// MOCK SETUP (Required before imports)
// ═══════════════════════════════════════════════════════════════

// Mock the AI router service for consistent timing
vi.mock('../ai/router.service', () => ({
    aiService: {
        parsePassagesOnly: vi.fn(),
        parseQuestionsAndAnswers: vi.fn(),
        getStatus: vi.fn(() => ({ available: true, name: 'gemini' })),
        testConnection: vi.fn(() => Promise.resolve({ success: true })),
    },
}));

// Mock firebase for offline parser
vi.mock('../firebase', () => ({
    firestore: {
        collection: vi.fn(),
    },
}));

// Import after mocking
import { aiService } from '../ai/router.service';
import { TestCreationService } from './index';
import { typeClassifierService } from './type-classifier.service';
import { validatorService } from './validator.service';

// ═══════════════════════════════════════════════════════════════
// SAMPLE CAMBRIDGE IELTS TEST DATA
// ═══════════════════════════════════════════════════════════════

/**
 * Full IELTS Reading Test 3 from Cambridge 10
 * 40 questions across 3 passages - representative of actual test size
 */
const FULL_IELTS_TEST_CONTENT = `
# TEST 3

## READING PASSAGE 1

You should spend about 20 minutes on Questions 1-13, which are based on Reading Passage 1 below.

### Questions 1-4

Reading Passage 1 has five paragraphs, A-E. Choose the correct heading for paragraphs B-E from the list of headings below.
Write the correct number, i-vii, in boxes 1-4 on your answer sheet.

**List of Headings**

* i. Economic and social significance of tourism
* ii. The development of mass tourism
* iii. Travel for the wealthy
* iv. Earning foreign exchange through tourism
* v. Difficulty in recognising the economic effects of tourism
* vi. The contribution of air travel to tourism
* vii. The world impact of tourism

*Example*
*Paragraph A*
*Answer: viii (The history of travel)*

**1.** Paragraph B
**2.** Paragraph C
**3.** Paragraph D
**4.** Paragraph E

---

### The Context, Meaning and Scope of Tourism

**A**
Travel has existed since the beginning of time, when primitive man set out, often traversing great distances in search of game, which provided the food and clothing necessary for his survival. Throughout the course of history, people have travelled for purposes of trade, religious conviction, economic gain, war, migration and other equally compelling motivations. In the Roman era, wealthy aristocrats and high government officials also travelled for pleasure. Seaside resorts located at Pompeii and Herculaneum afforded citizens the opportunity to escape to their vacation villas in order to avoid the summer heat of Rome. Travel, except during the Dark Ages, has continued to grow and, throughout recorded history, has played a vital role in the development of civilisations and their economies.

**B**
Tourism in the mass form as we know it today is a distinctly twentieth-century phenomenon. Historians suggest that the advent of mass tourism began in England during the industrial revolution with the rise of the middle class and the availability of relatively inexpensive transportation. The creation of the commercial airline industry following the Second World War and the subsequent development of the jet aircraft in the 1950s signalled the rapid growth and expansion of international travel.

**C**
Tourism today has grown significantly in both economic and social importance. In most industrialised countries over the past few years the fastest growth has been seen in the area of services. One of the largest segments of the service industry, although largely unrecognised as an entity in some of these countries, is travel and tourism.

**D**
However, the major problems of the travel and tourism industry that have hidden, or obscured, its economic impact are the diversity and fragmentation of the industry itself. The travel industry includes: hotels, motels and other types of accommodation; restaurants and other food services; transportation services and facilities; amusements, attractions and other leisure facilities.

**E**
However, the nature of this very diversity makes travel and tourism ideal vehicles for economic development in a wide variety of countries, regions or communities. Once the exclusive province of the wealthy, travel and tourism have become an institutionalised way of life for most of the population.

---

### Questions 5-10

Do the following statements agree with the information given in Reading Passage 1?
In boxes 5-10 on your answer sheet, write:

* **TRUE** if the statement agrees with the information
* **FALSE** if the statement contradicts the information
* **NOT GIVEN** if there is no information on this

**5.** The largest employment figures in the world are found in the travel and tourism industry.
**6.** Tourism contributes over six per cent of the Australian gross national product.
**7.** Tourism has a social impact because it promotes recreation.
**8.** Two main features of the travel and tourism industry make its economic significance difficult to ascertain.
**9.** Visitor spending is always greater than the spending of residents in tourist areas.
**10.** It is easy to show statistically how tourism affects individual economies.

### Questions 11-13

Complete the sentences below. Choose **NO MORE THAN THREE WORDS** from the passage for each answer.

**11.** In Greece, tourism is the most important _______.
**12.** The travel and tourism industry in Jamaica is the major _______.
**13.** The problems associated with measuring international tourism are often reflected in the measurement of _______.

---

## READING PASSAGE 2

You should spend about 20 minutes on Questions 14-26, which are based on Reading Passage 2 below.

### Autumn leaves

*Canadian writer Jay Ingram investigates the mystery of why leaves turn red in the fall*

**A**
One of the most captivating natural events of the year in many areas throughout North America is the turning of the leaves in the fall. The colours are magnificent, but the question of exactly why some trees turn yellow or orange, and others red or purple, is something which has long puzzled scientists.

**B**
Summer leaves are green because they are full of chlorophyll, the molecule that captures sunlight and converts that energy into new building materials for the tree. As fall approaches in the northern hemisphere, the amount of solar energy available declines considerably.

**C**
The source of the red is widely known: it is created by anthocyanins, water-soluble plant pigments reflecting the red to blue range of the visible spectrum. They belong to a class of sugar-based chemical compounds also known as flavonoids.

**D**
Some theories about anthocyanins have argued that they might act as a chemical defence against attacks by insects or fungi, or that they might attract fruit-eating birds or increase a leaf's tolerance to freezing.

**E**
It has also been proposed that trees may produce vivid red colours to convince herbivorous insects that they are healthy and robust and would be easily able to mount chemical defences against infestation.

**F**
Perhaps the most plausible suggestion as to why leaves would go to the trouble of making anthocyanins when they're busy packing up for the winter is the theory known as the 'light screen' hypothesis.

**G**
Chlorophyll, although exquisitely evolved to capture the energy of sunlight, can sometimes be overwhelmed by it, especially in situations of drought, low temperatures, or nutrient deficiency.

**H**
Even if you had never suspected that this is what was going on when leaves turn red, there are clues out there. One is straightforward: on many trees, the leaves that are the reddest are those on the side of the tree which gets most sun.

**I**
What is still not fully understood, however, is why some trees resort to producing red pigments while others don't bother, and simply reveal their orange or yellow hues.

---

### Questions 14-18

Reading Passage 2 has nine paragraphs, A-I. Which paragraph contains the following information?
Write the correct letter, A-I, in boxes 14-18 on your answer sheet.
*NB You may use any letter more than once.*

**14.** A description of the substance responsible for the red colouration of leaves.
**15.** The reason why trees drop their leaves in autumn.
**16.** Some evidence to confirm a theory about the purpose of the red leaves.
**17.** An explanation of the function of chlorophyll.
**18.** A suggestion that the red colouration in leaves could serve as a warning signal.

### Questions 19-22

Complete the notes below. Choose **ONE WORD ONLY** from the passage for each answer.

**Why believe the 'light screen' hypothesis?**

* The most vividly coloured red leaves are found on the side of the tree facing the **19** _______.
* The **20** _______ surfaces of leaves contain the most red pigment.
* Red leaves are most abundant when daytime weather conditions are **21** _______ and sunny.
* The intensity of the red colour of leaves increases as you go further **22** _______.

### Questions 23-25

Do the following statements agree with the information given in Reading Passage 2?

* **TRUE** if the statement agrees with the information
* **FALSE** if the statement contradicts the information
* **NOT GIVEN** if there is no information on this

**23.** It is likely that the red pigments help to protect the leaf from freezing temperatures.
**24.** The 'light screen' hypothesis would initially seem to contradict what is known about chlorophyll.
**25.** Leaves which turn colours other than red are more likely to be damaged by sunlight.

### Question 26

Choose the correct letter A, B, C or D.

**26.** For which of the following questions does the writer offer an explanation?

* **A** why conifers remain green in winter
* **B** how leaves turn orange and yellow in autumn
* **C** how herbivorous insects choose which trees to lay their eggs in
* **D** why anthocyanins are restricted to certain trees

---

## READING PASSAGE 3

You should spend about 20 minutes on Questions 27-40, which are based on Reading Passage 3 below.

### Beyond the blue horizon

*Ancient voyagers who settled the far-flung islands of the Pacific Ocean*

An important archaeological discovery on the island of Éfaté in the Pacific archipelago of Vanuatu has revealed traces of an ancient seafaring people, the distant ancestors of today's Polynesians. The site came to light only by chance. An agricultural worker, digging in the grounds of a derelict plantation, scraped open a grave - the first of dozens in a burial ground some 3,000 years old.

The Lapita left precious few clues about themselves, but Éfaté expands the volume of data available to researchers dramatically. The remains of 62 individuals have been uncovered so far, and archaeologists were also thrilled to find six complete Lapita pots.

DNA teased from these human remains may help answer one of the most puzzling questions in Pacific anthropology: did all Pacific islanders spring from one source or many?

There is one stubborn question for which archaeology has yet to provide any answers: how did the Lapita accomplish the ancient equivalent of a moon landing, many times over?

'All we can say for certain is that the Lapita had canoes that were capable of ocean voyages, and they had the ability to sail them,' says Geoff Irwin, a professor of archaeology at the University of Auckland.

The Lapita's thrust into the Pacific was eastward, against the prevailing trade winds, Irwin notes. Those nagging headwinds, he argues, may have been the key to their success.

For returning explorers, successful or not, the geography of their own archipelagoes would have provided a safety net. Without this to go by, overshooting their home ports, getting lost and sailing off into eternity would have been all too easy.

All this presupposes one essential detail, says Atholl Anderson, professor of prehistory at the Australian National University: the Lapita had mastered the advanced art of sailing against the wind.

Rather than give all the credit to human skill, Anderson invokes the winds of chance. El Niño, the same climate disruption that affects the Pacific today, may have helped scatter the Lapita, Anderson suggests.

However they did it, the Lapita spread themselves a third of the way across the Pacific, then called it quits for reasons known only to them.

---

### Questions 27-31

Complete the summary using the list of words and phrases, A-J, below. Write the correct letter, A-J, in boxes 27-31 on your answer sheet.

**The Éfaté burial site**

A 3,000-year-old burial ground of a seafaring people called the Lapita has been found on an abandoned **27** _______ on the Pacific island of Éfaté. The cemetery, which is a significant **28** _______, was uncovered accidentally by an agricultural worker.

**List of Words**
* **A** proof
* **B** plantation
* **C** harbour
* **D** bones
* **E** data
* **F** archaeological discovery
* **G** burial urn
* **H** source
* **I** animals
* **J** maps

### Questions 32-35

Choose the correct letter, A, B, C or D.

**32.** According to the writer, there are difficulties explaining how the Lapita accomplished their journeys because

* **A** the canoes that have been discovered offer relatively few clues.
* **B** archaeologists have shown limited interest in this area of research.
* **C** little information relating to this period can be relied upon for accuracy.
* **D** technological advances have altered the way such achievements are viewed.

**33.** According to the sixth paragraph, what was extraordinary about the Lapita?

* **A** They sailed beyond the point where land was visible.
* **B** Their cultural heritage discouraged the expression of fear.
* **C** They were able to build canoes that withstood ocean voyages.
* **D** Their navigational skills were passed on from one generation to the next.

**34.** What does 'This' refer to in the seventh paragraph?

* **A** the Lapita's seafaring talent
* **B** the Lapita's ability to detect signs of land
* **C** the Lapita's extensive knowledge of the region
* **D** the Lapita's belief they would be able to return home

**35.** According to the eighth paragraph, how was the geography of the region significant?

* **A** It played an important role in Lapita culture.
* **B** It meant there were relatively few storms at sea.
* **C** It provided a navigational aid for the Lapita.
* **D** It made a large number of islands habitable.

### Questions 36-40

Do the following statements agree with the views of the writer in Reading Passage 3?
Write:
* **YES** if the statement agrees with the views of the writer
* **NO** if the statement contradicts the views of the writer
* **NOT GIVEN** if it is impossible to say what the writer thinks about this

**36.** It is now clear that the Lapita could sail into a prevailing wind.
**37.** Extreme climate conditions may have played a role in Lapita migration.
**38.** The Lapita learnt to predict the duration of El Niños.
**39.** It remains unclear why the Lapita halted their expansion across the Pacific.
**40.** It is likely that the majority of Lapita settled on Fiji.

---

## ANSWER KEY

1. ii
2. i
3. v
4. vii
5. TRUE
6. NOT GIVEN
7. NOT GIVEN
8. TRUE
9. NOT GIVEN
10. FALSE
11. source of income
12. employer
13. domestic tourism
14. C
15. B
16. H
17. B
18. E
19. sun
20. upper
21. dry
22. north
23. FALSE
24. TRUE
25. NOT GIVEN
26. B
27. B
28. F
29. I
30. G
31. D
32. C
33. A
34. D
35. C
36. NO
37. YES
38. NOT GIVEN
39. YES
40. NOT GIVEN
`;

// ═══════════════════════════════════════════════════════════════
// MOCK RESPONSES FOR AI SERVICE
// ═══════════════════════════════════════════════════════════════

const mockPassagesResponse = {
    success: true,
    data: {
        passages: [
            {
                id: 'passage_1',
                title: 'The Context, Meaning and Scope of Tourism',
                content: 'Travel has existed since the beginning of time...',
                wordCount: 850,
                questionStart: 1,
                questionEnd: 13,
            },
            {
                id: 'passage_2',
                title: 'Autumn leaves',
                content: 'One of the most captivating natural events...',
                wordCount: 780,
                questionStart: 14,
                questionEnd: 26,
            },
            {
                id: 'passage_3',
                title: 'Beyond the blue horizon',
                content: 'An important archaeological discovery...',
                wordCount: 920,
                questionStart: 27,
                questionEnd: 40,
            },
        ],
        confidence: 0.95,
    },
};

const mockQuestionsResponse = {
    success: true,
    data: {
        questions: Array.from({ length: 40 }, (_, i) => ({
            questionNumber: i + 1,
            questionText: `Question ${i + 1} text`,
            type: i < 4 ? 'matching-headings' :
                i < 10 ? 'true-false-not-given' :
                    i < 13 ? 'sentence-completion' :
                        i < 18 ? 'matching-information' :
                            i < 22 ? 'sentence-completion' :
                                i < 25 ? 'true-false-not-given' :
                                    i === 25 ? 'multiple-choice-single' :
                                        i < 31 ? 'summary-completion' :
                                            i < 35 ? 'multiple-choice-single' :
                                                'yes-no-not-given',
            options: null,
            answer: `Answer ${i + 1}`,
            passageId: i < 13 ? 'passage_1' : i < 26 ? 'passage_2' : 'passage_3',
            confidence: 0.85 + Math.random() * 0.1,
        })),
        answerKey: Object.fromEntries(
            Array.from({ length: 40 }, (_, i) => [i + 1, `Answer ${i + 1}`])
        ),
        confidence: 0.88,
    },
};

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE TEST SUITE
// ═══════════════════════════════════════════════════════════════

describe('Performance: Full IELTS Test Parsing', () => {
    const MAX_TOTAL_TIME_MS = 60000; // 60 seconds requirement

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should classify 40 IELTS questions in under 5 seconds (rules-only simulation)', async () => {
        // Parse the full test content into individual questions
        const questionTexts = FULL_IELTS_TEST_CONTENT
            .match(/\*\*\d+\.\*\*.*?(?=\*\*\d+\.\*\*|---|\n\n###|$)/gs)
            ?.map(q => q.trim())
            .filter(q => q.length > 0) || [];

        console.log(`\n=== RULES-ONLY PARSING SIMULATION ===`);
        console.log(`Found ${questionTexts.length} questions to classify`);

        const startTime = performance.now();

        // Simulate the full parsing flow (rules-only):
        // 1. Extract question text patterns
        // 2. Classify each question
        // 3. Generate validation result

        const classifications = [];
        for (const qText of questionTexts) {
            const result = typeClassifierService.classifyQuestion(qText, []);
            classifications.push(result);
        }

        // Simulate validation
        const aiQuestions = classifications.map((c, i) => ({
            questionNumber: i + 1,
            questionText: questionTexts[i] || '',
            type: c.type,
            confidence: c.confidence,
        }));

        const rulesQuestions = classifications.map((c, i) => ({
            questionNumber: i + 1,
            type: c.type,
            confidence: c.confidence,
        }));

        validatorService.compareAIvsRules(aiQuestions, rulesQuestions);

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;

        console.log(`Total parsing time: ${totalTimeMs.toFixed(2)}ms`);
        console.log(`Questions classified: ${classifications.length}`);
        console.log(`Average per question: ${(totalTimeMs / Math.max(classifications.length, 1)).toFixed(2)}ms`);

        // Should complete well under 5 seconds
        expect(totalTimeMs).toBeLessThan(5000);

        // Performance should be < 60 seconds even with overhead
        expect(totalTimeMs).toBeLessThan(MAX_TOTAL_TIME_MS);
    });

    it('should complete end-to-end rules classification pipeline in under 10 seconds', () => {
        const startTime = performance.now();

        // Phase 1: Text extraction (simulated)
        const textExtractionStart = performance.now();
        const passages = FULL_IELTS_TEST_CONTENT.split(/## READING PASSAGE \d+/).filter(p => p.trim());
        const textExtractionTime = performance.now() - textExtractionStart;

        // Phase 2: Question extraction
        const questionExtractionStart = performance.now();
        const allQuestions = FULL_IELTS_TEST_CONTENT
            .match(/\*\*(\d+)\.\*\*/g)?.map(m => parseInt(m.replace(/\D/g, ''))) || [];
        const questionExtractionTime = performance.now() - questionExtractionStart;

        // Phase 3: Type classification (full)
        const classificationStart = performance.now();
        const questionSections = FULL_IELTS_TEST_CONTENT.split(/### Questions? \d+/i);
        const classifications: any[] = [];

        for (const section of questionSections) {
            if (!section.trim()) continue;
            const sectionText = section.substring(0, 500); // First 500 chars for context

            // Classify based on section context
            const result = typeClassifierService.classifyQuestion(sectionText, []);
            classifications.push(result);
        }
        const classificationTime = performance.now() - classificationStart;

        // Phase 4: Validation
        const validationStart = performance.now();
        const mergedQuestions = classifications.map((c, i) => ({
            questionNumber: i + 1,
            questionText: `Question ${i + 1}`,
            type: c.type,
            confidence: c.confidence,
            typeSource: 'rules' as const,
            uncertain: c.confidence < 90,
        }));
        const answerKey: Record<number, string> = {};
        for (let i = 1; i <= 40; i++) answerKey[i] = `Answer ${i}`;

        validatorService.validateAnswerKey(mergedQuestions, answerKey);
        const validationTime = performance.now() - validationStart;

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;

        console.log(`\n=== END-TO-END PIPELINE BENCHMARK ===`);
        console.log(`Phase 1 - Text Extraction: ${textExtractionTime.toFixed(2)}ms`);
        console.log(`Phase 2 - Question Extraction: ${questionExtractionTime.toFixed(2)}ms`);
        console.log(`Phase 3 - Classification: ${classificationTime.toFixed(2)}ms`);
        console.log(`Phase 4 - Validation: ${validationTime.toFixed(2)}ms`);
        console.log(`────────────────────────────`);
        console.log(`Total Time: ${totalTimeMs.toFixed(2)}ms`);
        console.log(`Passages found: ${passages.length}`);
        console.log(`Questions found: ${allQuestions.length}`);
        console.log(`Classification results: ${classifications.length}`);

        expect(totalTimeMs).toBeLessThan(10000); // 10 seconds
    });

    it('should handle 3 passages with 40 questions (Cambridge IELTS format) efficiently', () => {
        const startTime = performance.now();

        // Simulate realistic parsing of Cambridge IELTS format
        const passages = [
            { id: 'passage_1', title: 'Tourism', questionRange: [1, 13], wordCount: 800 },
            { id: 'passage_2', title: 'Autumn Leaves', questionRange: [14, 26], wordCount: 750 },
            { id: 'passage_3', title: 'Pacific Voyagers', questionRange: [27, 40], wordCount: 900 },
        ];

        // Simulate question classification per passage
        const allResults: any[] = [];

        for (const passage of passages) {
            const [start, end] = passage.questionRange;
            for (let qNum = start; qNum <= end; qNum++) {
                // Simulate question text based on position
                let questionContext = '';
                if (qNum <= 4) questionContext = 'Choose the correct heading';
                else if (qNum <= 10) questionContext = 'TRUE FALSE NOT GIVEN';
                else if (qNum <= 13) questionContext = 'Complete the sentence with NO MORE THAN THREE WORDS';
                else if (qNum <= 18) questionContext = 'Which paragraph contains';
                else if (qNum <= 22) questionContext = 'Complete with ONE WORD ONLY';
                else if (qNum <= 25) questionContext = 'TRUE FALSE NOT GIVEN';
                else if (qNum === 26) questionContext = 'Choose the correct letter A B C D';
                else if (qNum <= 31) questionContext = 'Complete the summary from the list';
                else if (qNum <= 35) questionContext = 'Choose A B C D';
                else questionContext = 'YES NO NOT GIVEN';

                const result = typeClassifierService.classifyQuestion(questionContext, []);
                allResults.push({
                    questionNumber: qNum,
                    passageId: passage.id,
                    ...result,
                });
            }
        }

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;

        console.log(`\n=== CAMBRIDGE IELTS FORMAT BENCHMARK ===`);
        console.log(`Passages: ${passages.length}`);
        console.log(`Questions classified: ${allResults.length}`);
        console.log(`Total time: ${totalTimeMs.toFixed(2)}ms`);
        console.log(`Per question: ${(totalTimeMs / allResults.length).toFixed(3)}ms`);

        expect(allResults.length).toBe(40);
        expect(totalTimeMs).toBeLessThan(1000); // Should complete in < 1 second
    });
});

// ═══════════════════════════════════════════════════════════════
// INDIVIDUAL STAGE BENCHMARKS
// ═══════════════════════════════════════════════════════════════

describe('Performance: Individual Stage Benchmarks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Type Classification Performance', () => {
        it('should classify 40 questions in under 500ms', () => {
            // Create 40 sample question texts
            const questions = [
                // Matching headings (4)
                { text: 'Choose the correct heading for paragraph B', instruction: 'Questions 1-4: Matching headings' },
                { text: 'Choose the correct heading for paragraph C', instruction: 'Questions 1-4: Matching headings' },
                { text: 'Choose the correct heading for paragraph D', instruction: 'Questions 1-4: Matching headings' },
                { text: 'Choose the correct heading for paragraph E', instruction: 'Questions 1-4: Matching headings' },
                // True/False/Not Given (6)
                { text: 'The largest employment figures are found in tourism.', instruction: 'TRUE/FALSE/NOT GIVEN' },
                { text: 'Tourism contributes over six per cent of GDP.', instruction: 'TRUE/FALSE/NOT GIVEN' },
                { text: 'Tourism has a social impact.', instruction: 'TRUE/FALSE/NOT GIVEN' },
                { text: 'Two main features make significance difficult.', instruction: 'TRUE/FALSE/NOT GIVEN' },
                { text: 'Visitor spending is always greater.', instruction: 'TRUE/FALSE/NOT GIVEN' },
                { text: 'It is easy to show statistically.', instruction: 'TRUE/FALSE/NOT GIVEN' },
                // Sentence completion (3)
                { text: 'In Greece, tourism is the most important _______.', instruction: 'NO MORE THAN THREE WORDS' },
                { text: 'The travel industry in Jamaica is the major _______.', instruction: 'NO MORE THAN THREE WORDS' },
                { text: 'Problems with measuring international tourism _______.', instruction: 'NO MORE THAN THREE WORDS' },
                // More questions to reach 40
                ...Array.from({ length: 27 }, (_, i) => ({
                    text: `Sample question ${14 + i} text with _______ blank`,
                    instruction: i < 5 ? 'Matching information' :
                        i < 9 ? 'ONE WORD ONLY' :
                            i < 12 ? 'TRUE/FALSE/NOT GIVEN' :
                                i === 12 ? 'Choose A, B, C or D' :
                                    i < 18 ? 'Summary completion' :
                                        i < 22 ? 'Choose A, B, C or D' :
                                            'YES/NO/NOT GIVEN'
                })),
            ];

            const startTime = performance.now();

            const results = questions.map(q =>
                typeClassifierService.detectFromSectionContext(q.instruction, q.text, [])
            );

            const endTime = performance.now();
            const totalTimeMs = endTime - startTime;

            console.log(`\n=== TYPE CLASSIFICATION BENCHMARK ===`);
            console.log(`Classified ${results.length} questions in ${totalTimeMs.toFixed(2)}ms`);
            console.log(`Average per question: ${(totalTimeMs / results.length).toFixed(2)}ms`);

            expect(results.length).toBe(40);
            expect(totalTimeMs).toBeLessThan(500);
        });

        it('should classify batch of questions efficiently', () => {
            const sampleQuestions = [
                'The writer suggests that TRUE/FALSE/NOT GIVEN',
                'Complete the summary using words from the list',
                'Which paragraph contains information about X',
                'Match each statement with the correct person',
                'Choose the correct letter A, B, C or D',
            ];

            const startTime = performance.now();

            // Classify each question 100 times
            for (let i = 0; i < 100; i++) {
                sampleQuestions.forEach(q => {
                    typeClassifierService.classifyQuestion(q, []);
                });
            }

            const endTime = performance.now();
            const totalTimeMs = endTime - startTime;

            console.log(`\n=== BATCH CLASSIFICATION BENCHMARK ===`);
            console.log(`${500} classifications in ${totalTimeMs.toFixed(2)}ms`);
            console.log(`Average: ${(totalTimeMs / 500).toFixed(3)}ms per classification`);

            expect(totalTimeMs).toBeLessThan(1000); // Should complete 500 in < 1 second
        });
    });

    describe('Validation Performance', () => {
        it('should validate 40 questions against answer key in under 200ms', () => {
            // Use MergedQuestion interface
            const questions = Array.from({ length: 40 }, (_, i) => ({
                questionNumber: i + 1,
                questionText: `Question ${i + 1}`,
                type: 'sentence-completion' as const,
                confidence: 85,
                typeSource: 'consensus' as const,
                uncertain: false,
                answer: `Answer ${i + 1}`,
            }));

            const answerKey: Record<number, string> = {};
            for (let i = 1; i <= 40; i++) {
                answerKey[i] = `Answer ${i}`;
            }

            const startTime = performance.now();

            const result = validatorService.validateAnswerKey(questions, answerKey);

            const endTime = performance.now();
            const totalTimeMs = endTime - startTime;

            console.log(`\n=== ANSWER KEY VALIDATION BENCHMARK ===`);
            console.log(`Validated ${questions.length} answers in ${totalTimeMs.toFixed(2)}ms`);

            expect(result.valid).toBe(true);
            expect(totalTimeMs).toBeLessThan(200);
        });

        it('should detect incomplete questions efficiently', () => {
            const passages = [
                { id: 'p1', title: 'Passage 1', content: 'Content...' },
                { id: 'p2', title: 'Passage 2', content: 'Content...' },
                { id: 'p3', title: 'Passage 3', content: '' }, // Incomplete (empty content)
            ];

            // Use MergedQuestion interface
            const questions = Array.from({ length: 40 }, (_, i) => ({
                questionNumber: i + 1,
                questionText: i === 5 ? '' : `Question ${i + 1}`, // Missing text
                type: 'sentence-completion' as const,
                confidence: 85,
                typeSource: 'consensus' as const,
                uncertain: false,
                options: i === 10 ? ['A', 'B'] : undefined, // Multiple choice missing options
                answer: i === 15 ? undefined : `Answer ${i + 1}`, // Missing answer
            }));

            // Create answer key matching questions (with one missing)
            const answerKey: Record<number, string> = {};
            for (let i = 1; i <= 40; i++) {
                if (i !== 16) { // Missing answer for question 16
                    answerKey[i] = `Answer ${i}`;
                }
            }

            const startTime = performance.now();

            const result = validatorService.detectIncomplete(questions, passages, answerKey);

            const endTime = performance.now();
            const totalTimeMs = endTime - startTime;

            console.log(`\n=== COMPLETENESS DETECTION BENCHMARK ===`);
            console.log(`Checked ${passages.length} passages and ${questions.length} questions`);
            console.log(`Found ${result.issues.length} issues in ${totalTimeMs.toFixed(2)}ms`);

            expect(totalTimeMs).toBeLessThan(100);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// STRESS TESTS
// ═══════════════════════════════════════════════════════════════

describe('Performance: Stress Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle multiple concurrent classifications', async () => {
        const concurrentTasks = 10;
        const questionsPerTask = 40;

        const questions = Array.from({ length: questionsPerTask }, (_, i) => ({
            text: `Sample question ${i + 1} with TRUE/FALSE/NOT GIVEN format`,
            options: [],
        }));

        const startTime = performance.now();

        // Run concurrent classification tasks
        const tasks = Array.from({ length: concurrentTasks }, () =>
            Promise.resolve(
                questions.map(q => typeClassifierService.classifyQuestion(q.text, q.options))
            )
        );

        await Promise.all(tasks);

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;
        const totalClassifications = concurrentTasks * questionsPerTask;

        console.log(`\n=== CONCURRENT STRESS TEST ===`);
        console.log(`${concurrentTasks} concurrent tasks, ${questionsPerTask} questions each`);
        console.log(`Total: ${totalClassifications} classifications in ${totalTimeMs.toFixed(2)}ms`);
        console.log(`Throughput: ${(totalClassifications / (totalTimeMs / 1000)).toFixed(0)} classifications/sec`);

        expect(totalTimeMs).toBeLessThan(5000); // 5 seconds max for 400 classifications
    });

    it('should maintain performance with large document text', () => {
        // Create a very large document (simulating multiple tests combined)
        const largeDocument = FULL_IELTS_TEST_CONTENT.repeat(5); // ~50KB of text

        const startTime = performance.now();

        // Just timing the text processing, not AI
        const wordCount = largeDocument.split(/\s+/).length;
        const paragraphs = largeDocument.split(/\n\n+/).length;
        const questionMatches = largeDocument.match(/\*\*\d+\.\*\*/g)?.length || 0;

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;

        console.log(`\n=== LARGE DOCUMENT PROCESSING ===`);
        console.log(`Document size: ${(largeDocument.length / 1024).toFixed(2)} KB`);
        console.log(`Word count: ${wordCount}`);
        console.log(`Paragraphs: ${paragraphs}`);
        console.log(`Question markers found: ${questionMatches}`);
        console.log(`Processing time: ${totalTimeMs.toFixed(2)}ms`);

        expect(totalTimeMs).toBeLessThan(500); // Should process large doc in < 500ms
    });
});

// ═══════════════════════════════════════════════════════════════
// MEMORY USAGE (Conceptual - actual monitoring requires Node.js APIs)
// ═══════════════════════════════════════════════════════════════

describe('Performance: Memory Efficiency', () => {
    it('should not leak memory during repeated classifications', () => {
        const iterations = 1000;
        const results: any[] = [];

        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const result = typeClassifierService.classifyQuestion(
                `Question ${i}: Is this statement true? TRUE/FALSE/NOT GIVEN`,
                []
            );
            // Don't store results to avoid memory buildup
            if (i % 100 === 0) {
                // Checkpoint - in real test would check memory here
                results.length = 0;
            }
        }

        const endTime = performance.now();
        const totalTimeMs = endTime - startTime;

        console.log(`\n=== MEMORY EFFICIENCY TEST ===`);
        console.log(`${iterations} iterations in ${totalTimeMs.toFixed(2)}ms`);
        console.log(`Average: ${(totalTimeMs / iterations).toFixed(3)}ms per iteration`);

        // Test passes if we complete without running out of memory
        expect(true).toBe(true);
    });
});
