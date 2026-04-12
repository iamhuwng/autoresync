import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { studentResumeService } from '../services/studentResume.service';

const STUDENT_RESUME_ENTRY_PATHS = new Set(['/student', '/student/dashboard']);

export default function StudentResumeBootstrap() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { navigateTo } = useNavigation('student');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.uid || !STUDENT_RESUME_ENTRY_PATHS.has(location.pathname)) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const resumeTarget = await studentResumeService.resolveResume(user.uid);
        if (!cancelled && resumeTarget) {
          navigateTo(resumeTarget.route, resumeTarget.params, {
            replace: true,
            state: resumeTarget.state,
            reason: 'student_activity_resume',
          });
          return;
        }
      } catch (error) {
        console.warn('[StudentResumeBootstrap] Failed to resolve student resume:', error);
      }

      if (!cancelled) {
        setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, location.pathname, navigateTo, user?.uid]);

  if (loading || (checking && STUDENT_RESUME_ENTRY_PATHS.has(location.pathname))) {
    return null;
  }

  return null;
}
