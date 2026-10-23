import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { CreateBookModalValue } from '../components/books/CreateBookModal';
import { toast } from '../components/modern/ToastNotification';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useFeatureTracking } from './useFeatureTracking';
import {
  createLocalBookAuthoringDraft, listLocalBookAuthoringDrafts, loadLocalBookAuthoringDraft,
  type LocalBookAuthoringDraft,
} from '../services/materialCatalog/localBookAuthoring.service';
import { createBookSubmissionClient } from '../services/materialCatalog/bookSubmission.client';
import { resolveLocalBookSubmission, submitLocalBookDraft } from '../services/materialCatalog/bookSubmission.workflow.service';
import { createSourceUploadClient } from '../services/book-source-delivery/sourceUpload.client';
import { inspectSourcePdf } from '../services/book-source-delivery/sourcePdfInspection.browser';
import { uploadSourcePdfDirect } from '../services/book-source-delivery/sourceUpload.browser';

export const useLocalBookDrafts = ({ user, enabled, onCommitted }: {
  readonly user: Pick<User, 'uid' | 'getIdToken'> | null;
  readonly enabled: boolean;
  readonly onCommitted: (bookId: string) => void;
}) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.bookAuthoring);
  const [drafts, setDrafts] = useState<readonly LocalBookAuthoringDraft[]>([]);
  const [draft, setDraft] = useState<LocalBookAuthoringDraft | null>(null);
  const owner = enabled ? user?.uid : undefined;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const inFlight = useRef(false);

  useEffect(() => {
    setDraft(null);
    setDrafts([]);
    if (!owner) return;
    let active = true;
    void listLocalBookAuthoringDrafts(owner).then((saved) => {
      if (active) setDrafts(saved);
    }).catch(() => {
      if (active) toast.error('Could not load PDF Book drafts saved on this device.');
    });
    return () => { active = false; };
  }, [owner]);

  const changed = useCallback((next: LocalBookAuthoringDraft) => {
    if (next.ownerId !== ownerRef.current) return;
    setDraft(next);
    setDrafts((previous) => [next, ...previous.filter((entry) => entry.draftId !== next.draftId)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }, []);
  const discarded = useCallback((draftId: string) => {
    setDrafts((previous) => previous.filter((entry) => entry.draftId !== draftId));
    setDraft((previous) => previous?.draftId === draftId ? null : previous);
  }, []);
  const start = async (metadata: CreateBookModalValue) => {
    if (!owner) throw new Error('PDF Book creation is unavailable.');
    const created = await createLocalBookAuthoringDraft(owner, { ...metadata, bookMode: 'pdf', visibility: 'private' });
    if (ownerRef.current !== owner) throw new Error('Book author account changed.');
    changed(created);
    trackAction('teacher_materials_book_pdf_local_session_started', { draftId: created.draftId });
    toast.info(`Saved "${created.metadata.title}" on this device.`);
  };
  const resume = (draftId: string) => {
    const saved = drafts.find((entry) => entry.draftId === draftId && entry.ownerId === owner);
    if (!saved) return false;
    changed(saved);
    trackAction('teacher_materials_book_pdf_local_resumed', { draftId });
    return true;
  };
  const clients = () => {
    if (!owner || !user || user.uid !== ownerRef.current) throw new Error('Book author account changed.');
    const baseUrl = import.meta.env.VITE_BOOK_SUBMISSION_WORKER_URL
      || import.meta.env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL || import.meta.env.VITE_R2_UPLOAD_WORKER_URL;
    const getIdToken = () => user.getIdToken();
    return {
      submission: createBookSubmissionClient({ baseUrl, getIdToken }),
      source: createSourceUploadClient({ baseUrl: import.meta.env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL || baseUrl,
        reconciliationBaseUrl: import.meta.env.VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL, getIdToken }),
    };
  };
  const submit = async (current: LocalBookAuthoringDraft) => {
    if (!owner || current.ownerId !== owner || inFlight.current) throw new Error('Book submission is unavailable.');
    const connection = clients();
    inFlight.current = true;
    trackAction('teacher_materials_book_pdf_submission_started', { draftId: current.draftId, strategy: current.strategy });
    try {
      const result = await submitLocalBookDraft({
        ownerId: owner, draft: current, ...connection, inspectSourcePdf,
        uploadSourcePdf: async (input) => {
          const origin = import.meta.env.VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN;
          if (!origin) throw new Error('book_submission_upload_origin_missing');
          await uploadSourcePdfDirect({ ...input, allowedB2Origins: [origin] });
        },
      });
      if (ownerRef.current !== owner) return;
      trackAction('teacher_materials_book_pdf_submission_committed', { draftId: current.draftId, bookId: result.receipt.finalBookId });
      if (result.cleanupPending) {
        const retained = await loadLocalBookAuthoringDraft(owner, current.draftId);
        if (retained) changed(retained);
        toast.warning('The Book was created. Retry local cleanup before starting another submission.');
      } else {
        discarded(current.draftId);
        toast.success(`Created "${current.metadata.title}".`);
        onCommitted(result.receipt.finalBookId);
      }
    } catch (error) {
      if (ownerRef.current === owner) {
        const retained = await loadLocalBookAuthoringDraft(owner, current.draftId);
        if (retained) changed(retained);
        trackAction('teacher_materials_book_pdf_submission_failed', { draftId: current.draftId,
          reason: error instanceof Error ? error.message : 'book_submission_failed' });
      }
      throw error;
    } finally { inFlight.current = false; }
  };
  const resolveDiscard = async () => {
    if (!draft || draft.ownerId !== owner) return false;
    try {
      await resolveLocalBookSubmission({ draft, ...clients() });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'book_submission_cleanup_pending') {
        toast.warning('Cleanup is waiting for the upload link to expire. Keep this draft and try discarding it again later.');
      } else toast.error('This submission is still active or committed. Check its status before discarding the local draft.');
      return false;
    }
  };
  return { drafts: owner ? drafts.filter((entry) => entry.ownerId === owner) : [],
    draft: draft?.ownerId === owner ? draft : null, start, resume, changed, discarded, submit, resolveDiscard };
};
