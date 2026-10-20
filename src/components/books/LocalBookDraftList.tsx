import type { LocalBookAuthoringDraft } from '../../services/materialCatalog/localBookAuthoring.service';

export default function LocalBookDraftList({ drafts, onResume }: {
  readonly drafts: readonly LocalBookAuthoringDraft[];
  readonly onResume: (draftId: string) => void;
}) {
  if (!drafts.length) return null;
  return <section aria-labelledby="local-book-drafts-heading" className="create-book-modal__fieldset">
    <h2 id="local-book-drafts-heading">PDF Book drafts saved on this device</h2>
    <ul className="create-book-modal__draft-list">
      {drafts.map((draft) => <li key={draft.draftId} className="create-book-modal__draft-row">
        <div className="create-book-modal__draft-details">
          <strong>{draft.metadata.title}</strong>
          <time dateTime={draft.updatedAt}>{new Date(draft.updatedAt).toLocaleString()}</time>
          {draft.submission.cleanupPending && <span>Book created; local cleanup needs a retry.</span>}
        </div>
        <button type="button" className="create-book-modal__button" onClick={() => onResume(draft.draftId)}>Resume local draft</button>
      </li>)}
    </ul>
  </section>;
}
