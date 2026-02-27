import fs from 'fs';

const teacherId = 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2';
const studentId = 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62';
const studentName = 'Student Test';

const results = [
    {
        resultId: 'res_reading_01',
        sessionCode: 'MOCKREAD01',
        testId: 'test_reading_01',
        studentId,
        studentName,
        testTitle: 'IELTS Reading Academy 1',
        testType: 'test',
        testSkill: 'reading',
        totalScore: 28,
        maxScore: 40,
        percentage: 70,
        bandScore: 6.5,
        submittedAt: new Date('2026-01-01T10:00:00Z').getTime(),
        createdAt: new Date('2026-01-01T10:00:00Z').getTime(),
        timeElapsed: 3000,
        testDuration: 3600,
        teacherId,
        isGuest: false,
        markingStatus: 'auto-marked',
        correct: 28,
        incorrect: 12,
        partialCredit: 0,
        totalQuestions: 40,
        questionResults: Array.from({ length: 40 }, (_, i) => ({
            questionNumber: i + 1,
            questionType: 'multiple-choice',
            isCorrect: i < 28,
            score: i < 28 ? 1 : 0,
            maxScore: 1,
            studentAnswer: 'A',
            correctAnswer: 'A',
            feedback: i < 28 ? 'Correct' : 'Incorrect'
        })),
        reMarkHistory: [
            {
                questionNumber: 5,
                originalScore: 0,
                newScore: 1,
                reason: 'Typo in answer key corrected',
                remarkedBy: 'teacher@test.com',
                remarkedAt: new Date('2026-01-02T09:00:00Z').getTime()
            }
        ],
        lastReMarkedAt: new Date('2026-01-02T09:00:00Z').getTime(),
        lastReMarkedBy: 'teacher@test.com'
    },
    {
        resultId: 'res_listening_01',
        sessionCode: 'MOCKLIST01',
        testId: 'test_listening_01',
        studentId,
        studentName,
        testTitle: 'IELTS Listening Practice',
        testType: 'test',
        testSkill: 'listening',
        totalScore: 32,
        maxScore: 40,
        percentage: 80,
        bandScore: 7.5,
        submittedAt: new Date('2026-01-05T14:30:00Z').getTime(),
        createdAt: new Date('2026-01-05T14:30:00Z').getTime(),
        timeElapsed: 1800,
        testDuration: 1800,
        teacherId,
        isGuest: false,
        markingStatus: 'auto-marked',
        correct: 32,
        incorrect: 8,
        partialCredit: 0,
        totalQuestions: 40,
        questionResults: Array.from({ length: 40 }, (_, i) => ({
            questionNumber: i + 1,
            questionType: 'multiple-choice',
            isCorrect: i < 32,
            score: i < 32 ? 1 : 0,
            maxScore: 1,
            studentAnswer: 'B',
            correctAnswer: 'B',
            feedback: i < 32 ? 'Great job' : 'Try again'
        }))
    },
    {
        resultId: 'res_writing_01',
        sessionCode: 'MOCKWRIT01',
        testId: 'test_writing_01',
        studentId,
        studentName,
        testTitle: 'IELTS Writing Task 2 - Technology',
        testType: 'test',
        testSkill: 'writing',
        totalScore: 0,
        maxScore: 9,
        percentage: 0,
        bandScore: 0,
        submittedAt: new Date('2026-01-10T09:00:00Z').getTime(),
        createdAt: new Date('2026-01-10T09:00:00Z').getTime(),
        timeElapsed: 2400,
        testDuration: 2400,
        teacherId,
        isGuest: false,
        markingStatus: 'pending-review',
        correct: 0,
        incorrect: 0,
        partialCredit: 0,
        totalQuestions: 1,
        writingSubmission: {
            text: 'In the modern world, technology has changed the way we communicate. I believe it has both positive and negative effects...',
            wordCount: 250
        },
        questionResults: [
            {
                questionNumber: 1,
                questionType: 'essay',
                isCorrect: false,
                score: 0,
                maxScore: 9,
                studentAnswer: 'Essay text...',
                correctAnswer: 'N/A',
                feedback: 'Pending manual review by teacher'
            }
        ]
    },
    {
        resultId: 'res_speaking_01',
        sessionCode: 'MOCKSPEAK01',
        testId: 'test_speaking_01',
        studentId,
        studentName,
        testTitle: 'IELTS Speaking Simulation',
        testType: 'test',
        testSkill: 'speaking',
        totalScore: 7,
        maxScore: 9,
        percentage: 77,
        bandScore: 7.0,
        submittedAt: new Date('2026-01-15T16:00:00Z').getTime(),
        createdAt: new Date('2026-01-15T16:00:00Z').getTime(),
        timeElapsed: 900,
        testDuration: 900,
        teacherId,
        isGuest: false,
        markingStatus: 'manually-marked',
        correct: 1,
        incorrect: 0,
        partialCredit: 0,
        totalQuestions: 1,
        speakingSubmission: {
            audioUrl: 'https://example.com/audio/speaking_mock.mp3',
            duration: 850
        },
        rubricScores: [
            { criterion: 'Fluency', score: 7, maxScore: 9, feedback: 'Speaks fluently with only occasional repetition' },
            { criterion: 'Lexical Resource', score: 7, maxScore: 9, feedback: 'Uses a range of vocabulary' },
            { criterion: 'Grammar', score: 6, maxScore: 9, feedback: 'Some minor grammatical errors' },
            { criterion: 'Pronunciation', score: 8, maxScore: 9, feedback: 'Clear and easy to understand' }
        ],
        questionResults: [
            {
                questionNumber: 1,
                questionType: 'speaking',
                isCorrect: true,
                score: 7,
                maxScore: 9,
                studentAnswer: 'Audio Recording',
                correctAnswer: 'N/A',
                feedback: 'Overall good performance'
            }
        ]
    },
    {
        resultId: 'res_reading_02',
        sessionCode: 'MOCKREAD02',
        testId: 'test_reading_02',
        studentId,
        studentName,
        testTitle: 'IELTS Reading Academy 2',
        testType: 'test',
        testSkill: 'reading',
        totalScore: 36,
        maxScore: 40,
        percentage: 90,
        bandScore: 8.0,
        submittedAt: new Date('2026-01-20T11:00:00Z').getTime(),
        createdAt: new Date('2026-01-20T11:00:00Z').getTime(),
        timeElapsed: 2800,
        testDuration: 3600,
        teacherId,
        isGuest: false,
        markingStatus: 'auto-marked',
        correct: 36,
        incorrect: 4,
        partialCredit: 0,
        totalQuestions: 40,
        questionResults: Array.from({ length: 40 }, (_, i) => ({
            questionNumber: i + 1,
            questionType: 'multiple-choice',
            isCorrect: i < 36,
            score: i < 36 ? 1 : 0,
            maxScore: 1,
            studentAnswer: 'C',
            correctAnswer: 'C',
            feedback: i < 36 ? 'Perfect' : 'Incorrect'
        }))
    },
    {
        resultId: 'res_guest_01',
        sessionCode: 'MOCKGUEST01',
        testId: 'test_reading_01',
        studentId: 'guest_user_999',
        studentName: 'Guest User',
        testTitle: 'IELTS Reading Academy 1',
        testType: 'test',
        testSkill: 'reading',
        totalScore: 20,
        maxScore: 40,
        percentage: 50,
        bandScore: 5.5,
        submittedAt: new Date('2026-01-25T15:00:00Z').getTime(),
        createdAt: new Date('2026-01-25T15:00:00Z').getTime(),
        timeElapsed: 3400,
        testDuration: 3600,
        teacherId,
        isGuest: true,
        markingStatus: 'auto-marked',
        correct: 20,
        incorrect: 20,
        partialCredit: 0,
        totalQuestions: 40,
        questionResults: Array.from({ length: 40 }, (_, i) => ({
            questionNumber: i + 1,
            questionType: 'multiple-choice',
            isCorrect: i < 20,
            score: i < 20 ? 1 : 0,
            maxScore: 1,
            studentAnswer: 'D',
            correctAnswer: 'D',
            feedback: i < 20 ? 'Correct' : 'Incorrect'
        }))
    }
];

// Generate index updates
const updates = {};
results.forEach(res => {
    updates[`/test_results/${res.resultId}`] = res;
    updates[`/test_results_by_teacher/${res.teacherId}/${res.resultId}`] = {
        resultId: res.resultId,
        sessionCode: res.sessionCode,
        studentId: res.studentId,
        studentName: res.studentName,
        percentage: res.percentage,
        submittedAt: res.submittedAt,
        isGuest: res.isGuest
    };
    updates[`/test_results_by_student/${res.studentId}/${res.resultId}`] = {
        resultId: res.resultId,
        sessionCode: res.sessionCode,
        testId: res.testId,
        percentage: res.percentage,
        submittedAt: res.submittedAt
    };
    updates[`/test_results_by_session/${res.sessionCode}/${res.resultId}`] = {
        resultId: res.resultId,
        studentId: res.studentId,
        studentName: res.studentName,
        percentage: res.percentage,
        submittedAt: res.submittedAt
    };
});

console.log(JSON.stringify(updates, null, 2));
fs.writeFileSync('mock_data.json', JSON.stringify(updates, null, 2), 'utf8');
console.log('Mock data written to mock_data.json');
