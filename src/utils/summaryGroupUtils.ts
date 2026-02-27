export type SummarySegment =
    | { type: 'text'; value: string }
    | { type: 'blank'; questionNumber: number };

// A "question" from editedQuestions in TestEditor
export interface SummaryQuestion {
    type: string;
    question: string;       // flat string for group leader, "" for members
    answer: string;
    options?: string[];     // word bank — only on group leader, only for 'summary-completion-list'
    passageId?: string;
    number?: number;
    summaryGroupId?: string; // unique ID for multi-group summary exercises (e.g. "sc-1", "sc-2")
    summaryAST?: SummarySegment[];  // optional rich format, stored on group leader
    [key: string]: any;     // allow any other field (points, timer, etc.)
}

/**
 * Given the list of sibling questions in a summary group,
 * returns the one question that contains the full paragraph text.
 * Detection rule: the question with the most "______" blank markers
 * AND non-empty question text.
 * Falls back to the first question if none have blanks.
 */
export function findGroupLeader(groupQuestions: SummaryQuestion[]): SummaryQuestion {
    if (!groupQuestions || groupQuestions.length === 0) {
        throw new Error('findGroupLeader requires at least one question');
    }
    let best = groupQuestions[0] as SummaryQuestion;
    let bestBlanks = 0;
    for (const q of groupQuestions) {
        if (!q.question) continue;
        const blanks = (q.question.match(/_{3,}/g) || []).length;
        if (blanks > bestBlanks) {
            bestBlanks = blanks;
            best = q;
        }
    }
    return best;
}

/**
 * Converts a flat question string (with "______" markers) into a
 * SummarySegment[] AST that the editor uses internally.
 *
 * @param flat - the flat string, e.g. "People go to ______ of the ______ Mona Lisa."
 * @param groupQuestions - all sibling questions in ORDER (Q27 first, Q28 second, etc.)
 * @returns SummarySegment[]
 *
 * Example:
 *   flat = "go to ______ of the ______"
 *   groupQuestions = [{ number: 27 }, { number: 28 }]
 *   result = [
 *     { type: 'text', value: 'go to ' },
 *     { type: 'blank', questionNumber: 27 },
 *     { type: 'text', value: ' of the ' },
 *     { type: 'blank', questionNumber: 28 },
 *   ]
 */
export function parseToAST(flat: string, groupQuestions: SummaryQuestion[]): SummarySegment[] {
    const parts = flat.split(/_{3,}/);
    const segments: SummarySegment[] = [];
    parts.forEach((text, i) => {
        // Always push a text segment (even if empty string — the editor will handle empty)
        segments.push({ type: 'text', value: text });
        // After each text part except the last, insert a blank
        if (i < groupQuestions.length) {
            const groupQuestion = groupQuestions[i];
            const qNum = groupQuestion?.number ?? (i + 1);
            segments.push({ type: 'blank', questionNumber: qNum });
        }
    });
    return segments;
}

/**
 * Converts a SummarySegment[] AST back into the flat question string
 * that the Student View (IELTSQuestionsPanel.tsx) expects.
 * Blank tokens become exactly "______" (six underscores).
 *
 * @param segments - the AST from the editor's local state
 * @returns string — the flat question string to save on the group leader question
 *
 * Example:
 *   segments = [
 *     { type: 'text', value: 'go to ' },
 *     { type: 'blank', questionNumber: 27 },
 *     { type: 'text', value: ' of the ' },
 *     { type: 'blank', questionNumber: 28 },
 *   ]
 *   result = "go to ______ of the ______"
 */
export function serializeToFlat(segments: SummarySegment[]): string {
    return segments
        .map(seg => seg.type === 'text' ? seg.value : '______')
        .join('');
}

/**
 * Given the full AST and a target question number, returns a human-readable
 * read-only context string showing the surrounding text with [QXX] placeholder.
 * Shows all text segments adjacent to the target blank (between two other blanks
 * or start/end of paragraph).
 *
 * @param segments - the AST
 * @param questionNumber - the question we want context for (e.g. 27)
 * @returns string — e.g. "go to look at a [Q27] of the Mona Lisa."
 */
export function extractContext(segments: SummarySegment[], questionNumber: number): string {
    return segments
        .map(seg => {
            if (seg.type === 'text') return seg.value;
            if (seg.questionNumber === questionNumber) return `[Q${questionNumber}]`;
            return `[Q${seg.questionNumber}]`;
        })
        .join('')
        .trim();
}

/**
 * When a word bank option is removed from the group leader's options array,
 * any sibling question whose answer matches the deleted option's letter
 * must have its answer cleared automatically.
 * 
 * Additionally, if a question's answer is a letter alphabetically AFTER the
 * deleted letter, it must be shifted down by 1 letter to stay pointed to the
 * identical word bank item.
 *
 * @param groupQuestions - all sibling questions (MUST be a fresh copy, not the original)
 * @param deletedOptionIndex - the 0-based index of the deleted option
 *                             (e.g. index 0 = letter "A", index 1 = letter "B", etc.)
 * @returns { updatedQuestions: SummaryQuestion[], clearedNumbers: number[] }
 *          updatedQuestions: the new array with affected answers cleared and shifted
 *          clearedNumbers: question numbers whose answers were cleared (for the toast message)
 */
export function applyDeletionGuard(
    groupQuestions: SummaryQuestion[],
    deletedOptionIndex: number
): { updatedQuestions: SummaryQuestion[]; clearedNumbers: number[] } {
    const deletedLetter = String.fromCharCode(65 + deletedOptionIndex); // 0 → 'A', 1 → 'B', etc.
    const clearedNumbers: number[] = [];

    const updatedQuestions = groupQuestions.map(q => {
        if (!q.answer) return { ...q };

        // Ensure we only shift single-letter uppercase strings 
        if (!/^[A-Z]$/.test(q.answer)) return { ...q };

        if (q.answer === deletedLetter) {
            clearedNumbers.push(q.number ?? 0);
            return { ...q, answer: '' };
        }

        if (q.answer > deletedLetter) {
            // Shift down by 1 letter (e.g. 'C' -> 'B')
            const newAnswer = String.fromCharCode(q.answer.charCodeAt(0) - 1);
            return { ...q, answer: newAnswer };
        }

        return { ...q };
    });

    return { updatedQuestions, clearedNumbers };
}

/**
 * Given the full flat questions array from TestEditor's editedQuestions
 * and the index of the currently selected question, returns all questions
 * that belong to the same summary group.
 *
 * Grouping rule: consecutive questions with the SAME type AND the SAME passageId.
 * Walk backwards from the selected index to find the start of the group,
 * then walk forward to find the end.
 *
 * @param allQuestions - Object.values(editedQuestions) — an array in order
 * @param selectedIndex - the 0-based index of the currently selected question
 * @returns SummaryQuestion[] - all questions in this group, in order
 */
export function getGroupQuestions(
    allQuestions: SummaryQuestion[],
    selectedIndex: number
): SummaryQuestion[] {
    const target = allQuestions[selectedIndex];
    if (!target) return [];

    const targetType = target.type;
    const targetPassageId = target.passageId;
    const targetGroupId = target.summaryGroupId;

    // Grouping via summaryGroupId (New Phase 2 isolation behavior)
    if (targetGroupId) {
        return allQuestions.filter(
            q => q.summaryGroupId === targetGroupId &&
                q.passageId === targetPassageId &&
                q.type === targetType
        );
    }

    // Legacy fallback: Walk backwards/forwards for exact consecutive types
    let start = selectedIndex;
    while (
        start > 0 &&
        allQuestions[start - 1] &&
        allQuestions[start - 1]?.type === targetType &&
        allQuestions[start - 1]?.passageId === targetPassageId &&
        !allQuestions[start - 1]?.summaryGroupId // Break if we hit a group ID
    ) {
        start--;
    }

    let end = selectedIndex;
    while (
        end < allQuestions.length - 1 &&
        allQuestions[end + 1] &&
        allQuestions[end + 1]?.type === targetType &&
        allQuestions[end + 1]?.passageId === targetPassageId &&
        !allQuestions[end + 1]?.summaryGroupId // Break if we hit a group ID
    ) {
        end++;
    }

    return allQuestions.slice(start, end + 1);
}
