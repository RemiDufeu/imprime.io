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

  // Back here once signed in: the login page follows `redirect` — a preview
  // link opened from an agent's answer lands on the preview.
  if (!data) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  return <Outlet />
}
