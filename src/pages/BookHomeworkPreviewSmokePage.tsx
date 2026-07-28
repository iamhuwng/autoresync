import { useMemo, useState } from 'react';
import { HomeworkCreateModal } from '../components/homework/HomeworkCreateModal';
import type { BookRuntimeDeliveryProjection } from '../services/book-delivery/bookDelivery.types';
import type { BookHomeworkPreviewSource } from '../services/book-homework/bookHomeworkPreview.service';
import './BookHomeworkPreviewSmokePage.css';

const fullDelivery: BookRuntimeDeliveryProjection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-teacher-preview-full',
  bindingRevision: 2,
  recipientId: 'student-preview',
  context: { contextId: 'homework-preview', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-preview',
    bookMode: 'pdf',
    bookRevision: 4,
    publicationId: 'publication-preview-4',
    publicationRevision: 2,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['section-1', 'unit-1', 'unit-2'], placementIds: ['placement-1', 'placement-2'] },
  outline: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, titleSnapshot: 'Section 1' },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' },
    { nodeKey: 'unit-2', parentNodeKey: 'section-1', nodeType: 'unit', order: 2, titleSnapshot: 'Unit 2' },
  ],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full-pdf',
      sourceVersionId: 'source-preview-full-v4',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  documentRequests: [{
    sourceKey: 'full-pdf',
    sourceVersionId: 'source-preview-full-v4',
    opaqueRouteKey: 'preview-full-route',
    localPageScope: { kind: 'all', pages: [] },
  }],
  activities: [
    {
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 1,
      activityVersionId: 'activity-1-v1',
      nodeKey: 'unit-1',
      order: 1,
      titleSnapshot: 'Reading Activity',
      contextMode: 'none',
      sourceContext: { available: false, description: 'No source context required.', pageGroupKeys: [], sourcePageScopes: [] },
    },
    {
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersion: 2,
      activityVersionId: 'activity-2-v2',
      nodeKey: 'unit-2',
      order: 2,
      titleSnapshot: 'Writing Activity',
      contextMode: 'required',
      sourceContext: {
        available: true,
        description: 'Full PDF page 6.',
        pageGroupKeys: ['page-group-2'],
        sourcePageScopes: [{ sourceKey: 'full-pdf', pages: [6] }],
      },
    },
  ],
  actionFlags: { canAutosave: false, canSubmit: true, canReview: false },
  provenance: {
    publicationId: 'publication-preview-4',
    publicationRevision: 2,
    bindingId: 'binding-teacher-preview-full',
    bindingRevision: 2,
  },
};

const componentDelivery: BookRuntimeDeliveryProjection = {
  ...fullDelivery,
  bindingId: 'binding-teacher-preview-components',
  bindingRevision: 3,
  sourceSet: {
    strategy: 'component_pdfs',
    sources: [
      {
        sourceKey: 'component-unit-1',
        sourceVersionId: 'source-component-unit-1-v2',
        lifecycle: 'verified-usable',
        sourceOrder: 1,
        ownerNodeKey: 'unit-1',
        localPageScope: { kind: 'pages', pages: [1, 2, 3] },
      },
      {
        sourceKey: 'component-unit-2',
        sourceVersionId: 'source-component-unit-2-v2',
        lifecycle: 'verified-usable',
        sourceOrder: 2,
        ownerNodeKey: 'unit-2',
        localPageScope: { kind: 'pages', pages: [1, 2] },
      },
    ],
  },
  documentRequests: [
    {
      sourceKey: 'component-unit-1',
      sourceVersionId: 'source-component-unit-1-v2',
      opaqueRouteKey: 'preview-component-unit-1',
      localPageScope: { kind: 'pages', pages: [1, 2, 3] },
    },
    {
      sourceKey: 'component-unit-2',
      sourceVersionId: 'source-component-unit-2-v2',
      opaqueRouteKey: 'preview-component-unit-2',
      localPageScope: { kind: 'pages', pages: [1, 2] },
    },
  ],
  activities: [
    {
      ...fullDelivery.activities[0]!,
      sourceContext: { available: false, description: 'No source context required.', pageGroupKeys: [], sourcePageScopes: [] },
    },
    {
      ...fullDelivery.activities[1]!,
      sourceContext: {
        available: true,
        description: 'Component Unit 2 page 1.',
        pageGroupKeys: ['page-group-2'],
        sourcePageScopes: [{ sourceKey: 'component-unit-2', pages: [1] }],
      },
    },
  ],
  provenance: {
    ...fullDelivery.provenance,
    bindingId: 'binding-teacher-preview-components',
    bindingRevision: 3,
  },
};

const makeSource = (delivery: BookRuntimeDeliveryProjection): BookHomeworkPreviewSource => ({
  delivery,
  identity: {
    manifestVersionId: 'manifest-preview-v1',
    ownerId: 'teacher-preview',
    createdByCommandId: 'command-preview-v1',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: delivery.bindingRevision,
  },
  bookTitle: 'Teacher Preview Book',
  priorResultAccess: true,
  soloAccess: true,
});

export default function BookHomeworkPreviewSmokePage() {
  const [strategy, setStrategy] = useState<'full_pdf' | 'component_pdfs'>('full_pdf');
  const [isOpen, setIsOpen] = useState(false);
  const [lastHandoff, setLastHandoff] = useState<string | null>(null);
  const [forkNotice, setForkNotice] = useState(false);
  const source = useMemo(
    () => makeSource(strategy === 'full_pdf' ? fullDelivery : componentDelivery),
    [strategy],
  );

  return (
    <main className="book-homework-preview-smoke">
      <header>
        <p className="book-homework-preview-smoke__eyebrow">Teacher acceptance fixture</p>
        <h1>Book Homework preview</h1>
        <p>Read-only fixture for the frozen Delivery, source breadth, Activity policy, warning, and no-write gates.</p>
      </header>

      <section className="book-homework-preview-smoke__controls" aria-label="Preview fixture controls">
        <label htmlFor="book-homework-preview-strategy">
          Delivery strategy
          <select
            id="book-homework-preview-strategy"
            value={strategy}
            onChange={(event) => {
              setStrategy(event.target.value as typeof strategy);
              setLastHandoff(null);
              setForkNotice(false);
            }}
          >
            <option value="full_pdf">Full PDF</option>
            <option value="component_pdfs">Component PDFs</option>
          </select>
        </label>
        <button type="button" onClick={() => setIsOpen(true)}>Open Book Homework preview</button>
      </section>

      <p className="book-homework-preview-smoke__read-only" role="status">
        No Firebase, Homework, Delivery, publication, or assignment write is enabled on this fixture route.
      </p>
      {forkNotice && <p role="status">Fork-before-assign callback observed; no write performed.</p>}
      {lastHandoff && <p role="status">{lastHandoff}</p>}

      {isOpen && (
        <HomeworkCreateModal
          isOpen
          onClose={() => setIsOpen(false)}
          onSuccess={() => setIsOpen(false)}
          preselectedBookHomework={source}
          onBookHomeworkConfirm={(draft) => {
            setLastHandoff(`Read-only handoff prepared for ${draft.manifest.completion.requiredBindingCount} Activity record(s).`);
          }}
          onBookHomeworkForkBeforeAssign={() => setForkNotice(true)}
        />
      )}
    </main>
  );
}
