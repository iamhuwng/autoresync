// TeacherLobbyPage — Composition Layer (PRD-0033 refactor)
// Rule 15 Exception: AppShell, Modal, Select — moved code, see PRD-0033 NG-1
import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { buildRoute } from '../constants/routes';
import { AppShell } from '@mantine/core';
import { Card, CardBody, Button, Input } from '../components/modern';
import { TeacherHeader } from '../components/navigation';

// Extracted hooks
import { useModalManager } from '../hooks/useModalManager';
import { useTeacherTests } from '../hooks/test/useTeacherTests';
import { useTeacherDrafts } from '../hooks/thcs/useTeacherDrafts';
import { useSessionManager } from '../hooks/session/useSessionManager';
import { useTestFilters } from '../hooks/test/useTestFilters';

// Extracted components
import TestCard from '../components/modern/TestCard';
import ThcsTestCard from '../components/modern/ThcsTestCard';
import DraftCard from '../components/modern/DraftCard';
import ContentTabs from '../components/modern/ContentTabs';
import SearchFilterBar from '../components/modern/SearchFilterBar';
import SessionBanner from '../components/SessionBanner';
import ClassSelectionModal from '../components/ClassSelectionModal';
import UseAsIsModal from '../components/UseAsIsModal';

// Modals kept as direct imports (heavy components)
// NOTE: QuizEditor removed — no legacy quiz items remain (PRD-0033 Task 2)
import TestEditor from '../components/TestEditor.tsx';
import TestCreationModal from '../components/test-creation/TestCreationModal';
import { THCSHomeworkAssignDialog } from '../components/thcs-editor/THCSHomeworkAssignDialog';
import THCSTestEditorModal from '../components/thcs-editor/THCSTestEditorModal';

const DEFAULT_WRITING_TASK1 = {
  taskType: 'line-graph',
  promptText: '',
  wordMinimum: 150,
  recommendedTimeMinutes: 20,
  showModelAnswerToStudent: false,
};

const DEFAULT_WRITING_TASK2 = {
  taskType: 'opinion',
  promptText: '',
  wordMinimum: 250,
  recommendedTimeMinutes: 40,
  showModelAnswerToStudent: false,
};

function buildWritingModalState(draft) {
  const task1 = draft?.tasks?.find((task) => task.taskNumber === 1);
  const task2 = draft?.tasks?.find((task) => task.taskNumber === 2);
  const hasTaskContent = Boolean(task1?.promptText || task2?.promptText);

  return {
    initialStep: hasTaskContent ? 'writing-content' : 'writing-metadata',
    initialData: {
      testType: 'IELTS',
      skillType: 'writing',
      writingMetadata: {
        title: draft?.metadata?.title || '',
        description: draft?.metadata?.description,
        duration: draft?.metadata?.duration || 60,
        difficulty: draft?.metadata?.difficulty,
        targetBand: draft?.metadata?.targetBand,
        tags: Array.isArray(draft?.metadata?.tags) ? draft.metadata.tags : [],
      },
      writingFormat: draft?.metadata?.format || 'full-test',
      writingTasks: {
        task1: {
          ...DEFAULT_WRITING_TASK1,
          ...(task1 || {}),
        },
        task2: {
          ...DEFAULT_WRITING_TASK2,
          ...(task2 || {}),
        },
      },
    },
    initialWritingDraftId: draft?.id,
  };
}

const TeacherLobbyPage = () => {
  const { navigateTo } = useNavigation('teacher');
  const { sessionCode } = useParams();
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  // ---------- Local UI State ----------
  const [contentFilter, setContentFilter] = useState('my'); // 'my' | 'public' | 'drafts'
  const [searchTerm, setSearchTerm] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState('all');
  const [thcsGradeFilter, setThcsGradeFilter] = useState('all');
  const [thcsExamTypeFilter, setThcsExamTypeFilter] = useState('all');
  const [testCreationInitialStep, setTestCreationInitialStep] = useState('type');
  const [testCreationInitialData, setTestCreationInitialData] = useState(undefined);
  const [testCreationInitialWritingDraftId, setTestCreationInitialWritingDraftId] = useState(undefined);

  // ---------- Hooks ----------
  const modals = useModalManager();
  const { tests, loading: contentLoading, deleteTest, togglePublic } = useTeacherTests();
  const { drafts, loading: draftsLoading, error: draftsError, deleteDraft } = useTeacherDrafts({
    userId: user?.uid || '',
    enabled: contentFilter === 'drafts',
  });

  const session = useSessionManager({
    sessionCode,
    userId: user?.uid || '',
    userRole: profile?.role || '',
    tests,
    navigateTo,
  });

  const { filteredTests } = useTestFilters(tests, {
    userId: user?.uid || '',
    userRole: profile?.role || '',
    contentFilter,
    searchTerm,
    testTypeFilter,
    thcsGradeFilter,
    thcsExamTypeFilter,
  });

  const resetTestCreationOverrides = useCallback(() => {
    setTestCreationInitialStep('type');
    setTestCreationInitialData(undefined);
    setTestCreationInitialWritingDraftId(undefined);
  }, []);

  const handleOpenTestCreation = useCallback(() => {
    resetTestCreationOverrides();
    modals.openTestCreation();
  }, [modals.openTestCreation, resetTestCreationOverrides]);

  const handleCloseTestCreation = useCallback(() => {
    resetTestCreationOverrides();
    modals.closeTestCreation();
  }, [modals.closeTestCreation, resetTestCreationOverrides]);

  const openWritingDraftInModal = useCallback((draft) => {
    const modalState = buildWritingModalState(draft);
    setTestCreationInitialStep(modalState.initialStep);
    setTestCreationInitialData(modalState.initialData);
    setTestCreationInitialWritingDraftId(modalState.initialWritingDraftId);
    modals.openTestCreation();
  }, [modals.openTestCreation]);

  // ---------- Handlers ----------
  const handleLogout = async () => {
    try {
      await logout();
      navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleEditTest = useCallback((test) => {
    const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';

    if (test.testType === 'THCS-THPT') {
      modals.openEditThcsTest(test);
      return;
    }

    if (isWritingTest) {
      if (!user?.uid) {
        alert('You must be signed in to edit this writing test.');
        return;
      }

      import('../services/writingTestService')
        .then(async ({ ensureWritingEditableDraft, getWritingDraft }) => {
          const result = await ensureWritingEditableDraft(test, user.uid);
          if (!result.success || !result.draftId) {
            throw new Error(result.error || 'Failed to prepare writing draft');
          }

          const draftResult = await getWritingDraft(result.draftId);
          if (!draftResult.success || !draftResult.data) {
            throw new Error(draftResult.error || 'Failed to load writing draft');
          }

          openWritingDraftInModal(draftResult.data);
        })
        .catch((error) => {
          console.error('Failed to open writing editor:', error);
          alert(error instanceof Error ? error.message : 'Failed to open writing editor.');
        });
      return;
    }

    modals.openEditTest(test);
  }, [modals.openEditThcsTest, modals.openEditTest, openWritingDraftInModal, user?.uid]);

  const handleDeleteTest = useCallback(async (test) => {
    const isThcs = test.testType === 'THCS-THPT';
    const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';
    const testTitle = isThcs || isWritingTest ? test.metadata?.title : test.title;
    if (window.confirm(`Are you sure you want to delete "${testTitle || 'this test'}"?`)) {
      await deleteTest(test);
    }
  }, [deleteTest]);

  const handleDeleteDraft = useCallback(async (draft) => {
    const draftTitle = draft.metadata?.title || 'Untitled Draft';
    if (!window.confirm(`Delete draft "${draftTitle}"? This cannot be undone.`)) return;
    await deleteDraft(draft.id);
  }, [deleteDraft]);

  const handleStartTest = useCallback((testId) => {
    session.startSession(testId, 'test');
  }, [session.startSession]);

  const handleCloneTest = useCallback(async (test) => {
    try {
      const { cloneFromPublicTest } = await import('../services/thcsDraftService');
      const result = await cloneFromPublicTest(test.id, user.uid);
      if (result.success && result.data) {
        navigate(buildRoute('TEACHER_THCS_EDIT', { draftId: result.data.draftId }));
      } else {
        alert('Failed to clone test: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Clone failed:', err);
      alert('Failed to clone test. Please try again.');
    }
  }, [user?.uid, navigate]);

  const handleUseAsIsStartLive = useCallback((test) => {
    modals.closeUseAsIs();
    session.startSession(test.id, 'test');
  }, [modals.closeUseAsIs, session.startSession]);

  const handleUseAsIsAssignHW = useCallback((test) => {
    modals.closeUseAsIs();
    modals.openHwDialog(test);
  }, [modals.closeUseAsIs, modals.openHwDialog]);

  // ---------- Helpers ----------
  const isOwner = useCallback((item) => {
    if (!user) return false;
    return item.ownerId === user.uid || item.createdBy === user.uid || (!item.ownerId && !item.createdBy);
  }, [user]);

  const canEdit = useCallback((item) => {
    return isOwner(item) || profile?.role === 'super_admin';
  }, [isOwner, profile]);

  // ---------- Render ----------
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
      backgroundAttachment: 'fixed',
    }}>
      <AppShell padding="md">
        <TeacherHeader
          pageTitle="Materials"
          userId={user?.uid}
          userRole={profile?.role}
          userDisplayName={profile?.displayName || user?.displayName || user?.email}
          userEmail={profile?.email || user?.email}
          userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
          onLogout={handleLogout}
        />

        <AppShell.Main>
          {/* Session Loading State */}
          {sessionCode && session.sessionLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: '50vh', gap: '1rem',
            }}>
              <div style={{
                width: '48px', height: '48px',
                border: '4px solid rgba(139, 92, 246, 0.2)',
                borderTop: '4px solid #8b5cf6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ color: '#64748b', fontSize: '1rem' }}>Loading session {sessionCode}...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Session Error State */}
          {sessionCode && session.sessionError && !session.sessionLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: '50vh', gap: '1rem',
            }}>
              <div style={{ fontSize: '3rem' }}>⚠️</div>
              <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 600 }}>{session.sessionError}</h2>
              <p style={{ color: '#64748b' }}>Redirecting to session management...</p>
            </div>
          )}

          {/* Main Content */}
          {(!sessionCode || (!session.sessionLoading && !session.sessionError)) && (
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
              {/* Page Header */}
              <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>
                  Test Dashboard
                </h1>
                <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                  Manage your tests and start formal assessment sessions
                </p>

                <ContentTabs
                  activeTab={contentFilter}
                  onTabChange={setContentFilter}
                />
              </div>

              {/* Session Banner */}
              <SessionBanner
                sessionCode={sessionCode}
                sessionData={session.sessionData}
                onBackToSessions={() => navigateTo('SESSIONS', {}, { reason: 'lobby_back_to_sessions' })}
                onReturnToMonitor={(code) => navigateTo('TEACHER_TEST_MONITOR', { sessionCode: code }, { reason: 'lobby_return_monitor' })}
                onReturnToQuiz={(code) => navigateTo('TEACHER_WAITING', { gameSessionId: code }, { reason: 'lobby_return_quiz' })}
              />

              {/* Drafts Tab */}
              {contentFilter === 'drafts' ? (
                <div>
                  {draftsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                      <div style={{
                        width: '40px', height: '40px',
                        border: '4px solid rgba(139, 92, 246, 0.2)',
                        borderTop: '4px solid #8b5cf6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                    </div>
                  ) : draftsError ? (
                    <Card variant="glass" style={{ padding: '2rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
                      <p style={{ color: '#ef4444', fontWeight: 600 }}>{draftsError}</p>
                    </Card>
                  ) : drafts.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                        No Drafts Yet
                      </h3>
                      <p style={{ color: '#64748b' }}>
                        Create a new THCS or IELTS writing test to start saving drafts
                      </p>
                    </Card>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: '1.5rem',
                    }}>
                      {drafts.map((draft, index) => (
                        <DraftCard
                          key={draft.id}
                          draft={draft}
                          index={index}
                          onResume={(draftToResume) => {
                            if (draftToResume?.draftKind === 'writing') {
                              openWritingDraftInModal(draftToResume);
                              return;
                            }
                            navigate(buildRoute('TEACHER_THCS_EDIT', { draftId: draftToResume.id }));
                          }}
                          onDelete={handleDeleteDraft}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Tests Tab (My Content / Public Library) */
                <>
                  <Card variant="glass" style={{ marginBottom: '2rem', animation: 'slideUp 0.5s ease-out 0.1s backwards' }}>
                    <CardBody>
                      <SearchFilterBar
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        contentFilter={contentFilter}
                        testTypeFilter={testTypeFilter}
                        onTestTypeFilterChange={setTestTypeFilter}
                        thcsGradeFilter={thcsGradeFilter}
                        onThcsGradeFilterChange={setThcsGradeFilter}
                        thcsExamTypeFilter={thcsExamTypeFilter}
                        onThcsExamTypeFilterChange={setThcsExamTypeFilter}
                        onCreateNew={handleOpenTestCreation}
                      />
                    </CardBody>
                  </Card>

                  {/* Content Loading */}
                  {contentLoading ? (
                    <div style={{
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                      padding: '4rem', flexDirection: 'column', gap: '1rem',
                    }}>
                      <div style={{
                        width: '48px', height: '48px',
                        border: '4px solid rgba(139, 92, 246, 0.2)',
                        borderTop: '4px solid #8b5cf6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <p style={{ color: '#64748b' }}>Loading tests...</p>
                    </div>
                  ) : filteredTests.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center', marginTop: '1.5rem' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                        {contentFilter === 'public' ? '🌐' : '📝'}
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                        {contentFilter === 'public' ? 'No public tests found' : 'No tests yet'}
                      </h3>
                      <p style={{ color: '#64748b' }}>
                        {contentFilter === 'public'
                          ? 'Check back later or create your own tests'
                          : 'Create your first test to get started'}
                      </p>
                    </Card>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: '1.5rem',
                      marginTop: '1.5rem',
                    }}>
                      {filteredTests.map((test, index) => {
                        if (test.testType === 'THCS-THPT') {
                          return (
                            <ThcsTestCard
                              key={test.id}
                              test={test}
                              index={index}
                              canEdit={canEdit(test)}
                              isOwner={isOwner(test)}
                              isPublicLibrary={contentFilter === 'public'}
                              onEdit={handleEditTest}
                              onDelete={handleDeleteTest}
                              onStartTest={handleStartTest}
                              onUseAsIs={modals.openUseAsIs}
                              onClone={handleCloneTest}
                              onAssignHw={modals.openHwDialog}
                            />
                          );
                        }
                        return (
                          <TestCard
                            key={test.id}
                            test={test}
                            index={index}
                            canEdit={canEdit(test)}
                            isOwner={isOwner(test)}
                            onEdit={handleEditTest}
                            onDelete={handleDeleteTest}
                            onStartTest={handleStartTest}
                            onTogglePublic={(id, isPublic) => togglePublic(id, isPublic)}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </AppShell.Main>

        {/* ===== Modals ===== */}

        {/* Class Selection Modal */}
        <ClassSelectionModal
          opened={session.showClassModal}
          onClose={session.cancelSession}
          onConfirm={session.confirmSession}
          classes={session.classes}
          selectedClassId={session.selectedClassId}
          onClassChange={session.setSelectedClassId}
          isListening={session.pendingSession?.isListening}
          selectedAudioMode={session.selectedAudioMode}
          onAudioModeChange={(mode) => {
            session.setSelectedAudioMode(mode);
            session.setShowAudioModeError(false);
          }}
          lastUsedAudioMode={session.lastUsedAudioMode}
          showAudioModeError={session.showAudioModeError}
          examMode={session.examMode}
          onExamModeChange={session.setExamMode}
        />

        {/* IELTS Test Editor — QuizEditor removed (no legacy quiz items, PRD-0033) */}
        {modals.state.editTest.show && modals.state.editTest.test && (
          <TestEditor
            show={modals.state.editTest.show}
            handleClose={modals.closeEditTest}
            test={modals.state.editTest.test}
          />
        )}

        {/* THCS Test Editor */}
        {modals.state.editThcsTest.show && modals.state.editThcsTest.test && (
          <THCSTestEditorModal
            show={modals.state.editThcsTest.show}
            handleClose={modals.closeEditThcsTest}
            test={modals.state.editThcsTest.test}
          />
        )}

        {/* Test Creation Modal */}
        <TestCreationModal
          opened={modals.state.testCreation.show}
          onClose={handleCloseTestCreation}
          onComplete={(draftId) => {
            handleCloseTestCreation();
            navigate(`/teacher/test/review/${draftId}`);
          }}
          initialStep={testCreationInitialStep}
          initialData={testCreationInitialData}
          initialWritingDraftId={testCreationInitialWritingDraftId}
        />

        {/* THCS Homework Dialog */}
        {modals.state.hwDialog.show && modals.state.hwDialog.test && (
          <THCSHomeworkAssignDialog
            isOpen={true}
            onClose={modals.closeHwDialog}
            onSuccess={modals.closeHwDialog}
            testId={modals.state.hwDialog.test.id}
            testTitle={modals.state.hwDialog.test.metadata?.title || 'Untitled THCS Test'}
            versionKey={modals.state.hwDialog.test._changelog ? Object.keys(modals.state.hwDialog.test._changelog).pop() : undefined}
            testMetadata={modals.state.hwDialog.test.metadata}
          />
        )}

        {/* Use-as-is Modal */}
        <UseAsIsModal
          test={modals.state.useAsIs.test}
          opened={modals.state.useAsIs.show}
          onClose={modals.closeUseAsIs}
          onStartLiveSession={handleUseAsIsStartLive}
          onAssignHomework={handleUseAsIsAssignHW}
          userId={user?.uid}
        />
      </AppShell>
    </div>
  );
};

export default TeacherLobbyPage;
