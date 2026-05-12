import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RequireAuth() {
  const { ready, session } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>Loading…</div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
