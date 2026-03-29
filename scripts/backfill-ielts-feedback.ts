import { execFile } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import type { THCSGradingResult, THCSSection } from '../src/types/thcs-test.types';
import type { TestResultRecord } from '../src/services/testResults.service';
import type { SavedResultFeedbackKind } from '../src/types/results.types';
import {
  buildSavedResultFeedbackMetadata,
  normalizeFeedbackQuestionType,
} from '../src/services/feedbackClassification.service';

const execFileAsync = promisify(execFile);
const firebaseBinary = process.platform === 'win32' ? 'cmd' : 'firebase';
function getFirebaseProjectId() {
  return process.env.VITE_FIREBASE_PROJECT_ID || 'temp-a1437';
}

const KNOWN_RESULT_IDS = ['-OokByqkBdjgdfRgv11N', '-OolNjDsPHI4s410MXaT'] as const;

type CliOptions = {
  dryRun: boolean;
  batch: boolean;
  seedKnown: boolean;
  resultIds: string[];
  limit?: number;
  help: boolean;
};

type CandidateRecord = {
  resultId: string;
  record: TestResultRecord;
  kind: SavedResultFeedbackKind;
};

type FirebaseNode = Record<string, unknown> | null;

function printUsage() {
  console.log(`IELTS feedback backfill utility

Usage:
  npx vite-node --mode test scripts/backfill-ielts-feedback.ts [options]

Options:
  --dry-run            Report candidates only (default)
  --write              Persist repairs
  --batch              Scan all test_results and repair eligible IELTS Reading/Listening rows
  --seed-known         Include the known missing result IDs (${KNOWN_RESULT_IDS.join(', ')})
  --result-id <id>     Repair one result (repeatable)
  --result-ids <a,b>   Repair multiple results from a comma-separated list
  --limit <n>          Cap the number of batch candidates processed
  --help               Show this help
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    batch: false,
    seedKnown: false,
    resultIds: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--write':
        options.dryRun = false;
        break;
      case '--batch':
        options.batch = true;
        break;
      case '--seed-known':
        options.seedKnown = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--result-id': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--result-id requires a value');
        }
        options.resultIds.push(value);
        index += 1;
        break;
      }
      case '--result-ids': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--result-ids requires a comma-separated value');
        }
        options.resultIds.push(
          ...value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        );
        index += 1;
        break;
      }
      case '--limit': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--limit requires a numeric value');
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error('--limit must be a positive number');
        }

        options.limit = Math.floor(parsed);
        index += 1;
        break;
      }
      default:
        if (arg.startsWith('--result-id=')) {
          options.resultIds.push(arg.slice('--result-id='.length));
          break;
        }

        if (arg.startsWith('--result-ids=')) {
          options.resultIds.push(
            ...arg
              .slice('--result-ids='.length)
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          );
          break;
        }

        if (arg.startsWith('--limit=')) {
          const parsed = Number(arg.slice('--limit='.length));
          if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('--limit must be a positive number');
          }
          options.limit = Math.floor(parsed);
          break;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toResultRecord(resultId: string, value: unknown): TestResultRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ...(value as TestResultRecord),
    resultId,
  };
}

function getCliArgs(path: string) {
  return ['database:get', path, '--project', getFirebaseProjectId()];
}

function getUpdateCliArgs(path: string, infilePath: string) {
  return ['database:update', path, infilePath, '--project', getFirebaseProjectId(), '--force'];
}

async function runFirebaseCli(args: string[]): Promise<string> {
  const commandArgs = process.platform === 'win32' ? ['/c', 'firebase', ...args] : args;
  const { stdout } = await execFileAsync(firebaseBinary, commandArgs, {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });

  return stdout.trim();
}

async function readFirebaseJson(path: string): Promise<FirebaseNode> {
  try {
    const output = await runFirebaseCli(getCliArgs(path));
    if (!output) {
      return null;
    }

    return JSON.parse(output) as FirebaseNode;
  } catch (error) {
    console.warn(`[backfill] Failed to read ${path}:`, error);
    return null;
  }
}

async function updateFirebaseJson(path: string, data: unknown): Promise<void> {
  const tempFile = join(
    tmpdir(),
    `ielts-feedback-backfill-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );

  await writeFile(tempFile, JSON.stringify(data), 'utf8');

  try {
    await runFirebaseCli(getUpdateCliArgs(path, tempFile));
  } finally {
    await rm(tempFile, { force: true }).catch(() => undefined);
  }
}

function buildQuestionResultsRecord(result: TestResultRecord): Record<string, unknown> {
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

function buildQuestionStub(questionNumber: number, questionType: string, correctAnswer: unknown) {
  return {
    id: `backfill-q-${questionNumber}`,
    questionNumber,
    questionText: `Question ${questionNumber}`,
    type: normalizeFeedbackQuestionType(questionType),
    intent: normalizeFeedbackQuestionType(questionType),
    correctAnswer,
  };
}

function buildSectionsFromSourceTest(sourceTest: Record<string, unknown>, record: TestResultRecord): THCSSection[] {
  const questions = Array.isArray(sourceTest.questions) ? sourceTest.questions.filter(isRecord) : [];

  const passages = Array.isArray(sourceTest.passages) ? sourceTest.passages.filter(isRecord) : [];
  if (passages.length > 0) {
    return passages
      .map((passage, index) => {
        const start = Number(passage.questionStart);
        const end = Number(passage.questionEnd);
        const sectionQuestions = questions
          .filter((question) => {
            const number = Number(question.number);
            return Number.isFinite(number) && number >= start && number <= end;
          })
          .map((question) => buildQuestionStub(Number(question.number), String(question.type || 'question'), question.answer));

        if (sectionQuestions.length === 0) {
          return null;
        }

        const segmentLabel = String(record.testSkill || '').toLowerCase().includes('listening') ? 'Part' : 'Passage';
        return {
          id: String(passage.id || `passage-${index + 1}`),
          name: String(passage.title || `${segmentLabel} ${index + 1}`),
          order: index,
          totalPoints: sectionQuestions.length,
          pointMode: 'auto',
          instructionText: '',
          isCustomInstruction: false,
          layout: 'single-column',
          passage: {
            id: String(passage.id || `passage-${index + 1}`),
            title: String(passage.title || `${segmentLabel} ${index + 1}`),
            content: String(passage.content || ''),
            wordCount: Number(passage.wordCount || 0),
          },
          questions: sectionQuestions as any,
        } as THCSSection;
      })
      .filter((section): section is THCSSection => Boolean(section));
  }

  const audioSections = Array.isArray(sourceTest.audioSections) ? sourceTest.audioSections.filter(isRecord) : [];
  if (audioSections.length > 0) {
    return audioSections
      .map((section, index) => {
        const start = Number(section.startQuestion);
        const end = Number(section.endQuestion);
        const sectionQuestions = questions
          .filter((question) => {
            const number = Number(question.number);
            return Number.isFinite(number) && number >= start && number <= end;
          })
          .map((question) => buildQuestionStub(Number(question.number), String(question.type || 'question'), question.answer));

        if (sectionQuestions.length === 0) {
          return null;
        }

        return {
          id: String(section.id || section.number || `part-${index + 1}`),
          name: String(section.name || `Part ${index + 1}`),
          order: index,
          totalPoints: sectionQuestions.length,
          pointMode: 'auto',
          instructionText: '',
          isCustomInstruction: false,
          layout: 'single-column',
          passage: {
            id: String(section.id || section.number || `part-${index + 1}`),
            title: String(section.name || `Part ${index + 1}`),
            content: '',
            wordCount: 0,
          },
          questions: sectionQuestions as any,
        } as THCSSection;
      })
      .filter((section): section is THCSSection => Boolean(section));
  }

  if (questions.length > 0) {
    return [
      {
        id: 'overall',
        name: 'Overall Performance',
        order: 0,
        totalPoints: questions.length,
        pointMode: 'auto',
        instructionText: '',
        isCustomInstruction: false,
        layout: 'single-column',
        questions: questions
          .map((question) => buildQuestionStub(Number(question.number), String(question.type || 'question'), question.answer))
          .sort((left, right) => left.questionNumber - right.questionNumber) as any,
      },
    ];
  }

  return buildSectionsFromResult(record);
}

function buildSectionsFromResult(record: TestResultRecord): THCSSection[] {
  const questionResults = Array.isArray(record.questionResults) ? record.questionResults : [];
  const passageResults = record.ieltsData?.passageResults || [];
  const segmentLabel = String(record.testSkill || '').toLowerCase().includes('listening') ? 'Part' : 'Passage';

  if (passageResults.length > 0) {
    return passageResults.map((passage, index) => ({
      id: `segment-${index + 1}`,
      name: `${segmentLabel} ${index + 1}`,
      order: index,
      totalPoints: passage.total,
      pointMode: 'auto',
      instructionText: '',
      isCustomInstruction: false,
      layout: 'single-column',
      passage: {
        id: `segment-${index + 1}`,
        title: passage.passageName || `${segmentLabel} ${index + 1}`,
        content: '',
        wordCount: 0,
      },
      questions: questionResults
        .filter(
          (question) =>
            question.questionNumber >= passage.questionRange[0]
            && question.questionNumber <= passage.questionRange[1],
        )
        .map((question) => buildQuestionStub(question.questionNumber, String(question.questionType || 'question'), question.correctAnswer)) as any,
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
      questions: [...questionResults]
        .sort((left, right) => left.questionNumber - right.questionNumber)
        .map((question) => buildQuestionStub(question.questionNumber, String(question.questionType || 'question'), question.correctAnswer)) as any,
    },
  ];
}

function buildSectionResults(record: TestResultRecord, sections: THCSSection[]) {
  const questionResults = Array.isArray(record.questionResults) ? record.questionResults : [];

  return sections.map((section) => {
    const items = questionResults.filter((question) =>
      Array.isArray((section as any).questions)
      && (section as any).questions.some((sourceQuestion: { questionNumber: number }) => sourceQuestion.questionNumber === question.questionNumber),
    );
    const correctCount = items.filter((item) => item.isCorrect).length;
    const totalCount = items.length;
    const intentBreakdown = new Map<string, { correct: number; total: number }>();

    for (const item of items) {
      const key = normalizeFeedbackQuestionType(String(item.questionType || 'question'));
      const existing = intentBreakdown.get(key) || { correct: 0, total: 0 };
      existing.total += 1;
      if (item.isCorrect) {
        existing.correct += 1;
      }
      intentBreakdown.set(key, existing);
    }

    return {
      sectionId: section.id,
      sectionName: section.name,
      pointsEarned: correctCount,
      pointsMax: totalCount,
      correctCount,
      totalCount,
      percentage: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
      intentBreakdown: Object.fromEntries(intentBreakdown.entries()),
    };
  });
}

function buildGradingResult(record: TestResultRecord, sections: THCSSection[]): THCSGradingResult {
  return {
    scaledScore: record.bandScore || Number((record.percentage / 10).toFixed(1)),
    totalPoints: record.totalScore,
    maxPoints: record.maxScore,
    sectionResults: buildSectionResults(record, sections) as any,
    questionResults: buildQuestionResultsRecord(record) as any,
    gradingStatus: 'fully-graded',
    gradedAt: record.submittedAt,
    testId: record.testId,
    studentId: record.studentId || (record as any).userId || '',
  } as THCSGradingResult;
}

function summarizeCandidate(candidate: CandidateRecord): string {
  const title = String(candidate.record.testTitle || 'Untitled test');
  const studentName = String(candidate.record.studentName || candidate.record.studentId || candidate.record.userId || 'unknown student');
  return `[${candidate.resultId}] ${candidate.kind} | ${title} | ${studentName}`;
}

function collectBatchCandidates(raw: FirebaseNode): CandidateRecord[] {
  if (!isRecord(raw)) {
    return [];
  }

  return Object.entries(raw)
    .map(([resultId, value]) => {
      const record = toResultRecord(resultId, value);
      if (!record) {
        return null;
      }

      const metadata = buildSavedResultFeedbackMetadata(record);
      if (metadata.kind !== 'ielts-reading' && metadata.kind !== 'ielts-listening') {
        return null;
      }

      if (record.formativeFeedback) {
        return null;
      }

      if (!Array.isArray(record.questionResults) || record.questionResults.length === 0) {
        return null;
      }

      return {
        resultId,
        record,
        kind: metadata.kind,
      };
    })
    .filter((candidate): candidate is CandidateRecord => Boolean(candidate));
}

async function fetchCandidateById(resultId: string): Promise<CandidateRecord | null> {
  const record = await readFirebaseJson(`/test_results/${resultId}`);
  if (!record) {
    return null;
  }

  const typedRecord = toResultRecord(resultId, record);
  if (!typedRecord) {
    return null;
  }

  const metadata = buildSavedResultFeedbackMetadata(typedRecord);
  if (metadata.kind !== 'ielts-reading' && metadata.kind !== 'ielts-listening') {
    return null;
  }

  if (typedRecord.formativeFeedback) {
    return null;
  }

  if (!Array.isArray(typedRecord.questionResults) || typedRecord.questionResults.length === 0) {
    return null;
  }

  return {
    resultId,
    record: typedRecord,
    kind: metadata.kind,
  };
}

async function buildFeedbackForCandidate(candidate: CandidateRecord) {
  const sourceTest = await readFirebaseJson(`/tests/${candidate.record.testId}`);
  const sourceTestRecord = isRecord(sourceTest) ? sourceTest : {};
  const metadata = buildSavedResultFeedbackMetadata(candidate.record);
  const sections = buildSectionsFromSourceTest(sourceTestRecord, candidate.record);
  const gradingResult = buildGradingResult(candidate.record, sections);

  const { generateFormativeFeedbackSnapshot } = await import('../src/services/formativeFeedback.service');
  const snapshot = await generateFormativeFeedbackSnapshot(
    gradingResult,
    sections,
    {
      title: candidate.record.testTitle || String(sourceTestRecord.title || 'Test'),
      gradeLevel: Number((candidate.record as any).gradeLevel || 9),
      type: String(candidate.record.testType || sourceTestRecord.type || ''),
      skill: String(candidate.record.testSkill || sourceTestRecord.skill || ''),
      family: metadata.kind === 'thcs' ? 'thcs' : metadata.kind ? 'ielts' : 'generic',
      kind: metadata.kind,
      formatKind: metadata.formatKind,
      segmentLabel: metadata.segmentLabel,
      bandScore: candidate.record.bandScore,
      passageResults: candidate.record.ieltsData?.passageResults || [],
      segmentBreakdown: metadata.segmentBreakdown,
      questionTypeBreakdown: metadata.questionTypeBreakdown,
      unansweredCount: metadata.unansweredCount,
      timeSpent: candidate.record.timeElapsed,
      totalQuestions: candidate.record.totalQuestions,
    },
    candidate.resultId,
  );

  return {
    snapshot,
    metadata,
  };
}

async function repairCandidate(candidate: CandidateRecord): Promise<'repaired' | 'failed'> {
  try {
    const { snapshot, metadata } = await buildFeedbackForCandidate(candidate);
    const outcome = snapshot.aiApplied ? 'saved-ai' : 'saved-deterministic';

    await updateFirebaseJson(`/test_results/${candidate.resultId}`, {
      formativeFeedback: snapshot.feedback,
      feedbackGenerationMeta: {
        kind: metadata.kind,
        lastAttemptAt: Date.now(),
        lastTriggerSource: 'ielts-backfill',
        lastOutcome: outcome,
        lastError: null,
      },
    });

    console.log(
      `[repaired] ${candidate.resultId} -> ${snapshot.mode}${snapshot.aiApplied ? ' (AI)' : ' (deterministic)'}`,
    );
    return 'repaired';
  } catch (error) {
    console.error(`[failed] ${candidate.resultId}:`, error);
    return 'failed';
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  loadEnv({ path: '.env' });
  loadEnv({ path: '.env.local', override: true });

  const targetIds = new Set<string>(options.resultIds);
  if (options.seedKnown) {
    for (const resultId of KNOWN_RESULT_IDS) {
      targetIds.add(resultId);
    }
  }

  const candidates = new Map<string, CandidateRecord>();

  if (options.batch || targetIds.size === 0) {
    const root = await readFirebaseJson('/test_results');
    for (const candidate of collectBatchCandidates(root)) {
      candidates.set(candidate.resultId, candidate);
    }
  }

  for (const resultId of targetIds) {
    const candidate = await fetchCandidateById(resultId);
    if (candidate) {
      candidates.set(candidate.resultId, candidate);
    }
  }

  const orderedCandidates = [...candidates.values()].sort((left, right) => {
    const leftTime = Number(left.record.submittedAt || left.record.createdAt || 0);
    const rightTime = Number(right.record.submittedAt || right.record.createdAt || 0);

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.resultId.localeCompare(right.resultId);
  });

  if (options.limit) {
    orderedCandidates.splice(options.limit);
  }

  console.log(`Found ${orderedCandidates.length} eligible IELTS result(s) missing formativeFeedback.`);
  for (const candidate of orderedCandidates) {
    console.log(`- ${summarizeCandidate(candidate)}`);
  }

  if (options.dryRun) {
    console.log('Dry run only. Re-run with --write to persist repairs.');
    return;
  }

  let repaired = 0;
  let failed = 0;

  for (const candidate of orderedCandidates) {
    const result = await repairCandidate(candidate);
    if (result === 'repaired') {
      repaired += 1;
    } else {
      failed += 1;
    }
  }

  console.log(`Backfill complete. repaired=${repaired} failed=${failed}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
