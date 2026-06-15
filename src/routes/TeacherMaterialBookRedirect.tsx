import { Navigate, useParams } from 'react-router-dom';
import { buildRoute } from '../constants/routes';

const TeacherMaterialBookRedirect = () => {
  const { bookId } = useParams<{ bookId: string }>();

  return (
    <Navigate
      to={buildRoute('LOBBY')}
      replace
      state={{
        teacherMaterialsOpenBookId: bookId,
        teacherMaterialsOpenBookSource: 'legacy-book-route',
      }}
    />
  );
};

export default TeacherMaterialBookRedirect;
