/**
 * THCS Draft Converter â€” ParsedTest â†’ THCSDraft
 *
 * Extracted from thcsDocumentParser.service.ts for clarity.
 * Converts the intermediate ParsedTest format into the final
 * THCSDraft structure used by the editor UI.
 */

import type { THCSQuestionType, MCQIntent } from '../../types/thcs-test.types';
import type { ParsedTest } from './thcsDocumentParser.service';

// â”€â”€ Task 10.8: ParsedTest â†’ THCSDraft Converter â”€â”€

export function convertParsedToThcsDraft(parsedTest: ParsedTest): {
    metadata: {
        title: string;
        gradeLevel: number;
        duration: number;
        totalPoints: number;
        examType?: string;
    };
    sections: Array<{
        id: string;
        name: string;
        order: number;
        instructionText: string;
        isCustomInstruction: boolean;
        pointMode: 'auto' | 'manual';
        totalPoints: number;
        defaultQuestionType: THCSQuestionType;
        shuffle: boolean;
        shuffleOptions: boolean;
        layout: 'single-column' | 'two-column';
        questions: Array<{
            id: string;
            questionNumber: number;
            type: THCSQuestionType;
            intent?: MCQIntent;
            questionText: string;
            options: [string, string, string, string];
            correctAnswer: string;
            optionUnderlines?: [string, string, string, string];
            underlinedParts?: string;
        }>;
        // Passage data (flat format per Gotcha #1)
        passageTitle?: string;
        passageContent?: string;
        passage?: {
            id: string;
            content: string;
            title?: string;
            wordCount: number;
        };
    }>;
} {
    const READING_TYPES: THCSQuestionType[] = ['reading-comprehension', 'reading-announcement', 'reading-cloze-mcq', 'reading-cloze-wordbank'];

    // MCQ Intent types â€” these should have `intent` set to the same value as `type`
    const MCQ_INTENTS: THCSQuestionType[] = [
        'pronunciation', 'word-stress',
        'mcq-grammar', 'mcq-vocabulary', 'mcq-sign-notice',
        'dialogue-response',
        'reading-cloze-mcq', 'reading-comprehension', 'reading-announcement',
        'sentence-arrangement', 'closest-meaning', 'error-identification',
        'synonym-mcq', 'antonym-mcq', 'word-reference',
    ];

    // Helper: strip {{}} from text to get plain text
    const stripBraces = (text: string): string => text.replace(/\{\{(.*?)\}\}/g, '$1');

    // Pre-compute total question count for per-question point distribution
    // Vietnamese THCS standard: 10 total points, equally distributed per question
    const totalQuestions = parsedTest.sections.reduce((sum, s) => sum + s.questions.length, 0);
    const pointsPerQuestion = totalQuestions > 0 ? 10 / totalQuestions : 0;

    // Track running total for rounding correction on last section
    let runningPointsTotal = 0;

    const sections = parsedTest.sections.map((ps, si) => {
        // â”€â”€ Safety net: re-check sentence-rewrite with MCQ options â”€â”€
        // In case validateAIResult didn't catch it, double-check here at draft conversion time.
        let effectiveType = ps.detectedType;
        if (
            (effectiveType === 'sentence-rewrite' || effectiveType === 'sentence-rewrite-keyword') &&
            ps.questions.length > 0 &&
            ps.questions.every(q => {
                const opts = q.options || [];
                const nonEmptyOpts = opts.filter((o: string) => o && o.trim().length > 0);
                const hasValidAnswer = /^[A-Da-d]$/.test(q.correctAnswer || '');
                return nonEmptyOpts.length === 4 && hasValidAnswer;
            })
        ) {
            console.log(`[convertParsedToThcsDraft] Safety reclassify "${ps.name}" from ${effectiveType} â†’ closest-meaning`);
            effectiveType = 'closest-meaning';
        }

        const isPronunciationType = effectiveType === 'pronunciation' || effectiveType === 'word-stress';
        const isErrorType = effectiveType === 'error-identification';
        const isSynonymAntonym = effectiveType === 'synonym-mcq' || effectiveType === 'antonym-mcq'
            || effectiveType === 'closest-meaning';

        const questions = ps.questions.map((pq) => {
            // Use reclassified type if applicable
            const qType = (effectiveType !== ps.detectedType) ? effectiveType : pq.type;
            const isMCQIntent = MCQ_INTENTS.includes(qType);

            // Base question object
            const q: {
                id: string;
                questionNumber: number;
                type: THCSQuestionType;
                intent?: MCQIntent;
                questionText: string;
                options: [string, string, string, string];
                correctAnswer: string;
                optionUnderlines?: [string, string, string, string];
                underlinedParts?: string;
            } = {
                id: crypto.randomUUID(),
                questionNumber: pq.questionNumber,
                type: qType,
                questionText: pq.text || '',
                options: (pq.options || ['', '', '', '']) as [string, string, string, string],
                correctAnswer: pq.correctAnswer || '',
            };

            // Set intent for MCQ types (critical â€” renderer checks q.intent, not q.type)
            if (isMCQIntent) {
                q.intent = qType as MCQIntent;
            }

            // â”€â”€ Pronunciation / Word-stress â”€â”€
            // Options contain {{}} markup â†’ extract as optionUnderlines, strip from plain options
            if (isPronunciationType) {
                const rawOptions = pq.options || [];
                const hasMarkup = rawOptions.some(opt => opt.includes('{{'));
                if (hasMarkup) {
                    q.optionUnderlines = rawOptions.map(opt => opt) as [string, string, string, string];
                    q.options = rawOptions.map(opt => stripBraces(opt)) as [string, string, string, string];
                }
                // Pronunciation questions often have empty questionText â€” that's correct
            }

            // â”€â”€ Error identification â”€â”€
            // Question text contains {{}} markup â†’ store as underlinedParts
            if (isErrorType && pq.text && pq.text.includes('{{')) {
                q.underlinedParts = pq.text;
                q.questionText = stripBraces(pq.text);
                // Options for error-id are the underlined parts (A/B/C/D labels)
                // They should be plain text (not the {{}} markup)
                q.options = (pq.options || ['', '', '', '']).map(opt => stripBraces(opt)) as [string, string, string, string];
            }

            // â”€â”€ Synonym / Antonym / Closest meaning â”€â”€
            // Question text may contain {{}} for the word to find synonym/antonym of
            // Keep {{}} in questionText â€” the renderer should handle display
            if (isSynonymAntonym && pq.text && pq.text.includes('{{')) {
                // Store the marked-up text as underlinedParts for rendering
                q.underlinedParts = pq.text;
                // Also provide clean version for plain display
                q.questionText = stripBraces(pq.text);
            }

            // â”€â”€ Writing question decomposition (sentence-rewrite / sentence-rewrite-keyword) â”€â”€
            // AI returns flat text like "Original sentence. => Start..." in `text` field.
            // THCSWritingBlock/THCSWritingRenderer expect structured fields:
            //   originalSentence, sentenceStarter (E1), keyword (E2), modelAnswers
            const isWritingType = qType === 'sentence-rewrite' || qType === 'sentence-rewrite-keyword';
            if (isWritingType && pq.text) {
                const rawText = pq.text;
                const answer = pq.correctAnswer || '';

                // Pattern 1 â€” E1 (given start): "Original. => Start..."
                // Common separators: =>, â†’, âžœ, â‡’, =, --â†’
                const arrowMatch = rawText.match(/^(.+?)\s*(?:=>|â†’|âžœ|â‡’|=\s*>)\s*(.+)$/s);
                if (arrowMatch && arrowMatch[1] && arrowMatch[2]) {
                    const originalPart = arrowMatch[1].trim();
                    const starterPart = arrowMatch[2].trim()
                        .replace(/_{2,}.*$/, '')  // strip trailing blanks
                        .replace(/\.{3,}$/, '')   // strip trailing ellipsis
                        .trim();

                    (q as any).originalSentence = originalPart;
                    if (starterPart) {
                        (q as any).sentenceStarter = starterPart;
                    }
                } else {
                    // No arrow separator â€” whole text is the original sentence
                    (q as any).originalSentence = rawText.replace(/_{2,}.*$/, '').trim();
                }

                // Pattern 2 â€” E2 (keyword): extract from text or answer
                // Look for "(KEYWORD)" at end of sentence, or "Using: KEYWORD" patterns
                if (qType === 'sentence-rewrite-keyword') {
                    // Priority 1: keyword in parentheses â€” "(POSSIBLE)", "(FOR)"
                    // Handles both: "(POSSIBLE)" at end and "(POSSIBLE) => It ______" with starter
                    const parenKwMatch = rawText.match(/\(([A-Z][A-Z\s]*)\)\s*(?:$|(?:=>|â†’|âžœ|â‡’|=\s*>))/);
                    // Priority 2: "Using: KEYWORD" or "KEYWORD: ALTHOUGH" syntax
                    const usingKwMatch = rawText.match(/(?:Using|KEYWORD|Key\s*word)\s*[:ï¼š]\s*([A-Z\s]+)/i)
                        || answer.match(/(?:Using|KEYWORD|Key\s*word)\s*[:ï¼š]\s*([A-Z\s]+)/i);

                    const kwMatch = parenKwMatch || usingKwMatch;
                    if (kwMatch && kwMatch[1]) {
                        (q as any).keyword = kwMatch[1].trim().toUpperCase();
                        // If keyword was in the text, strip it from originalSentence
                        if (parenKwMatch && (q as any).originalSentence) {
                            (q as any).originalSentence = ((q as any).originalSentence as string)
                                .replace(/\s*\([A-Z][A-Z\s]*\)\s*$/, '').trim();
                        }
                    }

                    // E2 starter extraction: if no arrow separator was found,
                    // try to extract starter from the answer key / correctAnswer
                    // e.g., answer "It's possible..." â†’ starter "It"
                    // e.g., answer "We have played..." â†’ starter "We"
                    // e.g., answer "My parents prefer..." â†’ starter "My"
                    if (!(q as any).sentenceStarter && answer) {
                        // Get first 1-3 words from the answer as the starter
                        const answerWords = answer.split(/\s+/);
                        if (answerWords.length >= 2) {
                            // Use first word as starter (typical for "It", "We", "My", "If", "Her")
                            const firstWord = answerWords[0]!;
                            // Validate it looks like a sentence starter (capitalized or common pronoun)
                            if (/^[A-Z]/.test(firstWord) || /^(it|we|my|if|her|his|the|she|he|they)$/i.test(firstWord)) {
                                (q as any).sentenceStarter = firstWord;
                            }
                        }
                    }
                }

                // Seed model answers from correctAnswer
                // Split alternatives: "expensive/costly" â†’ two model answers
                if (answer) {
                    const modelAnswers: string[] = [];

                    // If answer contains "/" for alternatives, expand them
                    if (answer.includes('/')) {
                        // Common pattern: "as expensive/costly as staying in a hotel"
                        // Try to build full sentences from alternatives
                        const slashParts = answer.split('/');
                        if (slashParts.length === 2 && slashParts[0]!.length < 30 && slashParts[1]!.length < 30) {
                            // Short alternatives â€” likely single word alternates
                            // Keep the full answer as-is plus expanded forms
                            modelAnswers.push(answer);
                            // Also add expanded versions if the slash appears mid-sentence
                            const starterPrefix = (q as any).sentenceStarter
                                ? (q as any).sentenceStarter + ' '
                                : '';
                            // Try to expand: find context around the slash
                            const slashIdx = answer.indexOf('/');
                            const before = answer.substring(0, slashIdx);
                            const afterSlash = answer.substring(slashIdx + 1);
                            // Find word boundary before the slash
                            const wordBefore = before.match(/^(.*?)(\S+)$/s);
                            if (wordBefore && afterSlash) {
                                const prefix = wordBefore[1];
                                const word1 = wordBefore[2];
                                // Find word boundary after the slash
                                const wordAfter = afterSlash.match(/^(\S+)(.*)/s);
                                if (wordAfter) {
                                    const word2 = wordAfter[1];
                                    const suffix = wordAfter[2];
                                    const expanded1 = (prefix ?? '') + (word1 ?? '') + suffix;
                                    const expanded2 = (prefix ?? '') + (word2 ?? '') + suffix;
                                    // Don't prepend starter if expanded answer already begins with it
                                    if (starterPrefix && expanded1.toLowerCase().startsWith(starterPrefix.trim().toLowerCase())) {
                                        modelAnswers.push(expanded1);
                                        modelAnswers.push(expanded2);
                                    } else {
                                        modelAnswers.push(starterPrefix + expanded1);
                                        modelAnswers.push(starterPrefix + expanded2);
                                    }
                                }
                            }
                        } else {
                            modelAnswers.push(answer);
                        }
                    } else {
                        // Single answer â€” add with starter prefix
                        const starterPrefix = (q as any).sentenceStarter
                            ? (q as any).sentenceStarter + ' '
                            : '';
                        // Don't prepend starter if answer already begins with it
                        if (starterPrefix && answer.toLowerCase().startsWith(starterPrefix.trim().toLowerCase())) {
                            modelAnswers.push(answer);
                        } else {
                            modelAnswers.push(starterPrefix + answer);
                        }
                    }

                    // Deduplicate and clean
                    const unique = [...new Set(modelAnswers.map(a => a.trim()).filter(Boolean))];
                    if (unique.length > 0) {
                        (q as any).modelAnswers = unique;
                    }
                }

                // Clear questionText â€” writing renderer uses originalSentence + sentenceStarter instead
                q.questionText = '';
            }

            // â”€â”€ Fill-in question mapping (verb-form / word-form) â”€â”€
            // THCSFillInBlock reads from `sentenceTemplate` and `blankAnswers`, NOT `questionText`
            // Map questionText â†’ sentenceTemplate, and seed blankAnswers from correctAnswer
            const isFillInType = qType === 'verb-form' || qType === 'word-form';
            if (isFillInType && q.questionText) {
                (q as any).sentenceTemplate = q.questionText;
                // Seed blankAnswers from correctAnswer
                if (q.correctAnswer) {
                    const blankCount = (q.questionText.match(/_{2,}/g) || []).length;
                    const answers = q.correctAnswer.split(/\s*[\/,]\s*/).filter(Boolean);
                    const blankAnswers = [];
                    for (let b = 0; b < Math.max(blankCount, 1); b++) {
                        blankAnswers.push({
                            acceptedAnswers: b === 0 ? answers : [answers[b] || ''],
                        });
                    }
                    (q as any).blankAnswers = blankAnswers;
                }
            }

            return q;
        });

        // â”€â”€ Word bank extraction for reading-cloze-wordbank sections â”€â”€
        // Extract word bank from instruction text or answer key
        if (effectiveType === 'reading-cloze-wordbank') {
            // Try to extract from instruction text: [WORD BANK: major / biodiversity / that / with / identified]
            const wbMatch = ps.instructionText?.match(/\[WORD\s*BANK\s*[:ï¼š]\s*(.+?)\]/i)
                || ps.passageText?.match(/\[WORD\s*BANK\s*[:ï¼š]\s*(.+?)\]/i);
            let wordBankWords: string[] = [];
            if (wbMatch && wbMatch[1]) {
                wordBankWords = wbMatch[1].split(/\s*[\/,|]\s*/).map(w => w.trim()).filter(Boolean);
            }

            // Fallback: reconstruct word bank from answer key (correctAnswer fields)
            if (wordBankWords.length === 0) {
                wordBankWords = questions
                    .map(q => q.correctAnswer)
                    .filter(Boolean)
                    .map(a => (a as string).trim())
                    .filter(Boolean);
            }

            // Apply word bank to all questions in this section
            if (wordBankWords.length > 0) {
                // Generate passageTemplate from section passageText
                // Convert "(26) ______" pattern to "___(1)___" format for renderer
                let templatePassage = ps.passageText || '';
                if (templatePassage) {
                    // Strip [WORD BANK: ...] from passage
                    templatePassage = templatePassage.replace(/\[WORD\s*BANK\s*[:\uff1a]\s*.+?\]\s*/gi, '').trim();

                    // Convert numbered blanks: "(26) ______" â†’ "___(1)___"
                    // Map question numbers to sequential blank numbers (1, 2, 3...)
                    questions.forEach((q, idx) => {
                        const qNum = q.questionNumber;
                        const blankNum = idx + 1;
                        // Replace patterns: (26) ______, (26)______, 26. ______
                        const numRegex = new RegExp(
                            `\\(?${qNum}\\)?\\s*_{2,}`,
                            'g'
                        );
                        templatePassage = templatePassage.replace(numRegex, `___(${blankNum})___`);
                    });

                    // Also handle simple ______ blanks (no number) â€” assign sequentially
                    let seqBlank = 0;
                    templatePassage = templatePassage.replace(/_{2,}/g, () => {
                        seqBlank++;
                        return `___(${seqBlank})___`;
                    });
                }

                questions.forEach((q, idx) => {
                    (q as any).wordBank = [...wordBankWords];
                    // Strip hallucinated MCQ options â€” word bank answers are fill-in, not A/B/C/D
                    q.options = ['', '', '', ''] as [string, string, string, string];
                    if (idx === 0) {
                        // First question gets the full passage template with all blanks
                        if (templatePassage) {
                            (q as any).passageTemplate = templatePassage;
                        }
                        // Map ALL blanks to their correct answers
                        const fullMapping: Record<string, string> = {};
                        questions.forEach((mq, mi) => {
                            if (mq.correctAnswer && typeof mq.correctAnswer === 'string') {
                                fullMapping[String(mi + 1)] = mq.correctAnswer;
                            }
                        });
                        (q as any).blankMapping = fullMapping;
                    } else {
                        // Subsequent questions â†’ descriptive text, no passage duplication
                        q.questionText = `Fill in blank (${q.questionNumber}) in the passage.`;
                        if (q.correctAnswer && typeof q.correctAnswer === 'string') {
                            (q as any).blankMapping = { '1': q.correctAnswer };
                        }
                    }
                });
            }
        }

        const isReading = READING_TYPES.includes(ps.detectedType);
        const isCloze = ps.detectedType === 'reading-cloze-mcq' || ps.detectedType === 'reading-cloze-wordbank';

        // Points per question: 10 / totalQuestions (e.g., 40 questions = 0.25 each)
        // Section points = questions.length Ã— pointsPerQuestion
        // Last section absorbs rounding remainder to guarantee total = 10.0
        const isLastSection = si === parsedTest.sections.length - 1;
        let sectionPoints: number;
        if (isLastSection && totalQuestions > 0) {
            // Last section gets the remainder to avoid rounding drift
            sectionPoints = Math.round((10 - runningPointsTotal) * 100) / 100;
        } else {
            sectionPoints = Math.round(pointsPerQuestion * questions.length * 100) / 100;
        }
        runningPointsTotal += sectionPoints;

        // Build passage data for reading sections
        let passageContent = ps.passageText || '';

        // Fallback: reconstruct passage from question texts if AI didn't provide a separate passage
        // This handles reading-comprehension, reading-cloze-mcq, reading-cloze-wordbank, etc.
        if (isReading && !passageContent && questions.length > 0) {
            // Check if question texts contain passage fragments (AI embedded passage in each question)
            const hasPassageFragments = questions.some(q => q.questionText && q.questionText.length > 50);
            if (hasPassageFragments) {
                if (isCloze) {
                    // Cloze: reconstruct passage with blank markers
                    passageContent = questions.map(q => {
                        const text = q.questionText || '';
                        // Replace bare blanks (not preceded by (N)) with numbered blanks
                        // Don't double-number blanks that already have (N) prefix
                        return text.replace(/(?<!\(\d+\)\s*)_{2,}/g, `(${q.questionNumber})______`);
                    }).join(' ');
                    // Clear question texts since context is in the passage
                    questions.forEach(q => { q.questionText = ''; });

                    // For wordbank: also populate passageTemplate on first question
                    // since WordBankClozeSection reads from firstQ.passageTemplate
                    if (effectiveType === 'reading-cloze-wordbank' && questions[0]) {
                        let templatePassage = passageContent;
                        // Strip [WORD BANK: ...] from passage if present
                        templatePassage = templatePassage.replace(/\[WORD\s*BANK\s*[:\uff1a]\s*.+?\]\s*/gi, '').trim();
                        // Convert numbered blanks: "(26)______" â†’ "___(1)___"
                        questions.forEach((q, idx) => {
                            const qNum = q.questionNumber;
                            const blankNum = idx + 1;
                            const numRegex = new RegExp(
                                `\\(?${qNum}\\)?\\s*_{2,}`,
                                'g'
                            );
                            templatePassage = templatePassage.replace(numRegex, `___(${blankNum})___`);
                        });
                        // Assign remaining bare blanks sequentially
                        let seqBlank = 0;
                        templatePassage = templatePassage.replace(/_{2,}/g, () => {
                            seqBlank++;
                            return `___(${seqBlank})___`;
                        });
                        (questions[0] as any).passageTemplate = templatePassage;
                    }
                } else {
                    // Reading comprehension: check if AI spread passage into question text
                    // This typically happens when AI puts a paragraph snippet as question text
                    // for each MCQ. Reconstruct the full passage from these fragments.
                    const fragments = questions
                        .map(q => q.questionText || '')
                        .filter(t => t.length > 50);
                    if (fragments.length > 0) {
                        // Deduplicate overlapping fragments and join
                        const seen = new Set<string>();
                        const uniqueFragments: string[] = [];
                        for (const frag of fragments) {
                            // Trim and normalize
                            const normalized = frag.trim();
                            if (!seen.has(normalized)) {
                                seen.add(normalized);
                                uniqueFragments.push(normalized);
                            }
                        }
                        // If there's a single long fragment repeated, use it once
                        // If multiple unique fragments, they might be paragraphs â€” join them
                        passageContent = uniqueFragments.join('\n\n');
                    }
                }
            }
        }

        // â”€â”€ Passage paragraph formatting (fallback â€” AI prompt handles primary formatting) â”€â”€
        // If AI returned passage without paragraph breaks, apply basic sentence-based splitting
        if (passageContent) {
            passageContent = passageContent.replace(/\r\n/g, '\n');

            // Only apply fallback formatting if no paragraph breaks exist
            if (!passageContent.includes('\n\n')) {
                // Split on sentence boundaries and group ~3-4 sentences per paragraph
                const sentences = passageContent.split(/(?<=[.?!])\s+/);
                if (sentences.length > 4) {
                    const paragraphs: string[] = [];
                    let currentPara: string[] = [];
                    for (let i = 0; i < sentences.length; i++) {
                        currentPara.push(sentences[i]!);
                        // Break every 3-4 sentences, or before natural transition words
                        const nextSentence = sentences[i + 1] || '';
                        const isTransition = /^(However|Moreover|Furthermore|In addition|On the other hand|Nevertheless|Since then|One night|Another|That)/i.test(nextSentence);
                        if (currentPara.length >= 3 || (currentPara.length >= 2 && isTransition)) {
                            paragraphs.push(currentPara.join(' '));
                            currentPara = [];
                        }
                    }
                    if (currentPara.length > 0) {
                        paragraphs.push(currentPara.join(' '));
                    }
                    passageContent = paragraphs.join('\n\n');
                }
            }
        }

        // â”€â”€ Auto-detect passage title from content â”€â”€
        // If the first non-empty line looks like a title (ALL CAPS, or short
        // standalone line before a long paragraph), extract it as the title
        // so the renderer can display it as a styled heading.
        let passageTitle: string | undefined;
        if (passageContent) {
            const lines = passageContent.split('\n');
            const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);
            if (firstNonEmpty >= 0) {
                const candidateLine = lines[firstNonEmpty]!.trim();
                // Find the next non-empty line after the candidate
                const secondNonEmpty = lines.findIndex((l, i) => i > firstNonEmpty && l.trim().length > 0);
                const secondLine = secondNonEmpty >= 0 ? lines[secondNonEmpty]!.trim() : '';

                const isAllCaps = candidateLine.length > 3
                    && candidateLine === candidateLine.toUpperCase()
                    && /[A-Z]/.test(candidateLine);
                const isShortBeforeLong = candidateLine.length <= 80
                    && secondLine.length > candidateLine.length * 2
                    && !candidateLine.endsWith('.');

                if (isAllCaps || isShortBeforeLong) {
                    passageTitle = candidateLine;
                    // Remove the title line from content
                    lines.splice(firstNonEmpty, 1);
                    passageContent = lines.join('\n').replace(/^\n+/, '');
                }
            }
        }

        const passageObj = isReading && passageContent ? {
            passage: {
                id: crypto.randomUUID(),
                content: passageContent,
                title: passageTitle || ps.name,
                wordCount: passageContent.split(/\s+/).filter(Boolean).length,
            },
        } : {};

        return {
            id: crypto.randomUUID(),
            name: ps.name,
            order: si,
            instructionText: ps.instructionText,
            isCustomInstruction: false,
            pointMode: 'auto' as const,
            totalPoints: sectionPoints,
            defaultQuestionType: effectiveType,
            shuffle: false,
            shuffleOptions: false,
            layout: ((isReading && effectiveType !== 'reading-cloze-wordbank') ? 'two-column' : 'single-column') as 'single-column' | 'two-column',
            questions,
            // Flat passage format for editor compatibility
            ...(isReading ? {
                passageTitle: ps.name,
                passageContent: passageContent,
            } : {}),
            // Nested passage format for student view compatibility
            ...passageObj,
        };
    });

    return {
        metadata: {
            title: parsedTest.metadata.title || 'Imported Test',
            gradeLevel: parsedTest.metadata.gradeLevel || 9,
            duration: parsedTest.metadata.duration || 45,
            totalPoints: 10,
            examType: parsedTest.metadata.examType || '',
        },
        sections,
    };
}
