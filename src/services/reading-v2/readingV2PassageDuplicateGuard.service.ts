import type { MaterialTestTypeId, ReadingPassageVisibilityScope } from '../../types/materialCatalog.types';

export type ReadingV2DuplicateIndexState = 'published' | 'archived';

export interface ReadingV2DuplicateIndexRow {
  readonly schemaVersion: 1;
  readonly ownerId: string;
  readonly passageMaterialId: string;
  readonly currentVersionId: string;
  readonly title: string;
  readonly state: ReadingV2DuplicateIndexState;
  readonly visibility: ReadingPassageVisibilityScope;
  readonly source: {
    readonly sourceFullTestId?: string;
    readonly sourceOrderDisplay?: string;
  };
  readonly testType: {
    readonly primaryTestTypeId?: MaterialTestTypeId;
    readonly testTypeIds: readonly MaterialTestTypeId[];
  };
  readonly questionCount: number;
  readonly updatedAt: string;
  readonly bodyShingleSize: 5;
  readonly questionShingleSize: 3;
  readonly bodyShingleHashes: readonly string[];
  readonly questionShingleHashes: readonly string[];
}

export interface ReadingV2DuplicateIndexInput {
  readonly ownerId: string;
  readonly passageMaterialId: string;
  readonly currentVersionId: string;
  readonly title: string;
  readonly state: ReadingV2DuplicateIndexState;
  readonly visibility: ReadingPassageVisibilityScope;
  readonly source: ReadingV2DuplicateIndexRow['source'];
  readonly testType: ReadingV2DuplicateIndexRow['testType'];
  readonly questionCount: number;
  readonly updatedAt: string;
  readonly bodyText: string;
  readonly questionText: string;
}

export interface ReadingV2DuplicateCandidateInput {
  readonly title: string;
  readonly source?: ReadingV2DuplicateIndexRow['source'];
  readonly bodyText: string;
  readonly questionText: string;
}

export interface ReadingV2DuplicateSimilarity {
  readonly bodySimilarityPercent: number;
  readonly questionSimilarityPercent: number;
  readonly combinedSimilarityPercent: number;
  readonly shouldWarn: boolean;
}

export type ReadingV2DuplicateAction =
  | 'use-existing'
  | 'restore-and-use'
  | 'create-new-anyway';

export interface ReadingV2DuplicateMatch extends ReadingV2DuplicateSimilarity {
  readonly materialId: string;
  readonly title: string;
  readonly source: ReadingV2DuplicateIndexRow['source'];
  readonly ownerId: string;
  readonly visibility: ReadingPassageVisibilityScope;
  readonly state: ReadingV2DuplicateIndexState;
  readonly currentVersionId: string;
  readonly actions: readonly ReadingV2DuplicateAction[];
}

export interface ReadingV2DuplicateGuardInput {
  readonly teacherId: string;
  readonly candidate: ReadingV2DuplicateCandidateInput;
  readonly rows: readonly ReadingV2DuplicateIndexRow[];
  readonly currentMaterialId?: string;
}

export interface ReadingV2DuplicateGuardResult {
  readonly shouldWarn: boolean;
  readonly blockPublish: false;
  readonly matches: readonly ReadingV2DuplicateMatch[];
}

const BODY_SHINGLE_SIZE = 5;
const QUESTION_SHINGLE_SIZE = 3;
const WARNING_THRESHOLD_PERCENT = 80;

const HASH_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const UNSAFE_DUPLICATE_INDEX_FIELDS = [
  'passageBody',
  'bodyText',
  'questionText',
  'canonicalPayload',
  'document',
  'sections',
  'stimuli',
  'taskGroups',
  'interactions',
  'optionSets',
  'answerKey',
  'answerKeys',
  'correctAnswers',
  'scoringRule',
  'scoringRules',
  'aiReviewEvidence',
  'authorDiagnostics',
  'hiddenProvenance',
  'importEvidence',
] as const;

const rotateRight = (value: number, shift: number): number =>
  (value >>> shift) | (value << (32 - shift));

const toHex = (value: number): string =>
  (value >>> 0).toString(16).padStart(8, '0');

const sha256Hex = (value: string): string => {
  const bytes = Array.from(new TextEncoder().encode(value));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(bitLength / (2 ** shift)) & 0xff);
  }

  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const byteIndex = offset + index * 4;
      words[index] =
        ((bytes[byteIndex] ?? 0) << 24) |
        ((bytes[byteIndex + 1] ?? 0) << 16) |
        ((bytes[byteIndex + 2] ?? 0) << 8) |
        (bytes[byteIndex + 3] ?? 0);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15]!, 7) ^ rotateRight(words[index - 15]!, 18) ^ (words[index - 15]! >>> 3);
      const s1 = rotateRight(words[index - 2]!, 17) ^ rotateRight(words[index - 2]!, 19) ^ (words[index - 2]! >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + s1 + choice + HASH_CONSTANTS[index]! + words[index]!) >>> 0;
      const s0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }

  return hash.map(toHex).join('');
};

const removeCombiningMarks = (value: string): string =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

export const normalizeReadingV2DuplicateText = (value: string): readonly string[] =>
  removeCombiningMarks(value.normalize('NFKC'))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export const createReadingV2DuplicateShingleHashes = (
  value: string,
  shingleSize: number,
): readonly string[] => {
  const tokens = normalizeReadingV2DuplicateText(value);
  if (tokens.length < shingleSize || shingleSize <= 0) {
    return [];
  }

  const shingles = new Set<string>();
  for (let index = 0; index <= tokens.length - shingleSize; index += 1) {
    shingles.add(sha256Hex(tokens.slice(index, index + shingleSize).join(' ')));
  }
  return [...shingles].sort();
};

const sorensenDicePercent = (left: readonly string[], right: readonly string[]): number => {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const intersectionSize = new Set(left.filter((value) => rightSet.has(value))).size;
  return Math.round((2 * intersectionSize / (new Set(left).size + new Set(right).size)) * 100);
};

export const calculateReadingV2DuplicateSimilarity = (
  left: Pick<ReadingV2DuplicateIndexRow, 'bodyShingleHashes' | 'questionShingleHashes'>,
  right: Pick<ReadingV2DuplicateIndexRow, 'bodyShingleHashes' | 'questionShingleHashes'>,
): ReadingV2DuplicateSimilarity => {
  const bodySimilarityPercent = sorensenDicePercent(left.bodyShingleHashes, right.bodyShingleHashes);
  const questionSimilarityPercent = sorensenDicePercent(left.questionShingleHashes, right.questionShingleHashes);
  const combinedSimilarityPercent = Math.round((bodySimilarityPercent * 0.5) + (questionSimilarityPercent * 0.5));

  return {
    bodySimilarityPercent,
    questionSimilarityPercent,
    combinedSimilarityPercent,
    shouldWarn: combinedSimilarityPercent >= WARNING_THRESHOLD_PERCENT,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const findUnsafeField = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const unsafe = findUnsafeField(entry);
      if (unsafe) {
        return unsafe;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if ((UNSAFE_DUPLICATE_INDEX_FIELDS as readonly string[]).includes(key)) {
      return key;
    }

    const unsafe = findUnsafeField(entry);
    if (unsafe) {
      return unsafe;
    }
  }

  return null;
};

export const getReadingV2DuplicateIndexPath = (ownerId: string, passageMaterialId: string): string =>
  `reading_v2/duplicate_indexes/passages_by_owner/${ownerId}/${passageMaterialId}`;

export const validateReadingV2DuplicateIndexRow = (row: unknown): ReadingV2DuplicateIndexRow => {
  if (!isRecord(row)) {
    throw new Error('Reading V2 duplicate index row must be an object.');
  }

  const unsafeField = findUnsafeField(row);
  if (unsafeField) {
    throw new Error(`Reading V2 duplicate index row contains unsafe duplicate index field: ${unsafeField}.`);
  }

  if (row.schemaVersion !== 1 || typeof row.ownerId !== 'string' || typeof row.passageMaterialId !== 'string') {
    throw new Error('Reading V2 duplicate index row requires schemaVersion, ownerId, and passageMaterialId.');
  }

  return row as unknown as ReadingV2DuplicateIndexRow;
};

export const buildReadingV2DuplicateIndexRow = (
  input: ReadingV2DuplicateIndexInput,
): ReadingV2DuplicateIndexRow =>
  validateReadingV2DuplicateIndexRow({
    schemaVersion: 1,
    ownerId: input.ownerId,
    passageMaterialId: input.passageMaterialId,
    currentVersionId: input.currentVersionId,
    title: input.title,
    state: input.state,
    visibility: input.visibility,
    source: input.source,
    testType: input.testType,
    questionCount: input.questionCount,
    updatedAt: input.updatedAt,
    bodyShingleSize: BODY_SHINGLE_SIZE,
    questionShingleSize: QUESTION_SHINGLE_SIZE,
    bodyShingleHashes: createReadingV2DuplicateShingleHashes(input.bodyText, BODY_SHINGLE_SIZE),
    questionShingleHashes: createReadingV2DuplicateShingleHashes(input.questionText, QUESTION_SHINGLE_SIZE),
  });

const isAccessibleDuplicateRow = (teacherId: string, row: ReadingV2DuplicateIndexRow): boolean =>
  row.state === 'published' || (row.state === 'archived' && row.ownerId === teacherId);

const actionsForRow = (teacherId: string, row: ReadingV2DuplicateIndexRow): readonly ReadingV2DuplicateAction[] =>
  row.state === 'archived' && row.ownerId === teacherId
    ? ['restore-and-use', 'create-new-anyway']
    : ['use-existing', 'create-new-anyway'];

export const findReadingV2PassageDuplicateMatches = (
  input: ReadingV2DuplicateGuardInput,
): ReadingV2DuplicateGuardResult => {
  const candidateRow = buildReadingV2DuplicateIndexRow({
    ownerId: input.teacherId,
    passageMaterialId: '__candidate__',
    currentVersionId: '__candidate__',
    title: input.candidate.title,
    state: 'published',
    visibility: 'private',
    source: input.candidate.source ?? {},
    testType: { testTypeIds: [] },
    questionCount: 0,
    updatedAt: new Date(0).toISOString(),
    bodyText: input.candidate.bodyText,
    questionText: input.candidate.questionText,
  });

  const matches = input.rows
    .filter((row) => row.passageMaterialId !== input.currentMaterialId)
    .filter((row) => isAccessibleDuplicateRow(input.teacherId, row))
    .map((row): ReadingV2DuplicateMatch => ({
      ...calculateReadingV2DuplicateSimilarity(candidateRow, row),
      materialId: row.passageMaterialId,
      title: row.title,
      source: row.source,
      ownerId: row.ownerId,
      visibility: row.visibility,
      state: row.state,
      currentVersionId: row.currentVersionId,
      actions: actionsForRow(input.teacherId, row),
    }))
    .filter((match) => match.shouldWarn)
    .sort((left, right) => right.combinedSimilarityPercent - left.combinedSimilarityPercent);

  return {
    shouldWarn: matches.length > 0,
    blockPublish: false,
    matches,
  };
};
