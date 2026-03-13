// DEPRECATED: Quiz action handlers — moved from TeacherLobbyPage.jsx on 2026-03-12. See PRD-0033.

export const createMockQuiz = (database, push, ref) => {
  const mockQuiz = {
    title: 'Mock Quiz for Testing',
    questions: [
      {
        type: 'multiple-choice',
        question: 'What is 2 + 2?',
        options: ['3', '4', '5', '6'],
        answer: '4',
        timer: 10,
        points: 10
      },
      {
        type: 'multiple-choice',
        question: 'What is the capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        answer: 'Paris',
        timer: 15,
        points: 10
      }
    ]
  };
  const quizzesRef = ref(database, 'quizzes');
  push(quizzesRef, mockQuiz);
};

export const handleDelete = (database, ref, remove) => (id) => {
  if (window.confirm('Are you sure you want to delete this quiz?')) {
    const quizRef = ref(database, `quizzes/${id}`);
    remove(quizRef);
  }
};

export const handleEditQuiz = (setSelectedQuiz, setShowEditModal) => (quiz) => {
  setSelectedQuiz(quiz);
  setShowEditModal(true);
};

export const handleCloseEditModal = (setShowEditModal, setSelectedQuiz) => () => {
  setShowEditModal(false);
  setSelectedQuiz(null);
};
