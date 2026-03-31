import { BrowserRouter } from 'react-router-dom';
import { useEffect, Suspense } from 'react';
import { ToastContainer, VanillaLoader } from './components/modern';
import { initBreadcrumbs } from './hooks/useBreadcrumbs';
import { reportingService } from './services/reportingService';
import { ConfirmDialog } from './components/modals/ConfirmDialog.tsx';
import PublicRoutes from './routes/PublicRoutes.tsx';

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

function App() {
  useEffect(() => {
    reportingService.initCore();
    initBreadcrumbs();
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <PublicRoutes />
        <ConfirmDialog />
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
