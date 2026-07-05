import { useEffect } from 'react';
import { buildRoute, type RouteName } from '../constants/routes';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useNavigation } from '../hooks/useNavigation';
import type { UserRole } from '../types/navigation.types';

type NoticeAudience = 'teacher' | 'student' | 'guest';
type RetiredFeature = 'quiz' | 'material';

interface RetiredMaterialNoticePageProps {
  readonly audience: NoticeAudience;
  readonly retiredFeature: RetiredFeature;
}

const RETURN_ROUTE_BY_AUDIENCE: Record<NoticeAudience, RouteName> = {
  teacher: 'LOBBY',
  student: 'STUDENT_DASHBOARD',
  guest: 'LOGIN',
};

const RETURN_LABEL_BY_AUDIENCE: Record<NoticeAudience, string> = {
  teacher: 'Back to Teacher Lobby',
  student: 'Back to Student Dashboard',
  guest: 'Back to login',
};

const roleForAudience = (audience: NoticeAudience): UserRole =>
  audience === 'teacher' ? 'teacher' : 'student';

const NOTICE_CONTENT: Record<RetiredFeature, {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly viewAction: string;
  readonly returnAction: string;
}> = {
  quiz: {
    eyebrow: 'Material no longer available',
    title: 'Quiz Mode has been retired',
    body: 'This route no longer opens legacy gameplay or reads retired Quiz records. Supported test-mode sessions and saved results remain available.',
    viewAction: 'retiredQuizNoticeViewed',
    returnAction: 'retiredQuizNoticeReturn',
  },
  material: {
    eyebrow: 'Material no longer available',
    title: 'Material no longer available',
    body: 'The source for this material is no longer available. Supported test-mode sessions, academic records, and saved answer reviews remain available.',
    viewAction: 'materialUnavailableNoticeViewed',
    returnAction: 'materialUnavailableNoticeReturn',
  },
};

export default function RetiredMaterialNoticePage({
  audience,
  retiredFeature,
}: RetiredMaterialNoticePageProps) {
  const { trackAction } = useFeatureTracking();
  const { navigateTo } = useNavigation(roleForAudience(audience));
  const returnRoute = RETURN_ROUTE_BY_AUDIENCE[audience];
  const returnPath = buildRoute(returnRoute);
  const content = NOTICE_CONTENT[retiredFeature];

  useEffect(() => {
    trackAction(content.viewAction, {
      audience,
      retiredFeature,
    });
  }, [audience, content.viewAction, retiredFeature, trackAction]);

  const handleReturn = () => {
    trackAction(content.returnAction, {
      audience,
      retiredFeature,
      returnRoute,
    });
    navigateTo(returnRoute, undefined, {
      reason: 'retired_quiz_notice_return',
    });
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <section
        aria-labelledby="retired-material-notice-title"
        style={{
          width: 'min(100%, 42rem)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          borderRadius: '1.5rem',
          background: '#ffffff',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
          padding: '2rem',
        }}
      >
        <p
          style={{
            margin: '0 0 0.75rem',
            color: '#7c3aed',
            fontSize: '0.875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
        }}
      >
          {content.eyebrow}
        </p>
        <h1
          id="retired-material-notice-title"
          style={{
            margin: '0 0 1rem',
            color: '#0f172a',
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            lineHeight: 1.1,
          }}
        >
          {content.title}
        </h1>
        <p
          style={{
            margin: '0 0 1.5rem',
            color: '#475569',
            fontSize: '1rem',
            lineHeight: 1.65,
          }}
        >
          {content.body}
        </p>
        <button
          type="button"
          data-return-route={returnPath}
          onClick={handleReturn}
          style={{
            minHeight: '44px',
            border: 0,
            borderRadius: '999px',
            background: '#7c3aed',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 700,
            padding: '0.75rem 1.25rem',
          }}
        >
          {RETURN_LABEL_BY_AUDIENCE[audience]}
        </button>
      </section>
    </main>
  );
}
