import { useEffect, useMemo, useState } from 'react';
import { get, ref, remove, set, update as updateDb } from 'firebase/database';
import { database } from '../../services/firebase';
import {
  createMaterialBooksRepository,
  type MaterialBooksRepository,
} from '../../services/materialCatalog/materialBooks.service';
import {
  resolveMaterialBookMode,
  type MaterialBookMetadata,
  type MaterialBookPublicProjection,
} from '../../types/materialCatalog.types';

export type BookEditorAccess = 'owner' | 'administrator' | 'public-readonly';

export type BookEditorModeResolution =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'resolved';
      readonly access: BookEditorAccess;
      readonly book: MaterialBookMetadata;
      readonly usePublicProjection: boolean;
    }
  | {
      readonly status: 'error';
      readonly title: 'Book failed to load' | 'Permission denied';
      readonly message: string;
    };

const INVALID_FIREBASE_KEY = /[.#$/[\]\u0000-\u001F\u007F]/u;

const isSafeBookId = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 256 && !INVALID_FIREBASE_KEY.test(trimmed);
};

const publicProjectionAsBook = (
  projection: MaterialBookPublicProjection,
): MaterialBookMetadata => ({
  bookId: projection.bookId,
  bookMode: resolveMaterialBookMode(projection.bookMode),
  ownerId: 'public-library',
  title: projection.title,
  subtitle: projection.subtitle,
  authors: projection.authors,
  publisher: projection.publisher,
  series: projection.series,
  coverUrl: projection.coverUrl,
  testTypeIds: projection.testTypeIds,
  tags: projection.tags,
  visibility: 'public-library-published',
  status: 'ready',
  createdAt: projection.approvedAt,
  updatedAt: projection.updatedAt,
  createdBy: projection.approvedBy,
  updatedBy: projection.approvedBy,
});

export const createFirebaseMaterialBooksRepository = (): MaterialBooksRepository =>
  createMaterialBooksRepository({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
    remove: async (path) => {
      await remove(ref(database, path));
    },
    update: async (payload) => {
      await updateDb(ref(database), payload);
    },
  });

const safeLoadError = (
  error: unknown,
): Extract<BookEditorModeResolution, { readonly status: 'error' }> => {
  const message = error instanceof Error ? error.message : '';

  if (/permission|denied|unauthorized/i.test(message)) {
    return {
      status: 'error',
      title: 'Permission denied',
      message: 'You do not have access to this Book.',
    };
  }

  if (/invalid material book mode/i.test(message)) {
    return {
      status: 'error',
      title: 'Book failed to load',
      message: 'This Book has an unsupported mode and cannot be opened safely.',
    };
  }

  return {
    status: 'error',
    title: 'Book failed to load',
    message: 'Unable to load this Book.',
  };
};

export const useBookEditorModeResolution = ({
  actorId,
  actorRole,
  bookId,
  repository,
}: {
  readonly actorId?: string;
  readonly actorRole?: string;
  readonly bookId: string | null;
  readonly repository?: MaterialBooksRepository;
}): BookEditorModeResolution => {
  const resolvedRepository = useMemo(
    () => repository ?? createFirebaseMaterialBooksRepository(),
    [repository],
  );
  const [keyedResolution, setKeyedResolution] = useState<{
    readonly bookId: string | null;
    readonly resolution: BookEditorModeResolution;
  }>({
    bookId: null,
    resolution: { status: 'idle' },
  });

  useEffect(() => {
    if (!bookId) {
      setKeyedResolution({
        bookId: null,
        resolution: { status: 'idle' },
      });
      return;
    }

    if (!isSafeBookId(bookId)) {
      setKeyedResolution({
        bookId,
        resolution: {
          status: 'error',
          title: 'Book failed to load',
          message: 'This Book link is invalid.',
        },
      });
      return;
    }

    if (!actorId) {
      setKeyedResolution({
        bookId,
        resolution: {
          status: 'error',
          title: 'Permission denied',
          message: 'Sign in before opening this Book.',
        },
      });
      return;
    }

    let cancelled = false;
    const requestedBookId = bookId.trim();
    setKeyedResolution({
      bookId: requestedBookId,
      resolution: { status: 'loading' },
    });

    const loadPublicProjection = async (): Promise<BookEditorModeResolution | null> => {
      const projection = await resolvedRepository.readPublicBookProjection?.(requestedBookId);

      if (!projection) {
        return null;
      }

      if (projection.bookId !== requestedBookId) {
        throw new Error('Public Book projection identity mismatch.');
      }

      return {
        status: 'resolved',
        access: 'public-readonly',
        book: publicProjectionAsBook(projection),
        usePublicProjection: true,
      };
    };

    const load = async (): Promise<BookEditorModeResolution> => {
      let rawBook: MaterialBookMetadata | null = null;
      let rawError: unknown;

      try {
        rawBook = await resolvedRepository.readBook(requestedBookId);
      } catch (error) {
        rawError = error;
      }

      if (rawBook) {
        if (rawBook.bookId !== requestedBookId) {
          throw new Error('Material Book identity mismatch.');
        }

        const book = {
          ...rawBook,
          bookMode: resolveMaterialBookMode(rawBook.bookMode),
        };

        if (book.ownerId === actorId) {
          return {
            status: 'resolved',
            access: 'owner',
            book,
            usePublicProjection: false,
          };
        }

        if (actorRole === 'super_admin') {
          return {
            status: 'resolved',
            access: 'administrator',
            book,
            usePublicProjection: false,
          };
        }
      }

      try {
        const publicResolution = await loadPublicProjection();
        if (publicResolution) {
          return publicResolution;
        }
      } catch (projectionError) {
        if (!rawError) {
          rawError = projectionError;
        }
      }

      if (rawBook || /permission|denied|unauthorized/i.test(
        rawError instanceof Error ? rawError.message : '',
      )) {
        return {
          status: 'error',
          title: 'Permission denied',
          message: 'You do not have access to this Book.',
        };
      }

      return {
        status: 'error',
        title: 'Book failed to load',
        message: 'Book not found.',
      };
    };

    void load()
      .then((nextResolution) => {
        if (!cancelled) {
          setKeyedResolution({
            bookId: requestedBookId,
            resolution: nextResolution,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setKeyedResolution({
            bookId: requestedBookId,
            resolution: safeLoadError(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [actorId, actorRole, bookId, resolvedRepository]);

  if (!bookId) {
    return { status: 'idle' };
  }

  return keyedResolution.bookId === bookId.trim()
    ? keyedResolution.resolution
    : { status: 'loading' };
};
