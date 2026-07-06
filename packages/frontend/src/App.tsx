import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './pages/Layout'
import HomePage from './pages/HomePage/HomePage'
import EditorPage from './pages/EditorPage/EditorPage'
import LoginPage from './pages/LoginPage/LoginPage'
import ApiKeysPage from './pages/SettingsPage/ApiKeysPage'
import RequireAuth from './components/RequireAuth'

function App() {
  return (
    <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protégé : redirige vers /login si pas de session */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="editor/:id" element={<EditorPage />} />
                <Route path="settings/api-keys" element={<ApiKeysPage />} />
              </Route>
            </Route>
          </Routes>
    </BrowserRouter>
  )
}

export default App
