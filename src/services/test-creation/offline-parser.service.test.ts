import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineParserService } from './offline-parser.service';

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn(() => ({ path: 'parsingCache/mock' })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __type: 'serverTimestamp' })),
  fromDate: vi.fn((date: Date) => ({ toDate: () => date })),
}));

vi.mock('firebase/firestore', () => ({
  doc: firestoreMocks.doc,
  setDoc: firestoreMocks.setDoc,
  getDoc: firestoreMocks.getDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  Timestamp: {
    fromDate: firestoreMocks.fromDate,
  },
  serverTimestamp: firestoreMocks.serverTimestamp,
}));

vi.mock('../firebase', () => ({
  firestore: {},
}));

describe('OfflineParserService', () => {
  let service: OfflineParserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OfflineParserService();
    (service as any).idbManager = {
      save: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('parses markdown-bold IELTS question numbering in offline fallback', async () => {
    const input = `# Engineering a solution to climate change

## Questions 35-40
**35.** removes carbon dioxide as soon as it is produced
**36.** increases the reflectivity of white clouds
**37.** cleans carbon dioxide from the air naturally`;

    const result = await service.parseOffline(input, 'pasted-content.txt');

    expect(result.questions).toHaveLength(3);
    expect(result.questions.map((question) => question.questionNumber)).toEqual([35, 36, 37]);
    expect(result.questions[0]?.questionText).toContain('removes carbon dioxide');
  });

  it('parses Question-prefixed numbering with text on the next line', async () => {
    const input = `Question 23.
What is the main idea of the passage?

Question 24.
The word magnet in paragraph 1 is closest in meaning to:`;

    const result = await service.parseOffline(input, 'question-prefix.txt');

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]?.questionText).toBe('What is the main idea of the passage?');
    expect(result.questions[1]?.questionText).toContain('The word magnet');
  });

  it('sanitizes undefined fields before saving checkpoints', async () => {
    const partialResults = {
      documentText: 'Example passage',
      rawSource: {
        hash: 'abc123',
        exactText: 'Example passage',
        metadata: undefined,
      },
      formattedTest: {
        passages: [],
        questions: [
          {
            questionNumber: 1,
            answer: undefined,
          },
        ],
      },
      verification: {
        damageRegions: [],
        summary: {
          blocked: undefined,
        },
      },
    } as any;

    await service.saveCheckpoint('user-1', 'hash-1', 'classifying', 75, partialResults);

    expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1);
    const payload = firestoreMocks.setDoc.mock.calls[0]?.[1];

    const collectUndefinedPaths = (value: unknown, path = 'root'): string[] => {
      if (value === undefined) {
        return [path];
      }

      if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectUndefinedPaths(item, `${path}[${index}]`));
      }

      if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
          collectUndefinedPaths(item, `${path}.${key}`),
        );
      }

      return [];
    };

    expect(collectUndefinedPaths(payload)).toEqual([]);
    expect(payload.partialResults.rawSource.metadata).toBeUndefined();
    expect(payload.partialResults.formattedTest.questions[0].answer).toBeUndefined();
    expect(payload.partialResults.verification.summary.blocked).toBeUndefined();
  });
});
