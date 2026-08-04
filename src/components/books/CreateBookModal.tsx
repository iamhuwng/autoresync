import React, { useCallback, useMemo, useState } from 'react';
import { toast } from '../modern/ToastNotification';
import type { MaterialBookMode, MaterialBookVisibility, MaterialTestTypeConfig } from '../../types/materialCatalog.types';
import './CreateBookModal.css';

export interface CreateBookModalValue {
  readonly bookMode: MaterialBookMode;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly edition?: string;
  readonly series?: string;
  readonly isbn?: string;
  readonly coverUrl?: string;
  readonly testTypeIds: readonly string[];
  readonly tags: readonly string[];
  readonly description?: string;
  readonly visibility: MaterialBookVisibility;
}

interface CreateBookModalProps {
  readonly opened: boolean;
  readonly testTypes: readonly MaterialTestTypeConfig[];
  readonly initialValue?: Partial<CreateBookModalValue>;
  readonly title?: string;
  readonly pdfModeEnabled?: boolean;
  readonly onClose: () => void;
  readonly onModeSelect?: (bookMode: MaterialBookMode) => void;
  readonly onSave: (value: CreateBookModalValue) => Promise<void> | void;
}

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const getString = (value: unknown): string => String(value ?? '').trim();

const toPublicVisibility = (value: string): MaterialBookVisibility =>
  value === 'public' ? 'public-library-pending-review' : 'private';

const fromVisibility = (visibility?: string): 'private' | 'public' =>
  visibility && visibility !== 'private' ? 'public' : 'private';

const CreateBookModal = ({
  opened,
  testTypes,
  initialValue,
  title = 'Create Book',
  // Ticket 50B owns activation; default stays fail-closed.
  pdfModeEnabled = false,
  onClose,
  onModeSelect,
  onSave,
}: CreateBookModalProps) => {
  const selectableTestTypes = useMemo(
    () => testTypes.filter((testType) => testType.active !== false && testType.teacherSelectable !== false),
    [testTypes],
  );
  const [titleValue, setTitleValue] = useState(initialValue?.title ?? '');
  const [subtitle, setSubtitle] = useState(initialValue?.subtitle ?? '');
  const [authors, setAuthors] = useState((initialValue?.authors ?? []).join(', '));
  const [publisher, setPublisher] = useState(initialValue?.publisher ?? '');
  const [edition, setEdition] = useState(initialValue?.edition ?? '');
  const [series, setSeries] = useState(initialValue?.series ?? '');
  const [isbn, setIsbn] = useState(initialValue?.isbn ?? '');
  const [coverUrl, setCoverUrl] = useState(initialValue?.coverUrl ?? '');
  const [tags, setTags] = useState((initialValue?.tags ?? []).join(', '));
  const [description, setDescription] = useState(initialValue?.description ?? '');
  const [visibility, setVisibility] = useState<'private' | 'public'>(fromVisibility(initialValue?.visibility));
  const [selectedTestTypeIds, setSelectedTestTypeIds] = useState<string[]>(
    (initialValue?.testTypeIds ?? []).map(String),
  );
  const [bookMode, setBookMode] = useState<MaterialBookMode | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setTitleValue(initialValue?.title ?? '');
    setSubtitle(initialValue?.subtitle ?? '');
    setAuthors((initialValue?.authors ?? []).join(', '));
    setPublisher(initialValue?.publisher ?? '');
    setEdition(initialValue?.edition ?? '');
    setSeries(initialValue?.series ?? '');
    setIsbn(initialValue?.isbn ?? '');
    setCoverUrl(initialValue?.coverUrl ?? '');
    setTags((initialValue?.tags ?? []).join(', '));
    setDescription(initialValue?.description ?? '');
    setVisibility(fromVisibility(initialValue?.visibility));
    setSelectedTestTypeIds((initialValue?.testTypeIds ?? []).map(String));
    setBookMode(null);
    setErrors({});
  }, [initialValue]);

  if (!opened) {
    return null;
  }

  const toggleTestType = (testTypeId: string) => {
    setSelectedTestTypeIds((current) => (
      current.includes(testTypeId)
        ? current.filter((entry) => entry !== testTypeId)
        : [...current, testTypeId]
    ));
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (bookMode === 'pdf' && !pdfModeEnabled) {
      setBookMode(null);
      setErrors({ bookMode: 'PDF source is no longer available. Choose another option.' });
      return;
    }

    if (!bookMode) {
      setErrors({ bookMode: 'Choose how to create this Book.' });
      return;
    }

    const nextErrors: Record<string, string> = {};
    const trimmedTitle = getString(titleValue);
    if (!trimmedTitle) {
      nextErrors.title = 'Book title is required.';
    }
    if (selectedTestTypeIds.length === 0) {
      nextErrors.testTypeIds = 'Choose at least one Test Type.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        bookMode,
        title: trimmedTitle,
        subtitle: getString(subtitle) || undefined,
        authors: splitList(authors),
        publisher: getString(publisher) || undefined,
        edition: getString(edition) || undefined,
        series: getString(series) || undefined,
        isbn: getString(isbn) || undefined,
        coverUrl: getString(coverUrl) || undefined,
        testTypeIds: selectedTestTypeIds,
        tags: splitList(tags),
        description: getString(description) || undefined,
        visibility: toPublicVisibility(visibility),
      });
      resetForm();
    } catch {
      toast.error('Could not save Book. Please try again.');
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
        aria-label={title}
        onSubmit={handleSubmit}
      >
        <div className="create-book-modal__header">
          <h2 className="create-book-modal__title">{title}</h2>
          <button className="create-book-modal__button" type="button" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="create-book-modal__body">
          <fieldset className="create-book-modal__fieldset">
            <legend className="create-book-modal__legend">How would you like to create this Book?</legend>
            <div className="create-book-modal__radio-row">
              <label className="create-book-modal__choice">
                <input
                  type="radio"
                  name="book-mode"
                  checked={bookMode === 'materials'}
                  onChange={() => {
                    setBookMode('materials');
                    onModeSelect?.('materials');
                    setErrors((current) => ({ ...current, bookMode: '' }));
                  }}
                />
                Materials
              </label>
              <label className="create-book-modal__choice">
                <input
                  type="radio"
                  name="book-mode"
                  checked={bookMode === 'pdf'}
                  disabled={!pdfModeEnabled}
                  onChange={() => {
                    setBookMode('pdf');
                    onModeSelect?.('pdf');
                    setErrors((current) => ({ ...current, bookMode: '' }));
                  }}
                />
                PDF source
              </label>
            </div>
            {!pdfModeEnabled && (
              <p className="create-book-modal__error" role="status">PDF source creation is not available yet.</p>
            )}
            {errors.bookMode && <p className="create-book-modal__error">{errors.bookMode}</p>}
          </fieldset>

          {bookMode && (
            <>
              <div className="create-book-modal__grid">
                <label className="create-book-modal__field create-book-modal__field--wide">
                  Title
                  <input value={titleValue} onChange={(event) => setTitleValue(event.target.value)} />
                  {errors.title && <p className="create-book-modal__error">{errors.title}</p>}
                </label>

            <label className="create-book-modal__field">
              Subtitle
              <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
            </label>

            <label className="create-book-modal__field">
              Authors
              <input value={authors} onChange={(event) => setAuthors(event.target.value)} />
            </label>

            <label className="create-book-modal__field">
              Publisher
              <input value={publisher} onChange={(event) => setPublisher(event.target.value)} />
            </label>

            <label className="create-book-modal__field">
              Edition
              <input value={edition} onChange={(event) => setEdition(event.target.value)} />
            </label>

            <label className="create-book-modal__field">
              Series
              <input value={series} onChange={(event) => setSeries(event.target.value)} />
            </label>

            <label className="create-book-modal__field">
              ISBN
              <input value={isbn} onChange={(event) => setIsbn(event.target.value)} />
            </label>

            <label className="create-book-modal__field create-book-modal__field--wide">
              Cover URL
              <input value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} />
            </label>
              </div>

          <fieldset className="create-book-modal__fieldset">
            <legend className="create-book-modal__legend">Test Types</legend>
            <div className="create-book-modal__check-grid">
              {selectableTestTypes.map((testType) => {
                const testTypeId = String(testType.testTypeId);
                return (
                  <label key={testTypeId} className="create-book-modal__choice">
                    <input
                      type="checkbox"
                      checked={selectedTestTypeIds.includes(testTypeId)}
                      onChange={() => toggleTestType(testTypeId)}
                    />
                    {testType.label}
                  </label>
                );
              })}
            </div>
            {errors.testTypeIds && <p className="create-book-modal__error">{errors.testTypeIds}</p>}
          </fieldset>

          <fieldset className="create-book-modal__fieldset">
            <legend className="create-book-modal__legend">Visibility</legend>
            <div className="create-book-modal__radio-row">
              <label className="create-book-modal__choice">
                <input
                  type="radio"
                  name="book-visibility"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                Private
              </label>
              <label className="create-book-modal__choice">
                <input
                  type="radio"
                  name="book-visibility"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />
                Public
              </label>
            </div>
          </fieldset>

          <label className="create-book-modal__field">
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>

          <label className="create-book-modal__field">
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
            </>
          )}
        </div>

        <div className="create-book-modal__footer">
          <button className="create-book-modal__button" type="button" onClick={handleClose}>
            Cancel
          </button>
          {bookMode && (
            <button className="create-book-modal__button create-book-modal__button--primary" type="submit" disabled={saving}>
              Save Book
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default CreateBookModal;
