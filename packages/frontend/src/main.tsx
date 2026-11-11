import '@ant-design/v5-patch-for-react-19'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import './index.css'
import App from './App.tsx'
import { AntdProvider } from './providers'
import { registerBuiltinFonts } from './fonts'

registerBuiltinFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AntdProvider>
      <App />
    </AntdProvider>
  </StrictMode>,
)
