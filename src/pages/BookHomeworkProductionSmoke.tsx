import { useEffect, useState } from 'react';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { useSearchParams } from 'react-router-dom';
import { BookPlacementRuntimeHost } from '../components/book-runtime/BookPlacementRuntimeHost';
import { createBookRuntimeViewerAdapter } from '../components/book-runtime/BookRuntimeViewerAdapter';
import { BookResultAdapter } from '../components/results/BookResultAdapter';
import { BookActivityGradingPanel } from '../components/results/BookActivityGradingPanel';
import { createBookHomeworkPlacementBrowserClient, resolveBookPlacementLaunch } from '../services/book-delivery/bookPlacementLaunch.browser';
import type { BookRuntimeDeliveryProjection } from '../services/book-delivery/bookDelivery.types';
import { createBookActivityLaunchBrowserClient } from '../services/book-activity/activityLaunch.browser';
import { createBookActivityEvaluationBrowserClient, type BookActivityEvaluationLocator } from '../services/book-activity/activityEvaluation.browser';
import { createBookResultBrowserClient } from '../services/bookResult.browser';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useFeatureTracking } from '../hooks/useFeatureTracking';

const origin = 'http://localhost:8792';

// QA external transport only. Default Runtime/PDF/integrity clients retain logical response binding.
const installTransport = (actor: string) => {
  const externalFetch = window.fetch;
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (url.hostname === 'identitytoolkit.googleapis.com' || url.hostname === 'securetoken.googleapis.com') {
      const response = await externalFetch(`${origin}/__homework-production/auth-response?uid=${actor}`);
      if (!response.ok) throw new Error('fixture_auth_unavailable');
      const auth = await response.json();
      const payload = url.pathname.includes('accounts:lookup')
        ? { users: [{ localId: actor, email: `${actor}@example.test`, emailVerified: true }] }
        : url.hostname === 'securetoken.googleapis.com'
          ? { access_token: auth.idToken, id_token: auth.idToken, refresh_token: auth.refreshToken,
            expires_in: auth.expiresIn, user_id: actor, project_id: 'homework-production-fixture' }
          : { ...auth, localId: actor };
      return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
    }
    if (/^\/(?:v1\/book-delivery|v1\/book-evaluation|book-delivery|book-runtime|book-integrity|book-evaluation)(?:\/|$)/u.test(url.pathname)) {
      const mapped = `${origin}${url.pathname}${url.search}`;
      const response = await externalFetch(input instanceof Request ? new Request(mapped, input) : mapped, init);
      Object.defineProperty(response, 'url', { value: url.href });
      return response;
    }
    return externalFetch(input, init);
  };
  window.fetch = fixtureFetch;
  return () => { if (window.fetch === fixtureFetch) window.fetch = externalFetch; };
};

const readLocator = (value: string | null): BookActivityEvaluationLocator => {
  const input: unknown = JSON.parse(value ?? 'null');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('fixture_locator_required');
  const record = input as Record<string, unknown>;
  const id = (key: string) => {
    const value = record[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(value)) {
      throw new Error('fixture_locator_invalid');
    }
    return value;
  };
  if (record.contextKind !== 'homework') throw new Error('fixture_locator_context_invalid');
  return { bookId: id('bookId'), studentId: id('studentId'), contextKind: 'homework',
    contextId: id('contextId'), placementId: id('placementId'), activityId: id('activityId'),
    activityVersionId: id('activityVersionId'),
    ...(record.terminalId === undefined ? {} : { terminalId: id('terminalId') }),
    ...(record.attemptId === undefined ? {} : { attemptId: id('attemptId') }),
  };
};

export default function BookHomeworkProductionSmoke() {
  const [params] = useSearchParams();
  const actor = params.get('actor') ?? 'student-1';
  const view = params.get('view') ?? 'runtime';
  const homeworkId = params.get('homeworkId');
  const routeHandle = params.get('routeHandle');
  const locatorQuery = params.get('locator');
  const fixture = params.get('fixture');
  const { trackAction } = useFeatureTracking(view === 'grade' ? FEATURE_IDS.homework : FEATURE_IDS.testTaking);
  const [state, setState] = useState<{
    actor: string;
    projection: BookRuntimeDeliveryProjection | null;
    locator: BookActivityEvaluationLocator | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setState(null);
    setError(null);
    if (fixture !== 'homework-production' || !import.meta.env.DEV
      || !['student-1', 'teacher-1'].includes(actor) || !['runtime', 'result', 'grade'].includes(view)) {
      setError('Homework QA fixture unavailable.');
      return;
    }
    const restore = installTransport(actor);
    void (async () => {
      const response = await fetch(`${origin}/__homework-production/auth-token?uid=${actor}`);
      if (!response.ok) throw new Error('fixture_auth_unavailable');
      const { token } = await response.json() as { token: string };
      if (!active) return;
      await signInWithCustomToken(getAuth(), token);
      if (!active) return;
      const uid = getAuth().currentUser?.uid;
      if (uid !== actor) throw new Error('fixture_actor_mismatch');
      let projection: BookRuntimeDeliveryProjection | null = null;
      let locator: BookActivityEvaluationLocator | null = null;
      if (view === 'runtime') {
        if (!homeworkId) throw new Error('fixture_homework_required');
        const homework = createBookHomeworkPlacementBrowserClient({ baseUrl: origin,
          getCurrentUserId: () => getAuth().currentUser?.uid,
          getIdToken: (refresh) => getAuth().currentUser?.getIdToken(refresh) ?? Promise.resolve(null),
        });
        const launch = await resolveBookPlacementLaunch({ studentId: uid,
          launch: { kind: 'homework', surface: 'homework', homeworkId }, clients: { homework } });
        if (launch.status !== 'resolved') throw new Error(`fixture_launch_${launch.reason}`);
        projection = launch.projection;
      } else if (view === 'grade') locator = readLocator(locatorQuery);
      else if (!routeHandle) throw new Error('fixture_result_route_required');
      if (active) setState({ actor: uid, projection, locator });
    })().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Homework QA fixture failed.');
    });
    return () => { active = false; restore(); };
  }, [actor, fixture, homeworkId, locatorQuery, routeHandle, view]);
  if (error) return <main><p role="alert">{error}</p></main>;
  if (!state) return <main><p role="status">Loading Homework QA fixture…</p></main>;
  const options = { baseUrl: origin,
    getIdToken: (refresh?: boolean) => getAuth().currentUser?.getIdToken(refresh) ?? Promise.resolve(null) };
  if (view === 'result' && routeHandle) return <BookResultAdapter routeHandle={routeHandle}
    viewerId={state.actor} viewerRole={state.actor === 'teacher-1' ? 'teacher' : 'student'}
    client={createBookResultBrowserClient(options)} evaluationClient={createBookActivityEvaluationBrowserClient(options)} />;
  if (view === 'grade' && state.locator) return <BookActivityGradingPanel locator={state.locator}
    studentName={state.locator.studentId} activityLabel={state.locator.activityId}
    client={createBookActivityEvaluationBrowserClient(options)} onAction={trackAction} />;
  if (state.projection) return <BookPlacementRuntimeHost projection={state.projection}
    viewer={createBookRuntimeViewerAdapter({ env: { DEV: true, VITE_BOOK_DELIVERY_WORKER_URL: origin },
      getIdToken: options.getIdToken })}
    activityClient={createBookActivityLaunchBrowserClient(options)} onAction={trackAction} />;
  return <main><p role="alert">Homework QA fixture unavailable.</p></main>;
}
