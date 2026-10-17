import { useRef, useState, type DragEvent } from 'react';
import { useClipboard } from '../../../core/platform';

export interface UnitActivityImportControlsProps {
  readonly disabled?: boolean;
  readonly guided?: boolean;
  readonly promptText: string;
  readonly importText: string;
  readonly manualCopyFallback: boolean;
  readonly busy: boolean;
  readonly canCancel: boolean;
  readonly selectedUnitKey: string | null;
  readonly statusText: string | null;
  readonly conflict: { readonly activityKey: string } | null;
  readonly onCopyPrompt: (copied: boolean) => void;
  readonly onImportTextChange: (text: string) => void;
  readonly onImport: () => void;
  readonly onReplaceExisting: () => void;
  readonly onCancel: () => void;
  readonly onFileReadError: () => void;
}

const readFileText = async (file: File): Promise<string> => file.text();

const UnitActivityImportControls = ({
  disabled = false,
  guided = false,
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
  const canUsePrompt = Boolean(selectedUnitKey && promptText);
  const canImport = Boolean(canUsePrompt && importText.trim() && !disabled && !busy);

  const copyPrompt = async () => {
    if (!canUsePrompt || disabled || busy) return;
    onCopyPrompt(await writeText(promptText));
  };
  const useFile = async (file: File | undefined) => {
    if (!file || disabled || busy) return;
    try {
      onImportTextChange(await readFileText(file));
    } catch {
      onFileReadError();
    }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    void useFile(event.dataTransfer.files[0]);
  };

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
      <div className="book-assembly-workspace__import-actions">
        <button type="button" disabled={disabled || !canUsePrompt} onClick={() => void copyPrompt()}>
          {guided ? 'Copy instructions' : 'Copy Unit prompt'}
        </button>
        <button type="button" disabled={disabled || busy || !canUsePrompt} onClick={() => fileInputRef.current?.click()}>
          {guided ? 'Choose JSON file' : 'Select JSON file'}
        </button>
        {busy ? (
          <button type="button" disabled={!canCancel} onClick={onCancel}>Cancel import</button>
        ) : <button type="button" disabled={!canImport} onClick={onImport}>{guided ? 'Add Unit content' : 'Stage Unit JSON'}</button>}
      </div>
      <input
        ref={fileInputRef}
        aria-label="Unit Activity JSON file"
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => void useFile(event.currentTarget.files?.[0])}
      />
      <label className="book-assembly-workspace__import-editor">
        {guided ? 'Paste the returned Unit content' : 'Paste Unit Activity JSON'}
        <textarea
          value={importText}
          onChange={(event) => onImportTextChange(event.target.value)}
          disabled={disabled || busy}
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
        onDrop={drop}
      >
        Drop Unit JSON here
      </div>
      {manualCopyFallback && (
        <label className="book-assembly-workspace__manual-copy">
          Manual copy fallback
          <textarea readOnly value={promptText} rows={8} />
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
