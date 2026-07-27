import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BookMode2EditorShell from '../components/books/BookMode2EditorShell';
import type { UnitAssemblyRepository } from '../services/book-assembly/unitAssembly.repository';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../services/book-assembly/unitAssembly.types';
import type { BookAssemblyManifestCandidate, TrustedBookSourceVersionProjection } from '../types/bookAssembly.types';
import { materialCatalogIds, type MaterialBookMetadata } from '../types/materialCatalog.types';
import { useAuth } from '../hooks/useAuth';

const NOW = '2026-07-27T00:00:00.000Z';
const BOOK_ID = 'prd0062-ticket56-book';
const OWNER_ID = 'teacher-1';

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { bookId: BOOK_ID, physicalPageCount: 48, sourceVersionId: 'source-full-ready', verifiedUsable: true },
  { bookId: BOOK_ID, physicalPageCount: 16, sourceVersionId: 'source-component-a', verifiedUsable: true },
  { bookId: BOOK_ID, physicalPageCount: 18, sourceVersionId: 'source-component-b', verifiedUsable: true },
  { bookId: BOOK_ID, physicalPageCount: 9, sourceVersionId: 'source-not-ready', verifiedUsable: false },
];

const smokeBook: MaterialBookMetadata = {
  bookId: materialCatalogIds.bookId(BOOK_ID),
  bookMode: 'pdf',
  ownerId: OWNER_ID,
  title: 'PRD0062 Ticket 56 Assembly Fixture',
  authors: ['Fixture Teacher'],
  testTypeIds: [],
  tags: ['prd0062', 'ticket56'],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: OWNER_ID,
  updatedBy: OWNER_ID,
};

const initialManifest: BookAssemblyManifestCandidate = {
  bookId: BOOK_ID,
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-full-ready', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'section-fixture', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-fixture', parentNodeKey: 'section-fixture', nodeType: 'unit', order: 1 },
  ],
  units: [],
};

const componentMappingManifest: BookAssemblyManifestCandidate = {
  bookId: BOOK_ID,
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'source-source-component-a', sourceVersionId: 'source-component-a', sourceOrder: 1, ownerNodeKey: 'section-component-a' },
      { sourceKey: 'source-source-component-b', sourceVersionId: 'source-component-b', sourceOrder: 2, ownerNodeKey: 'section-component-b' },
    ],
  },
  nodes: [
    { nodeKey: 'section-component-a', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-component-a', parentNodeKey: 'section-component-a', nodeType: 'unit', order: 1 },
    { nodeKey: 'section-component-b', parentNodeKey: null, nodeType: 'section', order: 2 },
    { nodeKey: 'unit-component-b', parentNodeKey: 'section-component-b', nodeType: 'unit', order: 1 },
  ],
  units: [],
};

const createCandidate = (
  manifest: BookAssemblyManifestCandidate,
  revision: number,
): BookAssemblyCandidateRecord => ({
  bookId: BOOK_ID,
  bookRevision: 7,
  candidateId: 'candidate-ticket56',
  lifecycle: 'draft',
  manifest,
  ownerId: OWNER_ID,
  revision,
  sourceSetRevision: 4,
  unitKey: manifest.nodes.find((node) => node.nodeType === 'unit')?.nodeKey ?? 'unit-fixture',
  updatedAt: NOW,
  validation: { valid: true, errors: [] },
});

const encodeCandidate = (candidate: BookAssemblyCandidateRecord): string =>
  encodeURIComponent(JSON.stringify(candidate));

const decodeCandidate = (value: string | null): BookAssemblyCandidateRecord | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as BookAssemblyCandidateRecord;
    return parsed?.bookId === BOOK_ID && parsed.manifest ? parsed : null;
  } catch {
    return null;
  }
};

export default function BookAssemblyWorkspaceSmokePage() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fixture = searchParams.get('fixture') ?? 'ticket56';
  const defaultCandidate = fixture === 'ticket57-component'
    ? createCandidate(componentMappingManifest, 1)
    : fixture === 'ticket57-full'
      ? createCandidate(initialManifest, 1)
      : null;
  const [candidate, setCandidate] = useState<BookAssemblyCandidateRecord | null>(() =>
    decodeCandidate(searchParams.get('candidate')) ?? defaultCandidate);
  const forceConflictRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  const persistCandidate = useCallback((next: BookAssemblyCandidateRecord) => {
    setCandidate(next);
    setSearchParams({ fixture, candidate: encodeCandidate(next) }, { replace: true });
  }, [fixture, setSearchParams]);

  const repository = useMemo<UnitAssemblyRepository>(() => {
    const mutationResult = (
      status: BookAssemblyMutationResult['status'],
      nextCandidate?: BookAssemblyCandidateRecord,
    ): BookAssemblyMutationResult => ({
      status,
      candidate: nextCandidate,
      receipt: {
        createdAt: NOW,
        fingerprint: 'ticket56-fixture-fingerprint',
        operationId: 'ticket56-fixture-operation',
        status,
        ...(nextCandidate && {
          candidateId: nextCandidate.candidateId,
          candidateRevision: nextCandidate.revision,
        }),
      },
      currentRevision: candidate?.revision,
    });

    return {
      create: async (input) => {
        const next = createCandidate(input.manifest, 1);
        persistCandidate(next);
        return mutationResult('created', next);
      },
      replace: async (input) => {
        if (forceConflictRef.current) {
          const remote = createCandidate(candidate?.manifest ?? initialManifest, (candidate?.revision ?? 1) + 1);
          persistCandidate(remote);
          forceConflictRef.current = false;
          return mutationResult('conflict');
        }
        const next = createCandidate(input.manifest, (candidate?.revision ?? input.expectedCandidateRevision) + 1);
        persistCandidate(next);
        return mutationResult('replaced', next);
      },
      validate: async () => mutationResult('validated', candidate ?? createCandidate(initialManifest, 1)),
      discard: async () => mutationResult('discarded', candidate ?? createCandidate(initialManifest, 1)),
      load: async () => ({
        conflict: null,
        candidate: candidate ?? createCandidate(initialManifest, 1),
        status: 'loaded',
      }),
    };
  }, [candidate, persistCandidate]);

  const signedInLabel = user
    ? `${profile?.role ?? 'user'} ${user.email ?? user.uid}`
    : 'not signed in';

  return (
    <main style={{ display: 'grid', gap: 16, maxWidth: '100%', overflowX: 'clip', padding: 'clamp(12px, 4vw, 24px)' }}>
      <header>
        <p style={{ margin: 0, color: '#5d687b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Ticket 56 fixture
        </p>
        <h1 style={{ margin: '4px 0 0' }}>Assembly workspace browser proof</h1>
        <p style={{ margin: '8px 0 0' }}>Signed in: {signedInLabel}</p>
        <p style={{ margin: '8px 0 0' }} data-testid="ticket56-dirty-state">
          Draft dirty: {dirty ? 'yes' : 'no'}
        </p>
        <button type="button" onClick={() => {
          forceConflictRef.current = true;
        }}>
          Simulate remote conflict
        </button>
      </header>
      <BookMode2EditorShell
        access="owner"
        assemblyBookRevision={7}
        assemblyInitialCandidate={candidate}
        assemblyRepository={repository}
        assemblySourceSetRevision={4}
        assemblySourceVersions={sourceVersions}
        book={smokeBook}
        onDirtyChange={setDirty}
        presentation="page-compat"
        uploadPresentationEnabled={false}
        uploadWorkflow={null}
      />
    </main>
  );
}
