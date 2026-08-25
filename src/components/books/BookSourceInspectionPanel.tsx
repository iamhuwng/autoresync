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
  readonly guided?: boolean;
  readonly uiVariant?: 'default' | 'mockup';
  readonly instanceKey?: string;
  readonly uploadUnavailableMessage?: string;
  readonly onAction?: (
    action: BookSourceInspectionAction,
    metadata?: Record<string, unknown>,
  ) => void;
  readonly onClaimChange: (selection: SourceUploadSelection | null) => void;
  readonly onRequestUploadAuthorization: (selection: SourceUploadSelection) => void;
}

const SOURCE_PDF_INSPECTION_TIMEOUT_MS = 30_000;

const inspectionErrorMessage = (error: unknown): string => {
  if (error instanceof SourcePdfInspectionError) {
    if (error.code === 'file_too_large') return 'Choose a PDF no larger than 500 MiB.';
    if (error.code === 'invalid_filename') return 'The source filename must be a safe .pdf name.';
    if (error.code === 'not_pdf') return 'The selected file is not a readable PDF.';
    if (error.code === 'empty_pdf') return 'The PDF has no readable pages.';
    if (error.code === 'timeout') return 'PDF inspection timed out. Check the file and try again.';
  }
  return 'The source PDF could not be inspected. Choose Retry or select another file.';
};

const BookSourceInspectionPanel = ({
  canRequestUploadAuthorization,
  guided = false,
  uiVariant = 'default',
  instanceKey = 'book-source-inspection',
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
  const inspectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const fileRef = useRef<File | null>(null);
  const onActionRef = useRef(onAction);
  fileRef.current = file;
  onActionRef.current = onAction;

  const clearInspectionTimeout = () => {
    if (inspectionTimeoutRef.current === null) return;
    clearTimeout(inspectionTimeoutRef.current);
    inspectionTimeoutRef.current = null;
  };

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
    clearInspectionTimeout();
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

    const handleInspectionFailure = (inspectionError: unknown) => {
      if (!mountedRef.current || runRef.current !== run) return;
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
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    timeoutId = setTimeout(() => {
      if (!mountedRef.current || runRef.current !== run || controller.signal.aborted) return;
      controller.abort();
      inspectionTimeoutRef.current = null;
      handleInspectionFailure(new SourcePdfInspectionError('timeout'));
    }, SOURCE_PDF_INSPECTION_TIMEOUT_MS);
    inspectionTimeoutRef.current = timeoutId;

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
      if (controller.signal.aborted) return;
      handleInspectionFailure(inspectionError);
    }).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (inspectionTimeoutRef.current === timeoutId) inspectionTimeoutRef.current = null;
      if (controllerRef.current === controller) controllerRef.current = null;
    });
  };

  useEffect(() => {
    // React StrictMode replays effects in development. Re-arm the mounted
    // sentinel for the live effect instance after the replay cleanup.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      controllerRef.current?.abort();
      clearInspectionTimeout();
      if (fileRef.current) invalidateSourcePdfInspectionClaim(fileRef.current);
    };
  }, []);

  const cancel = () => {
    runRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    clearInspectionTimeout();
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

  if (guided && uiVariant === 'mockup') {
    return (
      <section
        className="book-source-inspection book-source-inspection--guided book-source-inspection--mockup"
        data-presentation="guided"
        data-ui-variant="mockup"
        aria-labelledby={`${instanceKey}-title`}
      >
        <input
          id={`${instanceKey}-file`}
          className="book-source-inspection__mockup-input"
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Choose your PDF"
          onChange={(event) => {
            const nextFile = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (nextFile) inspect(nextFile, false);
          }}
        />
        {!selection && phase !== 'inspecting' && (
          <div className="pbf-upload-zone">
            <div>
              <div className="pbf-upload-icon" aria-hidden="true">PDF</div>
              <strong id={`${instanceKey}-title`}>Choose your PDF</strong>
              <p>We will check the file in your browser before anything is uploaded.</p>
              <label className="pbf-button pbf-button-primary" htmlFor={`${instanceKey}-file`}>Choose PDF</label>
            </div>
          </div>
        )}
        {phase === 'inspecting' && (
          <div className="pbf-callout" role="status" aria-live="polite">
            <strong>Checking your PDF</strong>
            <span>We’re checking the file on this device. Nothing is uploaded yet.</span>
            <button type="button" className="pbf-button" onClick={cancel} style={{ marginTop: 12 }}>Cancel</button>
          </div>
        )}
        {error && <div className="pbf-callout is-danger" role="alert"><strong>We couldn’t check this PDF</strong><span>{error}</span><button type="button" className="pbf-button" onClick={() => file && inspect(file, true)} style={{ marginTop: 12 }}>Try again</button></div>}
        {selection && phase === 'complete' && (
          <>
            <div className="pbf-file-summary">
              <div className="pbf-file-left"><span className="pbf-file-symbol">PDF</span><div><strong>{selection.claim.displayFilename}</strong><span>{selection.claim.physicalPageCount} pages · {selection.claim.exactByteSize.toLocaleString()} bytes · Checked on this device</span></div></div>
              <span className="pbf-status is-good">Looks good</span>
            </div>
            {canRequestUploadAuthorization ? (
              <div className="pbf-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}><button type="button" className="pbf-button pbf-button-primary" onClick={() => onRequestUploadAuthorization(selection)}>Upload PDF</button></div>
            ) : (
              <div className="pbf-callout is-warn" role="status"><strong>Upload is unavailable</strong><span>{uploadUnavailableMessage ?? 'Upload authorization is disabled in this view.'}</span></div>
            )}
            <details className="pbf-details" style={{ marginTop: 15 }}><summary>See file details</summary><dl><dt>Pages</dt><dd>{selection.claim.physicalPageCount}</dd><dt>Size</dt><dd>{selection.claim.exactByteSize.toLocaleString()} bytes</dd><dt>File check</dt><dd>Complete on this device</dd><dt>Privacy</dt><dd>Private until you publish a Unit</dd></dl></details>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      className={guided
        ? 'book-source-inspection book-source-inspection--guided'
        : 'book-source-inspection'}
      data-presentation={guided ? 'guided' : undefined}
      aria-labelledby={`${instanceKey}-title`}
    >
        <div className="book-source-inspection__heading">
          <div>
          <p className="book-source-inspection__eyebrow">{guided ? 'Step 1 · Choose your PDF' : 'Private source preflight'}</p>
          <h2 id={`${instanceKey}-title`}>{guided ? 'Choose your PDF' : 'Inspect source PDF'}</h2>
          </div>
        <span>{guided ? 'Checked on this device' : 'Local browser check'}</span>
      </div>

      {guided && (
        <p className="book-source-inspection__guided-step" role="status">
          Step 1 of 2: verify the exact PDF before any upload authorization is requested.
        </p>
      )}

      <p className="book-source-inspection__description">{guided
        ? 'We’ll check the file on this device first. Nothing is uploaded until you choose to continue.'
        : 'Choose the exact PDF you intend to use. Its filename, size, checksum, and page count are checked locally before any upload authorization is requested.'}</p>

      <label className="book-source-inspection__file-label" htmlFor={`${instanceKey}-file`}>
        {guided && <span className="book-source-inspection__file-icon" aria-hidden="true">PDF</span>}
        <strong>{guided ? 'Choose your PDF' : 'Source PDF'}</strong>
        {guided && <span className="book-source-inspection__file-help">Nothing is uploaded until you confirm the source.</span>}
        <input
          id={`${instanceKey}-file`}
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
