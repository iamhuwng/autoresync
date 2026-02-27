/**
 * Test Page Router
 * Routes students to skill-specific test pages based on test type
 * 
 * Architecture:
 * - Reads test data from Firebase to determine skill
 * - Routes to ReadingTestPage for Reading tests
 * - Routes to generic StudentTestPage for other skills (until implemented)
 * - Provides loading state and error handling
 * 
 * Created: Phase 2 Step 2.8 (Nov 24, 2025)
 */

import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { database } from '../services/firebase';
import { Center, Loader } from '@mantine/core';
import ReadingTestPage from '../skills/reading/components/ReadingTestPage';
import ListeningTestPage from '../skills/listening/components/ListeningTestPage';
import StudentTestPage from './StudentTestPage';

// PRD-0027: Lazy-load THCS-THPT student layout
const THCSTestLayout = lazy(() => import('../components/thcs-student/THCSTestLayout'));
// PRD-0030: Lazy-load IELTS Writing student page
const WritingTestPage = lazy(() => import('../components/writing-student/WritingTestPage'));

interface TestPageRouterProps {
  // No props needed - reads from URL params
}

const TestPageRouter: React.FC<TestPageRouterProps> = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const [skill, setSkill] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thcsTestData, setThcsTestData] = useState<any>(null); // PRD-0027: THCS test data for layout
  const [writingTestData, setWritingTestData] = useState<any>(null); // PRD-0030: Writing test data

  useEffect(() => {
    const detectSkill = async () => {
      if (!sessionCode) {
        setError('No session code provided');
        setLoading(false);
        return;
      }

      try {
        const t0 = performance.now();

        // PERF FIX: Only read testId from session, NOT the entire session node
        // (which includes all students' answers, progress — potentially huge)
        const testIdRef = ref(database, `game_sessions/${sessionCode}/testId`);
        const testIdSnapshot = await get(testIdRef);
        const t1 = performance.now();
        console.log(`⏱ [TestPageRouter] Session testId fetch: ${Math.round(t1 - t0)}ms`);

        if (!testIdSnapshot.exists()) {
          // Check if session itself exists
          const sessionExistsRef = ref(database, `game_sessions/${sessionCode}/createdAt`);
          const sessionExistsSnap = await get(sessionExistsRef);
          if (!sessionExistsSnap.exists()) {
            setError('Session not found');
          } else {
            // Session exists but no test selected yet
            setSkill('generic');
          }
          setLoading(false);
          return;
        }

        const testId = testIdSnapshot.val();

        // PERF FIX: First read only testType to decide routing quickly
        const testTypeRef = ref(database, `tests/${testId}/testType`);
        const testTypeSnapshot = await get(testTypeRef);
        const t2 = performance.now();
        console.log(`⏱ [TestPageRouter] Test type fetch: ${Math.round(t2 - t1)}ms`);

        const testType = testTypeSnapshot.val();

        // PRD-0027: THCS-THPT tests use testType discriminator, not skill
        if (testType === 'THCS-THPT') {
          console.log('📍 Test Page Router: Detected THCS-THPT test');
          // Fetch full test data for THCS layout
          const testRef = ref(database, `tests/${testId}`);
          const testSnapshot = await get(testRef);
          const t3 = performance.now();
          console.log(`⏱ [TestPageRouter] Full THCS test fetch: ${Math.round(t3 - t2)}ms (total: ${Math.round(t3 - t0)}ms)`);

          if (!testSnapshot.exists()) {
            setError('Test data not found');
            setLoading(false);
            return;
          }

          const testData = testSnapshot.val();
          // PERF FIX: Strip _changelog and stats — student doesn't need version
          // history or aggregated stats. _changelog can be very large with full deltas.
          delete testData._changelog;
          delete testData.stats;

          setThcsTestData(testData);
          setSkill('THCS-THPT');
          setLoading(false);
          return;
        }

        // IELTS tests: read skill field
        if (!testTypeSnapshot.exists()) {
          // testType not set — read skill instead (legacy IELTS format)
          const skillRef = ref(database, `tests/${testId}/skill`);
          const skillSnapshot = await get(skillRef);
          const testSkill = skillSnapshot.val() || 'Reading';
          console.log(`📍 Test Page Router: Detected skill = ${testSkill}`);

          // PRD-0030: Writing tests need full test data
          if (testSkill === 'Writing') {
            const testRef = ref(database, `tests/${testId}`);
            const testSnapshot = await get(testRef);
            if (testSnapshot.exists()) {
              setWritingTestData(testSnapshot.val());
            }
          }

          setSkill(testSkill);
        } else {
          // Non-THCS test with testType set — fallback to generic
          setSkill('generic');
        }
        setLoading(false);
      } catch (err) {
        console.error('Error detecting test skill:', err);
        setError('Failed to load test information');
        setLoading(false);
      }
    };

    detectSkill();
  }, [sessionCode]);

  // Loading state
  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader size="xl" />
          <div style={{ marginTop: '1rem', color: '#64748b', fontSize: '1rem' }}>
            Loading test...
          </div>
        </div>
      </Center>
    );
  }

  // Error state
  if (error) {
    return (
      <Center style={{ height: '100vh' }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Error Loading Test
          </div>
          <div style={{ color: '#64748b' }}>
            {error}
          </div>
        </div>
      </Center>
    );
  }

  // Route based on skill
  switch (skill) {
    case 'Reading':
      return <ReadingTestPage />;

    case 'Listening':
      return <ListeningTestPage />;

    // PRD-0027: THCS-THPT routing
    case 'THCS-THPT':
      return (
        <Suspense fallback={<Center style={{ height: '100vh' }}><Loader size="xl" /></Center>}>
          <THCSTestLayout testData={thcsTestData} sessionCode={sessionCode!} />
        </Suspense>
      );

    case 'Writing':
      if (writingTestData) {
        return (
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(59,130,246,0.15)', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite' }} />
              <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
            </div>
          }>
            <WritingTestPage testData={writingTestData} sessionCode={sessionCode!} />
          </Suspense>
        );
      }
      // No writing test data loaded yet — fallback
      return <StudentTestPage />;

    case 'Speaking':
      // Speaking is not yet implemented — use generic
      console.log(`⚠️ Speaking skill not yet implemented, using generic test page`);
      return <StudentTestPage />;

    case 'generic':
    default:
      // Fallback to generic test page
      return <StudentTestPage />;
  }
};

export default TestPageRouter;
