import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { database, firestore as db } from '../services/firebase';
import { ref, onValue, remove, push, update as dbUpdate } from 'firebase/database';
import { doc, deleteDoc, collection, getDocs, query, where, orderBy, setDoc } from 'firebase/firestore';
import queryOptimizer from '../services/firebaseQueryOptimizer';
import { AppShell, Modal, Select } from '@mantine/core';
import QuizEditor from '../components/QuizEditor.jsx';
import TestEditor from '../components/TestEditor.tsx';
import { useThemeContext } from '../context/ThemeContext.jsx';
import { Card, CardBody, CardFooter, Button, Input } from '../components/modern';
import { createSession, getSession } from '../services/sessionManager';
import { getClasses } from '../services/classManager';
import { TeacherHeader } from '../components/navigation';
import { AudioModeSelector } from '../components/test/AudioModeSelector';
// Test Creation Modal for new AI-powered test creation flow
import TestCreationModal from '../components/test-creation/TestCreationModal';
// Phase 3: THCS Homework Assignment Dialog (Task 2.1)
import { THCSHomeworkAssignDialog } from '../components/thcs-editor/THCSHomeworkAssignDialog';
// THCS Edit Test Modal (inline editing, same pattern as IELTS TestEditor)
import THCSTestEditorModal from '../components/thcs-editor/THCSTestEditorModal';

const TeacherLobbyPage = () => {
  const { navigateTo } = useNavigation('teacher');
  const { sessionCode } = useParams(); // Get session code from URL
  const { template } = useThemeContext();
  const { user, profile, logout } = useAuth(); // Get current authenticated user
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showEditTestModal, setShowEditTestModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [tests, setTests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('quiz'); // 'quiz', 'test', or 'material'
  const [contentFilter, setContentFilter] = useState('my'); // 'my' or 'public'
  const [contentLoading, setContentLoading] = useState(true); // Loading state for quizzes/tests
  const [sessionData, setSessionData] = useState(null); // Session data if in session mode
  const [sessionLoading, setSessionLoading] = useState(false); // Loading state for session
  const [sessionError, setSessionError] = useState(null); // Error state for session

  // Class Selection State
  const [classes, setClasses] = useState([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [pendingSession, setPendingSession] = useState(null); // { contentId, mode, isListening }
  const [selectedClassId, setSelectedClassId] = useState(null);

  // Audio Mode Selection State (PRD-0018)
  const [selectedAudioMode, setSelectedAudioMode] = useState(null);
  const [lastUsedAudioMode, setLastUsedAudioMode] = useState(null);
  const [showAudioModeError, setShowAudioModeError] = useState(false);

  // Exam Mode State (PRD-0018 Task 10.1) - disables student accommodations
  const [examMode, setExamMode] = useState(false);

  // Test Type Selection Modal State
  const [showTestTypeModal, setShowTestTypeModal] = useState(false);
  const [showTestCreationModal, setShowTestCreationModal] = useState(false);
  const navigate = useNavigate();

  // Phase 3: THCS Homework assign dialog state
  const [hwDialogTest, setHwDialogTest] = useState(null); // { id, title, metadata }

  // Phase 3 Task 4.1: Type filter for public library
  const [testTypeFilter, setTestTypeFilter] = useState('all'); // 'all' | 'IELTS' | 'THCS-THPT'
  const [thcsGradeFilter, setThcsGradeFilter] = useState('all'); // 'all' | '6' | '7' | ... | '12'
  const [thcsExamTypeFilter, setThcsExamTypeFilter] = useState('all'); // 'all' | 'Giữa Kì' | 'Cuối Kì' | 'Kiểm Tra'
  const [thcsLibraryTests, setThcsLibraryTests] = useState([]); // Tests from thcs_library/ Firestore
  const [thcsLibraryLoading, setThcsLibraryLoading] = useState(false);

  // Phase 3 Task 4.4: Use-as-is confirmation modal
  const [useAsIsTest, setUseAsIsTest] = useState(null); // test object for use-as-is modal

  // THCS Edit Test Modal state
  const [showThcsEditModal, setShowThcsEditModal] = useState(false);
  const [selectedThcsTest, setSelectedThcsTest] = useState(null);

  // Load last used audio mode from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('lastUsedAudioMode');
    if (savedMode === 'online' || savedMode === 'offline') {
      setLastUsedAudioMode(savedMode);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      sessionStorage.removeItem('isAdmin');
      navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Load classes for selection
  useEffect(() => {
    console.log('📚 [TeacherLobby] Classes useEffect triggered');
    let isSubscribed = true;

    if (user?.uid) {
      const loadClasses = async () => {
        // Super admins see ALL classes, teachers see only their own
        const filterTeacherId = profile?.role === 'super_admin' ? undefined : user.uid;
        console.log('📚 [TeacherLobby] Loading classes for user:', user.uid, '(filter:', filterTeacherId || 'ALL', ')');
        try {
          const classList = await getClasses(filterTeacherId);
          if (isSubscribed) {
            console.log('📚 [TeacherLobby] Classes loaded:', classList.length);
            // Null safety for class name/code
            setClasses(classList.map(c => ({
              value: c.id,
              label: `${c.name || 'Unnamed'} (${c.classCode || 'N/A'})`
            })));
          }
        } catch (error) {
          console.error('📚 [TeacherLobby] ERROR loading classes:', error);
        }
      };
      loadClasses();
    }

    return () => {
      isSubscribed = false;
    };
  }, [user, profile]);

  // Load session data if sessionCode exists - with real-time updates
  useEffect(() => {
    if (sessionCode) {
      setSessionLoading(true);
      setSessionError(null);
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);

      // Subscribe to real-time updates
      const unsubscribe = onValue(sessionRef, (snapshot) => {
        const session = snapshot.val();
        setSessionLoading(false);
        if (session) {
          setSessionData(session);
          setSessionError(null);
          setCurrentView(session.mode); // Set view based on session mode
        } else {
          // Only redirect if a sessionCode was explicitly provided but not found
          // Don't redirect if just accessing lobby without a session
          console.error('Session not found:', sessionCode);
          setSessionError('Session not found or has expired');
          // Give user time to see error before redirect
          setTimeout(() => {
            navigateTo('SESSIONS', {}, { reason: 'lobby_session_not_found', replace: true });
          }, 2000);
        }
      }, (error) => {
        // Handle Firebase errors
        console.error('Firebase error loading session:', error);
        setSessionLoading(false);
        setSessionError('Failed to load session. Please try again.');
      });

      // Cleanup listener on unmount
      return () => unsubscribe();
    } else {
      // No session code in URL - clear any existing session data
      setSessionData(null);
      setSessionLoading(false);
      setSessionError(null);
    }
  }, [sessionCode, navigateTo]);

  // Load data based on current view
  useEffect(() => {
    console.log(`🔄 [TeacherLobby] View changed to: ${currentView}`);
    let unsubscribe = null;
    let isSubscribed = true;
    let skipFirstCall = true; // Prevent immediate cache invalidation

    const loadData = async () => {
      setContentLoading(true);

      try {
        if (currentView === 'quiz') {
          // Load Quizzes
          console.log('🎮 [TeacherLobby] Loading quizzes...');

          // Initial fetch with cache
          const quizList = await queryOptimizer.getAllQuizzes();
          if (isSubscribed) {
            setQuizzes(quizList);
            setContentLoading(false);
          }

          // Real-time subscription
          const quizzesRef = ref(database, 'quizzes');
          unsubscribe = onValue(quizzesRef, (snapshot) => {
            if (!isSubscribed) return;

            // Skip first call (onValue fires immediately with current data)
            if (skipFirstCall) {
              skipFirstCall = false;
              console.log('🎮 [REALTIME] Skipping first quiz listener call (already have data)');
              return;
            }

            const data = snapshot.val();
            const list = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            console.log('🎮 [REALTIME] Quizzes updated:', list.length);
            setQuizzes(list);
            setContentLoading(false);

            // Only invalidate cache on actual updates
            queryOptimizer.invalidate('quiz', 'all');
          }, (error) => {
            // Check if error is due to logout (permission denied is expected after logout)
            if (error.code === 'PERMISSION_DENIED' && !user) {
              console.log('🔒 [REALTIME] Quiz listener stopped (user logged out)');
              return; // Silent fail - user is logging out
            }
            console.error('Error loading quizzes:', error);
            if (isSubscribed) setContentLoading(false);
          });

        } else if (currentView === 'test') {
          // Load Tests
          console.log('📝 [TeacherLobby] Loading tests...');

          // Initial fetch with cache
          const testList = await queryOptimizer.getAllTests();
          if (isSubscribed) {
            setTests(testList);
            setContentLoading(false);
          }

          // Real-time subscription
          const testsRef = ref(database, 'tests');
          unsubscribe = onValue(testsRef, (snapshot) => {
            if (!isSubscribed) return;

            // Skip first call (onValue fires immediately with current data)
            if (skipFirstCall) {
              skipFirstCall = false;
              console.log('📝 [REALTIME] Skipping first test listener call (already have data)');
              return;
            }

            const data = snapshot.val();
            const list = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            console.log('📝 [REALTIME] Tests updated:', list.length);
            setTests(list);
            setContentLoading(false);

            // Only invalidate cache on actual updates
            queryOptimizer.invalidate('test', 'all');
          }, (error) => {
            // Check if error is due to logout (permission denied is expected after logout)
            if (error.code === 'PERMISSION_DENIED' && !user) {
              console.log('🔒 [REALTIME] Test listener stopped (user logged out)');
              return; // Silent fail - user is logging out
            }
            console.error('Error loading tests:', error);
            if (isSubscribed) setContentLoading(false);
          });
        } else {
          // Material view or other - no heavy load needed yet
          setContentLoading(false);
        }
      } catch (error) {
        console.error('Error in data loading:', error);
        if (isSubscribed) setContentLoading(false);
      }
    };

    loadData();

    return () => {
      isSubscribed = false;
      if (unsubscribe) unsubscribe();
    };
  }, [currentView]);

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this quiz?')) {
      const quizRef = ref(database, `quizzes/${id}`);
      remove(quizRef);
    }
  };

  const handleDeleteTest = async (test) => {
    const isThcs = test.testType === 'THCS-THPT';
    const testTitle = isThcs ? test.metadata?.title : test.title;
    if (window.confirm(`Are you sure you want to delete "${testTitle || 'this test'}"?`)) {
      const testRef = ref(database, `tests/${test.id}`);
      remove(testRef);
      // PRD-0027: Clean up Firestore thcs_library and draft if THCS test
      if (isThcs) {
        try {
          await deleteDoc(doc(db, 'thcs_library', test.id));
        } catch { }
        if (test.sourceDraftId) {
          try {
            await deleteDoc(doc(db, 'thcs_drafts', test.sourceDraftId));
          } catch { }
        }
      }
    }
  };

  const handleTogglePublic = async (id, currentIsPublic, type = 'test') => {
    try {
      const itemRef = ref(database, `${type}s/${id}`);
      await dbUpdate(itemRef, {
        isPublic: !currentIsPublic,
        updatedAt: Date.now()
      });
      console.log(`✅ ${type} ${id} isPublic toggled to ${!currentIsPublic}`);
    } catch (error) {
      console.error(`❌ Error toggling isPublic for ${type}:`, error);
      alert(`Failed to update ${type}. Please try again.`);
    }
  };

  const handleEditQuiz = (quiz) => {
    setSelectedQuiz(quiz);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedQuiz(null); // Clear selected quiz to ensure fresh data on next open
  };

  const handleEditTest = (test) => {
    // PRD-0027: THCS-THPT tests open the inline THCS Edit Test Modal
    if (test.testType === 'THCS-THPT') {
      setSelectedThcsTest(test);
      setShowThcsEditModal(true);
      return;
    }
    setSelectedTest(test);
    setShowEditTestModal(true);
  };

  const handleCloseThcsEditModal = () => {
    setShowThcsEditModal(false);
    setSelectedThcsTest(null);
    // Reload tests to reflect any saved changes
    loadData();
  };

  const handleCloseEditTestModal = () => {
    setShowEditTestModal(false);
    setSelectedTest(null); // Clear selected test to ensure fresh data on next open
  };


  const createMockQuiz = () => {
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

  const handleStartSession = async (contentId, mode) => {
    console.log(`🚀 handleStartSession triggered: contentId=${contentId}, mode=${mode}`);
    // If already in a session, just update it (no class selection needed)
    if (sessionCode) {
      console.log(`ℹ️ Existing session detected (${sessionCode}). Updating content only.`);
      try {
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const updateData = mode === 'test'
          ? { testId: contentId, mode: 'test', quizId: null }
          : { quizId: contentId, mode: 'quiz', testId: null };

        await dbUpdate(sessionRef, updateData);
        console.log(`✅ Session ${sessionCode} updated: mode=${mode}, contentId=${contentId}`);

        if (mode === 'test') {
          navigateTo('TEACHER_TEST_MONITOR', { sessionCode }, { reason: 'teacher_start_test' });
        } else {
          navigateTo('TEACHER_WAITING', { gameSessionId: sessionCode }, { reason: 'teacher_start_quiz' });
        }
      } catch (error) {
        console.error(`❌ Error starting ${mode}:`, error);
        alert(`Failed to start ${mode}. Please try again.`);
      }
      return;
    }

    // If starting new session, open modal to select class
    console.log('🆕 Starting NEW session. Opening class selection modal.');
    console.log('Current classes available:', classes);

    // Check if this is a listening test
    const test = tests.find(t => t.id === contentId);
    const isListeningTest = mode === 'test' && test?.skill === 'Listening';

    setPendingSession({ contentId, mode, isListening: isListeningTest });
    setSelectedClassId(null); // Reset selection
    setSelectedAudioMode(null); // Reset audio mode
    setShowAudioModeError(false);
    setShowClassModal(true);
  };

  const confirmStartSession = async () => {
    if (!pendingSession) return;

    const { contentId, mode, isListening } = pendingSession;

    // Validate audio mode for listening tests
    if (isListening && !selectedAudioMode) {
      setShowAudioModeError(true);
      console.log('⚠️ Audio mode required for listening test');
      return;
    }

    console.log(`✅ Confirming start session. ClassId: ${selectedClassId || 'None (Standalone)'}, AudioMode: ${selectedAudioMode || 'N/A'}`);
    setShowClassModal(false);

    // Save audio mode preference for next time
    if (isListening && selectedAudioMode) {
      localStorage.setItem('lastUsedAudioMode', selectedAudioMode);
      setLastUsedAudioMode(selectedAudioMode);
    }

    try {
      // Create new session with optional classId and audioMode for listening tests
      const newSessionData = mode === 'test'
        ? {
          testId: contentId,
          mode: 'test',
          classId: selectedClassId,
          createdBy: user?.uid, // FIX: Add user UID for session ownership tracking
          // Include settings for listening tests (PRD-0018)
          ...(isListening && {
            settings: {
              audioMode: selectedAudioMode || 'online',
              // PRD-0018 Task 10.2: Save examMode to Firebase
              examMode: examMode,
            }
          }),
          // Include examMode for non-listening tests too
          ...(!isListening && examMode && {
            settings: {
              examMode: examMode,
            }
          })
        }
        : { quizId: contentId, mode: 'quiz', classId: selectedClassId, createdBy: user?.uid };

      const result = await createSession(newSessionData);

      if (result.success) {
        console.log(`✅ ${mode === 'test' ? 'Test' : 'Quiz'} session created with code: ${result.sessionCode}`);
        if (mode === 'test') {
          navigateTo('TEACHER_TEST_MONITOR', { sessionCode: result.sessionCode }, { reason: 'teacher_new_test_session' });
        } else {
          navigateTo('TEACHER_WAITING', { gameSessionId: result.sessionCode }, { reason: 'teacher_new_quiz_session' });
        }
      } else {
        console.error(`❌ Failed to create ${mode} session`);
        alert(`Failed to create ${mode} session. Please try again.`);
      }
    } catch (error) {
      console.error(`❌ Error starting ${mode}:`, error);
      alert(`Failed to start ${mode}. Please try again.`);
    }
  };

  // Memoized filter function to avoid recalculation on every render
  const filterByOwnership = useCallback((items, itemType) => {
    if (!user) {
      return items;
    }

    // Super admins see ALL content when "My Content" is selected
    if (profile?.role === 'super_admin' && contentFilter === 'my') {
      return items; // No filtering - show everything
    }

    if (contentFilter === 'my') {
      // Show content owned by current user OR content without ownership info (legacy)
      return items.filter(item => {
        const hasOwnership = item.ownerId || item.createdBy;
        const isOwned = item.ownerId === user.uid || item.createdBy === user.uid;
        // Include if: owned by user OR has no ownership info (legacy content)
        return isOwned || !hasOwnership;
      });
    } else {
      // Show only public content (not owned by current user)
      return items.filter(item => item.isPublic === true && item.ownerId !== user.uid);
    }
  }, [user, profile, contentFilter]);

  // Memoize filtered results to prevent recalculation on every render
  const filteredQuizzes = useMemo(() => {
    const ownershipFiltered = filterByOwnership(quizzes, 'quizzes');
    const searchFiltered = ownershipFiltered.filter(quiz =>
      quiz.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return searchFiltered;
  }, [quizzes, filterByOwnership, searchTerm]);

  const filteredTests = useMemo(() => {
    const ownershipFiltered = filterByOwnership(tests, 'tests');
    let searchFiltered = ownershipFiltered.filter(test => {
      // THCS-THPT tests have title inside metadata
      const title = test.testType === 'THCS-THPT' ? test.metadata?.title : test.title;
      return (title || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    // Phase 3 Task 4.1: Apply type filter only in public library mode
    if (contentFilter === 'public' && testTypeFilter !== 'all') {
      if (testTypeFilter === 'THCS-THPT') {
        searchFiltered = searchFiltered.filter(t => t.testType === 'THCS-THPT');
        // Apply grade sub-filter
        if (thcsGradeFilter !== 'all') {
          const grade = parseInt(thcsGradeFilter, 10);
          searchFiltered = searchFiltered.filter(t => t.metadata?.gradeLevel === grade);
        }
        // Apply exam type sub-filter
        if (thcsExamTypeFilter !== 'all') {
          searchFiltered = searchFiltered.filter(t => t.metadata?.examType === thcsExamTypeFilter);
        }
      } else if (testTypeFilter === 'IELTS') {
        searchFiltered = searchFiltered.filter(t => t.testType !== 'THCS-THPT');
      }
    }

    // Phase 3 Task 4.2: Sort by publishedAt (newest first) in public library
    if (contentFilter === 'public') {
      searchFiltered.sort((a, b) => {
        const aDate = a.publishedAt || a.createdAt || 0;
        const bDate = b.publishedAt || b.createdAt || 0;
        return bDate - aDate; // newest first
      });
    }

    return searchFiltered;
  }, [tests, filterByOwnership, searchTerm, contentFilter, testTypeFilter, thcsGradeFilter, thcsExamTypeFilter]);

  const renderQuizCard = (quiz, index) => {
    const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
    const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
    const variant = variants[index % variants.length];

    const isOwner = user && (quiz.ownerId === user.uid || quiz.createdBy === user.uid || (!quiz.ownerId && !quiz.createdBy));
    const isAdmin = profile?.role === 'super_admin';
    const canEdit = isOwner || isAdmin;

    return (
      <Card
        key={quiz.id}
        variant={variant}
        hover
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`
        }}
      >
        <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '700',
              marginBottom: '0.5rem',
              color: '#1e293b'
            }}>
              {quiz.title}
            </h3>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.25rem 0.75rem',
              background: 'rgba(255, 255, 255, 0.5)',
              borderRadius: '9999px',
              fontSize: '0.8125rem',
              fontWeight: '600',
              color: '#64748b'
            }}>
              {questionCount} question{questionCount === 1 ? '' : 's'}
            </div>
          </div>
        </CardBody>

        <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            variant="glass"
            size="sm"
            onClick={() => handleEditQuiz(quiz)}
            style={{ flex: '1 1 auto' }}
          >
            {canEdit ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
            {canEdit ? 'Edit' : 'View Only'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => canEdit && handleDelete(quiz.id)}
            disabled={!canEdit}
            style={{ flex: '1 1 auto', opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Delete
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleStartSession(quiz.id, 'quiz')}
            style={{ flex: '1 1 100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
              <path d="M8 5v14l11-7z" />
            </svg>
            Start Quiz
          </Button>
        </CardFooter>
      </Card>
    );
  };
  // PRD-0027: THCS-THPT test card renderer
  const renderThcsTestCard = (test, index) => {
    const meta = test.metadata || {};
    const isOwner = user && (test.ownerId === user.uid || test.createdBy === user.uid);
    const isAdmin = profile?.role === 'super_admin';
    const canEdit = isOwner || isAdmin;

    // Phase 3 Task 4.3: Different card for public library
    const isPublicLibrary = contentFilter === 'public';

    // Rotate color variants like IELTS cards instead of hardcoded lavender
    const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
    const variant = variants[index % variants.length];

    return (
      <Card
        key={test.id}
        variant={variant}
        hover
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`,
          ...(isPublicLibrary && { borderLeft: '4px solid #7c3aed' }),
        }}
      >
        <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h3
                title={meta.title || 'Untitled THCS Test'}
                style={{
                  fontSize: '1.25rem', fontWeight: '700', color: '#1e293b',
                  margin: 0, flex: 1,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: '1.4',
                }}
              >
                {meta.title || 'Untitled THCS Test'}
              </h3>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0.125rem 0.5rem',
                background: 'rgba(139, 92, 246, 0.15)',
                borderRadius: '9999px',
                fontSize: '0.6875rem', fontWeight: '700', color: '#7c3aed',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                THCS-THPT
              </span>
            </div>
            {/* Task 4.3: Show author in public library mode */}
            {isPublicLibrary && (
              <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                by {test.ownerName || 'Teacher'}
              </div>
            )}
            {/* Consolidated badges: 2 rows max (matching IELTS card style) */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0.25rem 0.75rem',
                background: 'rgba(255,255,255,0.5)', borderRadius: '9999px',
                fontSize: '0.8125rem', fontWeight: '600', color: '#64748b',
              }}>
                {test.questionCount || 0} question{(test.questionCount || 0) === 1 ? '' : 's'}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0.25rem 0.75rem',
                background: 'rgba(139, 92, 246, 0.1)', borderRadius: '9999px',
                fontSize: '0.8125rem', fontWeight: '600', color: '#8b5cf6',
              }}>
                Grade {meta.gradeLevel}{meta.examType ? ` · ${meta.examType}` : ''}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0.25rem 0.75rem',
                background: 'rgba(34, 197, 94, 0.1)', borderRadius: '9999px',
                fontSize: '0.8125rem', fontWeight: '600', color: '#16a34a',
              }}>
                {meta.duration || 45} min
              </div>
            </div>
          </div>
        </CardBody>

        <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          {isPublicLibrary ? (
            /* Task 4.3: Public library — Use as-is + Clone & Customize */
            <>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setUseAsIsTest(test)}
                style={{ flex: '1 1 auto', color: '#7c3aed', borderColor: 'rgba(139, 92, 246, 0.3)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Use as-is
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  try {
                    const { cloneFromPublicTest } = await import('../services/thcsDraftService');
                    const result = await cloneFromPublicTest(test.id, user.uid);
                    if (result.success && result.data) {
                      navigate(`/teacher/thcs-test/edit/${result.data.draftId}`);
                    }
                  } catch (err) {
                    console.error('Clone failed:', err);
                  }
                }}
                style={{ flex: '1 1 auto' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
                Clone & Customize
              </Button>
            </>
          ) : (
            /* My Content — Edit, Delete on row 1; Start Test + Assign HW on row 2 */
            <>
              <Button
                variant="glass"
                size="sm"
                onClick={() => handleEditTest(test)}
                style={{ flex: '1 1 auto' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {canEdit ? 'Edit' : 'View'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => canEdit && handleDeleteTest(test)}
                disabled={!canEdit}
                style={{ flex: '1 1 auto', opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
                Delete
              </Button>
              {/* Row 2: Start Test + Assign HW side-by-side */}
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleStartSession(test.id, 'test')}
                style={{ flex: '1 1 45%' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start Test
              </Button>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setHwDialogTest(test)}
                style={{ flex: '1 1 45%', color: '#7c3aed', borderColor: 'rgba(139, 92, 246, 0.3)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                Assign HW
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    );
  };

  const renderTestCard = (test, index) => {
    // PRD-0027: Handle THCS-THPT test type with different data structure
    const isThcsTest = test.testType === 'THCS-THPT';
    if (isThcsTest) {
      return renderThcsTestCard(test, index);
    }

    const questionCount = test.questionCount || 0;
    const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
    const variant = variants[index % variants.length];

    // Check if test is incomplete (missing answer keys)
    const isIncomplete = test.isComplete === false;
    const missingCount = test.missingAnswerCount || 0;

    const isOwner = user && (test.ownerId === user.uid || test.createdBy === user.uid || (!test.ownerId && !test.createdBy));
    const isAdmin = profile?.role === 'super_admin';
    const canEdit = isOwner || isAdmin;

    return (
      <Card
        key={test.id}
        variant={isIncomplete ? 'glass' : variant}
        hover={!isIncomplete}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`,
          ...(isIncomplete && {
            opacity: 0.7,
            filter: 'grayscale(40%)',
            border: '2px dashed rgba(251, 191, 36, 0.5)',
          })
        }}
      >
        <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: isIncomplete ? '#94a3b8' : '#1e293b',
                margin: 0,
              }}>
                {test.title}
              </h3>
              {isIncomplete && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.125rem 0.5rem',
                  background: 'rgba(251, 191, 36, 0.15)',
                  borderRadius: '9999px',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  color: '#b45309',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                }}>
                  ⚠️ Incomplete
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.25rem 0.75rem',
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '9999px',
                fontSize: '0.8125rem',
                fontWeight: '600',
                color: '#64748b'
              }}>
                {questionCount} question{questionCount === 1 ? '' : 's'}
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.25rem 0.75rem',
                background: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '9999px',
                fontSize: '0.8125rem',
                fontWeight: '600',
                color: '#8b5cf6'
              }}>
                {test.type} - {test.skill}
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.25rem 0.75rem',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: '9999px',
                fontSize: '0.8125rem',
                fontWeight: '600',
                color: '#16a34a'
              }}>
                {test.duration} min
              </div>
              {isIncomplete && missingCount > 0 && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.25rem 0.75rem',
                  background: 'rgba(251, 191, 36, 0.15)',
                  borderRadius: '9999px',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  color: '#b45309'
                }}>
                  {missingCount} missing answer{missingCount === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </div>
        </CardBody>

        <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            variant="glass"
            size="sm"
            onClick={() => handleEditTest(test)}
            style={{ flex: '1 1 auto' }}
          >
            {canEdit ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
            {canEdit ? (isIncomplete ? 'Complete' : 'Edit') : 'View Only'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => canEdit && handleDeleteTest(test)}
            disabled={!canEdit}
            style={{ flex: '1 1 auto', opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Delete
          </Button>
          <Button
            variant={isIncomplete ? 'glass' : 'primary'}
            size="sm"
            onClick={() => !isIncomplete && handleStartSession(test.id, 'test')}
            disabled={isIncomplete}
            style={{
              flex: '1 1 100%',
              ...(isIncomplete && {
                opacity: 0.5,
                cursor: 'not-allowed',
              })
            }}
            title={isIncomplete ? 'Complete the test first by adding missing answer keys' : 'Start test session'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
              <path d="M8 5v14l11-7z" />
            </svg>
            {isIncomplete ? 'Cannot Start (Incomplete)' : 'Start Test'}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <AppShell padding="md">
        {/* Unified Teacher Header with Navigation */}
        <TeacherHeader
          pageTitle="Materials"
          userId={user?.uid}
          userRole={profile?.role}
          onLogout={handleLogout}
        />

        <AppShell.Main>
          {/* Session Loading State */}
          {sessionCode && sessionLoading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '50vh',
              gap: '1rem'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '4px solid rgba(139, 92, 246, 0.2)',
                borderTop: '4px solid #8b5cf6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <p style={{ color: '#64748b', fontSize: '1rem' }}>Loading session {sessionCode}...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Session Error State */}
          {sessionCode && sessionError && !sessionLoading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '50vh',
              gap: '1rem'
            }}>
              <div style={{ fontSize: '3rem' }}>⚠️</div>
              <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 600 }}>{sessionError}</h2>
              <p style={{ color: '#64748b' }}>Redirecting to session management...</p>
            </div>
          )}

          {/* Main Content - Only show when not loading and no error (or no sessionCode) */}
          {(!sessionCode || (!sessionLoading && !sessionError)) && (
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
              {/* Page Header with Tabs */}
              <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
                <h1 style={{
                  fontSize: '2.5rem',
                  fontWeight: '800',
                  marginBottom: '0.5rem',
                  color: '#1e293b'
                }}>
                  {currentView === 'quiz' ? 'Quiz Dashboard' : currentView === 'test' ? 'Test Dashboard' : 'Material Library'}
                </h1>
                <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                  {currentView === 'quiz'
                    ? 'Manage your quizzes and start new game sessions'
                    : currentView === 'test'
                      ? 'Manage your tests and start formal assessment sessions'
                      : 'Browse and manage your material library'}
                </p>

                {/* Mode Tabs - Switch freely between quiz/test */}
                <div style={{
                  display: 'inline-flex',
                  gap: '0.25rem'
                }}>
                  <Button
                    variant={currentView === 'quiz' ? 'primary' : 'glass'}
                    size="md"
                    onClick={() => setCurrentView('quiz')}
                    style={{
                      minWidth: '120px'
                    }}
                  >
                    🎮 Quiz Mode
                  </Button>
                  <Button
                    variant={currentView === 'test' ? 'primary' : 'glass'}
                    size="md"
                    onClick={() => setCurrentView('test')}
                    style={{
                      minWidth: '120px'
                    }}
                  >
                    📝 Test Mode
                  </Button>
                </div>

                {/* Content Filter Tabs - Only show for quiz/test views */}
                {(currentView === 'quiz' || currentView === 'test') && (
                  <div style={{
                    display: 'inline-flex',
                    gap: '0.25rem',
                    marginTop: '1rem'
                  }}>
                    <Button
                      variant={contentFilter === 'my' ? 'primary' : 'glass'}
                      size="sm"
                      onClick={() => setContentFilter('my')}
                      style={{
                        minWidth: '100px'
                      }}
                    >
                      📁 My Content
                    </Button>
                    <Button
                      variant={contentFilter === 'public' ? 'primary' : 'glass'}
                      size="sm"
                      onClick={() => setContentFilter('public')}
                      style={{
                        minWidth: '100px'
                      }}
                    >
                      🌐 Public Library
                    </Button>
                  </div>
                )}

                {/* Phase 3 Task 4.1: Type Filter for Public Library */}
                {contentFilter === 'public' && currentView === 'test' && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: 'rgba(99, 102, 241, 0.04)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(99, 102, 241, 0.1)',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#6366f1', marginRight: '0.25rem' }}>Filter:</span>
                    <Select
                      size="xs"
                      value={testTypeFilter}
                      onChange={(v) => { setTestTypeFilter(v || 'all'); if (v !== 'THCS-THPT') { setThcsGradeFilter('all'); setThcsExamTypeFilter('all'); } }}
                      data={[
                        { value: 'all', label: '📚 All Types' },
                        { value: 'IELTS', label: '🌐 IELTS' },
                        { value: 'THCS-THPT', label: '🇻🇳 THCS-THPT' },
                      ]}
                      style={{ minWidth: '140px' }}
                    />
                    {testTypeFilter === 'THCS-THPT' && (
                      <>
                        <Select
                          size="xs"
                          value={thcsGradeFilter}
                          onChange={(v) => setThcsGradeFilter(v || 'all')}
                          data={[
                            { value: 'all', label: 'All Grades' },
                            { value: '6', label: 'Grade 6' },
                            { value: '7', label: 'Grade 7' },
                            { value: '8', label: 'Grade 8' },
                            { value: '9', label: 'Grade 9' },
                            { value: '10', label: 'Grade 10' },
                            { value: '11', label: 'Grade 11' },
                            { value: '12', label: 'Grade 12' },
                          ]}
                          style={{ minWidth: '120px' }}
                        />
                        <Select
                          size="xs"
                          value={thcsExamTypeFilter}
                          onChange={(v) => setThcsExamTypeFilter(v || 'all')}
                          data={[
                            { value: 'all', label: 'All Exam Types' },
                            { value: 'Giữa Kì', label: 'Giữa Kì' },
                            { value: 'Cuối Kì', label: 'Cuối Kì' },
                            { value: 'Kiểm Tra', label: 'Kiểm Tra' },
                            { value: '15 Phút', label: '15 Phút' },
                            { value: 'THPT QG', label: 'THPT QG' },
                          ]}
                          style={{ minWidth: '130px' }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Session Code Banner (only shown when in session mode) */}
              {sessionCode && (
                <Card
                  variant="lavender"
                  style={{
                    marginBottom: '2rem',
                    animation: 'slideUp 0.5s ease-out 0.05s backwards',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(192, 132, 252, 0.1) 100%)',
                    border: '2px solid rgba(139, 92, 246, 0.3)'
                  }}
                >
                  <CardBody>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{
                          fontSize: '3rem',
                          filter: 'grayscale(0%)'
                        }}>
                          🎯
                        </div>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#8b5cf6', marginBottom: '0.25rem' }}>
                            ACTIVE SESSION
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                              fontSize: '2.5rem',
                              fontWeight: '800',
                              fontFamily: 'monospace',
                              letterSpacing: '0.15em',
                              color: '#1e293b'
                            }}>
                              {sessionCode}
                            </div>
                            <div style={{
                              padding: '0.375rem 0.875rem',
                              borderRadius: '9999px',
                              background: sessionData?.mode === 'test'
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                              color: 'white',
                              fontSize: '0.8125rem',
                              fontWeight: '700',
                              textTransform: 'uppercase'
                            }}>
                              {sessionData?.mode === 'test' ? '📝 Test' : '🎮 Quiz'}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Share this code with students to join the session
                          </div>
                          {sessionData?.quizId === 'pending' || sessionData?.testId === 'pending' ? (
                            <div style={{
                              fontSize: '0.875rem',
                              color: '#f59e0b',
                              marginTop: '0.5rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span>⚠️</span>
                              <span>Select a quiz or test below to start</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        variant="glass"
                        size="md"
                        onClick={() => navigateTo('SESSIONS', {}, { reason: 'teacher_back_to_sessions' })}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                          <line x1="19" y1="12" x2="5" y2="12" />
                          <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Back to Sessions
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Active Session Alert - Show if test/quiz is selected or in progress */}
              {sessionCode && sessionData && (
                // Show if test/quiz is running OR selected (not pending)
                sessionData.status === 'in-progress' ||
                (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending') ||
                (sessionData.mode === 'quiz' && sessionData.quizId && sessionData.quizId !== 'pending')
              ) && (
                  <Card
                    variant="glass"
                    style={{
                      marginBottom: '2rem',
                      animation: 'slideUp 0.5s ease-out 0.1s backwards',
                      background: sessionData.mode === 'test'
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
                        : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
                      border: sessionData.mode === 'test'
                        ? '2px solid rgba(16, 185, 129, 0.3)'
                        : '2px solid rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    <CardBody>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1.5rem',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ flex: '1 1 300px' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: sessionData.mode === 'test' ? '#10b981' : '#8b5cf6',
                              boxShadow: `0 0 0 4px ${sessionData.mode === 'test' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`,
                              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}></div>
                            <h3 style={{
                              fontSize: '1.25rem',
                              fontWeight: '700',
                              color: '#1e293b',
                              margin: 0
                            }}>
                              {sessionData.status === 'in-progress'
                                ? `${sessionData.mode === 'test' ? '📝 Test' : '🎮 Quiz'} in Progress`
                                : `${sessionData.mode === 'test' ? '📝 Test' : '🎮 Quiz'} Ready`
                              }
                            </h3>
                          </div>
                          <p style={{
                            fontSize: '0.875rem',
                            color: '#64748b',
                            margin: 0
                          }}>
                            {sessionData.status === 'in-progress'
                              ? (sessionData.mode === 'test'
                                ? 'Students are currently taking the test. Click below to return to the monitoring dashboard.'
                                : 'The quiz session is currently active. Click below to return and continue.')
                              : (sessionData.mode === 'test'
                                ? 'Test is selected and ready to start. Click below to return to the monitor page.'
                                : 'Quiz is selected and ready to start. Click below to return to the quiz page.')
                            }
                          </p>
                        </div>
                        <Button
                          variant="primary"
                          size="lg"
                          onClick={() => {
                            if (sessionData.mode === 'test') {
                              navigateTo('TEACHER_TEST_MONITOR', { sessionCode }, { reason: 'teacher_return_to_test' });
                            } else {
                              navigateTo('TEACHER_QUIZ', { gameSessionId: sessionCode }, { reason: 'teacher_return_to_quiz' });
                            }
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                          {sessionData.status === 'in-progress' ? 'Return to' : 'Go to'} {sessionData.mode === 'test' ? 'Monitor' : 'Quiz'}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                )}

              {/* Search and Actions Bar */}
              <Card
                variant="glass"
                style={{
                  marginBottom: '2rem',
                  animation: 'slideUp 0.5s ease-out 0.1s backwards'
                }}
              >
                <CardBody>
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-end',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <Input
                        placeholder={currentView === 'test' ? '🔍 Search by title or keyword...' : '🔍 Search quizzes...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        variant="default"
                        size="md"
                      />
                    </div>

                    {currentView === 'quiz' ? (
                      <Button
                        variant="primary"
                        onClick={() => {
                          setSelectedQuiz(null);
                          setShowEditModal(true);
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                        Create New Quiz
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => setShowTestCreationModal(true)}
                        style={{
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                        Create New Test
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>

              {/* Content Grid */}
              {currentView === 'quiz' ? (
                // Quiz Grid
                filteredQuizzes.length === 0 ? (
                  <Card
                    variant="default"
                    style={{
                      textAlign: 'center',
                      padding: '4rem 2rem',
                      animation: 'scaleIn 0.5s ease-out 0.2s backwards'
                    }}
                  >
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 1.5rem' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <h2 style={{
                      fontSize: '1.75rem',
                      fontWeight: '700',
                      marginBottom: '0.5rem',
                      color: '#1e293b'
                    }}>
                      No quizzes found
                    </h2>
                    <p style={{ fontSize: '1rem', color: '#64748b' }}>
                      Create a quiz to get started
                    </p>
                  </Card>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1.5rem'
                  }}>
                    {filteredQuizzes.map((quiz, index) => renderQuizCard(quiz, index))}
                  </div>
                )
              ) : (
                // Test Grid
                filteredTests.length === 0 ? (
                  <Card
                    variant="default"
                    style={{
                      textAlign: 'center',
                      padding: '4rem 2rem',
                      animation: 'scaleIn 0.5s ease-out 0.2s backwards'
                    }}
                  >
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 1.5rem' }}>
                      <path d="M9 11H3v2h6v-2zm0-4H3v2h6V7zm0 8H3v2h6v-2zm7-4h8v2h-8v-2zm0-4h8v2h-8V7zm0 8h8v2h-8v-2z" />
                    </svg>
                    <h2 style={{
                      fontSize: '1.75rem',
                      fontWeight: '700',
                      marginBottom: '0.5rem',
                      color: '#1e293b'
                    }}>
                      No tests found
                    </h2>
                    <p style={{ fontSize: '1rem', color: '#64748b' }}>
                      {contentFilter === 'public'
                        ? 'No tests found matching your filters.'
                        : 'Create a test to get started'}
                    </p>
                  </Card>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1.5rem'
                  }}>
                    {filteredTests.map((test, index) => renderTestCard(test, index))}
                  </div>
                )
              )}
            </div>
          )}
        </AppShell.Main>

        {/* Class Selection Modal */}
        <Modal
          opened={showClassModal}
          onClose={() => setShowClassModal(false)}
          title={pendingSession?.isListening ? "Start Listening Test Session" : "Start Session"}
          centered
          size={pendingSession?.isListening ? "lg" : "md"}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p>Would you like to link this session to a specific class?</p>

            <Select
              label="Select Class (Optional)"
              placeholder="Choose a class or leave empty for standalone"
              data={classes}
              value={selectedClassId}
              onChange={setSelectedClassId}
              clearable
            />

            {/* Audio Mode Selection for Listening Tests (PRD-0018) */}
            {pendingSession?.isListening && (
              <>
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{
                    display: 'block',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    color: '#1e293b'
                  }}>
                    Audio Mode <span style={{ color: '#ef4444' }}>*</span>
                  </label>

                  <AudioModeSelector
                    value={selectedAudioMode}
                    onChange={(mode) => {
                      setSelectedAudioMode(mode);
                      setShowAudioModeError(false);
                    }}
                    required
                    disabled={false}
                    lastUsedMode={lastUsedAudioMode}
                  />

                  {showAudioModeError && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '0.375rem',
                      color: '#dc2626',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}>
                      ⚠️ You must select an audio mode to start the test
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Exam Mode Toggle (PRD-0018 Task 10.1) */}
            <div style={{
              marginTop: '0.5rem',
              padding: '1rem',
              background: examMode ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
              border: examMode ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              transition: 'all 0.2s ease',
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={examMode}
                  onChange={(e) => setExamMode(e.target.checked)}
                  style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    cursor: 'pointer',
                    accentColor: '#8b5cf6',
                  }}
                />
                <div>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>
                    🎓 Exam Mode
                  </span>
                  <p style={{
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    margin: '0.25rem 0 0 0',
                    lineHeight: 1.4,
                  }}>
                    Disable all student accommodations for this session
                  </p>
                </div>
              </label>

              {examMode && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(245, 158, 11, 0.15)',
                  borderRadius: '0.375rem',
                  color: '#92400e',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                }}>
                  ⚠️ Student accommodations (extra time, unlimited replays, etc.) will not apply
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
              <Button variant="glass" onClick={() => setShowClassModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmStartSession}>
                Start Session
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modals */}
        {showEditModal && (
          <QuizEditor
            show={showEditModal}
            handleClose={handleCloseEditModal}
            quiz={selectedQuiz}
          />
        )}
        {selectedTest && (
          <TestEditor
            show={showEditTestModal}
            handleClose={handleCloseEditTestModal}
            test={selectedTest}
          />
        )}

        {/* Test Creation Modal (new AI-powered flow) */}
        <TestCreationModal
          opened={showTestCreationModal}
          onClose={() => setShowTestCreationModal(false)}
          onComplete={(draftId) => {
            setShowTestCreationModal(false);
            // Navigate to review page with draft ID
            navigate(`/teacher/test/review/${draftId}`);
          }}
        />

        {/* Phase 3: THCS Homework Assignment Dialog (Task 2.1) */}
        {hwDialogTest && (
          <THCSHomeworkAssignDialog
            isOpen={!!hwDialogTest}
            onClose={() => setHwDialogTest(null)}
            onSuccess={() => setHwDialogTest(null)}
            testId={hwDialogTest.id}
            testTitle={hwDialogTest.metadata?.title || 'Untitled THCS Test'}
            versionKey={hwDialogTest._changelog ? Object.keys(hwDialogTest._changelog).pop() : undefined}
            testMetadata={hwDialogTest.metadata}
          />
        )}

        {/* THCS Edit Test Modal */}
        {selectedThcsTest && (
          <THCSTestEditorModal
            show={showThcsEditModal}
            handleClose={handleCloseThcsEditModal}
            test={selectedThcsTest}
          />
        )}

        {/* Phase 3 Task 4.4: Use-as-is Confirmation Modal */}
        <Modal
          opened={!!useAsIsTest}
          onClose={() => setUseAsIsTest(null)}
          title="Use Test As-Is"
          centered
          size="md"
        >
          {useAsIsTest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(139, 92, 246, 0.06)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(139, 92, 246, 0.15)',
              }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                  {useAsIsTest.metadata?.title || 'Untitled THCS Test'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Grade {useAsIsTest.metadata?.gradeLevel} | {useAsIsTest.metadata?.examType || 'Exam'} | {useAsIsTest.metadata?.duration || 45} min | {useAsIsTest.questionCount || 0} questions
                </div>
              </div>

              <div style={{
                padding: '0.625rem 0.875rem',
                background: 'rgba(245, 158, 11, 0.08)',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                color: '#92400e',
                lineHeight: 1.5,
              }}>
                ⚠️ This test will be used as-is. You cannot modify it. The original teacher retains ownership.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
                <Button
                  variant="primary"
                  onClick={async () => {
                    // Task 4.4.3: Save linked reference
                    try {
                      const linkedRef = doc(collection(db, `users/${user.uid}/thcs_linked_tests`));
                      await setDoc(linkedRef, {
                        id: linkedRef.id,
                        testId: useAsIsTest.id,
                        linkedFrom: useAsIsTest.ownerId || useAsIsTest.createdBy,
                        originalTestId: useAsIsTest.id,
                        isLinkedReference: true,
                        linkedAt: Date.now(),
                        testTitle: useAsIsTest.metadata?.title || 'Untitled',
                        testMetadata: {
                          gradeLevel: useAsIsTest.metadata?.gradeLevel || 9,
                          examType: useAsIsTest.metadata?.examType || '',
                          duration: useAsIsTest.metadata?.duration || 45,
                          questionCount: useAsIsTest.questionCount || 0,
                        },
                      });
                    } catch (err) {
                      console.error('Failed to save linked test:', err);
                    }
                    setUseAsIsTest(null);
                    handleStartSession(useAsIsTest.id, 'test');
                  }}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  🎯 Start Live Session
                </Button>
                <Button
                  variant="glass"
                  onClick={async () => {
                    // Task 4.4.3: Save linked reference
                    try {
                      const linkedRef = doc(collection(db, `users/${user.uid}/thcs_linked_tests`));
                      await setDoc(linkedRef, {
                        id: linkedRef.id,
                        testId: useAsIsTest.id,
                        linkedFrom: useAsIsTest.ownerId || useAsIsTest.createdBy,
                        originalTestId: useAsIsTest.id,
                        isLinkedReference: true,
                        linkedAt: Date.now(),
                        testTitle: useAsIsTest.metadata?.title || 'Untitled',
                        testMetadata: {
                          gradeLevel: useAsIsTest.metadata?.gradeLevel || 9,
                          examType: useAsIsTest.metadata?.examType || '',
                          duration: useAsIsTest.metadata?.duration || 45,
                          questionCount: useAsIsTest.questionCount || 0,
                        },
                      });
                    } catch (err) {
                      console.error('Failed to save linked test:', err);
                    }
                    const testForDialog = useAsIsTest;
                    setUseAsIsTest(null);
                    setHwDialogTest(testForDialog);
                  }}
                  style={{ width: '100%', justifyContent: 'center', color: '#7c3aed' }}
                >
                  📋 Assign as Homework
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </AppShell>
    </div >
  );
};

export default TeacherLobbyPage;
