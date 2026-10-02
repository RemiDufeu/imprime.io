import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './pages/Layout'
import HomePage from './pages/HomePage/HomePage'
import EditorPage from './pages/EditorPage/EditorPage'
import LoginPage from './pages/LoginPage/LoginPage'
import ConsentPage from './pages/LoginPage/ConsentPage'
import VerifyEmailPage from './pages/LoginPage/VerifyEmailPage'
import ForgotPasswordPage from './pages/LoginPage/ForgotPasswordPage'
import ResetPasswordPage from './pages/LoginPage/ResetPasswordPage'
import ApiKeysPage from './pages/SettingsPage/ApiKeysPage'
import AdminPage from './pages/AdminPage/AdminPage'
import FontsPage from './pages/AdminPage/FontsPage/FontsPage'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'

function App() {
  return (
    <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/oauth/consent" element={<ConsentPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protégé : redirige vers /login si pas de session */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="editor/:id" element={<EditorPage />} />
                <Route path="settings/api-keys" element={<ApiKeysPage />} />

                {/* Administration de l'instance : rôle admin requis */}
                <Route element={<RequireAdmin />}>
                  <Route path="admin" element={<AdminPage />}>
                    <Route index element={<Navigate to="fonts" replace />} />
                    <Route path="fonts" element={<FontsPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Routes>
    </BrowserRouter>
  )
}

export default App
