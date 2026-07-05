// @ts-nocheck
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BookEditorModal from '../components/books/BookEditorModal';
import { useAuth } from '../hooks/useAuth';
import type { BookMaterialSummary } from '../services/materialCatalog/bookEditor.service';
import { materialCatalogIds, type MaterialBookMaterialRef, type MaterialBookMetadata, type MaterialBookNode } from '../types/materialCatalog.types';

const NOW = '2026-06-10T00:00:00.000Z';
const DEFAULT_OWNER_ID = 'teacher-1';

type BookBrokenScenario =
  | 'healthy'
  | 'all'
  | 'archived-owned'
  | 'archived-other'
  | 'missing'
  | 'inaccessible'
  | 'missing-version'
  | 'missing-projection';

const scenarioLabels: Record<BookBrokenScenario, string> = {
  healthy: 'Healthy Book',
  all: 'All Broken Ref Scenarios',
  'archived-owned': 'Owned Archived Ref',
  'archived-other': 'Other Teacher Archived Ref',
  missing: 'Missing Ref',
  inaccessible: 'Inaccessible Ref',
  'missing-version': 'Missing Version Ref',
  'missing-projection': 'Missing Projection Ref',
};

const normalizeScenario = (value: string | null): BookBrokenScenario =>
  value === 'healthy' ||
  value === 'archived-owned' ||
  value === 'broken-refs' ||
  value === 'archived-other' ||
  value === 'non-owned-archived-ref' ||
  value === 'missing' ||
  value === 'inaccessible' ||
  value === 'missing-version' ||
  value === 'missing-projection' ||
  value === 'all-broken-ref-reasons'
    ? value
      .replace('broken-refs', 'archived-owned')
      .replace('non-owned-archived-ref', 'archived-other')
      .replace('all-broken-ref-reasons', 'all') as BookBrokenScenario
    : 'all';

const makeBook = (scenario: BookBrokenScenario, ownerId: string): MaterialBookMetadata => ({
  bookId: materialCatalogIds.bookId(`smoke-book-${scenario}`),
  ownerId,
  title: `Smoke Book - ${scenarioLabels[scenario]}`,
  subtitle: 'Book repair smoke data',
  authors: ['Smoke Teacher'],
  publisher: 'LT QA',
  edition: '1',
  series: 'Packet 8',
  isbn: '',
  coverUrl: '',
  primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
  testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  tags: ['smoke', 'book-repair'],
  description: 'Dev-only Book repair smoke fixture.',
  visibility: 'private',
  status: scenario === 'healthy' ? 'ready' : 'needs-repair',
  hasBrokenRefs: scenario !== 'healthy',
  brokenRefCount: scenario === 'healthy' ? 0 : scenario === 'all' ? 6 : 1,
  brokenRefReasons: scenario === 'healthy'
    ? []
    : scenario === 'all'
      ? ['archived', 'missing', 'inaccessible', 'missing-version', 'missing-projection']
      : [scenario === 'archived-owned' || scenario === 'archived-other' ? 'archived' : scenario],
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: ownerId,
  updatedBy: ownerId,
});

const makeRef = (
  key: string,
  ownerId: string,
  overrides: Partial<MaterialBookMaterialRef>,
): MaterialBookMaterialRef => ({
  refId: materialCatalogIds.refId(`ref-${key}`),
  materialId: `material-${key}`,
  materialKind: 'reading-passage',
  snapshotVersionId: `snapshot-${key}`,
  titleSnapshot: `Broken Passage ${key}`,
  testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
  visibilitySnapshot: 'private',
  availability: 'archived',
  updateState: 'unknown',
  order: 1,
  addedAt: NOW,
  addedBy: ownerId,
  ownerIdSnapshot: ownerId,
  ...overrides,
});

const scenarioRefs = (scenario: BookBrokenScenario, ownerId: string): readonly MaterialBookMaterialRef[] => {
  const refs: Record<BookBrokenScenario, MaterialBookMaterialRef> = {
    healthy: makeRef('healthy', ownerId, {
      titleSnapshot: 'Healthy control passage',
      availability: 'available',
      updateState: 'current',
      materialId: 'healthy-control',
      snapshotVersionId: 'healthy-control-version',
    }),
    'archived-owned': makeRef('archived-owned', ownerId, {
      titleSnapshot: 'Owned archived source',
      availability: 'archived',
      ownerIdSnapshot: ownerId,
      addedBy: ownerId,
    }),
    'archived-other': makeRef('archived-other', ownerId, {
      titleSnapshot: 'Other teacher archived source',
      availability: 'archived',
      ownerIdSnapshot: 'other-teacher',
      addedBy: 'other-teacher',
    }),
    missing: makeRef('missing', ownerId, {
      titleSnapshot: 'Deleted source',
      availability: 'missing',
      snapshotVersionId: 'deleted-version',
    }),
    inaccessible: makeRef('inaccessible', ownerId, {
      titleSnapshot: 'Private source without access',
      availability: 'inaccessible',
      ownerIdSnapshot: 'other-teacher',
      addedBy: 'other-teacher',
    }),
    'missing-version': makeRef('missing-version', ownerId, {
      titleSnapshot: 'Missing version source',
      availability: 'missing-version',
      snapshotVersionId: undefined,
    }),
    'missing-projection': makeRef('missing-projection', ownerId, {
      titleSnapshot: 'Missing projection source',
      availability: 'missing-projection',
    }),
    all: makeRef('all-placeholder', ownerId, {}),
  };

  const availableControl = makeRef('available-control', ownerId, {
    titleSnapshot: 'Available control passage',
    availability: 'available',
    updateState: 'current',
    materialId: 'available-control',
    snapshotVersionId: 'available-control-version',
  });

  if (scenario === 'all') {
    return [
      refs['archived-owned'],
      refs['archived-other'],
      refs.missing,
      refs.inaccessible,
      refs['missing-version'],
      refs['missing-projection'],
      availableControl,
    ].map((ref, index) => ({ ...ref, order: index + 1 }));
  }

  if (scenario === 'archived-owned') {
    return [refs[scenario], availableControl].map((ref, index) => ({ ...ref, order: index + 1 }));
  }

  return [refs[scenario]];
};

const makeNodes = (scenario: BookBrokenScenario, bookId: string, ownerId: string): readonly MaterialBookNode[] => [
  {
    nodeId: materialCatalogIds.nodeId('smoke-section-1'),
    bookId,
    parentNodeId: null,
    type: 'section',
    title: 'Repair Smoke Section',
    order: 1,
    materialRefs: scenarioRefs(scenario, ownerId),
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const createMaterialCandidates = (ownerId: string): readonly BookMaterialSummary[] => [
  {
    materialId: 'replacement-a',
    title: 'Replacement Active Passage A',
    materialKind: 'reading-passage',
    status: 'published',
    publishedSnapshotVersionId: 'replacement-a-version',
    testTypeIds: [materialCatalogIds.testTypeId('ielts')],
    visibility: 'private',
    ownerId,
    hiddenCanonicalPayload: 'canonical-payload-secret',
    hiddenAnswerKey: 'answer-key-secret',
  } as BookMaterialSummary & Record<string, unknown>,
  {
    materialId: 'replacement-b',
    title: 'Replacement Active Passage B',
    materialKind: 'reading-passage',
    status: 'published',
    publishedSnapshotVersionId: 'replacement-b-version',
    testTypeIds: [materialCatalogIds.testTypeId('ielts')],
    visibility: 'private',
    ownerId,
  },
  {
    materialId: 'archived-candidate',
    title: 'Archived Candidate Hidden From Replacement',
    materialKind: 'reading-passage',
    status: 'published',
    publishedSnapshotVersionId: 'archived-candidate-version',
    testTypeIds: [materialCatalogIds.testTypeId('ielts')],
    visibility: 'private',
    ownerId,
    archived: true,
  },
];

export default function BookEditorSmokePage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [opened, setOpened] = useState(true);
  const scenario = normalizeScenario(searchParams.get('fixture') ?? searchParams.get('scenario'));
  const ownerId = user?.uid ?? DEFAULT_OWNER_ID;
  const book = useMemo(() => makeBook(scenario, ownerId), [scenario, ownerId]);
  const nodes = useMemo(() => makeNodes(scenario, book.bookId, ownerId), [scenario, book.bookId, ownerId]);
  const materialCandidates = useMemo(() => createMaterialCandidates(ownerId), [ownerId]);

  return (
    <main>
      <BookEditorModal
        opened={opened}
        bookId={book.bookId}
        initialBook={book}
        initialNodes={nodes}
        materialCandidates={materialCandidates}
        onClose={() => setOpened(false)}
      />
      {!opened && (
        <button type="button" onClick={() => setOpened(true)}>
          Reopen Book smoke modal
        </button>
      )}
    </main>
  );
}
