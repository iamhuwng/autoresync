import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase, get, ref, set } from 'firebase/database';
import { loadTableCompletionSharedModules } from './table-completion-runtime.mjs';

const firebaseConfig = {
  apiKey: 'AIzaSyC7njFVpMEPUJFZZvbm6kNLUBOdhpNJ8BE',
  authDomain: 'temp-a1437.firebaseapp.com',
  databaseURL: 'https://temp-a1437-default-rtdb.firebaseio.com',
  projectId: 'temp-a1437',
  storageBucket: 'temp-a1437.firebasestorage.app',
  messagingSenderId: '587597924288',
  appId: '1:587597924288:web:9015df11ea8c89bc08ee80',
};

const VALIDATION_SEVERITY_RANK = {
  none: 0,
  informational: 1,
  'acknowledgement-required': 2,
  blocking: 3,
};

function getFirebaseDatabase() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getDatabase(app);
}

export function generateTestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 9);
  return `test-${timestamp}-${random}`;
}

function assertSupportedTableCompletionGroupSchema(group) {
  if (group?.schemaVersion !== 1) {
    throw new Error(
      `Unsupported table-completion schemaVersion ${group?.schemaVersion ?? 'unknown'} for group "${group?.groupId ?? 'unknown'}".`,
    );
  }
}

export function assertSupportedQuestionGroups(questionGroups = [], contextLabel = 'table-completion payload') {
  if (!Array.isArray(questionGroups)) {
    throw new Error(`${contextLabel} must provide questionGroups as an array when present.`);
  }

  questionGroups.forEach((group) => assertSupportedTableCompletionGroupSchema(group));
}

function compileAcceptableAnswers(questionText, answer) {
  if (!answer || typeof answer !== 'string') {
    return [];
  }

  const variants = new Set();
  const parts = answer.split(/[/|]/).map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('(') && part.includes(')')) {
      variants.add(part.replace(/[()]/g, ''));
      variants.add(part.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim());

      const blankCount = (questionText?.match(/_{3,}/g) || []).length;
      if (blankCount > 1) {
        const piped = part
          .replace(/\([^)]*\)/g, '|')
          .split('|')
          .map((segment) => segment.trim())
          .filter(Boolean)
          .join('|');
        if (piped.split('|').length === blankCount) {
          variants.add(piped);
        }
      }
      continue;
    }

    variants.add(part);
  }

  return Array.from(variants);
}

function derivePlainOptions(question) {
  if (Array.isArray(question.options) && question.options.length > 0) {
    return question.options.map((option) => typeof option === 'string' ? option : option.text ?? '');
  }

  if (Array.isArray(question.labeledOptions) && question.labeledOptions.length > 0) {
    return question.labeledOptions.map((option) => option.text ?? '');
  }

  if (Array.isArray(question.sectionReferences) && question.sectionReferences.length > 0) {
    return question.sectionReferences.map((section) => section.label);
  }

  return [];
}

async function sortTableCompletionQuestionGroups(questionGroups = [], passageOrder = []) {
  const { transforms } = await loadTableCompletionSharedModules();
  assertSupportedQuestionGroups(questionGroups, 'script material');
  return transforms.sortTableCompletionQuestionGroups(questionGroups, passageOrder);
}

async function mergeQuestionsWithCanonicalTableGroups(questions = [], questionGroups = []) {
  const { transforms } = await loadTableCompletionSharedModules();
  assertSupportedQuestionGroups(questionGroups, 'script material');
  return transforms.mergeQuestionsWithCanonicalTableGroups(questions, questionGroups);
}

function formatQuestionForStorage(question, defaultPassageId) {
  const questionText = question.questionText || question.question || '';
  const formatted = {
    number: question.number || question.questionNumber,
    type: question.type,
    question: questionText,
    questionText,
    answer: question.answer,
    passageId: question.passageId || defaultPassageId,
    points: question.points || 1,
  };

  const options = derivePlainOptions(question);
  if (options.length > 0) {
    formatted.options = options;
  }

  if (Array.isArray(question.labeledOptions) && question.labeledOptions.length > 0) {
    formatted.labeledOptions = question.labeledOptions;
  }

  if (question.optionLabelFormat) {
    formatted.optionLabelFormat = question.optionLabelFormat;
  }

  if (Array.isArray(question.sectionReferences) && question.sectionReferences.length > 0) {
    formatted.sectionReferences = question.sectionReferences;
  }

  const acceptableAnswers = compileAcceptableAnswers(questionText, question.answer);
  if (acceptableAnswers.length > 0) {
    formatted.acceptableAnswers = acceptableAnswers;
  }

  if (question.wordLimit !== undefined && question.wordLimit > 0) {
    formatted.wordLimit = question.wordLimit;
  }

  if (question.sectionInstructionId) {
    formatted.sectionInstructionId = question.sectionInstructionId;
  }
  if (question.groupId) {
    formatted.groupId = question.groupId;
  }
  if (question.blankId) {
    formatted.blankId = question.blankId;
  }
  if (question.anchorId) {
    formatted.anchorId = question.anchorId;
  }
  if (question.groupTaskType) {
    formatted.groupTaskType = question.groupTaskType;
  }
  if (question.tableGroupSchemaVersion) {
    formatted.tableGroupSchemaVersion = question.tableGroupSchemaVersion;
  }

  return formatted;
}

function sortDiagnostics(diagnostics = []) {
  return [...diagnostics].sort((left, right) => {
    if ((left.questionRange?.start ?? 0) !== (right.questionRange?.start ?? 0)) {
      return (left.questionRange?.start ?? 0) - (right.questionRange?.start ?? 0);
    }

    return left.groupId.localeCompare(right.groupId);
  });
}

function highestValidationSeverity(diagnostics = []) {
  return diagnostics.reduce((highest, diagnostic) => (
    VALIDATION_SEVERITY_RANK[diagnostic.validationSeverity] > VALIDATION_SEVERITY_RANK[highest]
      ? diagnostic.validationSeverity
      : highest
  ), 'none');
}

export async function buildTableCompletionDiagnostics(material) {
  const { validator } = await loadTableCompletionSharedModules();
  const persistedDiagnostics = Array.isArray(material.tableCompletionDiagnostics)
    ? material.tableCompletionDiagnostics
    : [];
  const questionGroups = Array.isArray(material.questionGroups) ? material.questionGroups : [];

  assertSupportedQuestionGroups(questionGroups, material.title || material.sourceFile || 'material');

  const currentDiagnostics = questionGroups.map((group) =>
    validator.buildPersistedTableCompletionDiagnostic(group),
  );
  const currentGroupIds = new Set(currentDiagnostics.map((diagnostic) => diagnostic.groupId));
  const unresolvedDiagnostics = persistedDiagnostics.filter(
    (diagnostic) => !currentGroupIds.has(diagnostic.groupId),
  );

  return sortDiagnostics([...currentDiagnostics, ...unresolvedDiagnostics]);
}

export async function buildTableCompletionPublishReport(material) {
  const diagnostics = await buildTableCompletionDiagnostics(material);
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.validationSeverity === 'blocking' || diagnostic.parseMode === 'unresolved',
  );
  const acknowledgementDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.validationSeverity === 'acknowledgement-required',
  );

  return {
    diagnostics,
    highestSeverity: highestValidationSeverity(diagnostics),
    hasBlocking: blockingDiagnostics.length > 0,
    hasAcknowledgementRequired: acknowledgementDiagnostics.length > 0,
    isPublishable: blockingDiagnostics.length === 0 && acknowledgementDiagnostics.length === 0,
    blockingDiagnostics,
    acknowledgementDiagnostics,
  };
}

export async function buildStudentSafeTestData(testData) {
  const { transforms } = await loadTableCompletionSharedModules();
  const safeCopy = JSON.parse(JSON.stringify(testData));

  if (Array.isArray(safeCopy.questions)) {
    safeCopy.questions = safeCopy.questions.map((question) => {
      const { answer, acceptableAnswers, explanation, ...rest } = question;
      void answer;
      void acceptableAnswers;
      void explanation;
      return rest;
    });
  }

  if (Array.isArray(safeCopy.questionGroups)) {
    assertSupportedQuestionGroups(safeCopy.questionGroups, 'student-safe projection');
    safeCopy.questionGroups = transforms.stripTableCompletionReviewOnlyProvenanceFromField(
      safeCopy.questionGroups,
    );
  }

  delete safeCopy.tableCompletionDiagnostics;
  return safeCopy;
}

export async function buildReadingTestData(material, options = {}) {
  const testId = options.testId || generateTestId();
  const now = options.now || Date.now();
  const createdBy = options.createdBy || 'teacher-default';
  const ownerId = options.ownerId || createdBy;
  const isPublic = options.isPublic ?? true;
  const duration = material.metadata?.duration || 20;
  const defaultPassageId = material.passages?.[0]?.id || 'default-passage';
  const sortedQuestionGroups = await sortTableCompletionQuestionGroups(
    material.questionGroups || [],
    (material.passages || []).map((passage) => passage.id),
  );
  const publishReport = await buildTableCompletionPublishReport({
    ...material,
    questionGroups: sortedQuestionGroups,
  });
  const mergedQuestions = await mergeQuestionsWithCanonicalTableGroups(
    material.questions || [],
    sortedQuestionGroups,
  );
  const questions = mergedQuestions.map((question) => formatQuestionForStorage(question, defaultPassageId));
  const passages = (material.passages || []).map((passage, index) => {
    const passageQuestions = questions.filter((question) => question.passageId === passage.id);
    const questionNumbers = passageQuestions
      .map((question) => question.number)
      .filter((number) => Number.isFinite(number));
    const questionStart =
      questionNumbers.length > 0 ? Math.min(...questionNumbers) : passage.questionStart || (index * 13) + 1;
    const questionEnd =
      questionNumbers.length > 0 ? Math.max(...questionNumbers) : passage.questionEnd || questionStart;

    return {
      id: passage.id,
      title: passage.title || `Passage ${index + 1}`,
      content: passage.content,
      type: passage.type || 'text',
      imageUrl: passage.imageUrl || '',
      wordCount: passage.wordCount || passage.content.split(/\s+/).filter(Boolean).length,
      questionStart,
      questionEnd,
      createdAt: now,
    };
  });

  const unansweredCount = questions.filter((question) => (
    !question.answer
    || (typeof question.answer === 'string' && question.answer.trim() === '')
    || (Array.isArray(question.answer) && question.answer.length === 0)
  )).length;

  return {
    id: testId,
    title: material.metadata?.title || material.title,
    type: material.metadata?.type || 'IELTS',
    skill: material.metadata?.skill || 'Reading',
    duration,
    difficulty: material.metadata?.difficulty || 'Advanced',
    questionCount: questions.length,
    createdAt: now,
    createdBy,
    updatedAt: now,
    isPublished: true,
    ownerId,
    isPublic,
    isComplete: unansweredCount === 0,
    ...(unansweredCount > 0 ? { missingAnswerCount: unansweredCount } : {}),
    metadata: {
      description: material.metadata?.description || '',
      instructions: `You have ${duration} minutes to complete all ${questions.length} questions`,
      tags: material.metadata?.tags || ['IELTS', 'Reading'],
      ...(material.metadata?.targetBand ? { targetBand: material.metadata.targetBand } : {}),
      ...(material.metadata?.estimatedScore ? { estimatedScore: material.metadata.estimatedScore } : {}),
    },
    passages,
    questions,
    ...(sortedQuestionGroups.length > 0 ? { questionGroups: sortedQuestionGroups } : {}),
    ...(publishReport.diagnostics.length > 0
      ? { tableCompletionDiagnostics: publishReport.diagnostics }
      : {}),
    settings: {
      allowPause: false,
      showTimer: true,
      shuffleQuestions: false,
      showResults: 'immediate',
      allowReview: true,
      passingScore: 60,
    },
    statistics: {
      attempts: 0,
      averageScore: 0,
      averageTime: 0,
      completionRate: 0,
    },
  };
}

export async function writeTestData(testData) {
  const database = getFirebaseDatabase();
  await set(ref(database, `tests/${testData.id}`), testData);
  await set(ref(database, `student_safe_tests/${testData.id}`), await buildStudentSafeTestData(testData));
  return testData;
}

export async function loadAllTests() {
  const database = getFirebaseDatabase();
  const snapshot = await get(ref(database, 'tests'));
  return snapshot.exists() ? snapshot.val() : {};
}

export async function deleteTestsByIds(testIds) {
  const database = getFirebaseDatabase();
  const deletedIds = [];

  for (const testId of testIds) {
    await set(ref(database, `tests/${testId}`), null);
    await set(ref(database, `student_safe_tests/${testId}`), null);
    deletedIds.push(testId);
  }

  return deletedIds;
}
