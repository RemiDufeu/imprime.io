import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './pages/Layout'
import HomePage from './pages/HomePage/HomePage'
import EditorPage from './pages/EditorPage/EditorPage'

function App() {
  return (
    <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="editor/:id" element={<EditorPage />} />
            </Route>
          </Routes>
    </BrowserRouter>
  )
}

export default App
