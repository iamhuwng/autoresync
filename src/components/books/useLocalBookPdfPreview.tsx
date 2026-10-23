import { useEffect, useMemo, useRef, useState } from 'react';
import { BookPdfViewer } from '../book-runtime/BookPdfViewer';
import { BookRuntimeShell } from '../book-runtime/BookRuntimeShell';
import { bookActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import { projectStudentActivity } from '../../services/book-activity/activityProjection.service';
import { normalizeActivity } from '../../services/book-activity/activityCanonical.service';
import { loadLocalBookAuthoringPdf, type LocalBookAuthoringDraft } from '../../services/materialCatalog/localBookAuthoring.service';
import { validateLocalBookAuthoring } from '../../services/materialCatalog/localBookAuthoringValidation.service';
import { createLocalBookPdfTransport, createLocalComponentPdfTransport, inspectLocalPdfPageCount } from '../../services/materialCatalog/localBookPdfTransport';
import type { BookRuntimeCandidatePreviewProjection } from '../../services/book-delivery/bookDelivery.types';

export function useLocalBookPdfPreview(current: LocalBookAuthoringDraft, activeUnitKey: string | null, unitLabel: (key: string) => string, trackAction: (action: string, metadata?: Record<string, unknown>) => void) {
  const previewContentKey = JSON.stringify([current.ownerId, current.draftId, current.strategy, current.pdfs, current.structureJson, current.unitsJson, current.pageMappingJson]);
  const [pdfPageCounts, setPdfPageCounts] = useState<Readonly<Record<string, number>>>({});
  const [inspectedContentKey, setInspectedContentKey] = useState<string | null>(null);
  const inspectingPdfs = current.pdfs.length > 0 && inspectedContentKey !== previewContentKey;
  const [missingPdfSources, setMissingPdfSources] = useState<readonly string[]>([]);
  const [previewTransport, setPreviewTransport] = useState<ReturnType<typeof createLocalBookPdfTransport> | null>(null);
  const [previewByteLength, setPreviewByteLength] = useState(0);
  const [runtimeResponses, setRuntimeResponses] = useState<Readonly<Record<string, unknown>>>({});
  const [previewActivityKey, setPreviewActivityKey] = useState<string | null>(null);
  const [previewPageReady, setPreviewPageReady] = useState(false);
  const readyPreviewPage = useRef<number | null>(null);
  const previewContent = useRef({ key: previewContentKey, revision: current.revision });
  // Review bookkeeping must not remount the preview while a teacher is answering.
  if (previewContent.current.key !== previewContentKey) previewContent.current = { key: previewContentKey, revision: current.revision };
  const previewContentRevision = previewContent.current.revision;
  useEffect(() => { readyPreviewPage.current = null; setPreviewPageReady(false); }, [previewContentRevision, activeUnitKey, current.step]);
  useEffect(() => { setRuntimeResponses({}); }, [previewContentKey, activeUnitKey]);
  const localValidation = validateLocalBookAuthoring({
    strategy: current.strategy,
    pdfs: current.pdfs,
    structureJson: current.structureJson,
    unitsJson: current.unitsJson,
    pageMappingJson: current.pageMappingJson,
    pdfPageCounts,
  });
  useEffect(() => {
    let cancelled = false;
    const descriptors = current.pdfs;
    if (descriptors.length === 0) {
      setMissingPdfSources([]);
      setPreviewTransport(null);
      return undefined;
    }
    void Promise.all(descriptors.map(async (descriptor) => ({
      descriptor,
      file: await loadLocalBookAuthoringPdf(current.ownerId, current.draftId, descriptor),
    })))
      .then(async (files) => {
        if (cancelled) return;
        const missing = files.filter(({ file }) => !file).map(({ descriptor }) => descriptor.sourceKey);
        setMissingPdfSources(missing);
        if (missing.length > 0) {
          setPdfPageCounts({});
          setInspectedContentKey(previewContentKey);
          setPreviewTransport(null);
          return;
        }
        const validFiles = files.flatMap(({ descriptor, file }) => file ? [{ descriptor, file }] : []);
        const pageCounts = Object.fromEntries(await Promise.all(validFiles.map(async ({ descriptor, file }) => [descriptor.sourceKey, await inspectLocalPdfPageCount(file)] as const)));
        if (cancelled) return;
        setPdfPageCounts(pageCounts);
        setInspectedContentKey(previewContentKey);
        if (current.step !== 4 || !activeUnitKey) return;
        const localValidation = validateLocalBookAuthoring({
          strategy: current.strategy,
          pdfs: current.pdfs,
          structureJson: current.structureJson,
          unitsJson: current.unitsJson,
          pageMappingJson: current.pageMappingJson,
          pdfPageCounts: pageCounts,
        });
        if (!localValidation.valid || !localValidation.manifest) return;
        const selectedUnit = localValidation.manifest.units.find((unit) => unit.unitKey === activeUnitKey);
        if (!selectedUnit) return;
        const transport = current.strategy === 'component'
          ? await createLocalComponentPdfTransport(
            Object.fromEntries(validFiles.map(({ descriptor, file }) => [descriptor.sourceKey, file])),
            selectedUnit.pageGroups.map((group) => ({ sourceKey: group.sourceKey, pages: group.pages })),
          )
          : createLocalBookPdfTransport(validFiles[0]!.file);
        const { contentLength } = await transport.head();
        if (cancelled) {
          transport.destroy();
          return;
        }
        setPreviewByteLength(contentLength);
        setPreviewTransport(transport);
      })
      .catch(() => {
        if (cancelled) return;
        setPdfPageCounts({});
        setInspectedContentKey(previewContentKey);
        setPreviewTransport(null);
      });
    return () => {
      cancelled = true;
      setPreviewTransport((transport) => {
        transport?.destroy();
        return null;
      });
    };
  }, [activeUnitKey, current.ownerId, current.step, previewContentKey]);

  const localRuntimeProjection = useMemo<BookRuntimeCandidatePreviewProjection | null>(() => {
    const manifest = localValidation.manifest;
    const unit = manifest?.units.find((candidate) => candidate.unitKey === activeUnitKey);
    if (!manifest || !unit || unit.activitySlots.length === 0 || !localValidation.activitiesByKey || !previewTransport) return null;
    const componentPageNumbers = new Map<string, number>();
    if (current.strategy === 'component') {
      let combinedPage = 1;
      for (const sourceKey of [...new Set(unit.pageGroups.map((group) => group.sourceKey))]) {
        for (const page of [...new Set(unit.pageGroups.filter((group) => group.sourceKey === sourceKey).flatMap((group) => group.pages))]) {
          componentPageNumbers.set(`${sourceKey}:${page}`, combinedPage);
          combinedPage += 1;
        }
      }
    }
    const activities = unit.activitySlots.map((slot) => ({
      placementId: `local:${unit.unitKey}:${slot.activityKey}`,
      activityId: slot.activityKey,
      nodeKey: unit.unitKey,
      order: slot.order,
      contextMode: slot.contextRequirement,
      sourceContext: { available: slot.pageGroupKeys.length > 0, description: 'Selected local PDF.', pageGroupKeys: slot.pageGroupKeys, sourcePageScopes: [] },
    }));
    return {
      schemaVersion: 1, projectionKind: 'book-runtime-candidate-preview', candidateId: current.draftId,
      candidateRevision: previewContentRevision, sourceSetRevision: previewContentRevision, unitKey: unit.unitKey,
      book: { bookId: 'local-book', bookMode: 'pdf', bookRevision: previewContentRevision },
      context: { contextId: current.draftId, kind: 'preview', entitlementBasis: 'candidate-preview' }, outline: [],
      sourceSet: current.strategy === 'component'
        ? { strategy: 'component_pdfs' as const, sources: manifest.sourceSet.sources.map((source) => ({ sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId, sourceOrder: source.sourceOrder, lifecycle: 'verified-usable' as const, ownerNodeKey: source.ownerNodeKey, localPageScope: { kind: 'all' as const, pages: [] } })) }
        : { strategy: 'full_pdf' as const, sources: [{ sourceKey: 'full', sourceVersionId: 'local-full', lifecycle: 'verified-usable' as const, localPageScope: { kind: 'all' as const, pages: [] } }] },
      documentRequests: current.strategy === 'component'
        ? [{ opaqueRouteKey: 'local-component-student-document', expectedByteLength: previewByteLength }]
        : [{ sourceKey: current.pdfs[0]?.sourceKey ?? 'full', sourceVersionId: `local-${current.pdfs[0]?.sourceKey ?? 'full'}`, opaqueRouteKey: 'local', localPageScope: { kind: 'all' as const, sourceKey: current.pdfs[0]?.sourceKey ?? 'full', pages: [] } }],
      pageGroups: unit.pageGroups.map((group) => ({ pageGroupKey: group.pageGroupKey, combinedPhysicalPages: current.strategy === 'component' ? group.pages.map((page) => componentPageNumbers.get(`${group.sourceKey}:${page}`) ?? page) : group.pages })), activities,
      actionFlags: { canAutosave: false, canSubmit: false, canReview: false },
    };
  }, [activeUnitKey, current.draftId, current.pdfs, previewContentRevision, current.strategy, localValidation.activitiesByKey, localValidation.manifest, previewTransport, previewByteLength]);

  const mappedBookPageRefs = (activityId: string): string[] => {
    const unit = localValidation.manifest?.units.find((candidate) => candidate.unitKey === activeUnitKey);
    const slot = unit?.activitySlots.find((candidate) => candidate.activityKey === activityId);
    return slot?.pageGroupKeys.flatMap((pageGroupKey) => {
      const group = unit?.pageGroups.find((candidate) => candidate.pageGroupKey === pageGroupKey);
      return group?.pages.map((page) => `source:${group.sourceKey}:page:${page}`) ?? [];
    }) ?? [];
  };

  const preview = <>{localRuntimeProjection && localValidation.activitiesByKey && <BookRuntimeShell
            deliveryProjection={localRuntimeProjection}
            activities={localRuntimeProjection.activities.map((placement, index) => ({ activityId: placement.activityId, label: localValidation.activitiesByKey![`${activeUnitKey}:${placement.activityId}`]?.title || `Activity ${index + 1}`, projection: projectStudentActivity(normalizeActivity(localValidation.activitiesByKey![`${activeUnitKey}:${placement.activityId}`], { createId: (() => { let nextId = 0; return () => `local-${activeUnitKey}-${placement.activityId}-${nextId += 1}`; })() }, undefined, { mappedBookPageRefs: mappedBookPageRefs(placement.activityId) })) }))}
            registry={bookActivityRendererRegistry} display={{ bookTitle: current.metadata.title, unitTitle: activeUnitKey ? unitLabel(activeUnitKey) : undefined, contextLabel: 'Teacher preview' }} responses={runtimeResponses} responseMode="editable"
            onResponseChange={(interactionId, response) => setRuntimeResponses((previous) => ({ ...previous, [interactionId]: response }))}
            onNavigationStateChange={(state) => { setPreviewActivityKey(state.activityId); if (readyPreviewPage.current !== state.combinedPhysicalPage) setPreviewPageReady(false); }}
            onAction={(action, metadata) => trackAction(action === 'bookRuntimeResponseChanged' ? 'teacher_materials_book_assembly_candidate_preview_response_changed' : 'teacher_materials_book_pdf_preview_action', { draftId: current.draftId, action, ...metadata })}
            viewer={{ title: `${current.metadata.title} local PDF`, reportsPageReady: true, render: (input) => <BookPdfViewer documentTitle={`${current.metadata.title} local preview`} transport={previewTransport!} initialPage={input.combinedPhysicalPage} allowedPages={input.allowedPages} onPageChange={input.onPageChange} onPageReady={(page) => { readyPreviewPage.current = page; setPreviewPageReady(true); input.onPageReady?.(page); }} /> }}
          />}</>;
  return { pdfPageCounts, setPdfPageCounts, inspectingPdfs, missingPdfSources, previewTransport, previewPageReady, previewActivityKey, setPreviewActivityKey, localValidation, preview };
}
