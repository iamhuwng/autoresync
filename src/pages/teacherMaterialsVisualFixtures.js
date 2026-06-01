import { DEFAULT_MATERIAL_TEST_TYPES } from '../services/materialCatalog/testTypeConfig.service';

const FIXTURE_OWNER_ID = 'prd0052-visual-fixture-teacher';
const FIXTURE_UPDATED_AT = '2026-06-01T12:00:00.000Z';

const normalize = (value) => String(value || '').trim().toLowerCase();

const flatten = (values) => values.flatMap((value) => {
  if (Array.isArray(value)) {
    return flatten(value);
  }

  return value ? [String(value)] : [];
});

const getTestTypes = (testTypeIds) => testTypeIds
  .map((testTypeId) => DEFAULT_MATERIAL_TEST_TYPES.find((config) => (
    normalize(config.testTypeId) === normalize(testTypeId)
  )))
  .filter(Boolean)
  .map((config) => ({ ...config }));

const matchesTestType = (row, testTypeId) => {
  const activeId = normalize(testTypeId);
  if (!activeId) {
    return true;
  }

  return (row.testTypeIds || []).map(normalize).includes(activeId);
};

const matchesSearch = (row, searchTerm) => {
  const query = normalize(searchTerm);
  if (!query) {
    return true;
  }

  return flatten([
    row.title,
    row.subtitle,
    row.sourceFullTestTitle,
    row.sourceOrderDisplay,
    row.sourceQuestionRange,
    row.authors,
    row.publisher,
    row.series,
    row.tags,
    (row.testTypes || []).flatMap((testType) => [testType.label, testType.shortLabel]),
  ]).join(' ').toLowerCase().includes(query);
};

const matchesScope = (row, scope) => {
  const normalizedScope = normalize(scope) || 'private';
  const visibility = normalize(row.visibility || row.scope);

  if (normalizedScope === 'public') {
    return visibility === 'public' || visibility.startsWith('public-library-');
  }

  return visibility === 'private';
};

const withTeacher = (row, teacherId) => ({
  ...row,
  ownerId: row.ownerId || teacherId || FIXTURE_OWNER_ID,
});

const filterRows = (rows, { scope, searchTerm, testTypeId, teacherId } = {}) => rows
  .map((row) => withTeacher(row, teacherId))
  .filter((row) => matchesScope(row, scope))
  .filter((row) => matchesTestType(row, testTypeId))
  .filter((row) => matchesSearch(row, searchTerm));

export const isTeacherMaterialsVisualFixturesEnabled = () => (
  (Boolean(import.meta.env.DEV) || import.meta.env.MODE === 'test') &&
  normalize(import.meta.env.VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES) === 'true'
);

const readingPassageFixtures = [
  {
    id: 'prd0052-fixture-reading-ielts-urban-light',
    materialId: 'prd0052-fixture-reading-ielts-urban-light',
    title: 'Urban Light and Night Study',
    questionCount: 13,
    durationMinutes: 20,
    updatedAt: FIXTURE_UPDATED_AT,
    visibility: 'private',
    scope: 'private',
    isOwner: true,
    selectable: true,
    primaryTestTypeId: 'ielts',
    primaryTestTypeState: 'active',
    testTypeIds: ['ielts'],
    testTypes: getTestTypes(['ielts']),
    sourceOrderDisplay: 'Passage 1',
    sourceQuestionRange: '1-13',
    sourceFullTestId: 'prd0052-fixture-full-test-ielts-a',
    sourceFullTestTitle: 'IELTS Reading Mock A',
    publishedSnapshotVersionId: 'prd0052-fixture-reading-ielts-v1',
    hasStudentSafeProjection: true,
    accessible: true,
    archived: false,
  },
  {
    id: 'prd0052-fixture-reading-toefl-campus',
    materialId: 'prd0052-fixture-reading-toefl-campus',
    title: 'Campus Archives and Oral History',
    questionCount: 10,
    durationMinutes: 18,
    updatedAt: '2026-05-30T09:30:00.000Z',
    visibility: 'private',
    scope: 'private',
    isOwner: true,
    selectable: true,
    primaryTestTypeId: 'toefl',
    primaryTestTypeState: 'active',
    testTypeIds: ['toefl'],
    testTypes: getTestTypes(['toefl']),
    sourceOrderDisplay: 'Passage 2',
    sourceQuestionRange: '14-23',
    sourceFullTestId: 'prd0052-fixture-full-test-toefl-a',
    sourceFullTestTitle: 'TOEFL Reading Set A',
    publishedSnapshotVersionId: 'prd0052-fixture-reading-toefl-v1',
    hasStudentSafeProjection: true,
    accessible: true,
    archived: false,
  },
  {
    id: 'prd0052-fixture-reading-toeic-public',
    materialId: 'prd0052-fixture-reading-toeic-public',
    title: 'Workplace Notices and Schedules',
    questionCount: 8,
    durationMinutes: 15,
    updatedAt: '2026-05-28T08:00:00.000Z',
    visibility: 'public',
    scope: 'public',
    isOwner: false,
    selectable: true,
    primaryTestTypeId: 'toeic',
    primaryTestTypeState: 'active',
    testTypeIds: ['toeic'],
    testTypes: getTestTypes(['toeic']),
    sourceOrderDisplay: 'Part 7',
    sourceQuestionRange: '147-154',
    sourceFullTestId: 'prd0052-fixture-full-test-toeic-public',
    sourceFullTestTitle: 'TOEIC Public Reading Pack',
    publishedSnapshotVersionId: 'prd0052-fixture-reading-toeic-v1',
    hasStudentSafeProjection: true,
    accessible: true,
    archived: false,
  },
];

const bookFixtures = [
  {
    id: 'prd0052-fixture-book-ielts-builder',
    bookId: 'prd0052-fixture-book-ielts-builder',
    title: 'IELTS Reading Builder',
    subtitle: 'Passage collections for visual QA',
    authors: ['PRD0052 Visual QA'],
    publisher: 'MySTUdent',
    series: 'Teacher Materials',
    visibility: 'private',
    status: 'draft',
    primaryTestTypeId: 'ielts',
    testTypeIds: ['ielts'],
    testTypes: getTestTypes(['ielts']),
    tags: ['reading', 'passages', 'book'],
    updatedAt: FIXTURE_UPDATED_AT,
    isOwner: true,
    archived: false,
  },
  {
    id: 'prd0052-fixture-book-toefl-campus',
    bookId: 'prd0052-fixture-book-toefl-campus',
    title: 'TOEFL Campus Reading Set',
    subtitle: 'Academic passages grouped by skill',
    authors: ['Teacher Library'],
    publisher: 'MySTUdent',
    series: 'Book Index Fixture',
    visibility: 'private',
    status: 'ready',
    primaryTestTypeId: 'toefl',
    testTypeIds: ['toefl'],
    testTypes: getTestTypes(['toefl']),
    tags: ['academic', 'toefl'],
    updatedAt: '2026-05-29T14:10:00.000Z',
    isOwner: true,
    archived: false,
  },
  {
    id: 'prd0052-fixture-book-public-toeic',
    bookId: 'prd0052-fixture-book-public-toeic',
    title: 'Public TOEIC Reading Pack',
    subtitle: 'Shared practice materials',
    authors: ['Public Library'],
    publisher: 'MySTUdent',
    series: 'Shared Books',
    visibility: 'public-library-visible',
    status: 'ready',
    primaryTestTypeId: 'toeic',
    testTypeIds: ['toeic'],
    testTypes: getTestTypes(['toeic']),
    tags: ['public', 'toeic'],
    updatedAt: '2026-05-27T11:45:00.000Z',
    isOwner: false,
    archived: false,
  },
];

export const listTeacherMaterialsFixtureReadingPassages = (options = {}) => (
  filterRows(readingPassageFixtures, options)
);

export const listTeacherMaterialsFixtureBooks = (options = {}) => (
  filterRows(bookFixtures, options)
);
