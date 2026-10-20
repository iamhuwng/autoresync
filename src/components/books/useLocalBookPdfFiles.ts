import { useState } from 'react';
import { toast } from '../modern/ToastNotification';
import { loadLocalBookAuthoringDraft, removeLocalBookAuthoringPdf, replaceLocalBookAuthoringPdf, saveLocalBookAuthoringDraft, saveLocalBookAuthoringPdf, type LocalBookAuthoringDraft, type LocalBookAuthoringStrategy } from '../../services/materialCatalog/localBookAuthoring.service';
import { COMPONENT_PDF_COMPOSITION_LIMITS } from '../../services/book-source-delivery/componentPdfComposition.types';
import { writeJson } from './LocalBookAuthoringModel';

interface Props {
  current: LocalBookAuthoringDraft;
  onDraft: (draft: LocalBookAuthoringDraft) => void;
  update: (patch: Partial<LocalBookAuthoringDraft>) => Promise<LocalBookAuthoringDraft>;
  onReset: () => void;
  trackAction: (action: string, metadata?: Record<string, unknown>) => void;
}

export function useLocalBookPdfFiles({ current, onDraft, update, onReset, trackAction }: Props) {
  const [fileBusy, setFileBusy] = useState(false);
  const chooseStrategy = async (strategy: LocalBookAuthoringStrategy) => {
    const base = current;
    if (base.strategy === strategy) return;
    const incompatible = base.pdfs.filter((pdf) => strategy === 'full' || pdf.sourceKey === 'full');
    try {
      for (const descriptor of incompatible) await removeLocalBookAuthoringPdf(base.ownerId, base.draftId, descriptor);
      if (incompatible.length > 0) {
        const latest = await loadLocalBookAuthoringDraft(base.ownerId, base.draftId) ?? base;
        onDraft(latest);
      }
    } catch {
      toast.error('Could not switch PDF setup. Try again.');
      return;
    }
    onReset();
    try { await update({
      strategy,
      step: 1,
      structureJson: '{\n  "nodes": [],\n  "units": []\n}',
      unitsJson: '{}',
      structureImportText: '',
      unitImportTexts: {},
      pageMappingJson: writeJson({ units: [] }),
      validationState: 'pending',
      previewRevision: undefined,
    }); } catch { return; }
    trackAction('teacher_materials_book_pdf_local_strategy_selected', { draftId: current.draftId, strategy });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !current.strategy) return;
    const fileCount = files.length;
    if (current.strategy === 'full' && files.length !== 1) {
      toast.warning('One complete PDF setup accepts exactly one PDF.');
      return;
    }
    const compatible = current.strategy === 'component'
      ? current.pdfs.filter((pdf) => pdf.sourceKey !== 'full')
      : [];
    const totalBytes = [...compatible, ...Array.from(files)].reduce((sum, item) => sum + ('size' in item ? item.size : 0), 0);
    if (current.strategy === 'component' && compatible.length + files.length > COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents) {
      toast.warning(`Choose no more than ${COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents} component PDFs.`);
      return;
    }
    if (current.strategy === 'component' && totalBytes > COMPONENT_PDF_COMPOSITION_LIMITS.maxAggregateBytes) {
      toast.warning('Choose component PDFs whose combined size is no larger than 50 MiB.');
      return;
    }
    setFileBusy(true);
    try {
      const incompatible = current.strategy === 'component'
        ? current.pdfs.filter((pdf) => pdf.sourceKey === 'full')
        : current.pdfs;
      const descriptors: LocalBookAuthoringDraft['pdfs'][number][] = [];
      const pending = compatible.filter((descriptor) => descriptor.storageState === 'needs-reselection');
      for (const file of Array.from(files)) {
        const replacement = pending.shift();
        if (replacement) {
          await replaceLocalBookAuthoringPdf(current.ownerId, current.draftId, replacement, file);
          const refreshed = await loadLocalBookAuthoringDraft(current.ownerId, current.draftId);
          if (refreshed) {
            onDraft(refreshed);
          }
          continue;
        }
        const sourceKey = current.strategy === 'full'
          ? 'full'
          : `component-${Math.max(0, ...compatible.map((pdf) => Number(pdf.sourceKey.replace('component-', '')) || 0), ...descriptors.map((pdf) => Number(pdf.sourceKey.replace('component-', '')) || 0)) + 1}`;
        descriptors.push(await saveLocalBookAuthoringPdf(current.ownerId, current.draftId, file, sourceKey));
      }
      for (const descriptor of incompatible) await removeLocalBookAuthoringPdf(current.ownerId, current.draftId, descriptor);
      const latest = await loadLocalBookAuthoringDraft(current.ownerId, current.draftId) ?? current;
      const next = descriptors.length > 0
        ? await saveLocalBookAuthoringDraft(latest, { validationState: 'pending', previewRevision: undefined })
        : latest;
      onDraft(next);
      toast.success(`${fileCount} PDF${fileCount === 1 ? '' : 's'} saved on this device.`);
      trackAction('teacher_materials_book_pdf_local_files_selected', { draftId: current.draftId, count: fileCount });
    } catch {
      // update() has already announced storage failures; this covers file/blob failures.
      toast.error('Could not save the PDF locally. Please reselect the file or free browser storage.');
    } finally {
      setFileBusy(false);
    }
  };

  const removePdf = async (descriptor: LocalBookAuthoringDraft['pdfs'][number]) => {
    try {
      await removeLocalBookAuthoringPdf(current.ownerId, current.draftId, descriptor);
      const latest = await loadLocalBookAuthoringDraft(current.ownerId, current.draftId);
      if (!latest) return;
      onDraft(latest);
      toast.success(`${descriptor.name} removed from this local Book.`);
      trackAction('teacher_materials_book_assembly_source_removed', { draftId: current.draftId, sourceKey: descriptor.sourceKey });
    } catch {
      toast.error('Could not remove this PDF from the local Book. Try again.');
    }
  };

  return { fileBusy, chooseStrategy, addFiles, removePdf };
}
