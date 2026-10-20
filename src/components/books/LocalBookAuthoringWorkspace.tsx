import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../modern/ToastNotification';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useClipboard } from '../../core/platform';
import {
  discardLocalBookAuthoringDraft,
  loadLocalBookAuthoringDraft,
  saveLocalBookAuthoringDraft,
  type LocalBookAuthoringDraft,
  type LocalBookAuthoringStep,
} from '../../services/materialCatalog/localBookAuthoring.service';
import { validateLocalBookAuthoring } from '../../services/materialCatalog/localBookAuthoringValidation.service';
import { importLocalBookPlan, importLocalBookUnit, reviseLocalBookConnections } from '../../services/materialCatalog/localBookAuthoringEdits.service';
import { buildUnitActivityImportPrompt } from '../../services/book-assembly/unitPrompt.service';
import type { BookAssemblyManifestCandidate, BookUnitCandidate } from '../../types/bookAssembly.types';
import { COMPONENT_PDF_COMPOSITION_LIMITS } from '../../services/book-source-delivery/componentPdfComposition.types';
import LocalBookConnectionEditor from './LocalBookConnectionEditor';
import { buildLocalBookStructurePrompt, parseObject, readStructure, readMapping, writeJson, validationSummary, type LocalUnit } from './LocalBookAuthoringModel';
import { useLocalBookPdfPreview } from './useLocalBookPdfPreview';
import { useLocalBookPdfFiles } from './useLocalBookPdfFiles';
import './LocalBookAuthoringWorkspace.css';

interface Props {
  readonly draft: LocalBookAuthoringDraft;
  readonly onChange: (draft: LocalBookAuthoringDraft) => void;
  readonly onComplete?: (draft: LocalBookAuthoringDraft) => Promise<void>;
  readonly onClose: () => void;
  readonly onDiscard?: () => void;
  readonly onResolveDiscard?: () => Promise<boolean>;
}

const stepLabels = ['Files', 'Plan', 'Activities', 'Preview', 'Create'] as const;

const LocalBookAuthoringWorkspace = ({ draft, onChange, onComplete, onClose, onDiscard, onResolveDiscard }: Props) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.bookAuthoring);
  const { writeText } = useClipboard();
  const [current, setCurrent] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [selectedUnitKey, setSelectedUnitKey] = useState<string | null>(null);
  const [reviewedUnits, setReviewedUnits] = useState<Readonly<Record<string, boolean>>>(draft.reviewedUnits ?? {});
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [unitImportStatus, setUnitImportStatus] = useState<string | null>(null);
  const [planImportError, setPlanImportError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [unitQuery, setUnitQuery] = useState('');
  const [connectionEditor, setConnectionEditor] = useState<string | null>(null);
  const importFile = useRef<HTMLInputElement>(null);
  const currentRef = useRef(current);

  const structureUnits = useMemo(() => readStructure(current.structureJson)?.units ?? [], [current.structureJson]);
  const authoringUnits = structureUnits;
  const unitLabel = (unitKey: string) => {
    const title = readStructure(current.structureJson)?.nodes.find((node) => node.nodeKey === unitKey)?.title;
    return typeof title === 'string' && title.trim() ? title.trim() : `Unit ${authoringUnits.findIndex((unit) => unit.unitKey === unitKey) + 1}`;
  };
  const activeUnitKey = selectedUnitKey && authoringUnits.some((unit) => unit.unitKey === selectedUnitKey)
    ? selectedUnitKey
    : authoringUnits[0]?.unitKey ?? null;
  const { pdfPageCounts, inspectingPdfs, missingPdfSources, previewTransport, previewPageReady, previewActivityKey, setPreviewActivityKey, localValidation, preview } = useLocalBookPdfPreview(current, activeUnitKey, unitLabel, trackAction);
  const manifestUnits = localValidation.manifest?.units ?? [];
  const structurePrompt = buildLocalBookStructurePrompt(current, pdfPageCounts);
  const structureImportText = current.structureImportText ?? (structureUnits.length || !readStructure(current.structureJson) ? current.structureJson : '');
  const unitImportText = activeUnitKey ? current.unitImportTexts?.[activeUnitKey] ?? '' : '';
  const submissionLocked = saving || (Boolean(current.submission.operationId) && current.submission.state !== 'idle');
  const discardDisabled = saving || importBusy || pendingSaves > 0 || current.submission.state === 'committed'
    || (Boolean(current.submission.operationId) && !onResolveDiscard);
  const unitImportManifest = localValidation.manifest ?? (() => {
    const structure = readStructure(current.structureJson);
    const sourceStrategy = current.strategy === 'component' ? 'component_pdfs' : 'full_pdf';
    const sources = current.pdfs.map((pdf, index) => ({
      sourceKey: pdf.sourceKey,
      sourceVersionId: `local-${pdf.sourceKey}`,
      sourceOrder: index + 1,
      ...(sourceStrategy === 'component_pdfs' ? { ownerNodeKey: activeUnitKey } : {}),
    }));
    return {
      bookId: 'local-book',
      sourceSet: { sourceStrategy, sources },
      nodes: structure?.nodes ?? [],
      units: structure?.units ?? [],
    } as unknown as BookAssemblyManifestCandidate;
  })();
  const unitPrompt = activeUnitKey ? (() => {
    try {
      const manifest = unitImportManifest;
      return buildUnitActivityImportPrompt({
        localAuthoring: true,
        bookTitle: current.metadata.title,
        manifest,
        unitKey: activeUnitKey,
        sourceVersions: manifest.sourceSet.sources.map((source) => ({
          sourceVersionId: source.sourceVersionId,
          physicalPageCount: pdfPageCounts[source.sourceKey] ?? 0,
        })),
      });
    } catch { return ''; }
  })() : '';

  useEffect(() => {
    setCurrent(draft);
    setReviewedUnits(draft.reviewedUnits ?? {});
  }, [draft]);

  useEffect(() => { currentRef.current = current; }, [current]);

  useEffect(() => {
    setSelectedUnitKey((selected) => selected && authoringUnits.some((unit) => unit.unitKey === selected)
      ? selected : authoringUnits[0]?.unitKey ?? null);
  }, [authoringUnits]);

  const update = async (patch: Partial<LocalBookAuthoringDraft>) => {
    const base = currentRef.current;
    const authoringInputChanged = (['strategy', 'structureJson', 'unitsJson', 'pageMappingJson', 'pdfs'] as const)
      .some((key) => key in patch && base[key] !== patch[key]);
    const effectivePatch = authoringInputChanged ? { ...patch, reviewedUnits: {} } : patch;
    if (authoringInputChanged) { setReviewedUnits({}); setHasPermission(false); }
    setPendingSaves((count) => count + 1);
    const optimistic: LocalBookAuthoringDraft = {
      ...base,
      ...effectivePatch,
      revision: base.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    currentRef.current = optimistic;
    setCurrent(optimistic);
    onChange(optimistic);
    try {
      const next = await saveLocalBookAuthoringDraft(base, effectivePatch);
      const settled = next.revision === optimistic.revision
        ? next
        : await loadLocalBookAuthoringDraft(base.ownerId, base.draftId) ?? next;
      if (currentRef.current.revision <= optimistic.revision) {
        currentRef.current = settled;
        setCurrent(settled);
        onChange(settled);
      }
      trackAction('teacher_materials_book_pdf_local_saved', {
        draftId: settled.draftId,
        revision: settled.revision,
        source: 'local_book_authoring',
      });
      setSaveFailed(false);
      return next;
    } catch (error) {
      const rawInputOnly = Object.keys(patch).every((key) => key === 'structureImportText' || key === 'unitImportTexts');
      if (!rawInputOnly && currentRef.current.revision === optimistic.revision) {
        currentRef.current = base;
        setCurrent(base);
        onChange(base);
      }
      toast.error('Could not save this Book on the device. Your last saved version is still available.');
      setSaveFailed(true);
      throw error;
    } finally { setPendingSaves((count) => count - 1); }
  };

  const { fileBusy, chooseStrategy, addFiles, removePdf } = useLocalBookPdfFiles({
    current, update, trackAction,
    onDraft: (next) => { currentRef.current = next; setCurrent(next); setReviewedUnits(next.reviewedUnits ?? {}); onChange(next); },
    onReset: () => { setReviewedUnits({}); setManualPrompt(null); },
  });

  const recordPromptCopy = (prompt: string, label: 'Book structure' | 'Unit Activity', copied: boolean) => {
    if (copied) {
      setManualPrompt(null);
      toast.success(`${label} prompt copied.`);
      trackAction(label === 'Book structure'
        ? 'teacher_materials_book_assembly_structure_prompt_copied'
        : 'teacher_materials_book_assembly_unit_prompt_copied', { draftId: current.draftId });
      return;
    }
    setManualPrompt(prompt);
    toast.warning('Clipboard was blocked. Copy the visible prompt manually.');
    trackAction(label === 'Book structure'
      ? 'teacher_materials_book_assembly_structure_prompt_manual_copy_shown'
      : 'teacher_materials_book_assembly_unit_prompt_manual_copy_shown', { draftId: current.draftId });
  };

  const copyPrompt = async (prompt: string, label: 'Book structure' | 'Unit Activity') => {
    recordPromptCopy(prompt, label, await writeText(prompt));
  };

  const validationInput = () => ({
    strategy: currentRef.current.strategy, pdfs: currentRef.current.pdfs,
    structureJson: currentRef.current.structureJson, unitsJson: currentRef.current.unitsJson,
    pageMappingJson: currentRef.current.pageMappingJson, pdfPageCounts,
  });
  const saveImportText = (kind: 'plan' | 'unit', text: string) => {
    setPendingPlan(null);
    if (kind === 'plan') setPlanImportError(null); else setUnitImportStatus(null);
    const patch = kind === 'plan' ? { structureImportText: text }
      : { unitImportTexts: { ...currentRef.current.unitImportTexts, [activeUnitKey!]: text } };
    void update(patch).catch(() => undefined);
  };
  const unitHasContent = (unit: { unitKey: string; activitySlots: readonly { activityKey: string }[] }, text = current.unitsJson) => {
    const value = parseObject<{ units?: { unitKey: string; slots?: { activityKey: string; content?: unknown }[] }[] }>(text, {});
    const slots = (Array.isArray(value?.units) ? value.units : []).find((entry) => entry?.unitKey === unit.unitKey)?.slots;
    return unit.activitySlots.length > 0 && Array.isArray(slots) && unit.activitySlots.every((slot) => slots.some((entry) => entry?.activityKey === slot.activityKey && entry.content));
  };
  const importPlan = async (confirmed = false) => {
    let structureJson: string;
    try { structureJson = importLocalBookPlan(validationInput(), pendingPlan ?? structureImportText); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'The returned Book plan is invalid.';
      setPlanImportError(message); toast.error(message);
      trackAction('teacher_materials_book_pdf_plan_import_failed', { draftId: current.draftId });
      return;
    }
    const changed = JSON.stringify(readStructure(structureJson)) !== JSON.stringify(readStructure(current.structureJson));
    if (changed && (structureUnits.length > 0 || (current.unitsJson.trim() && current.unitsJson.trim() !== '{}')) && !confirmed) { setPendingPlan(structureJson); return; }
    setImportBusy(true);
    try {
      await update({
        ...(changed ? { structureJson, unitsJson: '{}', pageMappingJson: writeJson({ units: [] }), unitImportTexts: {}, validationState: 'pending' as const, previewRevision: undefined } : {}),
        structureImportText: structureJson, step: 3,
      });
      setPendingPlan(null); setPlanImportError(null);
      toast.success('Book plan imported.');
      trackAction('teacher_materials_book_pdf_plan_imported', { draftId: current.draftId });
    } catch { setPlanImportError('The plan is valid, but could not be saved on this device. Try importing again.'); }
    finally { setImportBusy(false); }
  };
  const importUnitContent = async () => {
    if (!activeUnitKey || !unitImportText.trim()) return;
    let unitsJson: string;
    try { unitsJson = importLocalBookUnit(current.unitsJson, unitImportText, unitImportManifest, activeUnitKey); }
    catch (error) {
      const message = error instanceof Error && error.message === 'Import bundle is malformed JSON.'
        ? 'The JSON is incomplete or malformed. Copy the entire response again, or import the complete JSON file.'
        : error instanceof Error ? error.message : 'The returned Unit content is invalid.';
      setUnitImportStatus(message); toast.error(message);
      trackAction('teacher_materials_book_assembly_unit_import_failed', { draftId: current.draftId, unitKey: activeUnitKey });
      return;
    }
    setImportBusy(true);
    trackAction('teacher_materials_book_assembly_unit_import_started', { draftId: current.draftId, unitKey: activeUnitKey });
    try {
      const next = authoringUnits.find((unit) => !unitHasContent(unit, unitsJson));
      await update({ unitsJson, validationState: 'pending', previewRevision: undefined, step: next ? 3 : 4 });
      if (next) setSelectedUnitKey(next.unitKey);
      setUnitImportStatus(null);
      toast.success(`${unitLabel(activeUnitKey)} content imported.`);
      trackAction('teacher_materials_book_assembly_unit_import_staged', { draftId: current.draftId, unitKey: activeUnitKey });
    } catch { setUnitImportStatus('The content is valid, but could not be saved on this device. Try importing again.'); }
    finally { setImportBusy(false); }
  };
  const effectiveUnits = authoringUnits.map((unit) => {
    const mapping = readMapping(current.pageMappingJson)?.units.find((entry) => entry.unitKey === unit.unitKey);
    return mapping ? { ...unit, pageGroups: mapping.pageGroups, activitySlots: unit.activitySlots.length ? unit.activitySlots : mapping.activitySlots } : unit;
  });
  const connectionUnit = effectiveUnits.find((unit) => unit.unitKey === activeUnitKey);
  const activityTitles = Object.fromEntries((connectionUnit?.activitySlots ?? []).map((slot, index) => {
    const value = parseObject<{ units?: { unitKey: string; slots?: { activityKey: string; content?: { title?: string } }[] }[] }>(current.unitsJson, {});
    const entries = (Array.isArray(value?.units) ? value.units : []).find((entry) => entry?.unitKey === activeUnitKey)?.slots;
    const title = (Array.isArray(entries) ? entries : []).find((entry) => entry?.activityKey === slot.activityKey)?.content?.title;
    return [slot.activityKey, typeof title === 'string' && title.trim() ? title.trim() : `Activity ${index + 1}`];
  }));
  const openConnections = (unitKey = activeUnitKey, activityKey = previewActivityKey) => {
    const unit = effectiveUnits.find((entry) => entry.unitKey === unitKey);
    if (!unit) return;
    setSelectedUnitKey(unit.unitKey);
    setConnectionEditor(activityKey === 'references' || unit.activitySlots.some((slot) => slot.activityKey === activityKey) ? activityKey! : unit.activitySlots[0]?.activityKey ?? 'references');
    trackAction('teacher_materials_book_pdf_connection_opened', { draftId: current.draftId, unitKey });
  };
  const saveConnections = async (unit: BookUnitCandidate) => {
    const patch = reviseLocalBookConnections(validationInput(), unit);
    await update({ ...patch, validationState: 'pending', previewRevision: undefined });
    toast.success('PDF connections updated.');
    trackAction('teacher_materials_book_assembly_page_group_mapped', { draftId: current.draftId, unitKey: unit.unitKey });
  };

  const move = async (step: LocalBookAuthoringStep) => {
    if (step === 5 && !canCreate) {
      toast.warning('Review the local preview for every Unit before continuing.');
      return;
    }
    try { await update({ step }); } catch { return; }
    trackAction('teacher_materials_book_pdf_workflow_step_changed', {
      draftId: current.draftId,
      nextStep: step,
      source: 'local_book_authoring',
    });
  };

  const validate = () => validateLocalBookAuthoring({
      strategy: current.strategy,
      pdfs: current.pdfs,
      structureJson: current.structureJson,
      unitsJson: current.unitsJson,
      pageMappingJson: current.pageMappingJson,
      pdfPageCounts,
    });

  const canCreate = manifestUnits.length > 0
    && manifestUnits.every((unit) => reviewedUnits[unit.unitKey] === true)
    && localValidation.valid;
  const complete = async () => {
    if (current.submission.cleanupPending) {
      setSaving(true);
      try { await onComplete?.(current); }
      catch { toast.error('Could not finish local cleanup. The Book is already created.'); }
      finally { setSaving(false); }
      return;
    }
    const result = validate();
    if (!result.valid) {
      const message = validationSummary(result.errors);
      toast.error(message);
      void update({ validationState: 'error', validationMessage: message });
      return;
    }
    if (!canCreate || !hasPermission || inspectingPdfs || saveFailed || pendingSaves > 0) {
      toast.warning('Review the local preview for every Unit before creating the Book.');
      return;
    }
    setSaving(true);
    try {
      const saved = await update({ validationState: 'ready', previewRevision: current.revision + 1, step: 5 });
      if (!onComplete) {
        toast.info('Local Book progress saved. Final creation is unavailable in this entry.');
        return;
      }
      await onComplete(saved);
    } catch {
      toast.error('Book creation failed. Your local draft is still available to retry.');
    } finally {
      setSaving(false);
    }
  };

  const review = async () => {
    const result = validate();
    if (!result.valid) {
      const message = validationSummary(result.errors);
      toast.error(message);
      void update({ validationState: 'error', validationMessage: message });
      return;
    }
    if (!previewTransport || !activeUnitKey || !previewPageReady) {
      toast.warning('Open the current local PDF preview before marking this Unit reviewed.');
      return;
    }
    const nextReviewedUnits = { ...reviewedUnits, [activeUnitKey]: true };
    const nextUnit = authoringUnits.find((unit) => !nextReviewedUnits[unit.unitKey]);
    await update({ validationState: 'ready', previewRevision: current.revision + 1, reviewedUnits: nextReviewedUnits, step: nextUnit ? 4 : 5 });
    setReviewedUnits(nextReviewedUnits);
    if (nextUnit) setSelectedUnitKey(nextUnit.unitKey);
    trackAction('teacher_materials_book_pdf_preview_approved', { draftId: current.draftId, unitKey: activeUnitKey });
  };

  const discard = async () => {
    if (discardDisabled) return;
    setSaving(true);
    try {
      if (onResolveDiscard && !(await onResolveDiscard())) return;
      await discardLocalBookAuthoringDraft(current.ownerId, current.draftId);
      trackAction('teacher_materials_book_assembly_local_discarded', {
        draftId: current.draftId,
        source: 'local_book_authoring',
      });
      toast.success('Local Book draft and selected PDFs were discarded.');
      onDiscard?.();
      onClose();
    } catch {
      toast.error('Could not discard the local Book draft. Try again.');
    } finally { setSaving(false); }
  };

  const firstIssue = inspectingPdfs || missingPdfSources.length > 0 ? undefined : localValidation.errors[0];
  const fixIssue = () => {
    const error = firstIssue;
    if (!error) return;
    trackAction('teacher_materials_book_pdf_issue_opened', { draftId: current.draftId, field: error.field });
    if (error.field === 'files' || error.field === 'strategy') { void move(1); return; }
    const index = error.path.match(/units\[(\d+)\]/)?.[1];
    const source = parseObject<{ units?: LocalUnit[] }>(error.field === 'activities' ? current.unitsJson : error.field === 'mapping' ? current.pageMappingJson : current.structureJson, {});
    const key = index !== undefined && Array.isArray(source?.units) ? source.units[Number(index)]?.unitKey
      : authoringUnits.find((entry) => error.path.startsWith(`$.${entry.unitKey}.`))?.unitKey;
    const unit = effectiveUnits.find((entry) => entry.unitKey === key) ?? authoringUnits[0];
    if (error.field === 'activities') { if (unit) setSelectedUnitKey(unit.unitKey); void move(3); return; }
    if (unit && (error.field === 'mapping' || /pageGroups|activitySlots/u.test(error.path))) {
      const groupIndex = error.path.match(/pageGroups\[(\d+)\]/)?.[1];
      const group = groupIndex === undefined ? undefined : source?.units?.[Number(index)]?.pageGroups?.[Number(groupIndex)];
      const slotIndex = Number(error.path.match(/activitySlots\[(\d+)\]/)?.[1] ?? 0);
      openConnections(unit.unitKey, group?.mode === 'reference_only' ? 'references' : group?.activityKeys[0] ?? unit.activitySlots[slotIndex]?.activityKey);
      return;
    }
    void move(2);
  };
  const validationFeedback = firstIssue && <section className="local-book-authoring__issue" aria-label="Draft needs attention">
    <div><p>{firstIssue.field === 'activities' ? 'Activity content needs attention.' : firstIssue.message}</p><button type="button" onClick={fixIssue}>{firstIssue.field === 'activities' ? 'Fix Activity content' : firstIssue.field === 'files' || firstIssue.field === 'strategy' ? 'Go to Files' : 'Fix this issue'}</button></div>
    <details><summary>Validation details</summary><ul>{localValidation.errors.map((error, index) => <li key={`${error.field}:${error.path}:${index}`}>{error.path}: {error.message}</li>)}</ul></details>
  </section>;
  const readImportFile = async (file: File | undefined) => {
    if (!file) return;
    trackAction('teacher_materials_book_pdf_import_file_selected', { draftId: current.draftId, kind: current.step === 2 ? 'plan' : 'unit' });
    try { saveImportText(current.step === 2 ? 'plan' : 'unit', await file.text()); }
    catch { toast.error('Could not read that JSON file. Try selecting it again.'); }
  };
  const importControls = (kind: 'plan' | 'unit') => {
    const text = kind === 'plan' ? structureImportText : unitImportText;
    const prompt = kind === 'plan' ? structurePrompt : unitPrompt;
    const error = kind === 'plan' ? planImportError : unitImportStatus;
    const sourceKeys = kind === 'plan' ? current.pdfs.map((pdf) => pdf.sourceKey) : [...new Set(connectionUnit?.pageGroups.map((group) => group.sourceKey) ?? [])];
    return <>
      <button className="local-book-authoring__copy" type="button" disabled={inspectingPdfs || fileBusy || !prompt || (kind === 'unit' && !activeUnitKey)} onClick={() => void copyPrompt(prompt, kind === 'plan' ? 'Book structure' : 'Unit Activity')}>Copy {kind === 'plan' ? 'planning' : 'Unit'} prompt</button>
      <small className="local-book-authoring__source-hint">PDF{sourceKeys.length === 1 ? '' : 's'}: {current.pdfs.filter((pdf) => sourceKeys.includes(pdf.sourceKey)).map((pdf) => pdf.name).join(' · ') || 'Choose your PDFs first'}</small>
      <label className="local-book-authoring__import-label" htmlFor="book-returned-json">Paste returned JSON</label>
      <textarea id="book-returned-json" aria-invalid={Boolean(error)} aria-describedby={error ? 'book-import-error' : undefined} value={text} onChange={(event) => saveImportText(kind, event.target.value)} spellCheck={false} placeholder="Paste the complete response from your AI tool" />
      {error && <p id="book-import-error" className="local-book-authoring__error" role="alert">{error}</p>}
      <button className="local-book-authoring__link" type="button" onClick={() => { trackAction('teacher_materials_book_pdf_import_file_opened', { draftId: current.draftId, kind }); importFile.current?.click(); }}>Import a JSON file instead</button>
      {manualPrompt && <label>Copy prompt manually<textarea readOnly value={manualPrompt} rows={6} /></label>}
      {pendingPlan && <div className="local-book-authoring__issue"><p>Replace the Book plan? Existing Activity content and PDF corrections will be cleared.</p><div><button type="button" onClick={() => { setPendingPlan(null); trackAction('teacher_materials_book_pdf_plan_replacement_canceled', { draftId: current.draftId }); }}>Keep current plan</button><button type="button" onClick={() => void importPlan(true)}>Replace plan</button></div></div>}
    </>;
  };
  const unitPicker = <div className="local-book-authoring__unit-picker">
    {authoringUnits.length > 12 && <label>Find a Unit<input type="search" value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} /></label>}
    {authoringUnits.length > 1 ? <label>Unit<select aria-label="Unit to author" value={activeUnitKey ?? ''} onChange={(event) => { setSelectedUnitKey(event.target.value); setUnitImportStatus(null); setPreviewActivityKey(null); trackAction('teacher_materials_book_assembly_component_unit_selected', { draftId: current.draftId, unitKey: event.target.value }); }}>
      {authoringUnits.filter((unit) => unit.unitKey === activeUnitKey || unitLabel(unit.unitKey).toLowerCase().includes(unitQuery.toLowerCase())).filter((unit, index) => unit.unitKey === activeUnitKey || index < 49).map((unit) => <option key={unit.unitKey} value={unit.unitKey}>{unitLabel(unit.unitKey)}</option>)}
    </select></label> : activeUnitKey && <p>{unitLabel(activeUnitKey)}</p>}
  </div>;
  const filesReady = Boolean(current.strategy) && (current.strategy === 'full' ? current.pdfs.length === 1 : current.pdfs.length >= 2)
    && !inspectingPdfs && !missingPdfSources.length && current.pdfs.every((pdf) => pdfPageCounts[pdf.sourceKey] > 0);
  const nextLabel = current.step === 1 ? 'Continue' : current.step === 2 ? 'Import plan' : current.step === 3 ? 'Import content'
    : current.step === 4 ? (authoringUnits.some((unit) => unit.unitKey !== activeUnitKey && !reviewedUnits[unit.unitKey]) ? 'Approve Unit & next' : 'Approve Unit & continue')
      : current.submission.cleanupPending ? 'Retry local cleanup' : saving ? 'Creating…' : 'Create Book';
  const nextDisabled = fileBusy || importBusy || pendingSaves > 0 || (current.step === 1 ? !filesReady
    : current.step === 2 ? !structureImportText.trim() || inspectingPdfs || !filesReady
      : current.step === 3 ? !unitImportText.trim() || !unitPrompt || inspectingPdfs
        : current.step === 4 ? !localValidation.valid || !previewTransport || !previewPageReady || inspectingPdfs
          : saving || (!current.submission.cleanupPending && (!canCreate || !hasPermission || inspectingPdfs || saveFailed)));
  const next = () => {
    if (current.step === 1) void move(2);
    else if (current.step === 2) void importPlan();
    else if (current.step === 3) void importUnitContent();
    else if (current.step === 4) void review().catch(() => undefined);
    else void complete();
  };
  return <section className="local-book-authoring" aria-label="Local Book authoring">
    <div className="local-book-authoring__status"><small role="status">{saveFailed ? 'Not saved on this device. Retry your last action.' : pendingSaves > 0 ? 'Saving on this device…' : 'Saved on this device'}</small><details><summary>Draft options</summary><button type="button" disabled={discardDisabled} onClick={() => void discard()}>Discard draft</button></details></div>
    <nav className="local-book-authoring__steps" aria-label="Book authoring steps">{stepLabels.map((label, index) => <button key={label} type="button" disabled={submissionLocked || importBusy} aria-current={current.step === index + 1 ? 'step' : undefined} onClick={() => void move(index + 1 as LocalBookAuthoringStep)}><span>{index + 1}</span>{label}</button>)}</nav>
    <div className="local-book-authoring__content">
      {missingPdfSources.length > 0 && <div className="local-book-authoring__issue" role="alert"><p>A saved PDF is unavailable. Reselect the same file to keep its connections.</p><button type="button" onClick={() => void move(1)}>Go to Files</button></div>}
      <fieldset className="local-book-authoring__fields" disabled={(submissionLocked && current.step !== 5) || saving || importBusy}>
        {current.step === 1 && <div className="local-book-authoring__panel">
          <h3>Choose your PDFs</h3>
          <div className="local-book-authoring__strategy"><button type="button" aria-pressed={current.strategy === 'full'} onClick={() => void chooseStrategy('full')}>One complete PDF</button><button type="button" aria-pressed={current.strategy === 'component'} onClick={() => void chooseStrategy('component')}>Several component PDFs</button></div>
          <label className="local-book-authoring__file-picker"><span>{current.strategy === 'component' ? 'Add PDFs' : 'Choose PDF'}</span><input aria-label={current.strategy === 'component' ? 'Choose component PDF files' : 'Choose complete PDF'} type="file" accept="application/pdf,.pdf" multiple={current.strategy === 'component'} disabled={fileBusy || !current.strategy} onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} /></label>
          {current.strategy === 'component' && <small>2–{COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents} PDFs · up to 50 MiB in total</small>}
          <ul className="local-book-authoring__files">{current.pdfs.map((pdf, index) => <li key={pdf.id}><span>{pdf.name}<small>{pdf.storageState === 'needs-reselection' ? 'Reselect this PDF' : inspectingPdfs ? 'Checking PDF…' : `${pdfPageCounts[pdf.sourceKey] ?? '?'} pages`}</small></span><div>{current.strategy === 'component' && <button type="button" disabled={index === 0} aria-label={`Move ${pdf.name} up`} onClick={() => { const pdfs = [...current.pdfs]; [pdfs[index - 1], pdfs[index]] = [pdfs[index], pdfs[index - 1]]; trackAction('teacher_materials_book_assembly_source_reordered', { draftId: current.draftId, sourceKey: pdf.sourceKey }); void update({ pdfs, validationState: 'pending', previewRevision: undefined }).catch(() => undefined); }}>↑</button>}<button type="button" onClick={() => void removePdf(pdf)}>Remove</button></div></li>)}</ul>
        </div>}
        {current.step === 2 && <div className="local-book-authoring__panel"><h3>Plan your Book</h3>{importControls('plan')}</div>}
        {current.step === 3 && <div className="local-book-authoring__panel"><h3>Add Activity content</h3>{authoringUnits.length > 0 ? <>{unitPicker}{importControls('unit')}</> : <><p>Import a Book plan first.</p><button type="button" onClick={() => void move(2)}>Go to Plan</button></>}</div>}
        {current.step === 4 && <div className="local-book-authoring__preview-panel"><div className="local-book-authoring__preview-heading"><h3>Preview as student</h3>{unitPicker}{connectionUnit && <button type="button" className="local-book-authoring__link" onClick={() => openConnections()}>Change PDF connection</button>}</div>{validationFeedback}
          {inspectingPdfs && <p role="status">Checking saved PDFs…</p>}
          {preview}
        </div>}
        {current.step === 5 && <div className="local-book-authoring__panel"><h3>Create your Book</h3>{inspectingPdfs ? <p role="status">Checking saved PDFs…</p> : <><div className="local-book-authoring__create-summary"><strong>{current.metadata.title}</strong><small>{current.metadata.visibility === 'private' ? 'Private' : 'Public library'} · {manifestUnits.length} Unit{manifestUnits.length === 1 ? '' : 's'} · {manifestUnits.reduce((count, unit) => count + unit.activitySlots.length, 0)} Activities</small></div>{validationFeedback}</>}
          {!current.submission.cleanupPending && <label className="local-book-authoring__permission"><input type="checkbox" checked={hasPermission} disabled={saving} onChange={(event) => { setHasPermission(event.target.checked); trackAction('teacher_materials_book_pdf_permission_confirmed', { draftId: current.draftId, confirmed: event.target.checked }); }} />I have permission to share these PDFs with my students.</label>}
          {current.submission.cleanupPending && <p role="status">This Book is created. Retry removes the local draft without creating another Book.</p>}
          {current.submission.lastError && <p className="local-book-authoring__error" role="alert">{current.submission.lastError}</p>}
        </div>}
      </fieldset>
      <input hidden ref={importFile} type="file" accept="application/json,.json" aria-label="Returned JSON file" onChange={(event) => { void readImportFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </div>
    <footer className="local-book-authoring__footer"><small>{current.step === 5 ? 'PDFs upload when you create the Book.' : ''}</small><div><button type="button" disabled={current.step === 1 || submissionLocked || importBusy} onClick={() => void move(current.step - 1 as LocalBookAuthoringStep)}>Back</button><button type="button" className="local-book-authoring__primary-action" disabled={nextDisabled} onClick={next}>{importBusy ? 'Importing…' : nextLabel}</button></div></footer>
    {connectionEditor && connectionUnit && <LocalBookConnectionEditor unit={connectionUnit} initialActivityKey={connectionEditor} titles={activityTitles} sources={current.pdfs.filter((pdf) => current.strategy === 'full' || !effectiveUnits.some((unit) => unit.unitKey !== connectionUnit.unitKey && unit.pageGroups.some((group) => group.sourceKey === pdf.sourceKey)))} pageCounts={pdfPageCounts} onAction={(kind) => trackAction('teacher_materials_book_pdf_connection_changed', { draftId: current.draftId, kind })} onSave={saveConnections} onClose={() => { setConnectionEditor(null); trackAction('teacher_materials_book_pdf_connection_closed', { draftId: current.draftId }); }} />}
  </section>;
};

export default LocalBookAuthoringWorkspace;
