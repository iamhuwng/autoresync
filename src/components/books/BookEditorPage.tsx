import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { MaterialBooksRepository } from '../../services/materialCatalog/materialBooks.service';
import type { BookMaterialSummary } from '../../services/materialCatalog/bookEditor.service';
import type {
  MaterialBookMetadata,
  MaterialBookNode,
} from '../../types/materialCatalog.types';
import { TeacherHeader } from '../navigation';
import BookEditorWorkspace from './BookEditorWorkspace';
import BookMode2EditorShell from './BookMode2EditorShell';
import { useBookEditorModeResolution } from './useBookEditorModeResolution';
import './BookEditorPage.css';

interface BookEditorPageProps {
  readonly initialBook?: MaterialBookMetadata;
  readonly initialNodes?: readonly MaterialBookNode[];
  readonly materialCandidates?: readonly BookMaterialSummary[];
  readonly repository?: MaterialBooksRepository;
}

const BookEditorPage = ({
  initialBook,
  initialNodes,
  materialCandidates,
  repository,
}: BookEditorPageProps) => {
  const { bookId: routeBookId } = useParams<{ bookId: string }>();
  const { user, profile, logout } = useAuth();
  const bookId = routeBookId ?? initialBook?.bookId ?? '';
  const resolution = useBookEditorModeResolution({
    actorId: user?.uid,
    actorRole: profile?.role,
    bookId,
    repository,
  });

  const editor = (() => {
    if (resolution.status === 'idle' || resolution.status === 'loading') {
      return (
        <main className="book-editor-page__main" aria-busy="true">
          <p className="book-editor-page__status">Loading Book...</p>
        </main>
      );
    }

    if (resolution.status === 'error') {
      return (
        <main className="book-editor-page__main">
          <section className="book-editor-page__error" role="alert">
            <strong>{resolution.title}</strong>
            <p>{resolution.message}</p>
          </section>
        </main>
      );
    }

    if (resolution.book.bookMode === 'pdf') {
      return (
        <BookMode2EditorShell
          access={resolution.access}
          book={resolution.book}
          presentation="page-compat"
        />
      );
    }

    return (
      <BookEditorWorkspace
        bookId={bookId}
        initialBook={resolution.usePublicProjection ? undefined : resolution.book}
        initialNodes={resolution.usePublicProjection ? undefined : initialNodes}
        materialCandidates={materialCandidates}
        repository={repository}
        presentation="page-compat"
      />
    );
  })();

  return (
    <div className="book-editor-page">
      <TeacherHeader
        pageTitle="Book Editor"
        userId={user?.uid}
        userRole={profile?.role}
        userDisplayName={profile?.displayName || user?.displayName || user?.email}
        userEmail={profile?.email || user?.email}
        userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
        onLogout={() => {
          void logout?.();
        }}
      />
      {editor}
    </div>
  );
};

export default BookEditorPage;
