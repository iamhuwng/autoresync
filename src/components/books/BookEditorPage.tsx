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
  const bookId = initialBook?.bookId ?? routeBookId ?? '';

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
      <BookEditorWorkspace
        bookId={bookId}
        initialBook={initialBook}
        initialNodes={initialNodes}
        materialCandidates={materialCandidates}
        repository={repository}
        presentation="page-compat"
      />
    </div>
  );
};

export default BookEditorPage;
