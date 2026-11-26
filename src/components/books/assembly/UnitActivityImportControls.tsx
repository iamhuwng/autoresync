import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useClipboard } from '../../../core/platform';

export interface UnitActivityImportControlsProps {
  readonly disabled?: boolean;
  readonly guided?: boolean;
  readonly compact?: boolean;
  readonly allowMultipleFiles?: boolean;
  readonly canUsePromptOverride?: boolean;
  readonly copyLabel?: string;
  readonly uploadLabel?: string;
  readonly importLabel?: string;
  readonly editorLabel?: string;
  readonly placeholder?: string;
  readonly extraActions?: ReactNode;
  readonly promptText: string;
  readonly importText: string;
  readonly manualCopyFallback: boolean;
  readonly busy: boolean;
  readonly canCancel: boolean;
  readonly selectedUnitKey: string | null;
  readonly statusText: string | null;
  readonly conflict: { readonly activityKey: string; readonly unitLabel?: string } | null;
  readonly onCopyPrompt: (copied: boolean) => void;
  readonly onImportTextChange: (text: string) => void;
  readonly onImport: () => void;
  readonly onReplaceExisting: () => void;
  readonly onCancel: () => void;
  readonly onFileReadError: () => void;
}

const stripFence = (value: string): string => {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/iu.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
};

const readFilesText = async (files: readonly File[]): Promise<string> => {
  if (files.length === 1) return files[0]!.text();
  const entries: unknown[] = [];
  for (const file of files) {
    const raw = stripFence(await file.text());
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries.push(...parsed);
    } else {
      // Preserve complete envelopes (bookId, schemaVersion, promptVersion)
      // so the bulk parser validates every file's metadata without stripping it.
      entries.push(parsed);
    }
  }
  return JSON.stringify(entries, null, 2);
};

const UnitActivityImportControls = ({
  disabled = false,
  guided = false,
  compact = false,
  allowMultipleFiles = false,
  canUsePromptOverride,
  copyLabel,
  uploadLabel,
  importLabel,
  editorLabel,
  placeholder,
  extraActions,
  promptText,
  importText,
  manualCopyFallback,
  busy,
  canCancel,
  selectedUnitKey,
  statusText,
  conflict,
  onCopyPrompt,
  onImportTextChange,
  onImport,
  onReplaceExisting,
  onCancel,
  onFileReadError,
}: UnitActivityImportControlsProps) => {
  const { writeText } = useClipboard();
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canUsePrompt = canUsePromptOverride ?? Boolean(selectedUnitKey && promptText);
  const canImport = Boolean(canUsePrompt && importText.trim() && !disabled && !busy);

  const copyPrompt = async () => {
    if (!canUsePrompt || disabled || busy) return;
    onCopyPrompt(await writeText(promptText));
  };
  const useFiles = async (fileList: FileList | null | undefined) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0 || disabled || busy) return;
    const selectedFiles = allowMultipleFiles ? files : [files[0]!];
    try {
      onImportTextChange(await readFilesText(selectedFiles));
    } catch {
      onFileReadError();
    }
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    void useFiles(event.dataTransfer.files);
  };

  const resolvedCopyLabel = copyLabel ?? (guided ? 'Copy instructions' : 'Copy Unit prompt');
  const resolvedUploadLabel = uploadLabel ?? (allowMultipleFiles ? 'Upload JSON(s)' : guided ? 'Choose JSON file' : 'Select JSON file');
  const resolvedImportLabel = importLabel ?? (guided ? 'Add Unit content' : 'Stage Unit JSON');
  const resolvedEditorLabel = editorLabel ?? (guided ? 'Paste the returned Unit content' : 'Paste Unit Activity JSON');

  const actionsBar = (
    <div className="book-assembly-workspace__import-actions">
      <button type="button" className={compact ? 'pbf-button' : undefined} disabled={disabled || !canUsePrompt} onClick={() => void copyPrompt()}>
        {resolvedCopyLabel}
      </button>
      {extraActions}
      <button type="button" className={compact ? 'pbf-button' : undefined} disabled={disabled || busy || !canUsePrompt} onClick={() => fileInputRef.current?.click()}>
        {resolvedUploadLabel}
      </button>
      {busy ? (
        <button type="button" className={compact ? 'pbf-button' : undefined} disabled={!canCancel} onClick={onCancel}>Cancel import</button>
      ) : (
        <button type="button" className={compact ? 'pbf-button pbf-button-primary' : undefined} disabled={!canImport} onClick={onImport}>
          {resolvedImportLabel}
        </button>
      )}
    </div>
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      aria-label={allowMultipleFiles ? 'Bulk Unit Activity JSON files' : 'Unit Activity JSON file'}
      hidden
      multiple={allowMultipleFiles}
      type="file"
      accept="application/json,.json"
      onChange={(event) => {
        const files = event.currentTarget.files;
        void useFiles(files);
        event.currentTarget.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <div className="book-assembly-workspace__unit-import book-assembly-workspace__unit-import--compact">
        {actionsBar}
        {fileInput}
        <div
          className={`book-assembly-workspace__import-drop-wrap${dropActive ? ' is-active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (disabled || busy) return;
            setDropActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
        >
          <textarea
            aria-label={resolvedEditorLabel}
            className="book-assembly-workspace__json-textarea"
            value={importText}
            onChange={(event) => onImportTextChange(event.target.value)}
            placeholder={placeholder ?? 'Paste JSON or drop .json file…'}
            disabled={disabled || busy}
            spellCheck={false}
            rows={10}
          />
        </div>
        {manualCopyFallback && (
          <label className="book-assembly-workspace__manual-copy">
            Manual copy fallback
            <textarea readOnly value={promptText} spellCheck={false} rows={8} />
          </label>
        )}
        {statusText && <p className="book-assembly-workspace__import-status" role="status">{statusText}</p>}
        {conflict && (
          <div role="alert" className="book-assembly-guided__error">
            <p>
              {conflict.unitLabel ? `${conflict.unitLabel} · ` : ''}
              {conflict.activityKey} already has a saved draft.
            </p>
            <button type="button" className="pbf-button" disabled={busy} onClick={onReplaceExisting}>
              Replace existing Activity draft
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="book-assembly-workspace__unit-import" aria-labelledby="book-assembly-unit-import-title">
      <div className="book-assembly-workspace__section-heading">
        <div>
          <h2 id="book-assembly-unit-import-title">{guided ? 'Add Unit content' : 'Unit Activity import'}</h2>
          <p>{guided
            ? 'Choose a JSON file from your Unit authoring flow, or paste the returned content below.'
            : 'Copy the Unit prompt, then stage returned JSON through trusted Activity authoring.'}</p>
        </div>
      </div>
      {actionsBar}
      {fileInput}
      <label className="book-assembly-workspace__import-editor">
        {resolvedEditorLabel}
        <textarea
          value={importText}
          onChange={(event) => onImportTextChange(event.target.value)}
          disabled={disabled || busy}
          spellCheck={false}
          rows={8}
        />
      </label>
      <div
        className={`book-assembly-workspace__dropzone${dropActive ? ' is-active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled || busy) return;
          setDropActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDrop}
      >
        Drop Unit JSON here
      </div>
      {manualCopyFallback && (
        <label className="book-assembly-workspace__manual-copy">
          Manual copy fallback
          <textarea readOnly value={promptText} spellCheck={false} rows={8} />
        </label>
      )}
      {statusText && <p role="status">{statusText}</p>}
      {conflict && (
        <div role="alert" className="book-assembly-guided__error">
          <p>{conflict.activityKey} already has a newer saved draft. Replacing it will use this imported JSON as the next revision.</p>
          <button type="button" disabled={busy} onClick={onReplaceExisting}>Replace existing Activity draft</button>
        </div>
      )}
    </section>
  );
};

export default UnitActivityImportControls;
