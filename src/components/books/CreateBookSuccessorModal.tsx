import React, { useEffect, useMemo, useState } from 'react';
import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import { oppositeBookMode } from '../../services/materialCatalog/bookSuccessor.service';
import './CreateBookModal.css';

interface CreateBookSuccessorModalProps {
  readonly opened: boolean;
  readonly predecessor: MaterialBookMetadata | null;
  readonly onClose: () => void;
  readonly onCreate: (input: {
    readonly reason: string;
    readonly targetMode: 'materials' | 'pdf';
  }) => Promise<void> | void;
}

const modeLabel = (mode: 'materials' | 'pdf'): string =>
  mode === 'materials' ? 'Materials' : 'PDF source';

const CreateBookSuccessorModal = ({
  opened,
  predecessor,
  onClose,
  onCreate,
}: CreateBookSuccessorModalProps) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fromMode = predecessor?.bookMode ?? 'materials';
  const targetMode = useMemo(() => oppositeBookMode(fromMode), [fromMode]);

  useEffect(() => {
    if (!opened) {
      setReason('');
      setError('');
      setSaving(false);
    }
  }, [opened]);

  if (!opened || !predecessor) {
    return null;
  }

  const close = () => {
    if (!saving) {
      setReason('');
      setError('');
      onClose();
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError('Explain why this Book needs a different mode.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onCreate({ reason: normalizedReason, targetMode });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the successor Book.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-book-modal__backdrop">
      <form
        className="create-book-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Create ${modeLabel(targetMode)} successor`}
        onSubmit={submit}
      >
        <div className="create-book-modal__header">
          <h2 className="create-book-modal__title">Create Book successor</h2>
          <button className="create-book-modal__button" type="button" onClick={close} disabled={saving}>
            Close
          </button>
        </div>

        <div className="create-book-modal__body">
          <p>
            <strong>{predecessor.title}</strong> stays unchanged. A new private draft will open in
            {' '}<strong>{modeLabel(targetMode)}</strong> mode.
          </p>
          <p role="status">
            Existing Book contents are not converted or copied across modes.
          </p>
          <label className="create-book-modal__field">
            Reason
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError('');
              }}
              maxLength={500}
              required
            />
          </label>
          {error && <p className="create-book-modal__error" role="alert">{error}</p>}
        </div>

        <div className="create-book-modal__footer">
          <button className="create-book-modal__button" type="button" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button
            className="create-book-modal__button create-book-modal__button--primary"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Creating…' : `Create ${modeLabel(targetMode)} successor`}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateBookSuccessorModal;
