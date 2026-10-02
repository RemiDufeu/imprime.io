import { Navigate, Outlet } from 'react-router-dom'
import { isAdmin, useSession } from '../auth/authClient'

/**
 * Route guard for the administration pages: sends anyone without the admin
 * role back home. Nested inside `RequireAuth`, so the session is loaded.
 */
export default function RequireAdmin() {
  const { data } = useSession()

  if (!isAdmin(data?.user)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
