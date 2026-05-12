import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { useApp } from './state/AppContext';
import { Dashboard } from './pages/Dashboard';
import { UpdateBalances } from './pages/UpdateBalances';
import { Income } from './pages/Income';
import { Expenses } from './pages/Expenses';
import { PeriodAssign } from './pages/PeriodAssign';
import { Setup } from './pages/Setup';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';

function Gate() {
  const { ready, year } = useApp();
  if (!ready) {
    return (
      <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>Loading…</div>
    );
  }
  if (!year) return <Navigate to="/setup" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { path: 'setup', element: <Setup /> },
      {
        path: '',
        element: <Gate />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'balances', element: <UpdateBalances /> },
          { path: 'income', element: <Income /> },
          { path: 'expenses', element: <Expenses /> },
          { path: 'period/:id/assign', element: <PeriodAssign /> },
          { path: 'settings', element: <Settings /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
