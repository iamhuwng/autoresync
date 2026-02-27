import React, { useState, useEffect } from 'react';
import { Modal } from '@mantine/core';
import EditQuizModal from './EditQuizModal';
import QuestionEditorPanel from './QuestionEditorPanel';
import PassageEditorPanel from './PassageEditorPanel';
import SingleQuestionCreator from './SingleQuestionCreator';
import BulkQuestionCreator from './BulkQuestionCreator';
import { database } from '../services/firebase';
import { ref, update } from 'firebase/database';
import { Button, Card } from './modern';

const QuizEditor = ({ quiz: propQuiz, show, handleClose }) => {
  // Create a default empty quiz for new quiz creation
  const defaultQuiz = {
    id: null,
    title: 'New Quiz',
    questions: [],
    version: 1,
    editHistory: [],
    passages: [],
  };

  // Use prop quiz if provided, otherwise use default for new quiz flow
  const quiz = propQuiz || defaultQuiz;
  const isNewQuiz = !propQuiz;

  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(null);
  const [selectedPassageIndex, setSelectedPassageIndex] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editMode, setEditMode] = useState('questions'); // 'questions' or 'passages'
  const [editedQuestions, setEditedQuestions] = useState({});
  const [modifiedQuestions, setModifiedQuestions] = useState(new Set());
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [showSingleCreator, setShowSingleCreator] = useState(false);
  const [showBulkCreator, setShowBulkCreator] = useState(false);
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [titleModified, setTitleModified] = useState(false);
  const [passages, setPassages] = useState([]);

  const getStorageKey = () => `quiz_edit_${quiz?.id || 'new'}`;

  // Extract passages from quiz (handles both Single Document Input and Wizard formats)
  const extractPassagesFromQuestions = () => {
    // 🔧 FIX: Check if passages exist at quiz root level (Single Document Input format)
    if (quiz?.passages && Array.isArray(quiz.passages) && quiz.passages.length > 0) {
      console.log('✅ Loading passages from quiz.passages (Single Document Input):', quiz.passages.length);
      return quiz.passages.map(p => ({
        id: p.id,
        title: p.title || '',
        content: p.content || '',
        type: p.type || 'text',
        ...(p.imageUrl && { imageUrl: p.imageUrl }),
        questionStart: p.questionStart || 1,
        questionEnd: p.questionEnd || quiz.questions.length
      }));
    }

    // Fallback: Extract passages embedded in questions (Wizard format)
    const passagesMap = {};
    quiz?.questions?.forEach((q) => {
      if (q.passage && q.passage.id) {
        if (!passagesMap[q.passage.id]) {
          passagesMap[q.passage.id] = {
            id: q.passage.id,
            title: q.passage.title || '',
            content: q.passage.content || '',
            type: q.passage.type || 'text',
            ...(q.passage.imageUrl && { imageUrl: q.passage.imageUrl }),
            questionStart: q.passage.questionStart || 1,
            questionEnd: q.passage.questionEnd || quiz.questions.length
          };
        }
      }
    });

    const extractedPassages = Object.values(passagesMap);
    if (extractedPassages.length > 0) {
      console.log('✅ Loading passages from question.passage (Wizard format):', extractedPassages.length);
    }
    return extractedPassages;
  };

  useEffect(() => {
    if (show) {
      const storageKey = getStorageKey();
      const savedData = localStorage.getItem(storageKey);

      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setEditedQuestions(parsed.questions || {});
          setModifiedQuestions(new Set(parsed.modified || []));
          setEditedTitle(parsed.title || quiz.title);
          setTitleModified(parsed.titleModified || false);
          // Load passages from localStorage if available, otherwise extract from questions
          setPassages(parsed.passages || extractPassagesFromQuestions());
        } catch (error) {
          console.error('Error loading from localStorage:', error);
          // If there's an error, start fresh
          localStorage.removeItem(storageKey);
          initializeFreshQuestions();
          setEditedTitle(quiz.title);
          setTitleModified(false);
          setPassages(extractPassagesFromQuestions());
        }
      } else {
        initializeFreshQuestions();
        setEditedTitle(quiz.title);
        setTitleModified(false);
        setPassages(extractPassagesFromQuestions());
      }

      // For NEW quiz (no questions), auto-show the Add Questions options
      if (isNewQuiz || (quiz.questions && quiz.questions.length === 0)) {
        setShowAddOptions(true);
      }
    }
  }, [propQuiz, show]);

  const initializeFreshQuestions = () => {
    const initial = {};
    quiz.questions.forEach((q, index) => {
      const normalized = {
        ...q,
        question: q.question || q.text || '',
        answer: q.answer || q.correctAnswer || '',
        type: q.type || 'multiple-choice',
        timer: q.timer || 10,
        points: q.points || 10
      };
      initial[index] = normalized;
    });
    setEditedQuestions(initial);
    setModifiedQuestions(new Set());
  };

  useEffect(() => {
    if (quiz && Object.keys(editedQuestions).length > 0) {
      const storageKey = getStorageKey();
      const dataToSave = {
        timestamp: new Date().toISOString(),
        questions: editedQuestions,
        modified: Array.from(modifiedQuestions),
        title: editedTitle,
        titleModified,
        passages
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    }
  }, [editedQuestions, modifiedQuestions, quiz, editedTitle, titleModified, passages]);

  useEffect(() => {
    if (selectedQuestionIndex !== null) {
      setShowEditor(true);
    } else {
      setShowEditor(false);
    }
  }, [selectedQuestionIndex]);

  const handleQuestionSelect = (index) => {
    setSelectedQuestionIndex(index);
  };

  const handleCloseEditor = () => {
    setSelectedQuestionIndex(null);
  };

  const handleQuestionUpdate = (index, updatedQuestion) => {
    setEditedQuestions(prev => ({
      ...prev,
      [index]: updatedQuestion
    }));
    setModifiedQuestions(prev => new Set([...prev, index]));
  };

  const handleResetQuestion = (index) => {
    if (window.confirm('Are you sure you want to reset this question to its original state?')) {
      const original = quiz.questions[index];
      setEditedQuestions(prev => ({
        ...prev,
        [index]: { ...original }
      }));
      setModifiedQuestions(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleSetAllTimers = (timerValue) => {
    const updatedQuestions = {};
    Object.keys(editedQuestions).forEach(index => {
      updatedQuestions[index] = {
        ...editedQuestions[index],
        timer: timerValue
      };
    });
    setEditedQuestions(updatedQuestions);
    setModifiedQuestions(new Set(Object.keys(editedQuestions).map(Number)));
  };

  const handleHideQuestion = (index) => {
    const question = editedQuestions[index] || quiz.questions[index];
    const updated = {
      ...question,
      hidden: !question.hidden
    };
    setEditedQuestions(prev => ({
      ...prev,
      [index]: updated
    }));
    setModifiedQuestions(prev => new Set([...prev, index]));
  };

  const handleDeleteQuestion = (index) => {
    // Remove from editedQuestions
    const newEditedQuestions = { ...editedQuestions };
    delete newEditedQuestions[index];

    // Reindex remaining questions
    const reindexed = {};
    let newIndex = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (i !== index) {
        reindexed[newIndex] = newEditedQuestions[i] || quiz.questions[i];
        newIndex++;
      }
    }

    setEditedQuestions(reindexed);
    setModifiedQuestions(new Set(Object.keys(reindexed).map(Number)));

    // Close editor if deleted question was selected
    if (selectedQuestionIndex === index) {
      setSelectedQuestionIndex(null);
    } else if (selectedQuestionIndex > index) {
      setSelectedQuestionIndex(selectedQuestionIndex - 1);
    }
  };

  const handleAddQuestion = () => {
    setShowAddOptions(true);
    setSelectedQuestionIndex(null);
    setShowEditor(false);
  };

  const handleSelectSingleQuestion = () => {
    setShowAddOptions(false);
    setShowSingleCreator(true);
    setShowEditor(true);
  };

  const handleSelectBulkQuestions = () => {
    setShowAddOptions(false);
    setShowBulkCreator(true);
    setShowEditor(true);
  };

  const handleCancelAdd = () => {
    setShowAddOptions(false);
    setShowSingleCreator(false);
    setShowBulkCreator(false);
    setShowEditor(false);
  };

  const handleSaveSingleQuestion = (newQuestion) => {
    // Add the new question to the end of the questions list
    const newIndex = Object.keys(editedQuestions).length;
    const updatedQuestions = {
      ...editedQuestions,
      [newIndex]: newQuestion
    };
    setEditedQuestions(updatedQuestions);
    setModifiedQuestions(new Set([...modifiedQuestions, newIndex]));

    // Close creator and select the new question
    setShowSingleCreator(false);
    setSelectedQuestionIndex(newIndex);
    setShowEditor(false);

    // Show question list again after a brief moment
    setTimeout(() => {
      setShowEditor(true);
    }, 100);
  };

  const handleSaveBulkQuestions = (newQuestions) => {
    if (!newQuestions || newQuestions.length === 0) return;

    // Add all new questions to the end of the questions list
    const startIndex = Object.keys(editedQuestions).length;
    const updatedQuestions = { ...editedQuestions };
    const newIndices = [];

    newQuestions.forEach((question, i) => {
      const index = startIndex + i;
      updatedQuestions[index] = {
        ...question,
        number: index + 1
      };
      newIndices.push(index);
    });

    setEditedQuestions(updatedQuestions);
    setModifiedQuestions(new Set([...modifiedQuestions, ...newIndices]));

    // Close creator and select the first new question
    setShowBulkCreator(false);
    setSelectedQuestionIndex(startIndex);
    setShowEditor(false);

    // Show question list again after a brief moment
    setTimeout(() => {
      setShowEditor(true);
    }, 100);
  };

  const handleTitleChange = (newTitle) => {
    setEditedTitle(newTitle);
    setTitleModified(true);
  };

  // Passage handlers
  const handlePassageSelect = (index) => {
    setSelectedPassageIndex(index);
    setShowEditor(true);
  };

  const handlePassageUpdate = (updatedPassage) => {
    const updated = [...passages];
    updated[selectedPassageIndex] = updatedPassage;
    setPassages(updated);
  };

  const handleAddPassage = () => {
    const newPassage = {
      id: `passage_${Date.now()}`,
      title: '',
      content: '',
      questionStart: 1,
      questionEnd: quiz.questions.length
    };
    setPassages([...passages, newPassage]);
    setSelectedPassageIndex(passages.length);
    setShowEditor(true);
  };

  const handleDeletePassage = (index) => {
    if (window.confirm('Are you sure you want to delete this passage? Questions will lose their passage reference.')) {
      const updated = passages.filter((_, i) => i !== index);
      setPassages(updated);
      if (selectedPassageIndex === index) {
        setSelectedPassageIndex(null);
        setShowEditor(false);
      } else if (selectedPassageIndex > index) {
        setSelectedPassageIndex(selectedPassageIndex - 1);
      }
    }
  };

  const handleClosePassageEditor = () => {
    setSelectedPassageIndex(null);
    setShowEditor(false);
  };

  const handlePreviousPassage = () => {
    if (selectedPassageIndex > 0) {
      setSelectedPassageIndex(selectedPassageIndex - 1);
    }
  };

  const handleNextPassage = () => {
    if (selectedPassageIndex < passages.length - 1) {
      setSelectedPassageIndex(selectedPassageIndex + 1);
    }
  };

  const handleEditModeToggle = (mode) => {
    setEditMode(mode);
    setShowEditor(false);
    setSelectedQuestionIndex(null);
    setSelectedPassageIndex(null);
  };

  const validateQuestions = () => {
    const errors = [];
    Object.entries(editedQuestions).forEach(([index, question]) => {
      const questionNum = parseInt(index) + 1;

      if (!question.question || question.question.trim() === '') {
        errors.push(`Question ${questionNum}: Question text is empty`);
      }

      if (question.options) {
        question.options.forEach((opt, optIndex) => {
          if (typeof opt === 'string' && (!opt || opt.trim() === '')) {
            errors.push(`Question ${questionNum}: Option ${String.fromCharCode(65 + optIndex)} is empty`);
          }
          else if (typeof opt === 'object' && opt !== null && !opt.text) {
            errors.push(`Question ${questionNum}: Option ${String.fromCharCode(65 + optIndex)} is missing text`);
          }
        });
      }

      // Validate answers based on question type
      if (question.type === 'matching') {
        // Matching questions support TWO formats:
        // 1. Grouped format: answers object
        // 2. Individual format (IELTS): answer string
        const hasGroupedAnswers = question.answers && typeof question.answers === 'object' && Object.keys(question.answers).length > 0;
        const hasIndividualAnswer = question.answer && typeof question.answer === 'string' && question.answer.trim() !== '';

        if (!hasGroupedAnswers && !hasIndividualAnswer) {
          errors.push(`Question ${questionNum}: Correct answer is not set`);
        }
      } else if (question.type === 'diagram-labeling') {
        // Diagram labeling questions have answers in labels array
        if (!question.labels || !Array.isArray(question.labels)) {
          errors.push(`Question ${questionNum}: Labels are not set`);
        } else {
          const hasEmptyAnswers = question.labels.some(label => !label.answer || label.answer.trim() === '');
          if (hasEmptyAnswers) {
            errors.push(`Question ${questionNum}: Some label answers are not set`);
          }
        }
      } else {
        // Standard answer validation for other question types
        if (!question.answer) {
          errors.push(`Question ${questionNum}: Correct answer is not set`);
        } else if (typeof question.answer === 'string' && question.answer.trim() === '') {
          errors.push(`Question ${questionNum}: Correct answer is not set`);
        } else if (Array.isArray(question.answer) && question.answer.length === 0) {
          errors.push(`Question ${questionNum}: Correct answer is not set`);
        }
      }
    });

    return errors;
  };

  const handleSave = () => {
    const errors = validateQuestions();

    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowValidationPopup(true);
      setPendingAction('save');
      return;
    }

    performSave();
  };

  const performSave = () => {
    if (quiz && quiz.id) {
      // If no changes were made, just close
      if (Object.keys(editedQuestions).length === 0 && !titleModified && passages.length === 0) {
        handleClose();
        return;
      }

      setIsSaving(true);

      const updates = {};

      // Build passage map first (if passages were modified)
      const passageMap = {}; // Maps question index to passage object
      if (passages.length > 0) {
        passages.forEach((passage) => {
          const passageObj = {
            id: passage.id,
            title: passage.title,
            content: passage.content,
            questionStart: passage.questionStart,
            questionEnd: passage.questionEnd,
            type: 'text'  // Required for PassageRenderer
          };

          // Map this passage to all questions in its range
          for (let i = passage.questionStart - 1; i < passage.questionEnd && i < quiz.questions.length; i++) {
            passageMap[i] = passageObj;
          }
        });
      }

      // Update questions (merge passage if applicable)
      Object.entries(editedQuestions).forEach(([index, question]) => {
        const questionIndex = parseInt(index);
        // If this question has a passage update, merge it
        if (passageMap[questionIndex]) {
          updates[`/quizzes/${quiz.id}/questions/${index}`] = {
            ...question,
            passage: passageMap[questionIndex]
          };
          delete passageMap[questionIndex]; // Mark as handled
        } else {
          updates[`/quizzes/${quiz.id}/questions/${index}`] = question;
        }
      });

      // Apply remaining passage updates (for questions not in editedQuestions)
      Object.entries(passageMap).forEach(([index, passageObj]) => {
        updates[`/quizzes/${quiz.id}/questions/${index}/passage`] = passageObj;
      });

      // Update title if modified
      if (titleModified) {
        updates[`/quizzes/${quiz.id}/title`] = editedTitle;
      }

      // 🔧 FIX: Save passages at quiz root level (for Single Document Input compatibility)
      if (passages.length > 0) {
        updates[`/quizzes/${quiz.id}/passages`] = passages.map(p => ({
          id: p.id,
          title: p.title,
          content: p.content,
          type: p.type || 'text',
          ...(p.imageUrl && { imageUrl: p.imageUrl }),
          questionStart: p.questionStart,
          questionEnd: p.questionEnd,
          wordCount: p.content?.trim().split(/\s+/).length || 0,
          createdAt: p.createdAt || new Date().toISOString()
        }));
      }

      // Track changes for edit history
      const changes = [];
      if (titleModified) changes.push('Title updated');
      if (Object.keys(editedQuestions).length > 0) changes.push(`${Object.keys(editedQuestions).length} question(s) modified`);
      if (passages.length > 0) changes.push('Passages updated');

      // Version tracking - increment version on save
      const currentVersion = quiz.version || 1;
      updates[`/quizzes/${quiz.id}/version`] = currentVersion + 1;
      updates[`/quizzes/${quiz.id}/lastEditedAt`] = Date.now();

      // Append to edit history (limit to last 10 entries)
      const existingHistory = quiz.editHistory || [];
      const newHistoryEntry = {
        timestamp: Date.now(),
        changes: changes.length > 0 ? changes : ['Minor edits'],
      };
      const updatedHistory = [...existingHistory, newHistoryEntry].slice(-10);
      updates[`/quizzes/${quiz.id}/editHistory`] = updatedHistory;

      update(ref(database), updates)
        .then(() => {
          localStorage.removeItem(getStorageKey());
          setModifiedQuestions(new Set());
          setTitleModified(false);
          setPassages([]);
          setIsSaving(false);
          setShowSaveSuccess(true);

          // Hide success checkmark after 2 seconds
          setTimeout(() => {
            setShowSaveSuccess(false);
          }, 2000);
        })
        .catch((error) => {
          console.error('Error saving quiz:', error);
          setIsSaving(false);
          alert('Error saving quiz. Please try again.');
        });
    } else {
      // No quiz ID, just close
      handleClose();
    }
  };

  const handleCloseAttempt = () => {
    // Check if there are actual changes by comparing editedQuestions with original quiz.questions
    const hasActualChanges = modifiedQuestions.size > 0 && Array.from(modifiedQuestions).some(index => {
      const edited = editedQuestions[index];
      const original = quiz.questions[index];
      return JSON.stringify(edited) !== JSON.stringify(original);
    });

    if (hasActualChanges || titleModified || passages.length > 0) {
      const errors = validateQuestions();

      // Only show validation popup if there are actual errors
      if (errors.length > 0) {
        setValidationErrors(errors);
        setShowValidationPopup(true);
        setPendingAction('close');
      } else {
        // No errors, just ask for discard confirmation
        if (window.confirm('You have unsaved changes. Discard changes and close?')) {
          localStorage.removeItem(getStorageKey());
          setModifiedQuestions(new Set());
          setTitleModified(false);
          setPassages([]);
          handleClose();
        }
      }
    } else {
      // No actual changes, just close
      localStorage.removeItem(getStorageKey());
      setModifiedQuestions(new Set());
      setTitleModified(false);
      setPassages([]);
      handleClose();
    }
  };

  const handleValidationAction = (action) => {
    setShowValidationPopup(false);

    if (action === 'continue') {
      setPendingAction(null);
    } else if (action === 'save') {
      performSave();
    } else if (action === 'discard') {
      localStorage.removeItem(getStorageKey());
      setModifiedQuestions(new Set());
      setTitleModified(false);
      setPassages([]);
      handleClose();
    }
  };

  if (!show) {
    return null;
  }

  return (
    <Modal
      opened={show}
      onClose={handleCloseAttempt}
      size="auto"
      withCloseButton={false}
      padding={0}
      styles={{
        body: {
          background: 'transparent',
        },
        content: {
          background: 'transparent',
          boxShadow: 'none',
        }
      }}
    >
      {/* Outer wrapper for vertical centering */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 0'
      }}>
        {/* Inner container for both modals with horizontal layout */}
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'flex-start'
        }}>
          <EditQuizModal
            quiz={quiz}
            editedQuestions={editedQuestions}
            onQuestionSelect={handleQuestionSelect}
            selectedQuestionIndex={selectedQuestionIndex}
            selectedPassageIndex={selectedPassageIndex}
            onSaveChanges={handleSave}
            onCancel={handleCloseAttempt}
            showEditor={showEditor}
            onSetAllTimers={handleSetAllTimers}
            onUpdateQuestionTimer={handleQuestionUpdate}
            onHideQuestion={handleHideQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            onAddQuestion={handleAddQuestion}
            isSaving={isSaving}
            showSaveSuccess={showSaveSuccess}
            onTitleChange={handleTitleChange}
            editedTitle={editedTitle}
            editMode={editMode}
            onEditModeToggle={handleEditModeToggle}
            passages={passages}
            onPassageSelect={handlePassageSelect}
            onAddPassage={handleAddPassage}
            onDeletePassage={handleDeletePassage}
            showAddOptions={showAddOptions}
            onSelectSingle={handleSelectSingleQuestion}
            onSelectBulk={handleSelectBulkQuestions}
            onCancelAdd={handleCancelAdd}
          />

          {/* Question Editor Panel */}
          {showEditor && editMode === 'questions' && selectedQuestionIndex !== null && !showSingleCreator && !showBulkCreator && (editedQuestions[selectedQuestionIndex] || quiz.questions[selectedQuestionIndex]) && (
            <Card
              variant="glass"
              hover={false}
              style={{
                width: '650px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                opacity: showEditor ? 1 : 0,
                transition: 'opacity 0.3s ease',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
              }}
            >
              <QuestionEditorPanel
                question={editedQuestions[selectedQuestionIndex] || quiz.questions[selectedQuestionIndex]}
                questionIndex={selectedQuestionIndex}
                totalQuestions={quiz.questions.length}
                onUpdate={handleQuestionUpdate}
                onClose={handleCloseEditor}
                onReset={handleResetQuestion}
                onPrevious={() => setSelectedQuestionIndex(Math.max(0, selectedQuestionIndex - 1))}
                onNext={() => setSelectedQuestionIndex(Math.min(quiz.questions.length - 1, selectedQuestionIndex + 1))}
                isFirst={selectedQuestionIndex === 0}
                isLast={selectedQuestionIndex === quiz.questions.length - 1}
              />
            </Card>
          )}

          {/* Single Question Creator Panel */}
          {showEditor && showSingleCreator && (
            <Card
              variant="glass"
              hover={false}
              style={{
                width: '650px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                transition: 'opacity 0.3s ease',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
              }}
            >
              <SingleQuestionCreator
                show={true}
                onClose={handleCancelAdd}
                onSave={handleSaveSingleQuestion}
                quizQuestionsLength={Object.keys(editedQuestions).length}
                passages={passages}
                inline={true}
              />
            </Card>
          )}

          {/* Bulk Question Creator Panel */}
          {showEditor && showBulkCreator && (
            <Card
              variant="glass"
              hover={false}
              style={{
                width: '650px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                transition: 'opacity 0.3s ease',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
              }}
            >
              <BulkQuestionCreator
                show={true}
                onClose={handleCancelAdd}
                onSave={handleSaveBulkQuestions}
                passages={passages}
                inline={true}
              />
            </Card>
          )}

          {/* Passage Editor Panel */}
          {showEditor && editMode === 'passages' && selectedPassageIndex !== null && passages[selectedPassageIndex] && (
            <Card
              variant="glass"
              hover={false}
              style={{
                width: '650px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                opacity: showEditor ? 1 : 0,
                transition: 'opacity 0.3s ease',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
              }}
            >
              <PassageEditorPanel
                passage={passages[selectedPassageIndex]}
                passageIndex={selectedPassageIndex}
                totalPassages={passages.length}
                onUpdate={handlePassageUpdate}
                onClose={handleClosePassageEditor}
                onPrevious={handlePreviousPassage}
                onNext={handleNextPassage}
                isFirst={selectedPassageIndex === 0}
                isLast={selectedPassageIndex === passages.length - 1}
                quizQuestionsLength={quiz.questions.length}
              />
            </Card>
          )}
        </div>
      </div>

      {/* Validation Popup */}
      <Modal
        opened={showValidationPopup}
        onClose={() => setShowValidationPopup(false)}
        size="lg"
        withCloseButton={false}
        padding={0}
        styles={{
          body: {
            padding: 0,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column'
          },
          content: {
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(254, 242, 242, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.15)',
            borderRadius: '1rem',
            overflow: 'visible',
            maxHeight: '90vh'
          }
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.08) 100%)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                Validation Issues
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.125rem' }}>
                {validationErrors.length} issue{validationErrors.length === 1 ? '' : 's'} found
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowValidationPopup(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#475569',
            marginBottom: '0.75rem'
          }}>
            Please fix the following issues before saving:
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxHeight: '300px',
            overflowY: 'auto',
            flex: 1
          }}>
            {validationErrors.map((error, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  background: 'rgba(254, 242, 242, 0.5)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(239, 68, 68, 0.1)'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" stroke="white" strokeWidth="2" />
                  <line x1="9" y1="9" x2="15" y2="15" stroke="white" strokeWidth="2" />
                </svg>
                <span style={{
                  fontSize: '0.875rem',
                  color: '#1e293b',
                  lineHeight: 1.5
                }}>
                  {error}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid rgba(239, 68, 68, 0.15)',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.03) 0%, rgba(220, 38, 38, 0.03) 100%)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem'
        }}>
          <Button variant="glass" onClick={() => handleValidationAction('continue')}>
            Continue Editing
          </Button>
          {pendingAction === 'save' && (
            <Button variant="primary" onClick={() => handleValidationAction('save')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              Save Anyway
            </Button>
          )}
          {pendingAction === 'close' && (
            <Button
              variant="glass"
              onClick={() => handleValidationAction('discard')}
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)',
                color: '#dc2626',
                fontWeight: 600
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Discard Changes
            </Button>
          )}
        </div>
      </Modal>
    </Modal>
  );
};

export default QuizEditor;