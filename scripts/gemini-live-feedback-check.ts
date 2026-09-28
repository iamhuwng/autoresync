import assert from 'node:assert/strict';
import { signInLiveTeacher } from './lib/ai-worker-live-auth';

await signInLiveTeacher();
const { generateFormativeFeedbackSnapshot } = await import('../src/services/formativeFeedback.service');

const result = await generateFormativeFeedbackSnapshot(
  {
    testId: 'canary-contract-check', studentId: 'student@test.com', totalPoints: 1,
    maxPoints: 2, scaledScore: 5, sectionResults: [], gradedAt: Date.now(),
    gradingStatus: 'completed',
    questionResults: {
      1: { questionNumber: 1, isCorrect: true, studentAnswer: 'B', correctAnswer: 'B', pointsEarned: 1, pointsMax: 1 },
      2: { questionNumber: 2, isCorrect: false, studentAnswer: '', correctAnswer: 'C', pointsEarned: 0, pointsMax: 1 },
    },
  } as any,
  [{
    id: 'canary-contract-section', name: 'Grammar', order: 0, totalPoints: 2,
    pointMode: 'auto', instructionText: 'Choose the correct answer.', isCustomInstruction: false,
    layout: 'single-column',
    questions: [
      { id: 'q1', order: 0, type: 'mcq-grammar', questionText: 'She ___ to school.', options: ['go', 'goes', 'going', 'gone'], correctAnswer: 'B' },
      { id: 'q2', order: 1, type: 'mcq-grammar', questionText: 'They ___ here since 2020.', options: ['live', 'lived', 'have lived', 'living'], correctAnswer: 'C' },
    ],
  }] as any,
  { title: 'Canary feedback contract', gradeLevel: 9, family: 'thcs', kind: 'thcs', totalQuestions: 2 },
  'canary-contract-check',
);

assert.equal(result.mode, 'ai');
assert.ok(result.feedback.aiFeedback?.summary.trim());
assert.equal(Object.keys(result.feedback.questionTopics ?? {}).length, 2);
assert.ok(Object.keys(result.feedback.questionExplanations ?? {}).length > 0);
console.log(JSON.stringify({
  mode: result.mode,
  model: result.feedback.aiModel,
  topics: Object.keys(result.feedback.questionTopics ?? {}).length,
  explanations: Object.keys(result.feedback.questionExplanations ?? {}).length,
  hasSummary: Boolean(result.feedback.aiFeedback?.summary),
  recommendations: result.feedback.studyRecommendations?.length ?? 0,
}, null, 2));
process.exit(0);
