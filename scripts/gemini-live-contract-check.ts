import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { signInLiveTeacher } from './lib/ai-worker-live-auth';

await signInLiveTeacher();
const [{ geminiProvider }, { generateFormativeFeedbackSnapshot }] = await Promise.all([
  import('../src/services/ai/gemini.provider'),
  import('../src/services/formativeFeedback.service'),
]);

const source = await readFile(resolve('documentation/samples/Cam 10 reading Test 3.md'), 'utf8');
const firstPassage = source.match(/## READING PASSAGE 1[\s\S]*?(?=## READING PASSAGE 2|$)/)?.[0];
assert.ok(firstPassage, 'Cam 10 Test 3 first passage sample must exist');

const passages = await geminiProvider.parsePassagesOnly(firstPassage);
assert.equal(passages.success, true, passages.success ? '' : passages.error);
assert.ok(passages.data.passages.length > 0, 'passage extraction returns passages');
console.log(JSON.stringify({ stage: 'passage-extraction', count: passages.data.passages.length }));

const parsed = await geminiProvider.parseQuestionsAndAnswers(firstPassage);
assert.equal(parsed.success, true, parsed.success ? '' : parsed.error);
assert.ok(parsed.data.questions.length > 0, 'question extraction returns questions');
console.log(JSON.stringify({ stage: 'question-answer-extraction', count: parsed.data.questions.length }));
const answers = await geminiProvider.generateAnswersFromContent(
  passages.data.passages.map((passage) => passage.content).join('\n\n'),
  parsed.data.questions.map((question) => ({
    number: question.questionNumber,
    questionText: question.questionText,
    type: question.type,
    options: question.options ?? undefined,
  })),
);
assert.equal(answers.success, true, answers.success ? '' : answers.error);
assert.ok(Object.keys(answers.data.answerKey).length > 0, 'answer generation returns keyed answers');
console.log(JSON.stringify({ stage: 'answer-generation', count: Object.keys(answers.data.answerKey).length }));

const writingGrade = await geminiProvider.gradeWritingAnswer(
  'Trees were planted to reduce carbon dioxide in the air.',
  ['Trees were planted to absorb carbon dioxide from the atmosphere.'],
  'People planted trees to reduce atmospheric carbon dioxide.',
);
assert.equal(writingGrade.success, true, writingGrade.success ? '' : writingGrade.error);
assert.ok(Number.isFinite(writingGrade.data.score) && Number.isFinite(writingGrade.data.confidence));
assert.ok(writingGrade.data.feedback.trim());
console.log(JSON.stringify({ stage: 'writing-grade', score: writingGrade.data.score, confidence: writingGrade.data.confidence }));

const writingSuggestions = await geminiProvider.generateWritingSuggestionBatch({
  taskPrompt: 'Some people think cities should invest more in public transport. Explain why you agree or disagree.',
  essay: {
    taskNumber: 2,
    paragraphs: [{
      paragraphIndex: 0,
      sentences: [
        { sentenceIndex: 0, text: 'Public transport help people reach work without using a car.' },
        { sentenceIndex: 1, text: 'It also reduce traffic and pollution in busy cities.' },
      ],
    }],
  },
  scope: 'combined',
  maxFindings: 3,
  priorFindingsLedger: [],
});
assert.equal(writingSuggestions.success, true, writingSuggestions.success ? '' : writingSuggestions.error);
assert.ok(Array.isArray(writingSuggestions.data.findings));
assert.equal(typeof writingSuggestions.data.hasMorePotential, 'boolean');
for (const finding of writingSuggestions.data.findings) {
  assert.ok([
    'Public transport help people reach work without using a car.',
    'It also reduce traffic and pollution in busy cities.',
  ].includes(finding.anchorText));
}
console.log(JSON.stringify({ stage: 'writing-suggestions', findings: writingSuggestions.data.findings.length }));

const formative = await generateFormativeFeedbackSnapshot(
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
assert.ok(formative.feedback.aiFeedback?.summary.trim(), 'formative feedback has a readable summary');
assert.ok(formative.feedback.questionExplanations && Object.keys(formative.feedback.questionExplanations).length > 0);
console.log(JSON.stringify({ stage: 'formative-feedback', mode: formative.mode }));

console.log(JSON.stringify({
  sourceChars: firstPassage.length,
  passages: passages.data.passages.length,
  parsedQuestions: parsed.data.questions.length,
  generatedAnswers: Object.keys(answers.data.answerKey).length,
  writingGrade: { score: writingGrade.data.score, hasFeedback: Boolean(writingGrade.data.feedback) },
  writingSuggestionFindings: writingSuggestions.data.findings.length,
  feedbackMode: formative.mode,
  feedbackShape: {
    topicCount: Object.keys(formative.feedback.questionTopics ?? {}).length,
    explanationCount: Object.keys(formative.feedback.questionExplanations ?? {}).length,
    hasSummary: Boolean(formative.feedback.aiFeedback?.summary),
    recommendationCount: formative.feedback.studyRecommendations?.length ?? 0,
  },
}, null, 2));
process.exit(0);
