import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useState, Suspense } from 'react';
import { Center, Loader } from '@mantine/core';
import { lazyWithRetry } from './utils/lazyWithRetry.ts';

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
const FeedbackComponentsDemo = lazyWithRetry(() => import('./pages/FeedbackComponentsDemo.tsx'));
const AcademicRecordDemoPage = lazyWithRetry(() => import('./pages/AcademicRecordDemoPage.tsx'));
const FeedbackDemoPage = lazyWithRetry(() => import('./pages/FeedbackDemoPage.tsx'));
const DemoIndexPage = lazyWithRetry(() => import('./pages/DemoIndexPage.tsx'));
// PRD-0016: Solo Study & Homework System
const StudentLibraryPage = lazyWithRetry(() => import('./pages/StudentLibraryPage.tsx'));
// PRD-0025: Unified Solo Practice Mode
const StudentPracticePage = lazyWithRetry(() => import('./pages/StudentPracticePage.tsx'));
const TeacherHomeworkListPage = lazyWithRetry(() => import('./pages/TeacherHomeworkListPage.tsx'));
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
  <Center style={{ height: '100vh' }}>
    <Loader size="xl" />
  </Center>
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



function App() {
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  return (
    <BrowserRouter>
      <RestoreBanner />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route path="/blocked" element={<BlockedUserPage />} />
          <Route path="/guest-join" element={<GuestJoinPage />} />
          <Route path="/guest-results" element={<GuestResultsPage />} />
          <Route path="/teacher-invite" element={<TeacherInvitePage />} />

          {/* Profile Routes */}
          <Route path="/profile/complete" element={
            <PrivateRoute>
              <ProfileCompletionPage />
            </PrivateRoute>
          } />
          <Route path="/profile" element={
            <PrivateRoute>
              <ProfileCompletionGuard>
                <ProfilePage />
              </ProfileCompletionGuard>
            </PrivateRoute>
          } />

          {/* Admin Routes - SUPER ADMIN ONLY */}
          <Route path="/admin/dashboard" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminDashboardPage />
            </PrivateRoute>
          } />
          <Route path="/admin/materials" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminMaterialsPage />
            </PrivateRoute>
          } />
          <Route path="/admin/sessions" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminSessionsPage />
            </PrivateRoute>
          } />
          <Route path="/admin/users" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminUserManagementPage />
            </PrivateRoute>
          } />
          <Route path="/admin/migration" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminMigrationPage />
            </PrivateRoute>
          } />
          {/* Admin Courses - SUPER ADMIN ONLY */}
          <Route path="/admin/courses" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminCoursesPage />
            </PrivateRoute>
          } />

          {/* Admin Classes - SUPER ADMIN ONLY */}
          <Route path="/admin/classes" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminClassesPage />
            </PrivateRoute>
          } />

          {/* Admin Settings - SUPER ADMIN ONLY */}
          <Route path="/admin/settings" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminSettingsPage />
            </PrivateRoute>
          } />

          {/* Admin Backup & Recovery - SUPER ADMIN ONLY (PRD-0026) */}
          <Route path="/admin/backup" element={
            <PrivateRoute allowedRoles={['super_admin']}>
              <AdminBackupPage />
            </PrivateRoute>
          } />


          {/* Teacher Student Management - TEACHERS ONLY */}
          <Route path="/teacher/students" element={
            <PrivateRoute allowedRoles={['teacher']}>
              <TeacherStudentsPage />
            </PrivateRoute>
          } />

          {/* Teacher Homework Management - TEACHERS ONLY (PRD-0016) */}
          <Route path="/teacher/homework" element={
            <PrivateRoute allowedRoles={['teacher']}>
              <TeacherHomeworkListPage />
            </PrivateRoute>
          } />

          {/* Teacher Routes - TEACHERS ONLY (super_admin uses /admin routes) */}
          <Route path="/lobby" element={
            <PrivateRoute allowedRoles={['teacher']}>
              <ProfileCompletionGuard>
                <TeacherLobbyPage />
              </ProfileCompletionGuard>
            </PrivateRoute>
          } />
          <Route path="/teacher-lobby/:sessionCode" element={
            <PrivateRoute allowedRoles={['teacher']}>
              <ProfileCompletionGuard>
                <TeacherLobbyPage />
              </ProfileCompletionGuard>
            </PrivateRoute>
          } />
          <Route path="/sessions" element={<PrivateRoute allowedRoles={['teacher']}><SessionManagementPage /></PrivateRoute>} />
          <Route path="/teacher/results" element={<PrivateRoute allowedRoles={['teacher']}><TeacherResultsDashboard /></PrivateRoute>} />

          <Route path="/create-test" element={<PrivateRoute allowedRoles={['teacher']}><TestBuilderRouter /></PrivateRoute>} />
          <Route path="/teacher-wait/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}><TeacherWaitingRoomPage /></PrivateRoute>} />
          <Route path="/teacher-quiz/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}><TeacherQuizPage /></PrivateRoute>} />
          <Route path="/teacher-test/:sessionCode" element={<PrivateRoute allowedRoles={['teacher']}><TeacherTestMonitorPage /></PrivateRoute>} />
          <Route path="/teacher-test-results/:sessionCode" element={<PrivateRoute allowedRoles={['teacher']}><TeacherTestResultsPage /></PrivateRoute>} />
          <Route path="/teacher-feedback/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}><TeacherFeedbackPage /></PrivateRoute>} />
          <Route path="/teacher-results/:gameSessionId" element={<PrivateRoute allowedRoles={['teacher']}><TeacherResultsPage /></PrivateRoute>} />
          <Route path="/teacher/classes" element={<PrivateRoute allowedRoles={['teacher']}><TeacherClassesPage /></PrivateRoute>} />
          <Route path="/teacher/courses" element={<PrivateRoute allowedRoles={['teacher']}><TeacherCoursesPage /></PrivateRoute>} />
          <Route path="/teacher/courses/:courseId" element={<PrivateRoute allowedRoles={['teacher']}><TeacherCourseProfilePage /></PrivateRoute>} />
          <Route path="/material/:materialId" element={<PrivateRoute allowedRoles={['teacher']}><MaterialProfilePage /></PrivateRoute>} />
          <Route path="/teacher/classes/:classId" element={<PrivateRoute allowedRoles={['teacher']}><TeacherClassDetailPage /></PrivateRoute>} />
          <Route path="/teacher/student/:studentId/history" element={<PrivateRoute allowedRoles={['teacher']}><TeacherStudentHistoryPage /></PrivateRoute>} />

          {/* PRD-0020: IELTS Test Creation - Redirects to Materials + auto-open modal */}
          <Route path="/teacher/test/create" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><TestCreationRedirectPage /></PrivateRoute>} />
          {/* PRD-0020: Standalone test creation page (direct access) */}
          <Route path="/teacher/test/create-standalone" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><TestCreationPage /></ErrorBoundary></PrivateRoute>} />
          {/* PRD-0022: Test Review Page - Teachers and Super Admins */}
          <Route path="/teacher/test/review/:draftId" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><TestReviewPage /></ErrorBoundary></PrivateRoute>} />
          {/* PRD-0027: THCS-THPT Test Editor - Teachers Only */}
          <Route path="/teacher/thcs-test/create" element={<PrivateRoute allowedRoles={['teacher']}><ErrorBoundary><THCSTestEditorPage /></ErrorBoundary></PrivateRoute>} />
          <Route path="/teacher/thcs-test/edit/:draftId" element={<PrivateRoute allowedRoles={['teacher']}><ErrorBoundary><THCSTestEditorPage /></ErrorBoundary></PrivateRoute>} />
          {/* PRD-0028: THCS Grading Tab - Teachers and Super Admins */}
          <Route path="/teacher/grading" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><TeacherGradingPage /></ErrorBoundary></PrivateRoute>} />
          {/* PRD-0030: IELTS Writing Test System */}
          <Route path="/teacher/writing-test/create" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><WritingTestBuilder /></ErrorBoundary></PrivateRoute>} />
          <Route path="/teacher/writing-test/edit/:draftId" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><WritingTestBuilder /></ErrorBoundary></PrivateRoute>} />
          <Route path="/teacher/grading/writing" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><TeacherGradingPage /></ErrorBoundary></PrivateRoute>} />
          <Route path="/teacher/grading/writing/:submissionId" element={<PrivateRoute allowedRoles={['teacher', 'super_admin']}><ErrorBoundary><WritingGradingPage /></ErrorBoundary></PrivateRoute>} />

          {/* Student Routes */}
          <Route path="/student" element={
            <PrivateRoute allowedRoles={['student']}>
              <ProfileCompletionGuard>
                <StudentDashboardPage />
              </ProfileCompletionGuard>
            </PrivateRoute>
          } />
          <Route path="/student/dashboard" element={
            <PrivateRoute allowedRoles={['student']}>
              <ProfileCompletionGuard>
                <StudentDashboardPage />
              </ProfileCompletionGuard>
            </PrivateRoute>
          } />
          <Route path="/student/courses" element={<PrivateRoute allowedRoles={['student']}><StudentCoursesPage /></PrivateRoute>} />
          <Route path="/student/courses/:courseId" element={<PrivateRoute allowedRoles={['student']}><StudentCourseDetailPage /></PrivateRoute>} />
          <Route path="/student/courses/catalog" element={<PrivateRoute allowedRoles={['student']}><StudentCourseCatalogPage /></PrivateRoute>} />
          <Route path="/student/classes/:classId" element={<PrivateRoute allowedRoles={['student']}><StudentClassDetailPage /></PrivateRoute>} />
          {/* Student Session Routes - PROTECTED (PRD-0016) */}
          <Route path="/student-wait/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}><StudentWaitingRoomPage /></PrivateRoute>} />
          <Route path="/student-quiz/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}><StudentQuizPage /></PrivateRoute>} />
          <Route path="/student-test/:sessionCode" element={<PrivateRoute allowedRoles={['student']}><TestPageRouter /></PrivateRoute>} />
          <Route path="/student-test-results/:sessionCode" element={<PrivateRoute allowedRoles={['student']}><StudentTestResultsPage /></PrivateRoute>} />
          <Route path="/student-feedback/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}><StudentFeedbackPage /></PrivateRoute>} />
          <Route path="/student-results/:gameSessionId" element={<PrivateRoute allowedRoles={['student']}><StudentResultsPage /></PrivateRoute>} />
          {/* Student test results by session code (used by post-submission redirect) */}
          <Route path="/student/results/:sessionCode" element={<PrivateRoute allowedRoles={['student']}><StudentTestResultsPage /></PrivateRoute>} />
          {/* PRD-0016: Solo Study & Homework System */}
          <Route path="/student/library" element={<PrivateRoute allowedRoles={['student']}><StudentLibraryPage /></PrivateRoute>} />
          {/* PRD-0025: Unified Solo Practice Mode - NEW canonical route */}
          <Route path="/student/practice/:materialId" element={<PrivateRoute allowedRoles={['student']}><StudentPracticePage /></PrivateRoute>} />
          {/* PRD-0025: Legacy redirect - old solo-test URLs still work */}
          <Route path="/student/solo-test/:materialId" element={<PrivateRoute allowedRoles={['student']}><StudentPracticePage /></PrivateRoute>} />
          {/* PRD-0016: Student Homework Routes */}
          <Route path="/student/homework" element={<PrivateRoute allowedRoles={['student']}><StudentHomeworkListPage /></PrivateRoute>} />
          <Route path="/student/homework/:homeworkId" element={<PrivateRoute allowedRoles={['student']}><StudentHomeworkDetailPage /></PrivateRoute>} />
          <Route path="/student/homework/:homeworkId/test" element={<PrivateRoute allowedRoles={['student']}><StudentPracticePage /></PrivateRoute>} />
          <Route path="/student/academic-record" element={<PrivateRoute allowedRoles={['student']}><AcademicRecordPage /></PrivateRoute>} />
          {/* PRD-0019: Post-submission confirmation for Writing tests */}
          <Route path="/submission-complete" element={<PrivateRoute allowedRoles={['student']}><SubmissionCompletePage /></PrivateRoute>} />
          <Route path="/result/:resultId" element={<PrivateRoute allowedRoles={['student', 'teacher', 'super_admin']}><ResultDetailPage /></PrivateRoute>} />

          {/* Demo/Testing Routes */}
          <Route path="/demo" element={<DemoIndexPage />} />
          <Route path="/demo/feedback" element={<FeedbackComponentsDemo />} />
          <Route path="/demo/feedback-system" element={<FeedbackDemoPage />} />
          <Route path="/demo/academic-record" element={<AcademicRecordDemoPage />} />
        </Routes>
        <AdminLoginModal show={showAdminLogin} handleClose={() => setShowAdminLogin(false)} />

        <ConfirmDialog />
      </Suspense>
    </BrowserRouter >
  );
}

export default App;
