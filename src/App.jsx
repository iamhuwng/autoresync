import { BrowserRouter, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, Suspense } from 'react';
import { ToastContainer, VanillaLoader } from './components/modern';
import { initBreadcrumbs } from './hooks/useBreadcrumbs';
import { reportingService } from './services/reportingService';
import { ConfirmDialog } from './components/modals/ConfirmDialog.tsx';
import PublicRoutes from './routes/PublicRoutes.tsx';
import { formatDocumentTitle } from './core/platform';

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

function RoutedAppContent() {
  const location = useLocation();

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    // Reset to the app brand on route changes so pages without explicit titles
    // do not keep the previous route's tab title.
    document.title = formatDocumentTitle();
  }, [location.key]);

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <PublicRoutes />
        <ConfirmDialog />
      </Suspense>
      <ToastContainer />
    </>
  );
}

function App() {
  useEffect(() => {
    reportingService.initCore();
    initBreadcrumbs();
  }, []);

  return (
    <BrowserRouter>
      <RoutedAppContent />
    </BrowserRouter>
  );
}

export default App;
