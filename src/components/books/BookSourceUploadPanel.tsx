import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../modern/ToastNotification';
import type {
  SourceUploadByteProgress,
} from '../../services/book-source-delivery/sourceUpload.browser';
import {
  SourceUploadWorkflowError,
  type SourceUploadSelection,
  type SourceUploadBrowserWorkflow,
} from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import type {
  SourceUploadSafeOperationState,
} from '../../services/book-source-delivery/sourceUpload.client';
import './BookSourceUploadPanel.css';

type ActivePhase = 'idle' | 'uploading' | 'verifying' | 'reconciling' | 'failed';

export type BookSourceUploadAction =
  | 'book_source_upload_started'
  | 'book_source_upload_byte_retry_started'
  | 'book_source_upload_completion_retry_started'
  | 'book_source_upload_canceled'
  | 'book_source_upload_cancel_request_failed'
  | 'book_source_upload_cleanup_retry_started'
  | 'book_source_upload_cleanup_released'
  | 'book_source_upload_cleanup_retry_failed'
  | 'book_source_upload_restored'
  | 'book_source_upload_verified'
  | 'book_source_upload_failed';

interface BookSourceUploadPanelProps {
  readonly allowFreshUpload: boolean;
  readonly bookId: string;
  readonly immutablePublished: boolean;
  readonly onAction?: (
    action: BookSourceUploadAction,
    metadata?: Record<string, unknown>,
  ) => void;
  readonly selection: SourceUploadSelection | null;
  readonly workflow: SourceUploadBrowserWorkflow;
}

const emptyProgress: SourceUploadByteProgress = {
  confirmed: false,
  loadedBytes: 0,
  totalBytes: 0,
  percent: 0,
};

const errorMessage = (error: unknown): string => {
  if (
    error instanceof SourceUploadWorkflowError
    && error.code === 'verified_source_exists'
  ) {
    return 'A verified source already exists. Published source bytes are immutable; use the replacement workflow.';
  }
  if (
    error instanceof SourceUploadWorkflowError
    && error.code === 'operation_exists'
  ) {
    return 'An upload operation already exists. Resume its byte or completion step below.';
  }
  return 'Source upload did not finish. Choose the retry that matches the saved operation state.';
};

const BookSourceUploadPanel = ({
  allowFreshUpload,
  bookId,
  immutablePublished,
  onAction,
  selection,
  workflow,
}: BookSourceUploadPanelProps) => {
  const [saved, setSaved] = useState<SourceUploadSafeOperationState | null>(null);
  const [activePhase, setActivePhase] = useState<ActivePhase>('idle');
  const [progress, setProgress] = useState<SourceUploadByteProgress>(emptyProgress);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef(0);

  const restore = useCallback(async () => {
    const state = await workflow.load(bookId);
    setSaved(state);
    if (state) {
      onAction?.('book_source_upload_restored', { phase: state.phase });
    }
  }, [bookId, onAction, workflow]);

  useEffect(() => {
    let active = true;
    void workflow.load(bookId).then((state) => {
      if (!active) return;
      setSaved(state);
      if (state) onAction?.('book_source_upload_restored', { phase: state.phase });
    });
    return () => {
      active = false;
      activeRunRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [bookId, onAction, workflow]);

  const finishVerified = (state: SourceUploadSafeOperationState) => {
    if (state.phase !== 'verified') {
      throw new Error('Source upload completed without verified state.');
    }
    setSaved(state);
    setActivePhase('idle');
    setError('');
    onAction?.('book_source_upload_verified', {
      reservationId: state.reservationId,
      sourceVersionId: state.sourceVersionId,
    });
    toast.success('PDF upload verified. Source Version is ready.');
  };

  const fail = async (uploadError: unknown) => {
    if (uploadError instanceof DOMException && uploadError.name === 'AbortError') return;
    await restore();
    const message = errorMessage(uploadError);
    setActivePhase('failed');
    setError(message);
    onAction?.('book_source_upload_failed', {
      code: uploadError instanceof Error ? uploadError.name : 'unexpected',
    });
    toast.error(message);
  };

  const runBytes = async (retry: boolean) => {
    if (!selection) return;
    const activeRun = activeRunRef.current + 1;
    activeRunRef.current = activeRun;
    const controller = new AbortController();
    controllerRef.current = controller;
    setActivePhase('uploading');
    setError('');
    setProgress({
      confirmed: false,
      loadedBytes: 0,
      totalBytes: selection.file.size,
      percent: 0,
    });
    onAction?.(
      retry
        ? 'book_source_upload_byte_retry_started'
        : 'book_source_upload_started',
      { exactByteSize: selection.file.size },
    );
    toast.info(retry ? 'Retrying PDF byte upload.' : 'PDF upload started.');
    try {
      const result = await (retry ? workflow.retryBytes : workflow.start)({
        bookId,
        sourceKey: 'main',
        kind: immutablePublished ? 'replacement' : 'initial',
        ...selection,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (activeRunRef.current !== activeRun || controller.signal.aborted) return;
          setProgress(nextProgress);
          if (nextProgress.confirmed) setActivePhase('verifying');
        },
      });
      if (activeRunRef.current !== activeRun || controller.signal.aborted) return;
      finishVerified(result.state);
    } catch (uploadError) {
      if (controller.signal.aborted) return;
      await fail(uploadError);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const retryCompletion = async () => {
    setActivePhase('verifying');
    setError('');
    onAction?.('book_source_upload_completion_retry_started');
    toast.info('Retrying metadata-only source verification.');
    try {
      const result = await workflow.retryCompletion(bookId);
      finishVerified(result.state);
    } catch (completionError) {
      await fail(completionError);
    }
  };

  const cancel = async () => {
    activeRunRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    let confirmed = false;
    try {
      confirmed = await workflow.requestCancellation(bookId);
    } catch {
      confirmed = false;
    }
    try {
      await restore();
    } catch {
      setSaved(null);
    }
    setActivePhase('idle');
    setError('');
    onAction?.(
      confirmed
        ? 'book_source_upload_canceled'
        : 'book_source_upload_cancel_request_failed',
    );
    if (confirmed) {
      toast.info('Upload canceled. Cleanup requested; provider deletion is not yet confirmed.');
    } else {
      toast.error('Upload stopped, but cleanup request was not confirmed. Retry cleanup later.');
    }
  };

  const retryCleanup = async () => {
    setActivePhase('reconciling');
    setError('');
    onAction?.('book_source_upload_cleanup_retry_started');
    toast.info('Retrying exact upload cleanup.');
    try {
      const status = await workflow.retryCleanup(bookId);
      await restore();
      setActivePhase('idle');
      if (status === 'released' || status === 'verified_completed') {
        onAction?.('book_source_upload_cleanup_released');
        toast.success(status === 'released'
          ? 'Upload cleanup confirmed. Reserved capacity was released.'
          : 'Upload verification and replay cleanup confirmed.');
      } else {
        onAction?.('book_source_upload_cleanup_retry_failed');
        toast.warning('Cleanup remains pending. Reserved capacity is still held safely.');
      }
    } catch {
      await restore();
      setActivePhase('failed');
      setError('Cleanup is still pending. Retry when the provider is available.');
      onAction?.('book_source_upload_cleanup_retry_failed');
      toast.error('Could not finish upload cleanup. Reserved capacity remains held.');
    }
  };

  const busy = activePhase === 'uploading'
    || activePhase === 'verifying'
    || activePhase === 'reconciling';
  const canStart = allowFreshUpload && selection !== null && saved === null && !busy;
  const canRetryBytes = allowFreshUpload
    && selection !== null
    && (saved?.phase === 'begin_pending' || saved?.phase === 'reserved')
    && !busy;
  const canRetryCompletion = saved?.phase === 'completion_pending' && !busy;
  const canRequestCleanup = saved !== null
    && saved.phase !== 'begin_pending'
    && saved.phase !== 'verified'
    && saved.phase !== 'cancel_requested'
    && !busy;

  return (
    <section
      className="book-source-upload"
      aria-labelledby="book-source-upload-title"
    >
      <div className="book-source-upload__heading">
        <div>
          <p className="book-source-upload__eyebrow">Private source upload</p>
          <h2 id="book-source-upload-title">Upload source PDF</h2>
        </div>
        <span>Browser → private B2</span>
      </div>

      <p>
        PDF bytes go directly to one short-lived object destination. Worker
        calls carry metadata only.
      </p>

      {immutablePublished && (
        <p className="book-source-upload__immutable" role="status">
          Published source bytes are immutable. This action creates a replacement
          operation; it never overwrites the ready Source Version.
        </p>
      )}

      {!allowFreshUpload && saved === null && (
        <p className="book-source-upload__inline" role="status">
          New upload authorization is disabled. Existing status, completion,
          and cleanup remain available.
        </p>
      )}

      {saved && (
        <dl className="book-source-upload__state">
          <div>
            <dt>Browser-known phase</dt>
            <dd>{saved.phase.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt>Reservation</dt>
            <dd>{saved.phase === 'begin_pending' ? 'Not assigned yet' : saved.reservationId}</dd>
          </div>
          <div>
            <dt>Source Version</dt>
            <dd>{saved.phase === 'begin_pending' ? 'Not assigned yet' : saved.sourceVersionId}</dd>
          </div>
        </dl>
      )}

      {busy && (
        <div className="book-source-upload__progress" role="status">
          <div>
            <span>
              {activePhase === 'reconciling'
                ? 'Reconciling the exact unfinished provider version'
                : activePhase === 'verifying'
                ? 'Verifying immutable provider metadata'
                : progress.percent >= 100
                  ? 'PDF byte stream complete — awaiting exact B2 confirmation'
                  : 'Streaming PDF bytes to the exact B2 destination'}
            </span>
            <span>
              {activePhase === 'reconciling'
                ? 'Reserved capacity stays held until cleanup is proven'
                : activePhase === 'verifying'
                ? `${Math.round(progress.percent)}%`
                : `${progress.loadedBytes} / ${progress.totalBytes} bytes (${Math.round(progress.percent)}%)`}
            </span>
          </div>
          <progress
            aria-label="Source PDF upload progress"
            max={100}
            value={progress.percent}
          />
          {activePhase === 'uploading'
            && (saved?.phase === 'reserved' || progress.loadedBytes > 0) && (
            <button type="button" onClick={() => void cancel()}>
              Cancel upload
            </button>
          )}
        </div>
      )}

      {saved?.phase === 'verified' && (
        <p className="book-source-upload__success" role="status">
          One verified ready Source Version is recorded for this operation.
        </p>
      )}

      {error && <p className="book-source-upload__error" role="alert">{error}</p>}

      <div className="book-source-upload__actions">
        {saved === null && (
          <button type="button" disabled={!canStart} onClick={() => void runBytes(false)}>
            Upload PDF
          </button>
        )}
        {(saved?.phase === 'begin_pending' || saved?.phase === 'reserved') && (
          <button type="button" disabled={!canRetryBytes} onClick={() => void runBytes(true)}>
            Retry PDF bytes
          </button>
        )}
        {saved?.phase === 'completion_pending' && (
          <button
            type="button"
            disabled={!canRetryCompletion}
            onClick={() => void retryCompletion()}
          >
            Retry verification only
          </button>
        )}
        {canRequestCleanup && (
          <button type="button" onClick={() => void cancel()}>
            Request cleanup
          </button>
        )}
        {saved?.phase === 'cancel_requested' && (
          <button type="button" disabled={busy} onClick={() => void retryCleanup()}>
            Retry cleanup
          </button>
        )}
      </div>
    </section>
  );
};

export default BookSourceUploadPanel;
