import { useEffect, useRef, useState } from 'react';
import type { ActivityContextRequirement, BookPageGroupCandidate, BookUnitCandidate } from '../../types/bookAssembly.types';
import { connectLocalBookActivity } from '../../services/materialCatalog/localBookAuthoringEdits.service';
import type { LocalBookPdfDescriptor } from '../../services/materialCatalog/localBookAuthoring.service';

interface Props {
  readonly unit: BookUnitCandidate;
  readonly initialActivityKey: string;
  readonly titles: Readonly<Record<string, string>>;
  readonly sources: readonly Pick<LocalBookPdfDescriptor, 'sourceKey' | 'name'>[];
  readonly pageCounts: Readonly<Record<string, number>>;
  readonly onSave: (unit: BookUnitCandidate) => Promise<void>;
  readonly onClose: () => void;
  readonly onAction: (kind: string) => void;
}
type GroupInput = { group: BookPageGroupCandidate; pages: string; first: string };

export default function LocalBookConnectionEditor({ unit, initialActivityKey, titles, sources, pageCounts, onSave, onClose, onAction }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState(initialActivityKey);
  const [query, setQuery] = useState('');
  const selectedGroups = (key: string) => unit.pageGroups.filter((group) => key === 'references' ? group.mode === 'reference_only' : group.activityKeys.includes(key));
  const inputs = (key: string) => selectedGroups(key).map((group) => ({ group, pages: group.pages.join(', '), first: String(group.defaultPhysicalPageNumber ?? group.pages[0] ?? '') }));
  const [groups, setGroups] = useState<GroupInput[]>(() => inputs(initialActivityKey));
  const [context, setContext] = useState<ActivityContextRequirement>(() => unit.activitySlots.find((slot) => slot.activityKey === initialActivityKey)?.contextRequirement ?? 'required');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const choose = (key: string) => {
    onAction('activity-selected');
    setTarget(key); setGroups(inputs(key)); setError('');
    setContext(unit.activitySlots.find((slot) => slot.activityKey === key)?.contextRequirement ?? 'required');
  };
  const edit = (index: number, patch: Partial<GroupInput>) => setGroups((previous) => previous.map((group, i) => i === index ? { ...group, ...patch } : group));
  const save = async () => {
    onAction('apply-requested');
    const parsed: BookPageGroupCandidate[] = [];
    for (const entry of groups) {
      const pages = entry.pages.split(',').map((page) => page.trim() ? Number(page) : NaN);
      const first = Number(entry.first), max = pageCounts[entry.group.sourceKey];
      if (!max || pages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > max) || !pages.includes(first)) {
        setError(`Choose pages from 1–${max ?? '?'} in ${sources.find((source) => source.sourceKey === entry.group.sourceKey)?.name ?? 'this PDF'}. The opening page must be one of those pages.`);
        return;
      }
      parsed.push({ ...entry.group, pages: [...new Set(pages)], defaultPhysicalPageNumber: first });
    }
    if (target !== 'references' && parsed.length === 0) { setError('Connect at least one PDF page to this Activity.'); return; }
    const unchanged = JSON.stringify(parsed.map((group) => ({ ...group, defaultPhysicalPageNumber: group.defaultPhysicalPageNumber ?? group.pages[0] })))
      === JSON.stringify(selectedGroups(target).map((group) => ({ ...group, defaultPhysicalPageNumber: group.defaultPhysicalPageNumber ?? group.pages[0] })))
      && (target === 'references' || context === unit.activitySlots.find((slot) => slot.activityKey === target)?.contextRequirement);
    if (unchanged) { onClose(); return; }
    setBusy(true);
    try {
      const replacements = new Map(parsed.map((group) => [group.pageGroupKey, group]));
      await onSave(target === 'references'
        ? { ...unit, pageGroups: [...unit.pageGroups.flatMap((group) => group.mode !== 'reference_only' ? [group] : replacements.has(group.pageGroupKey) ? [replacements.get(group.pageGroupKey)!] : []), ...parsed.filter((group) => !unit.pageGroups.some((original) => original.pageGroupKey === group.pageGroupKey))] }
        : connectLocalBookActivity(unit, target, parsed, context));
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update these PDF connections.'); }
    finally { setBusy(false); }
  };
  const options = [...unit.activitySlots.filter((slot) => slot.activityKey === target), ...unit.activitySlots.filter((slot) => slot.activityKey !== target && (titles[slot.activityKey] ?? '').toLowerCase().includes(query.toLowerCase())).slice(0, 49)];
  return <dialog className="local-book-authoring__connection-dialog" ref={dialog} aria-labelledby="connection-heading" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header><h2 id="connection-heading">PDF connection</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close PDF connection">×</button></header>
      <fieldset disabled={busy} className="local-book-authoring__connection-body">
        {unit.activitySlots.length > 12 && <label>Find an Activity<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
        <label>Activity<select value={target} disabled={busy} onChange={(event) => choose(event.target.value)}>{options.map((slot) => <option key={slot.activityKey} value={slot.activityKey}>{titles[slot.activityKey]}</option>)}<option value="references">Reference pages</option></select></label>
        {groups.map((entry, index) => <div className="local-book-authoring__connection-group" key={entry.group.pageGroupKey}>
          {sources.length > 1 ? <label>PDF<select value={entry.group.sourceKey} onChange={(event) => edit(index, { group: { ...entry.group, sourceKey: event.target.value } })}>{sources.map((source) => <option key={source.sourceKey} value={source.sourceKey}>{source.name}</option>)}</select></label> : <small>{sources[0]?.name}</small>}
          <div className="local-book-authoring__connection-fields"><label>PDF pages<input aria-describedby={error ? 'connection-error' : undefined} value={entry.pages} onChange={(event) => edit(index, { pages: event.target.value })} placeholder="e.g. 12, 13" /></label><label>Open on<input type="number" min="1" value={entry.first} onChange={(event) => edit(index, { first: event.target.value })} /></label></div>
          <button type="button" className="local-book-authoring__link" onClick={() => { onAction('group-removed'); setGroups((previous) => previous.filter((_, i) => i !== index)); }}>Remove connection</button>
        </div>)}
        <button type="button" className="local-book-authoring__link" disabled={!sources.length} onClick={() => { onAction('group-added'); setGroups((previous) => [...previous, { group: { pageGroupKey: `pages-${crypto.randomUUID()}`, sourceKey: sources[0].sourceKey, pages: [], activityKeys: target === 'references' ? [] : [target], mode: target === 'references' ? 'reference_only' : 'activity' }, pages: '', first: '' }]); }}>Connect another page group{sources.length > 1 ? ' or PDF' : ''}</button>
        {target !== 'references' && <details><summary>More options</summary><label>PDF context<select value={context} onChange={(event) => setContext(event.target.value as ActivityContextRequirement)}><option value="required">Alongside this Activity</option><option value="optional">Reference on request</option><option value="none">No PDF context required</option></select></label></details>}
        {error && <p id="connection-error" className="local-book-authoring__error" role="alert">{error}</p>}
      </fieldset>
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="local-book-authoring__primary-action" disabled={busy}>{busy ? 'Applying…' : 'Apply change'}</button></footer>
    </form>
  </dialog>;
}
