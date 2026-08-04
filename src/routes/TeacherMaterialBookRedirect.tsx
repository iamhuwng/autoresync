import BookEditorPage from '../components/books/BookEditorPage';

/**
 * Compatibility route owner retained for stable imports.
 *
 * Book mode is resolved from the authorized stored record by BookEditorPage.
 * This wrapper must never redirect through location state: route state is not
 * an authority for either Book identity or mode.
 */
const TeacherMaterialBookRedirect = () => <BookEditorPage />;

export default TeacherMaterialBookRedirect;
