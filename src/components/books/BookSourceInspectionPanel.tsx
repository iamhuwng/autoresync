import { useEffect, useRef, useState } from 'react';
import { toast } from '../modern/ToastNotification';
import {
  inspectSourcePdf,
  invalidateSourcePdfInspectionClaim,
  isSourcePdfInspectionClaimForFile,
  SourcePdfInspectionError,
  type SourcePdfInspectionClaim,
} from '../../services/book-source-delivery/sourcePdfInspection.browser';
import type { SourceUploadSelection } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import './BookSourceInspectionPanel.css';

export type BookSourceInspectionAction =
  | 'book_source_pdf_inspection_started'
  | 'book_source_pdf_inspection_completed'
  | 'book_source_pdf_inspection_failed'
  | 'book_source_pdf_inspection_canceled'
  | 'book_source_pdf_inspection_retried';

interface BookSourceInspectionPanelProps {
  readonly canRequestUploadAuthorization: boolean;
  readonly uploadUnavailableMessage?: string;
  readonly onAction?: (
    action: BookSourceInspectionAction,
    metadata?: Record<string, unknown>,
  ) => void;
  readonly onClaimChange: (selection: SourceUploadSelection | null) => void;
  readonly onRequestUploadAuthorization: (selection: SourceUploadSelection) => void;
}

const inspectionErrorMessage = (error: unknown): string => {
  if (error instanceof SourcePdfInspectionError) {
    if (error.code === 'file_too_large') return 'Choose a PDF no larger than 500 MiB.';
    if (error.code === 'invalid_filename') return 'The source filename must be a safe .pdf name.';
    if (error.code === 'not_pdf') return 'The selected file is not a readable PDF.';
    if (error.code === 'empty_pdf') return 'The PDF has no readable pages.';
  }
  return 'The source PDF could not be inspected. Choose Retry or select another file.';
};

const BookSourceInspectionPanel = ({
  canRequestUploadAuthorization,
  uploadUnavailableMessage,
  onAction,
  onClaimChange,
  onRequestUploadAuthorization,
}: BookSourceInspectionPanelProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [claim, setClaim] = useState<SourcePdfInspectionClaim | null>(null);
  const [phase, setPhase] = useState<'idle' | 'inspecting' | 'complete' | 'failed'>('idle');
  const [error, setError] = useState('');
  const runRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const fileRef = useRef<File | null>(null);
  const onClaimChangeRef = useRef(onClaimChange);
  const onActionRef = useRef(onAction);
  fileRef.current = file;
  onClaimChangeRef.current = onClaimChange;
  onActionRef.current = onAction;

  const clearClaim = () => {
    const currentFile = file;
    if (currentFile) invalidateSourcePdfInspectionClaim(currentFile);
    setClaim(null);
    onClaimChange(null);
  };

  const inspect = (nextFile: File, retry: boolean) => {
    runRef.current += 1;
    const run = runRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (file) invalidateSourcePdfInspectionClaim(file);
    setFile(nextFile);
    setClaim(null);
    onClaimChange(null);
    setError('');
    setPhase('inspecting');
    onActionRef.current?.(
      retry ? 'book_source_pdf_inspection_retried' : 'book_source_pdf_inspection_started',
      { exactByteSize: nextFile.size },
    );
    void inspectSourcePdf(nextFile, { signal: controller.signal }).then((nextClaim) => {
      if (!mountedRef.current || runRef.current !== run || controller.signal.aborted) return;
      setClaim(nextClaim);
      setPhase('complete');
      onClaimChange({ file: nextFile, claim: nextClaim });
      onActionRef.current?.('book_source_pdf_inspection_completed', {
        exactByteSize: nextClaim.exactByteSize,
        physicalPageCount: nextClaim.physicalPageCount,
      });
    }).catch((inspectionError: unknown) => {
      if (!mountedRef.current || runRef.current !== run || controller.signal.aborted) return;
      if (inspectionError instanceof SourcePdfInspectionError
        && inspectionError.code === 'aborted') return;
      invalidateSourcePdfInspectionClaim(nextFile);
      setClaim(null);
      setPhase('failed');
      const message = inspectionErrorMessage(inspectionError);
      setError(message);
      onClaimChange(null);
      onActionRef.current?.('book_source_pdf_inspection_failed', {
        code: inspectionError instanceof SourcePdfInspectionError
          ? inspectionError.code
          : 'unexpected',
      });
      toast.error(message);
    }).finally(() => {
      if (controllerRef.current === controller) controllerRef.current = null;
    });
  };

  useEffect(() => () => {
    mountedRef.current = false;
    runRef.current += 1;
    controllerRef.current?.abort();
    if (fileRef.current) invalidateSourcePdfInspectionClaim(fileRef.current);
    onClaimChangeRef.current(null);
  }, []);

  const cancel = () => {
    runRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    clearClaim();
    setPhase('idle');
    setError('');
    onActionRef.current?.('book_source_pdf_inspection_canceled');
    toast.info('PDF inspection canceled.');
  };

  const selection = file && claim && isSourcePdfInspectionClaimForFile(claim, file)
    ? { file, claim }
    : null;
  const canContinue = canRequestUploadAuthorization && selection !== null && phase === 'complete';

  return (
    <section className="book-source-inspection" aria-labelledby="book-source-inspection-title">
      <div className="book-source-inspection__heading">
        <div>
          <p className="book-source-inspection__eyebrow">Private source preflight</p>
          <h2 id="book-source-inspection-title">Inspect source PDF</h2>
        </div>
        <span>Local browser check</span>
      </div>

      <p>
        Choose the exact PDF you intend to use. Its filename, size, checksum, and
        page count are checked locally before any upload authorization is requested.
      </p>

      <label className="book-source-inspection__file-label" htmlFor="book-source-inspection-file">
        Source PDF
        <input
          id="book-source-inspection-file"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const nextFile = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (nextFile) inspect(nextFile, false);
          }}
        />
      </label>

      {phase === 'inspecting' && (
        <div className="book-source-inspection__status" role="status" aria-live="polite">
          <span>Inspecting PDF locally…</span>
          <button type="button" onClick={cancel}>Cancel inspection</button>
        </div>
      )}

      {error && (
        <div className="book-source-inspection__error" role="alert">{error}</div>
      )}

      {phase === 'failed' && file && (
        <button type="button" onClick={() => inspect(file, true)}>
          Retry inspection
        </button>
      )}

      {selection && (
        <dl className="book-source-inspection__claim">
          <div><dt>Filename</dt><dd>{selection.claim.displayFilename}</dd></div>
          <div><dt>Exact bytes</dt><dd>{selection.claim.exactByteSize.toLocaleString()}</dd></div>
          <div><dt>SHA-256</dt><dd>{selection.claim.sha256Hex}</dd></div>
          <div><dt>Pages</dt><dd>{selection.claim.physicalPageCount}</dd></div>
          <div><dt>Readability</dt><dd>{selection.claim.readability}</dd></div>
        </dl>
      )}

      {!canRequestUploadAuthorization && (
        <p
          id="book-source-inspection-availability"
          className="book-source-inspection__inline"
          role="status"
          aria-live="polite"
        >
          {uploadUnavailableMessage ?? 'Upload authorization is disabled in this view.'}
        </p>
      )}

      {canRequestUploadAuthorization && !selection && phase === 'idle' && (
        <p className="book-source-inspection__inline" role="status" aria-live="polite">
          Choose a PDF to enable upload authorization.
        </p>
      )}

      <button
        type="button"
        disabled={!canContinue}
        aria-describedby={!canRequestUploadAuthorization ? 'book-source-inspection-availability' : undefined}
        onClick={() => {
          if (selection && canContinue) onRequestUploadAuthorization(selection);
        }}
      >
        Continue to upload
      </button>
    </section>
  );
};

export default BookSourceInspectionPanel;
