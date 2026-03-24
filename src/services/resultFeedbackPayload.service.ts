import type { FeedbackPromptMetadata } from './formativeFeedback.service';
import { getTestFromFirebase, type TestData } from './testStorage';
import type { TestResultRecord } from './testResults.service';
import { getThcsTestFromFirebase } from './thcsTestStorage';
import type { THCSGradingResult, THCSSection } from '../types/thcs-test.types';

export interface ResultFeedbackPayload {
  gradingResult: THCSGradingResult;
  sections: THCSSection[];
  testMetadata: FeedbackPromptMetadata;
  resultId: string;
}

function isIeltsResult(result: TestResultRecord): boolean {
  const type = String(result.testType || '').toLowerCase();
  return type.includes('ielts')
    || Boolean(result.ieltsData?.passageResults?.length)
    || typeof result.bandScore === 'number';
}

function normalizeFeedbackQuestionType(questionType: string | undefined): string {
  const raw = String(questionType || 'question').trim().toLowerCase();
  if (!raw) {
    return 'question';
  }

  return raw.replace(/\s+/g, '_').replace(/-/g, '_');
}

function buildQuestionResultsRecord(result: TestResultRecord) {
  const questionResults = Array.isArray(result.questionResults) ? result.questionResults : [];

  return Object.fromEntries(
    questionResults.map((questionResult) => [
      questionResult.questionNumber,
      {
        questionNumber: questionResult.questionNumber,
        isCorrect: questionResult.isCorrect,
        studentAnswer: questionResult.studentAnswer,
        correctAnswer: questionResult.correctAnswer,
        pointsEarned: questionResult.score,
        pointsMax: questionResult.maxScore,
      },
    ]),
  );
}

function buildIntentBreakdown(items: Array<TestResultRecord['questionResults'][number]>) {
  return items.reduce<Record<string, { correct: number; total: number }>>((acc, item) => {
    const key = normalizeFeedbackQuestionType(item.questionType);

    if (!acc[key]) {
      acc[key] = { correct: 0, total: 0 };
    }

    acc[key].total += 1;
    if (item.isCorrect) {
      acc[key].correct += 1;
    }

    return acc;
  }, {});
}

function normalizeGenericAnswer(answer: unknown): string | string[] {
  if (Array.isArray(answer)) {
    return answer.map((value) => String(value ?? '').trim()).filter(Boolean);
  }

  if (answer && typeof answer === 'object') {
    return Object.entries(answer as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value ?? '').trim()}`)
      .join('; ');
  }

  return String(answer ?? '').trim();
}

function normalizeOptions(options: unknown): string[] | undefined {
  if (!Array.isArray(options) || options.length === 0) {
    return undefined;
  }

  return options.map((option) => String(option ?? '').trim());
}

function mapGenericQuestion(rawQuestion: TestData['questions'][number]) {
  const explanationText = typeof rawQuestion.explanation === 'string'
    ? rawQuestion.explanation.trim()
    : '';

  return {
    id: `result-feedback-q-${rawQuestion.number}`,
    questionNumber: rawQuestion.number,
    questionText: rawQuestion.question || `Question ${rawQuestion.number}`,
    type: normalizeFeedbackQuestionType(rawQuestion.type),
    intent: normalizeFeedbackQuestionType(rawQuestion.type),
    options: normalizeOptions(rawQuestion.options),
    correctAnswer: normalizeGenericAnswer(rawQuestion.answer),
    explanation: explanationText
      ? {
          text: explanationText,
          source: 'teacher' as const,
          approvedByTeacher: true,
        }
      : undefined,
  };
}

function buildSectionsFromGenericTestData(testData: TestData, result: TestResultRecord): THCSSection[] {
  const mappedQuestions = testData.questions.map((question) => ({
    rawQuestion: question,
    mappedQuestion: mapGenericQuestion(question),
  }));

  const sectionsFromPassages = Array.isArray(testData.passages) && testData.passages.length > 0
    ? testData.passages
        .map((passage, index) => {
          const passageQuestions = mappedQuestions
            .filter(({ rawQuestion }) => {
              if (rawQuestion.passageId === passage.id) {
                return true;
              }

              return rawQuestion.number >= passage.questionStart && rawQuestion.number <= passage.questionEnd;
            })
            .map(({ mappedQuestion }) => mappedQuestion);

          if (passageQuestions.length === 0) {
            return null;
          }

          return {
            id: passage.id || `passage-${index + 1}`,
            name: passage.title || `Passage ${index + 1}`,
            order: index,
            totalPoints: passageQuestions.length,
            pointMode: 'auto' as const,
            instructionText: '',
            isCustomInstruction: false,
            layout: 'single-column' as const,
            passage: {
              id: passage.id || `passage-${index + 1}`,
              title: passage.title || `Passage ${index + 1}`,
              content: passage.content || '',
              wordCount: passage.wordCount || 0,
            },
            questions: passageQuestions as any,
          } as THCSSection;
        })
        .filter((section): section is THCSSection => Boolean(section))
    : [];

  if (sectionsFromPassages.length > 0) {
    return sectionsFromPassages;
  }

  const questionResults = Array.isArray(result.questionResults) ? result.questionResults : [];
  const overallQuestions = mappedQuestions
    .sort((left, right) => left.mappedQuestion.questionNumber - right.mappedQuestion.questionNumber)
    .map(({ mappedQuestion }) => mappedQuestion);

  return [
    {
      id: 'overall',
      name: testData.title || 'Overall Performance',
      order: 0,
      totalPoints: questionResults.length || overallQuestions.length,
      pointMode: 'auto',
      instructionText: '',
      isCustomInstruction: false,
      layout: 'single-column',
      questions: overallQuestions as any,
    },
  ];
}

function buildFallbackSectionsFromResult(result: TestResultRecord): THCSSection[] {
  const questionResults = Array.isArray(result.questionResults) ? result.questionResults : [];
  const passageResults = result.ieltsData?.passageResults || [];

  if (result.thcsData?.sectionResults?.length) {
    return result.thcsData.sectionResults.map((section, index) => ({
      id: section.sectionId || section.sectionName || `section-${index + 1}`,
      name: section.sectionName || `Section ${index + 1}`,
      order: index,
      totalPoints: section.totalCount || 0,
      pointMode: 'auto',
      instructionText: '',
      isCustomInstruction: false,
      layout: 'single-column',
      questions: questionResults
        .filter((question) => normalizeFeedbackQuestionType(question.questionType) in (section.intentBreakdown || {}))
        .map((question) => ({
          id: `fallback-q-${question.questionNumber}`,
          questionNumber: question.questionNumber,
          questionText: `Question ${question.questionNumber}`,
          type: normalizeFeedbackQuestionType(question.questionType),
          intent: normalizeFeedbackQuestionType(question.questionType),
          correctAnswer: question.correctAnswer,
        })) as any,
    }));
  }

  if (passageResults.length > 0) {
    return passageResults.map((passage, index) => ({
      id: `passage-${index + 1}`,
      name: passage.passageName || `Passage ${index + 1}`,
      order: index,
      totalPoints: passage.total,
      pointMode: 'auto',
      instructionText: '',
      isCustomInstruction: false,
      layout: 'single-column',
      questions: questionResults
        .filter(
          (question) =>
            question.questionNumber >= passage.questionRange[0]
            && question.questionNumber <= passage.questionRange[1],
        )
        .map((question) => ({
          id: `fallback-q-${question.questionNumber}`,
          questionNumber: question.questionNumber,
          questionText: `Question ${question.questionNumber}`,
          type: normalizeFeedbackQuestionType(question.questionType),
          intent: normalizeFeedbackQuestionType(question.questionType),
          correctAnswer: question.correctAnswer,
        })) as any,
    }));
  }

  return [
    {
      id: 'overall',
      name: 'Overall Performance',
      order: 0,
      totalPoints: questionResults.length,
      pointMode: 'auto',
      instructionText: '',
      isCustomInstruction: false,
      layout: 'single-column',
      questions: questionResults.map((question) => ({
        id: `fallback-q-${question.questionNumber}`,
        questionNumber: question.questionNumber,
        questionText: `Question ${question.questionNumber}`,
        type: normalizeFeedbackQuestionType(question.questionType),
        intent: normalizeFeedbackQuestionType(question.questionType),
        correctAnswer: question.correctAnswer,
      })) as any,
    },
  ];
}

async function loadSourceSections(result: TestResultRecord): Promise<THCSSection[]> {
  if (String(result.testType || '').toLowerCase().startsWith('thcs') || String(result.testType || '').toLowerCase().startsWith('practice_thcs')) {
    const thcsTest = await getThcsTestFromFirebase(result.testId);
    if (thcsTest.success && thcsTest.data?.sections?.length) {
      return thcsTest.data.sections;
    }
  } else {
    const genericTest = await getTestFromFirebase(result.testId);
    if (genericTest.success && genericTest.data) {
      return buildSectionsFromGenericTestData(genericTest.data, result);
    }
  }

  return buildFallbackSectionsFromResult(result);
}

export async function buildResultFeedbackPayload(
  result: TestResultRecord,
  activeResultId: string,
): Promise<ResultFeedbackPayload | null> {
  const questionResults = Array.isArray(result.questionResults) ? result.questionResults : [];

  if (questionResults.length === 0) {
    return null;
  }

  const questionResultsRecord = buildQuestionResultsRecord(result);
  const sourceSections = await loadSourceSections(result);

  if (result.thcsData?.sectionResults?.length) {
    return {
      gradingResult: {
        scaledScore: result.thcsData.scaledScore,
        totalPoints: result.totalScore,
        maxPoints: result.maxScore,
        sectionResults: result.thcsData.sectionResults,
        questionResults: questionResultsRecord,
        gradingStatus: 'fully-graded',
        gradedAt: result.submittedAt,
        testId: result.testId,
        studentId: result.studentId || (result as any).userId || '',
      } as THCSGradingResult,
      sections: sourceSections,
      testMetadata: {
        title: result.testTitle || 'Test',
        gradeLevel: (result as any).gradeLevel || 9,
        type: result.testType,
        skill: result.testSkill,
        family: 'thcs',
        timeSpent: result.timeElapsed,
        totalQuestions: result.totalQuestions,
      },
      resultId: activeResultId,
    };
  }

  const sectionResults = sourceSections.map((section) => {
    const items = questionResults.filter((question) =>
      section.questions.some((sourceQuestion) => sourceQuestion.questionNumber === question.questionNumber),
    );
    const correctCount = items.filter((item) => item.isCorrect).length;
    const totalCount = items.length;

    return {
      sectionId: section.id,
      sectionName: section.name,
      pointsEarned: correctCount,
      pointsMax: totalCount,
      correctCount,
      totalCount,
      percentage: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
      intentBreakdown: buildIntentBreakdown(items) as any,
    };
  });

  if (!isIeltsResult(result)) {
    return {
      gradingResult: {
        scaledScore: Number((result.percentage / 10).toFixed(1)),
        totalPoints: result.totalScore,
        maxPoints: result.maxScore,
        sectionResults,
        questionResults: questionResultsRecord,
        gradingStatus: 'fully-graded',
        gradedAt: result.submittedAt,
        testId: result.testId,
        studentId: result.studentId || (result as any).userId || '',
      } as THCSGradingResult,
      sections: sourceSections,
      testMetadata: {
        title: result.testTitle || 'Test',
        gradeLevel: (result as any).gradeLevel || 9,
        type: result.testType,
        skill: result.testSkill,
        family: 'generic',
        timeSpent: result.timeElapsed,
        totalQuestions: result.totalQuestions,
      },
      resultId: activeResultId,
    };
  }

  return {
    gradingResult: {
      scaledScore: result.bandScore || Number((result.percentage / 10).toFixed(1)),
      totalPoints: result.totalScore,
      maxPoints: result.maxScore,
      sectionResults,
      questionResults: questionResultsRecord,
      gradingStatus: 'fully-graded',
      gradedAt: result.submittedAt,
      testId: result.testId,
      studentId: result.studentId || (result as any).userId || '',
    } as THCSGradingResult,
    sections: sourceSections,
    testMetadata: {
      title: result.testTitle || 'IELTS Test',
      gradeLevel: (result as any).gradeLevel || 9,
      type: result.testType,
      skill: result.testSkill,
      family: 'ielts',
      bandScore: result.bandScore,
      passageResults: result.ieltsData?.passageResults || [],
      timeSpent: result.timeElapsed,
      totalQuestions: result.totalQuestions,
    },
    resultId: activeResultId,
  };
}
