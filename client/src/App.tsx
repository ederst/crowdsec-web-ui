import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from "./components/Layout";
import { AuthProvider } from "./contexts/AuthContext";
import { NotificationUnreadProvider } from "./contexts/NotificationUnreadContext";
import { RefreshProvider } from "./contexts/RefreshContext";
import { useRefresh } from "./contexts/useRefresh";
import { useAuth } from "./contexts/useAuth";
import { SyncOverlay } from "./components/SyncOverlay";
import { getBasePath } from "./lib/basePath";
import { useI18n } from "./lib/i18n";

const Dashboard = lazy(async () => ({ default: (await import('./pages/Dashboard')).Dashboard }));
const Alerts = lazy(async () => ({ default: (await import('./pages/Alerts')).Alerts }));
const Decisions = lazy(async () => ({ default: (await import('./pages/Decisions')).Decisions }));
const Notifications = lazy(async () => ({ default: (await import('./pages/Notifications')).Notifications }));

function RouteFallback() {
  const { t } = useI18n();
  return <div className="text-center p-8 text-gray-500">{t('app.loading')}</div>;
}

// ponytail: minimal blocked screen — no redirect, just a gate;
// real enforcement is backend, this prevents UI from rendering for unauthenticated requests
function AuthGate({ children }: { children: React.ReactNode }) {
  const { rbacEnabled, currentUser, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  if (rbacEnabled && !currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center max-w-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Authentication Required</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Access to this application requires authentication. Please sign in via the configured identity provider.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppContent() {
  const { syncStatus } = useRefresh();

  return (
    <>
      <SyncOverlay syncStatus={syncStatus} />
      <BrowserRouter basename={getBasePath() || '/'}>
        <AuthGate>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route
                index
                element={(
                  <Suspense fallback={<RouteFallback />}>
                    <Dashboard />
                  </Suspense>
                )}
              />
              <Route
                path="alerts"
                element={(
                  <Suspense fallback={<RouteFallback />}>
                    <Alerts />
                  </Suspense>
                )}
              />
              <Route
                path="decisions"
                element={(
                  <Suspense fallback={<RouteFallback />}>
                    <Decisions />
                  </Suspense>
                )}
              />
              <Route
                path="notifications"
                element={(
                  <Suspense fallback={<RouteFallback />}>
                    <Notifications />
                  </Suspense>
                )}
              />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <RefreshProvider>
        <NotificationUnreadProvider>
          <AppContent />
        </NotificationUnreadProvider>
      </RefreshProvider>
    </AuthProvider>
  );
}

export default App;
