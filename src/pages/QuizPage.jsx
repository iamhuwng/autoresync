import React from 'react';
import TeacherQuizPage from './TeacherQuizPage';
import StudentQuizPage from './StudentQuizPage';

const QuizPage = () => {
  const isAdmin = sessionStorage.getItem('isAdmin') === 'true';

  return isAdmin ? <TeacherQuizPage /> : <StudentQuizPage />;
};

export default QuizPage;
