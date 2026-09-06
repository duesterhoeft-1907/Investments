import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session';
import { Spinner } from './components/ui';
import Wizard from './pages/Wizard';
import Login from './pages/Login';

/*
 * Die oeffentliche Anfrage-Strecke laedt sofort. Alles hinter der Anmeldung
 * (CRM, Chat, Diagramme) sowie das Kundenportal kommen als eigene Buendel –
 * ein Interessent soll nicht das gesamte CRM herunterladen.
 */
const AppShell = lazy(() => import('./components/AppShell'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Chat = lazy(() => import('./pages/Chat'));
const Team = lazy(() => import('./pages/Team'));
const Portal = lazy(() => import('./pages/Portal'));

function Loading({ light = false }: { light?: boolean }) {
  return (
    <div className={`flex min-h-screen items-center justify-center ${light ? 'bg-paper-50' : 'bg-ink-950'}`}>
      <Spinner size={30} />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <SessionProvider>
        <Routes>
          {/* Oeffentlich */}
          <Route path="/" element={<Wizard />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/portal/:token?"
            element={
              <Suspense fallback={<Loading light />}>
                <Portal />
              </Suspense>
            }
          />

          {/* Intern */}
          <Route
            path="/app"
            element={
              <RequireAuth>
                <Suspense fallback={<Loading />}>
                  <AppShell />
                </Suspense>
              </RequireAuth>
            }
          >
            <Route index element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
            <Route path="leads" element={<Suspense fallback={<Loading />}><Leads /></Suspense>} />
            <Route path="leads/:id" element={<Suspense fallback={<Loading />}><LeadDetail /></Suspense>} />
            <Route path="tasks" element={<Suspense fallback={<Loading />}><Tasks /></Suspense>} />
            <Route path="chat/:channelId?" element={<Suspense fallback={<Loading />}><Chat /></Suspense>} />
            <Route path="team" element={<Suspense fallback={<Loading />}><Team /></Suspense>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </Router>
  );
}
