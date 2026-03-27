import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useEffect, useState, Suspense } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry.ts';
import { ToastContainer, VanillaLoader } from './components/modern';
import { TrackedRoute } from './components/TrackedRoute.tsx';
import { initBreadcrumbs } from './hooks/useBreadcrumbs';
import { auth, database } from './services/firebase';
import { reportingService } from './services/reportingService';

// Lazy load all page components for code splitting
// Using lazyWithRetry to auto-recover from stale chunk errors after deployments
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage.jsx'));
const TeacherInvitePage = lazyWithRetry(() => import('./pages/TeacherInvitePage.jsx'));
const TeacherLobbyPage = lazyWithRetry(() => import('./pages/TeacherLobbyPage.jsx'));

const TestBuilderRouter = lazyWithRetry(() => import('./pages/TestBuilderRouter'));
const StudentWaitingRoomPage = lazyWithRetry(() => import('./pages/StudentWaitingRoomPage.jsx'));
const TeacherWaitingRoomPage = lazyWithRetry(() => import('./pages/TeacherWaitingRoomPage.jsx'));
const TeacherQuizPage = lazyWithRetry(() => import('./pages/TeacherQuizPage.jsx'));
const StudentQuizPage = lazyWithRetry(() => import('./pages/StudentQuizPageNew.jsx'));
const MaterialProfilePage = lazyWithRetry(() => import('./pages/MaterialProfilePage.tsx'));
// StudentTestPage replaced by TestPageRouter
const TestPageRouter = lazyWithRetry(() => import('./pages/TestPageRouter.tsx'));
const TeacherTestMonitorPage = lazyWithRetry(() => import('./pages/TeacherTestMonitorPage.tsx'));
const StudentTestResultsPage = lazyWithRetry(() => import('./pages/StudentTestResultsPage.tsx'));
const TeacherTestResultsPage = lazyWithRetry(() => import('./pages/TeacherTestResultsPage.tsx'));
const TeacherResultsPage = lazyWithRetry(() => import('./pages/TeacherResultsPage.jsx'));
const StudentResultsPage = lazyWithRetry(() => import('./pages/StudentResultsPage.jsx'));
const StudentDashboardPage = lazyWithRetry(() => import('./pages/StudentDashboardPage.jsx'));
const TeacherResultsDashboard = lazyWithRetry(() => import('./pages/TeacherResultsDashboard.jsx'));
const AdminUserManagementPage = lazyWithRetry(() => import('./pages/AdminUserManagementPage.jsx'));
const TeacherStudentsPage = lazyWithRetry(() => import('./pages/TeacherStudentsPage.tsx'));
const GuestJoinPage = lazyWithRetry(() => import('./pages/GuestJoinPage.jsx'));
const GuestResultsPage = lazyWithRetry(() => import('./pages/GuestResultsPage.tsx'));
const StudentFeedbackPage = lazyWithRetry(() => import('./pages/StudentFeedbackPage.jsx'));
const TeacherFeedbackPage = lazyWithRetry(() => import('./pages/TeacherFeedbackPage.jsx'));
const SessionManagementPage = lazyWithRetry(() => import('./pages/SessionManagementPage.tsx'));
const TeacherClassesPage = lazyWithRetry(() => import('./pages/TeacherClassesPage.tsx'));
const TeacherCoursesPage = lazyWithRetry(() => import('./pages/TeacherCoursesPage.tsx'));
const TeacherCourseProfilePage = lazyWithRetry(() => import('./pages/TeacherCourseProfilePage.tsx'));
const TeacherClassDetailPage = lazyWithRetry(() => import('./pages/TeacherClassDetailPage.tsx'));
const StudentClassDetailPage = lazyWithRetry(() => import('./pages/StudentClassDetailPage.jsx'));
const AdminMigrationPage = lazyWithRetry(() => import('./pages/AdminMigrationPage.tsx'));
const AdminDashboardPage = lazyWithRetry(() => import('./pages/AdminDashboardPage.tsx'));
const AdminMaterialsPage = lazyWithRetry(() => import('./pages/AdminMaterialsPage.tsx'));
const AdminSessionsPage = lazyWithRetry(() => import('./pages/AdminSessionsPage.tsx'));
const AdminCoursesPage = lazyWithRetry(() => import('./pages/AdminCoursesPage.tsx'));
const AdminClassesPage = lazyWithRetry(() => import('./pages/AdminClassesPage.tsx'));
const AdminSettingsPage = lazyWithRetry(() => import('./pages/AdminSettingsPage.tsx'));
const AdminBackupPage = lazyWithRetry(() => import('./pages/AdminBackupPage.tsx'));
const AdminReportsPage = lazyWithRetry(() => import('./pages/AdminReportsPage.tsx'));
const TeacherStudentHistoryPage = lazyWithRetry(() => import('./pages/TeacherStudentHistoryPage.tsx'));
const StudentCoursesPage = lazyWithRetry(() => import('./pages/StudentCoursesPage.tsx'));
const StudentCourseDetailPage = lazyWithRetry(() => import('./pages/StudentCourseDetailPage.tsx'));
const StudentCourseCatalogPage = lazyWithRetry(() => import('./pages/CourseCatalogPage.tsx'));
const ProfileCompletionPage = lazyWithRetry(() => import('./pages/ProfileCompletionPage.tsx'));
const ProfilePage = lazyWithRetry(() => import('./components/profile/ProfilePage.tsx'));
const AcademicRecordPage = lazyWithRetry(() => import('./pages/AcademicRecordPage.tsx'));
const ResultDetailPage = lazyWithRetry(() => import('./pages/ResultDetailPage.tsx'));
const AccessDeniedPage = lazyWithRetry(() => import('./pages/AccessDeniedPage.tsx'));
const BlockedUserPage = lazyWithRetry(() => import('./pages/BlockedUserPage.tsx'));

// PRD-0016: Solo Study & Homework System
const StudentLibraryPage = lazyWithRetry(() => import('./pages/StudentLibraryPage.tsx'));
// PRD-0025: Unified Solo Practice Mode
const StudentPracticePage = lazyWithRetry(() => import('./pages/StudentPracticePage.tsx'));
const TeacherHomeworkListPage = lazyWithRetry(() => import('./pages/TeacherHomeworkListPage.tsx'));
const TeacherHomeworkDetailPage = lazyWithRetry(() => import('./pages/TeacherHomeworkDetailPage.tsx'));
// PRD-0034: Student Homework Profile
const StudentHomeworkProfile = lazyWithRetry(() => import('./pages/StudentHomeworkProfile.tsx'));
const StudentHomeworkListPage = lazyWithRetry(() => import('./pages/StudentHomeworkListPage.tsx'));
const StudentHomeworkDetailPage = lazyWithRetry(() => import('./pages/StudentHomeworkDetailPage.tsx'));
// PRD-0019: Test Duration End Flow
const SubmissionCompletePage = lazyWithRetry(() => import('./pages/SubmissionCompletePage.tsx'));
// PRD-0020: Automated IELTS Reading Test Creation
const TestCreationPage = lazyWithRetry(() => import('./pages/TestCreationPage.tsx'));
const TestCreationRedirectPage = lazyWithRetry(() => import('./pages/TestCreationRedirectPage.tsx'));
// PRD-0022: Test Creation Modal with Drafts
const TestReviewPage = lazyWithRetry(() => import('./pages/TestReviewPage.tsx'));
// PRD-0027: THCS-THPT Test System
const THCSTestEditorPage = lazyWithRetry(() => import('./pages/THCSTestEditorPage.tsx'));
// PRD-0028: THCS Grading Tab
const TeacherGradingPage = lazyWithRetry(() => import('./pages/TeacherGradingPage.tsx'));
// PRD-0030: IELTS Writing Test System
const WritingTestBuilder = lazyWithRetry(() => import('./pages/WritingTestBuilder.tsx'));
const WritingGradingQueuePage = lazyWithRetry(() => import('./pages/WritingGradingQueuePage.tsx'));
const WritingGradingPage = lazyWithRetry(() => import('./pages/WritingGradingPage.tsx'));
import PrivateRoute from './components/PrivateRoute.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ProfileCompletionGuard } from './components/ProfileCompletionGuard.tsx';
// import { LogProvider } from './context/LogContext.jsx'; // DISABLED FOR TESTING
import AdminLoginModal from './components/AdminLoginModal.jsx';
import { ConfirmDialog } from './components/modals/ConfirmDialog.tsx';
import RestoreBanner from './components/RestoreBanner.tsx';

// Loading fallback component
const LoadingFallback = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <VanillaLoader size="xl" />
  </div>
);

// Placeholder components for routing
const Placeholder = ({ name }) => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h1>{name} Page</h1>
    <nav>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/">Login</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/lobby">Lobby</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/student-wait/test">Student Waiting Room</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/teacher-wait/test">Teacher Waiting Room</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/student-quiz/test">Student Quiz</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/teacher-quiz/test">Teacher Quiz</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/student-results/test">Student Results</Link></li>
        <li style={{ display: 'inline', margin: '0 1rem' }}><Link to="/teacher-results/test">Teacher Results</Link></li>
      </ul>
    </nav>
    <p>This is a placeholder for the {name} page.</p>
  </div>
);

const withTrackedRoute = (children, featureName) => (
  <TrackedRoute featureName={featureName}>{children}</TrackedRoute>
);



function App() {
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    reportingService.init(auth, database);
    initBreadcrumbs();
  }, []);

  return (
    <BrowserRouter>
      <RestoreBanner />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route path="/blocked" element={<BlockedUserPage />} />
          <Route path="/guest-join" element={<GuestJoinPage />} />
          <Route path="/guest-results" element={withTrackedRoute(<GuestResultsPage />, 'results')} />
          <Route path="/teacher-invite" element={<TeacherInvitePage />} />

          {/* Profile Routes */}
          <Route path="/profile/complete" element={
            <PrivateRoute>
              {withTrackedRoute(<ProfileCompletionPage />, 'results')}
            </PrivateRoute>
          } />
          <Route path="/profile" element={
            <PrivateRoute>
              {withTrackedRoute(
                <ProfileCompletionGuard>
                  <ProfilePage />
                </ProfileCompletionGuard>,
                'profile'
              )}
            </PrivateRoute>
          } />

          {/* Admin Routes - SUPER ADMIN ONLY */}
          <Route path="/admin/dashboard" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminDashboardPage />)}
            </PrivateRoute>
          } />
          <Route path="/admin/materials" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminMaterialsPage />)}
            </PrivateRoute>
          } />
          <Route path="/admin/sessions" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminSessionsPage />)}
            </PrivateRoute>
          } />
          <Route path="/admin/users" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminUserManagementPage />)}
            </PrivateRoute>
          } />
          <Route path="/admin/migration" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminMigrationPage />)}
            </PrivateRoute>
          } />
          {/* Admin Courses - SUPER ADMIN ONLY */}
          <Route path="/admin/courses" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminCoursesPage />)}
            </PrivateRoute>
          } />

          {/* Admin Classes - SUPER ADMIN ONLY */}
          <Route path="/admin/classes" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminClassesPage />)}
            </PrivateRoute>
          } />

          {/* Admin Settings - SUPER ADMIN ONLY */}
          <Route path="/admin/settings" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminSettingsPage />)}
            </PrivateRoute>
          } />

          {/* Admin Backup & Recovery - SUPER ADMIN ONLY (PRD-0026) */}
          <Route path="/admin/backup" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminBackupPage />)}
            </PrivateRoute>
          } />
          <Route path="/admin/reports" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              {withTrackedRoute(<AdminReportsPage />)}
            </PrivateRoute>
          } />


          {/* Teacher Student Management - TEACHERS ONLY */}
          <Route path="/teacher/students" element={
            <PrivateRoute allowedRoles={['teacher']}>
              {withTrackedRoute(<TeacherStudentsPage />)}
            </PrivateRoute>
          } />

          {/* PRD-0034: Student Homework Profile — MUST be before :homeworkId to avoid capture */}
          <Route path="/teacher/homework/student/:studentId" element={
            <PrivateRoute allowedRoles={['teacher']}>
              {withTrackedRoute(
                <ErrorBoundary>
                  <StudentHomeworkProfile />
                </ErrorBoundary>,
                'homework'
              )}
            </PrivateRoute>
          } />
          {/* Teacher Homework Management - TEACHERS ONLY (PRD-0016) */}
          <Route path="/teacher/homework/:homeworkId" element={
            <PrivateRoute allowedRoles={['teacher']}>
              {withTrackedRoute(
                <ErrorBoundary>
                  <TeacherHomeworkDetailPage />
                </ErrorBoundary>,
                'homework'
              )}
            </PrivateRoute>
          } />
          <Route path="/teacher/homework" element={
            <PrivateRoute allowedRoles={['teacher']}>
              {withTrackedRoute(
                <ErrorBoundary>
                  <TeacherHomeworkListPage />
                </ErrorBoundary>,
                'homework'
              )}
            </PrivateRoute>
          } />

          {/* Teacher Routes - TEACHERS ONLY (super_admin uses /admin routes) */}
          <Route path="/lobby" element={
            <PrivateRoute allowedRoles={['teacher']}>
              {withTrackedRoute(
                <ProfileCompletionGuard>
                  <TeacherLobbyPage />
                </ProfileCompletionGuard>
              )}
            </PrivateRoute>
          } />
          <Route path="/teacher-lobby/:sessionCode" element={
            <PrivateRoute allowedRoles={['teacher']}>
              {withTrackedRoute(
                <ProfileCompletionGuard>
                  <TeacherLobbyPage />
                </ProfileCompletionGuard>
              )}
            </PrivateRoute>
          } />
          <Route path="/sessions" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<SessionManagementPage />, 'sessions')}</PrivateRoute>} />
          <Route path="/teacher/results" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<TeacherResultsDashboard />, 'results')}</PrivateRoute>} />

          <Route path="/create-test" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TestBuilderRouter />, 'testCreation')}</PrivateRoute>} />
          <Route path="/teacher-wait/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherWaitingRoomPage />, 'liveSessions')}</PrivateRoute>} />
          <Route path="/teacher-quiz/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherQuizPage />, 'liveSessions')}</PrivateRoute>} />
          <Route path="/teacher-test/:sessionCode" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherTestMonitorPage />)}</PrivateRoute>} />
              <Route path="/teacher-test-results/:sessionCode" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<TeacherTestResultsPage />, 'results')}</PrivateRoute>} />
          <Route path="/teacher-feedback/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherFeedbackPage />, 'feedback')}</PrivateRoute>} />
          <Route path="/teacher-results/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherResultsPage />, 'results')}</PrivateRoute>} />
          <Route path="/teacher/classes" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherClassesPage />, 'classes')}</PrivateRoute>} />
          <Route path="/teacher/courses" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherCoursesPage />, 'courses')}</PrivateRoute>} />
          <Route path="/teacher/courses/:courseId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherCourseProfilePage />, 'courses')}</PrivateRoute>} />
          <Route path="/material/:materialId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<MaterialProfilePage />, 'materials')}</PrivateRoute>} />
          <Route path="/teacher/classes/:classId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherClassDetailPage />, 'classes')}</PrivateRoute>} />
          <Route path="/teacher/student/:studentId/history" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<TeacherStudentHistoryPage />, 'results')}</PrivateRoute>} />

          {/* PRD-0020: IELTS Test Creation - Redirects to Materials + auto-open modal */}
          <Route path="/teacher/test/create" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<TestCreationRedirectPage />, 'testCreation')}</PrivateRoute>} />
          {/* PRD-0020: Standalone test creation page (direct access) */}
          <Route path="/teacher/test/create-standalone" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><TestCreationPage /></ErrorBoundary>, 'testCreation')}</PrivateRoute>} />
          {/* PRD-0022: Test Review Page - Teachers and Super Admins */}
          <Route path="/teacher/test/review/:draftId" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><TestReviewPage /></ErrorBoundary>, 'testCreation')}</PrivateRoute>} />
          {/* PRD-0027: THCS-THPT Test Editor - Teachers Only */}
          <Route path="/teacher/thcs-test/create" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<ErrorBoundary><THCSTestEditorPage /></ErrorBoundary>, 'testCreation')}</PrivateRoute>} />
          <Route path="/teacher/thcs-test/edit/:draftId" element={<PrivateRoute allowedRoles={['teacher']}>{withTrackedRoute(<ErrorBoundary><THCSTestEditorPage /></ErrorBoundary>, 'testCreation')}</PrivateRoute>} />
          {/* PRD-0028: THCS Grading Tab - Teachers and Super Admins */}
          <Route path="/teacher/grading" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><TeacherGradingPage /></ErrorBoundary>, 'grading')}</PrivateRoute>} />
          {/* PRD-0030: IELTS Writing Test System */}
          <Route path="/teacher/writing-test/create" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><WritingTestBuilder /></ErrorBoundary>, 'testCreation')}</PrivateRoute>} />
          <Route path="/teacher/writing-test/edit/:draftId" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><WritingTestBuilder /></ErrorBoundary>, 'testCreation')}</PrivateRoute>} />
          <Route path="/teacher/grading/writing" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><TeacherGradingPage /></ErrorBoundary>, 'grading')}</PrivateRoute>} />
          <Route path="/teacher/grading/writing/:submissionId" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}>{withTrackedRoute(<ErrorBoundary><WritingGradingPage /></ErrorBoundary>, 'grading')}</PrivateRoute>} />

          {/* Student Routes */}
          <Route path="/student" element={
            <PrivateRoute allowedRoles={['student']}>
              {withTrackedRoute(
                <ProfileCompletionGuard>
                  <StudentDashboardPage />
                </ProfileCompletionGuard>
              )}
            </PrivateRoute>
          } />
          <Route path="/student/dashboard" element={
            <PrivateRoute allowedRoles={['student']}>
              {withTrackedRoute(
                <ProfileCompletionGuard>
                  <StudentDashboardPage />
                </ProfileCompletionGuard>
              )}
            </PrivateRoute>
          } />
          <Route path="/student/courses" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentCoursesPage />, 'courses')}</PrivateRoute>} />
          <Route path="/student/courses/:courseId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentCourseDetailPage />, 'courses')}</PrivateRoute>} />
          <Route path="/student/courses/catalog" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentCourseCatalogPage />, 'courses')}</PrivateRoute>} />
          <Route path="/student/classes/:classId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentClassDetailPage />, 'classes')}</PrivateRoute>} />
          {/* Student Session Routes - PROTECTED (PRD-0016) */}
          <Route path="/student-wait/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentWaitingRoomPage />, 'liveSessions')}</PrivateRoute>} />
          <Route path="/student-quiz/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentQuizPage />, 'liveSessions')}</PrivateRoute>} />
          <Route path="/student-test/:sessionCode" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<TestPageRouter />, 'testTaking')}</PrivateRoute>} />
          <Route path="/student-test-results/:sessionCode" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentTestResultsPage />, 'results')}</PrivateRoute>} />
          <Route path="/student-feedback/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentFeedbackPage />, 'feedback')}</PrivateRoute>} />
          <Route path="/student-results/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentResultsPage />, 'results')}</PrivateRoute>} />
          {/* Legacy student result entry path: supports older links while StudentTestResultsPage redirects resultId deep-links to /result/:resultId */}
          <Route path="/student/results/:sessionCode" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentTestResultsPage />, 'results')}</PrivateRoute>} />
          {/* PRD-0016: Solo Study & Homework System */}
          <Route path="/student/library" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentLibraryPage />, 'materials')}</PrivateRoute>} />
          {/* PRD-0025: Unified Solo Practice Mode - NEW canonical route */}
          <Route path="/student/practice/:materialId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentPracticePage />, 'testTaking')}</PrivateRoute>} />
          {/* PRD-0025: Legacy redirect - old solo-test URLs still work */}
          <Route path="/student/solo-test/:materialId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentPracticePage />, 'testTaking')}</PrivateRoute>} />
          {/* PRD-0016: Student Homework Routes */}
          <Route path="/student/homework" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentHomeworkListPage />, 'homework')}</PrivateRoute>} />
          <Route path="/student/homework/:homeworkId" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentHomeworkDetailPage />, 'homework')}</PrivateRoute>} />
          <Route path="/student/homework/:homeworkId/test" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<StudentPracticePage />, 'testTaking')}</PrivateRoute>} />
          <Route path="/student/academic-record" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<AcademicRecordPage />, 'academicRecords')}</PrivateRoute>} />
          {/* PRD-0019: Post-submission confirmation for Writing tests */}
          <Route path="/submission-complete" element={<PrivateRoute allowedRoles={['student']}>{withTrackedRoute(<SubmissionCompletePage />, 'results')}</PrivateRoute>} />
          <Route path="/result/:resultId" element={<PrivateRoute allowedRoles={['student', 'teacher', 'super_admin']}>{withTrackedRoute(<ResultDetailPage />, 'results')}</PrivateRoute>} />


        </Routes>
        <AdminLoginModal show={showAdminLogin} handleClose={() => setShowAdminLogin(false)} />

        <ConfirmDialog />
      </Suspense>
      <ToastContainer />
    </BrowserRouter >
  );
}

export default App;
