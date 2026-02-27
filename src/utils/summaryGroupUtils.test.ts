import {
    findGroupLeader,
    parseToAST,
    serializeToFlat,
    extractContext,
    applyDeletionGuard,
    getGroupQuestions,
} from './summaryGroupUtils';

const makeQ = (overrides: any) => ({
    type: 'summary-completion-list',
    question: '',
    answer: '',
    passageId: 'p1',
    number: 1,
    summaryGroupId: undefined,
    ...overrides,
});

describe('findGroupLeader', () => {
    it('returns the question with the most blanks', () => {
        const q1 = makeQ({ number: 27, question: 'go to ______ of the ______ Mona Lisa.' });
        const q2 = makeQ({ number: 28, question: '' });
        const leader = findGroupLeader([q1, q2]);
        expect(leader.number).toBe(27);
    });

    it('falls back to first question if none have blanks', () => {
        const q1 = makeQ({ number: 27, question: 'no blanks here' });
        const q2 = makeQ({ number: 28, question: '' });
        const leader = findGroupLeader([q1, q2]);
        expect(leader.number).toBe(27);
    });
});

describe('parseToAST', () => {
    it('correctly splits one blank', () => {
        const flat = 'People go to ______ museums.';
        const qs = [makeQ({ number: 27 })];
        const ast = parseToAST(flat, qs);
        expect(ast).toEqual([
            { type: 'text', value: 'People go to ' },
            { type: 'blank', questionNumber: 27 },
            { type: 'text', value: ' museums.' },
        ]);
    });

    it('correctly splits two blanks', () => {
        const flat = 'A ______ and a ______.';
        const qs = [makeQ({ number: 27 }), makeQ({ number: 28 })];
        const ast = parseToAST(flat, qs);
        expect(ast).toEqual([
            { type: 'text', value: 'A ' },
            { type: 'blank', questionNumber: 27 },
            { type: 'text', value: ' and a ' },
            { type: 'blank', questionNumber: 28 },
            { type: 'text', value: '.' },
        ]);
    });
});

describe('serializeToFlat', () => {
    it('converts AST back to flat string', () => {
        const segments = [
            { type: 'text' as const, value: 'A ' },
            { type: 'blank' as const, questionNumber: 27 },
            { type: 'text' as const, value: ' and a ' },
            { type: 'blank' as const, questionNumber: 28 },
            { type: 'text' as const, value: '.' },
        ];
        expect(serializeToFlat(segments)).toBe('A ______ and a ______.');
    });

    it('round-trips parseToAST → serializeToFlat', () => {
        const flat = 'go to ______ of the ______ here.';
        const qs = [makeQ({ number: 27 }), makeQ({ number: 28 })];
        const ast = parseToAST(flat, qs);
        expect(serializeToFlat(ast)).toBe(flat);
    });
});

describe('extractContext', () => {
    it('returns the full paragraph with [Q27] in the right place', () => {
        const segments = [
            { type: 'text' as const, value: 'go to ' },
            { type: 'blank' as const, questionNumber: 27 },
            { type: 'text' as const, value: ' of the Mona Lisa.' },
        ];
        const ctx = extractContext(segments, 27);
        expect(ctx).toBe('go to [Q27] of the Mona Lisa.');
    });
});

describe('applyDeletionGuard', () => {
    it('clears answers matching the deleted letter', () => {
        const qs = [
            makeQ({ number: 27, answer: 'A' }),
            makeQ({ number: 28, answer: 'B' }),
            makeQ({ number: 29, answer: 'A' }),
        ];
        const { updatedQuestions, clearedNumbers } = applyDeletionGuard(qs, 0); // delete 'A'
        expect(updatedQuestions[0].answer).toBe('');
        expect(updatedQuestions[1].answer).toBe('A'); // B -> A
        expect(updatedQuestions[2].answer).toBe('');
        expect(clearedNumbers).toEqual([27, 29]);
    });

    it('returns empty clearedNumbers when nothing is affected', () => {
        const qs = [makeQ({ number: 27, answer: 'B' })];
        const { clearedNumbers, updatedQuestions } = applyDeletionGuard(qs, 0); // delete 'A'
        expect(clearedNumbers).toHaveLength(0);
        expect(updatedQuestions[0].answer).toBe('A'); // B -> A since 'A' was removed
    });

    it('shifts down answers that are alphabetically after the deleted letter', () => {
        const qs = [
            makeQ({ number: 27, answer: 'A' }),
            makeQ({ number: 28, answer: 'C' }),
            makeQ({ number: 29, answer: 'D' }),
            makeQ({ number: 30, answer: 'E' }),
        ];
        // Delete 'B' (index 1)
        const { updatedQuestions, clearedNumbers } = applyDeletionGuard(qs, 1);

        expect(clearedNumbers).toHaveLength(0);
        expect(updatedQuestions[0].answer).toBe('A'); // Unchanged (A < B)
        expect(updatedQuestions[1].answer).toBe('B'); // C -> B
        expect(updatedQuestions[2].answer).toBe('C'); // D -> C
        expect(updatedQuestions[3].answer).toBe('D'); // E -> D
    });
});

describe('getGroupQuestions', () => {
    it('returns group spanning consecutive same-type same-passage questions', () => {
        const allQs = [
            makeQ({ number: 26, type: 'true-false-not-given', passageId: 'p1' }),
            makeQ({ number: 27, type: 'summary-completion-list', passageId: 'p1' }),
            makeQ({ number: 28, type: 'summary-completion-list', passageId: 'p1' }),
            makeQ({ number: 29, type: 'summary-completion-list', passageId: 'p1' }),
            makeQ({ number: 30, type: 'multiple-choice', passageId: 'p1' }),
        ];
        // select index 2, which is question 28
        const group = getGroupQuestions(allQs, 2);
        expect(group.map(q => q.number)).toEqual([27, 28, 29]);
    });

    it('does not cross passage boundaries', () => {
        const allQs = [
            makeQ({ number: 27, type: 'summary-completion-list', passageId: 'p1' }),
            makeQ({ number: 28, type: 'summary-completion-list', passageId: 'p2' }),
        ];
        const group = getGroupQuestions(allQs, 0);
        expect(group.map(q => q.number)).toEqual([27]);
    });

    it('isolates multi-group exercises by summaryGroupId in the same passage', () => {
        const allQs = [
            makeQ({ number: 27, summaryGroupId: 'sc-1' }),
            makeQ({ number: 28, summaryGroupId: 'sc-1' }),
            makeQ({ number: 29, summaryGroupId: 'sc-2' }),
            makeQ({ number: 30, summaryGroupId: 'sc-2' }),
        ];
        // Select index 2 (q 29), should only return sc-2 group
        const group = getGroupQuestions(allQs, 2);
        expect(group.map(q => q.number)).toEqual([29, 30]);

        // Select index 0 (q 27), should only return sc-1 group
        const group1 = getGroupQuestions(allQs, 0);
        expect(group1.map(q => q.number)).toEqual([27, 28]);
    });

    it('prevents legacy fallback from bleeding into new summaryGroupId blocks', () => {
        const allQs = [
            makeQ({ number: 27, summaryGroupId: undefined }), // legacy behavior question
            makeQ({ number: 28, summaryGroupId: undefined }),
            makeQ({ number: 29, summaryGroupId: 'sc-1' }),    // new behavior question
        ];
        // Grouping legacy question 27 shouldn't sweep up 29 since 29 has a summaryGroupId
        const group = getGroupQuestions(allQs, 0);
        expect(group.map(q => q.number)).toEqual([27, 28]);
    });
});
