import { useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { BookPdfViewerHost } from '../components/book-runtime/BookPdfViewerHost';

const smokeRoute = () => ({
  workerOrigin: window.location.origin,
  opaqueRouteKey: 'smoke-viewer',
  sourceVersionId: 'smoke-source-v1',
  physicalPageNumber: 1,
});

export default function BookPdfViewerSmokePage() {
  const { user, profile } = useAuth();
  const route = useMemo(() => smokeRoute(), []);
  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!user) return '';
    const token = await Promise.race([
      user.getIdToken(forceRefresh).catch(() => ''),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('smoke-viewer-token'), 250);
      }),
    ]);
    return token || 'smoke-viewer-token';
  }, [user]);

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <p>Loading viewer auth...</p>
      </main>
    );
  }

  return (
    <main style={{ display: 'grid', gap: 16, padding: 24 }}>
      <header>
        <p style={{ margin: 0, color: '#5d687b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Teacher viewer fixture
        </p>
        <h1 style={{ margin: '4px 0 0' }}>Book PDF viewer smoke</h1>
        <p style={{ margin: '8px 0 0' }}>
          {user ? `Signed in as ${profile?.role ?? 'user'}${user.email ? ` - ${user.email}` : ''}` : 'No authenticated user loaded.'}
        </p>
      </header>
      <BookPdfViewerHost
        title="Smoke PDF"
        route={route}
        getIdToken={getIdToken}
      />
    </main>
  );
}
