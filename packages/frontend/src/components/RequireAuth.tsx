import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../auth/authClient'
import SpinnerFullScreen from './Feedback/SpinnerFullScreen'

/**
 * Garde de route : laisse passer si une session est présente, sinon redirige
 * vers /login. Utilisée comme route parente enveloppant les pages protégées.
 */
export default function RequireAuth() {
  const { data, isPending } = useSession()
  const location = useLocation()

  if (isPending) {
    return <SpinnerFullScreen />
  }

  if (!data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
