import { describe, it, expect } from 'vitest';

const PATTERNS = {
    sectionHeader: /^(?:(?:SECTION|Part|Phần|Ph[aầ]n)\s*(?:[IVXLCDM]+|\d+)[.:\s]*(.+)|(?:[IVXLCDM]{2,}|[IVX])[.:\s]+(.{4,}))/im,
    question: /^(?:(?:C[aâ]u\s*|Question\s*|Q\.?\s*)(?:s?\s*)?(\d+)[.):\s]*(.*)|([0-9]+)[.):\s]+(.{3,}))/i,
    optionLine: /^([A-H])[.):\s]+(.+)/i,
    answerKeyHeader: /^(?:[=\-*#\s]*(?:[IVXLCDM]+\.?\s*|\d+\.?\s*)?)?(?:ANSWER\s*KEY|ĐÁP\s*ÁN|KEY|KEYS|BẢNG\s*ĐÁP\s*ÁN|MÃ\s*Đ[ÊỀ].*ĐÁP\s*ÁN)[:\s=\-*]*/i,
    answerKeyLine: /(?:C[aâ]u\s*)?(\d+)[:.)\-\s]+(?:Đ[áa]p\s*[áa]n[:\s]*)?([A-H])/gi,
    answerKeySpaced: /^\s*(\d+)[.):\s]+([A-H])\s*$/i,
};

const INPUT_TEXT = `[CONFIDENCE: 80]

Question 1.
A. economic
B. economy
C. economically
D. economize

Question 2.
A. who
B. which
C. where
D. that

Question 3.
A. establishing
B. established
C. establish
D. to establish

Question 4.
A. implement
B. implementation
C. implementing
D. implemented

Question 5.
A. amount
B. number
C. deal
D. plenty

Question 6.
A. increased
B. decreased
C. expanded
D. developed

Question 7.
A. back
B. heart
C. front
D. edge

Question 8.
A. compete
B. competition
C. competitive
D. competitively

Question 9.
A. eco-friendly
B. unfriendly
C. friendly
D. eco-friendlier

Question 10.
A. cultural
B. cross-cultural
C. culture
D. culturally

Question 11.
A. impact
B. change
C. effect
D. influence

Question 12.
A. limited
B. exclusive
C. common
D. public

Question 13.
a. Yes, it's incredible to see how far we've come in such a short time.
b. Did you hear that Vietnam has become a top destination for tech investment in 2025?
c. That's true. The government's focus on digital transformation is really paying off.
A. b-a-c
B. b-c-a
C. a-b-c
D. c-b-a

Question 14.
a. First, the country has signed numerous free trade agreements.
b. There are several reasons why Vietnam's economy is booming.
c. Second, its young and skilled workforce attracts many multinational corporations.
d. Finally, the strategic location in Southeast Asia makes it a perfect logistics hub.
A. b-a-c-d
B. b-c-a-d
C. a-b-c-d
D. d-c-b-a

Question 15.
a. However, we must also address environmental challenges to ensure long-term growth.
b. Vietnam has made significant progress in reducing poverty and improving education.
c. In conclusion, while there are hurdles, the future looks bright for our nation.
d. These achievements have laid a solid foundation for sustainable development.
A. b-d-a-c
B. b-a-d-c
C. a-b-d-c
D. d-b-a-c

Question 16.
a. It's not just about the economy; our cultural heritage is also gaining global recognition.
b. I've noticed more international tourists visiting our traditional festivals lately.
c. Exactly! Our unique traditions are becoming a major draw for people around the world.
A. a-b-c
B. b-a-c
C. c-a-b
D. a-c-b

Question 17.
a. Moreover, renewable energy projects are popping up all over the country.
b. Vietnam is taking bold steps towards a greener future.
c. For instance, the transition to electric vehicles is being heavily promoted.
d. These initiatives are crucial for meeting our net-zero emissions goal by 2050.
A. b-c-a-d
B. b-a-c-d
C. c-b-a-d
D. a-b-c-d

Question 18.
A. evolved
B. involved
C. revolved
D. dissolved

Question 19.
A. marked
B. made
C. took
D. gave

Question 20.
A. actively
B. activity
C. active
D. activate

Question 21.
A. focus
B. focal
C. focused
D. focusing

Question 22.
A. pillar
B. wall
C. bridge
D. gate

Question 23.
What is the main idea of the passage?
A. Vietnam's efforts to attract foreign investment and its economic prospects.
B. The role of Free Trade Agreements in Vietnam's manufacturing sector.
C. The importance of education and vocational training in Vietnam.
D. Challenges facing Vietnam's infrastructure development.

Question 24.
The word magnet in paragraph 1 is closest in meaning to:
A. attraction
B. repellent
C. barrier
D. source

Question 25.
According to the passage, which of the following is NOT mentioned as a reason for Vietnam's FDI success?
A. Strategic location
B. Pro-business policies
C. High labor costs
D. Improved infrastructure

Question 26.
The word These investments in paragraph 1 refers to:
A. FDI from Samsung, LG, and Intel
B. Investments in ports and highways
C. Government's commitment to infrastructure
D. Vietnamese businesses' access to markets

Question 27.
What do Free Trade Agreements (FTAs) provide for Vietnamese businesses?
A. Better access to international markets
B. Lower taxes on local products
C. More jobs for unskilled workers
D. Reduced competition from foreign companies

Question 28.
Why is there a growing need for a more skilled workforce in Vietnam?
A. Because Vietnam is moving up the value chain.
B. Because foreign companies are leaving the country.
C. Because the population is aging rapidly.
D. Because the government is cutting education funding.

Question 29.
The word trajectory in paragraph 3 is closest in meaning to:
A. path
B. decline
C. speed
D. result

Question 30.
Which of the following can be inferred from the passage?
A. Vietnam's economy will face significant hurdles but has strong potential.
B. Vietnam has already become the leading economy in Southeast Asia.
C. Environmental concerns are no longer a priority for the government.
D. Foreign companies are hesitant to invest in Vietnam due to bureaucracy.

Question 31.
Which of the following is the best title for the passage?
A. Vietnam's Journey from Agriculture to High-Tech Hub
B. The Impact of Doi Moi on Vietnam's Textile Industry
C. Challenges and Opportunities in Vietnam's Green Economy
D. The Role of Samsung in Vietnam's Economic Development

Question 32.
The word pivotal in paragraph 1 is closest in meaning to:
A. crucial
B. minor
C. optional
D. secondary

Question 33.
According to paragraph 2, what was a primary characteristic of early FDI in Vietnam?
A. Concentration in high-tech manufacturing
B. Focus on labor-intensive industries
C. Significant investment in the service sector
D. Development of specialized economic zones

Question 34.
The word it in paragraph 2 refers to:
A. Vietnam
B. Samsung
C. smartphone
D. South Korea

Question 35.
According to the passage, why has Vietnam become a major hub for smartphone production?
A. Because of its abundant and low-cost labor force in textiles.
B. Due to significant investments from tech giants like Samsung.
C. Because it has the most advanced logistics system in Asia.
D. Due to the lack of environmental regulations in the country.

Question 36.
The word bottlenecks in paragraph 3 most likely means:
A. obstacles
B. facilities
C. advantages
D. solutions

Question 37.
Which of the following is NOT mentioned as a challenge to Vietnam's future growth?
A. Infrastructure bottlenecks
B. Shortage of highly skilled talent
C. Lack of tax incentives for foreign companies
D. Environmental sustainability issues

Question 38.
How is the Vietnamese government responding to environmental concerns?
A. By prioritizing rapid industrial growth over protection.
B. By implementing stricter regulations and promoting green investments.
C. By reducing the number of specialized economic zones.
D. By focusing solely on labor-intensive industries.

Question 39.
Which of the following is TRUE according to the passage?
A. Vietnam's economic reforms have eliminated all bureaucratic barriers.
B. The Vietnamese government has successfully addressed skilled labor shortages.
C. Environmental sustainability has been prioritized over industrial growth.
D. Samsung has invested over 17 billion in Vietnam for smartphone production.

Question 40.
Which of the following best summarises the passage?
A. Vietnam has evolved into a prime investment destination through reforms.
B. Vietnam's economic zones have created opportunities for retail companies.
C. Vietnam's manufacturing success has been driven primarily by Samsung.
D. Vietnam faces insurmountable infrastructure and labor challenges.

=== 4. ANSWER KEY ===

1. A
2. B
3. B
4. A
5. B
6. A
7. B
8. A
9. A
10. B
11. A
12. B
13. A
14. A
15. A
16. B
17. A
18. A
19. A
20. A
21. A
22. A
23. A
24. A
25. C
26. A
27. A
28. A
29. A
30. A
31. A
32. A
33. B
34. A
35. B
36. A
37. C
38. B
39. D
40. A`;

interface MiniSection {
    name: string;
    startLine: number;
    endLine: number;
    questions: MiniQuestion[];
    instructionText: string;
}

interface MiniQuestion {
    questionNumber: number;
    text: string;
    options: string[];
}

function detectSections(lines: string[]): MiniSection[] {
    const sections: MiniSection[] = [];
    let current: MiniSection | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();

        if (PATTERNS.answerKeyHeader.test(line)) {
            if (current) {
                current.endLine = i - 1;
                sections.push(current);
                current = null;
            }
            break;
        }

        const m = line.match(PATTERNS.sectionHeader);
        if (m) {
            if (current) {
                current.endLine = i - 1;
                sections.push(current);
            }
            current = {
                name: (m[1] || m[2] || '').trim() || `Section ${sections.length + 1}`,
                startLine: i,
                endLine: lines.length - 1,
                questions: [],
                instructionText: '',
            };
        }
    }

    if (current) {
        current.endLine = lines.length - 1;
        sections.push(current);
    }

    if (sections.length === 0) {
        sections.push({
            name: 'General',
            startLine: 0,
            endLine: lines.length - 1,
            questions: [],
            instructionText: '',
        });
    }

    return sections;
}

function parseQuestions(lines: string[], sections: MiniSection[]): void {
    for (const section of sections) {
        let currentQ: MiniQuestion | null = null;
        let instructionLines: string[] = [];
        let foundFirst = false;

        for (let i = section.startLine + 1; i <= section.endLine; i++) {
            const line = lines[i]?.trim() || '';
            if (!line) continue;

            if (PATTERNS.answerKeyHeader.test(line)) break;

            const qm = line.match(PATTERNS.question);
            const om = line.match(PATTERNS.optionLine);

            if (qm && !foundFirst) {
                foundFirst = true;
                section.instructionText = instructionLines.join(' ').trim();
            }
            if (!foundFirst) {
                instructionLines.push(line);
                continue;
            }

            if (qm) {
                const qNum = qm[1] || qm[3];
                const qText = qm[2] || qm[4] || '';
                if (qNum) {
                    const clean = qText.trim();
                    if (clean.length <= 2 && /^[A-H]$/i.test(clean)) continue;
                    if (currentQ && (currentQ.text || currentQ.options.length > 0)) {
                        section.questions.push(currentQ);
                    }
                    currentQ = { questionNumber: parseInt(qNum, 10), text: clean, options: [] };
                }
            } else if (om && currentQ) {
                currentQ.options.push(om[2]!.trim());
            } else if (currentQ && currentQ.options.length === 0) {
                if (line.length > 2 && !/^[-=_~*]{3,}$/.test(line)) currentQ.text += ` ${line}`;
            }
        }

        if (currentQ && (currentQ.text || currentQ.options.length > 0)) {
            section.questions.push(currentQ);
        }
        if (!section.instructionText && instructionLines.length > 0) {
            section.instructionText = instructionLines.join(' ').trim();
        }
    }
}

function extractAnswerKey(lines: string[]): Record<number, string> {
    const key: Record<number, string> = {};
    let inAnswerSection = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (PATTERNS.answerKeyHeader.test(trimmed)) {
            inAnswerSection = true;
            continue;
        }
        if (!inAnswerSection) continue;

        const spacedMatch = trimmed.match(PATTERNS.answerKeySpaced);
        if (spacedMatch) {
            key[parseInt(spacedMatch[1]!, 10)] = spacedMatch[2]!.toUpperCase();
            continue;
        }

        PATTERNS.answerKeyLine.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PATTERNS.answerKeyLine.exec(trimmed)) !== null) {
            key[parseInt(m[1]!, 10)] = m[2]!.toUpperCase();
        }
    }

    return key;
}

describe('paste-parse regression', () => {
    const lines = INPUT_TEXT.split('\n');
    const sections = detectSections(lines);
    parseQuestions(lines, sections);
    const allQuestions = sections.flatMap((section) => section.questions);
    const answerKey = extractAnswerKey(lines);

    it('keeps section detection bounded', () => {
        expect(sections.length).toBeLessThanOrEqual(3);
    });

    it('parses the full 40-question set', () => {
        expect(allQuestions).toHaveLength(40);

        const q1 = allQuestions.find((q) => q.questionNumber === 1);
        const q23 = allQuestions.find((q) => q.questionNumber === 23);
        const q40 = allQuestions.find((q) => q.questionNumber === 40);

        expect(q1).toBeDefined();
        expect(q1?.options).toHaveLength(4);
        expect(q1?.options[0]).toBe('economic');

        expect(q23?.text).toContain('main idea');
        expect(q23?.options).toHaveLength(4);

        expect(q40?.text).toContain('summarises');

        for (let n = 1; n <= 12; n++) {
            const question = allQuestions.find((q) => q.questionNumber === n);
            expect(question).toBeDefined();
            expect(question?.options).toHaveLength(4);
        }

        for (let n = 13; n <= 17; n++) {
            const question = allQuestions.find((q) => q.questionNumber === n);
            expect(question).toBeDefined();
            expect(question?.options.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('extracts the answer key cleanly', () => {
        expect(Object.keys(answerKey)).toHaveLength(40);
        expect(answerKey[1]).toBe('A');
        expect(answerKey[25]).toBe('C');
        expect(answerKey[40]).toBe('A');
    });
});
