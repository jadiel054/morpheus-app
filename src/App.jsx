import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './lib/authContext'
import { ThemeProvider } from './lib/themeContext'
import { LoginGate } from './components/morpheus/LoginGate'
import { UpdateBanner } from './components/pwa/UpdateBanner'
import { InstallPWA } from './components/pwa/InstallPWA'
import Morpheus from './pages/Morpheus'
import Home from './pages/Home'
import SecurityBlock from './pages/SecurityBlock'
import DigitalAssets from './pages/DigitalAssets'
import ExportSource from './pages/ExportSource'
import DownloadSchema from './pages/DownloadSchema'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0a1520',
              border: '1px solid #0d2030',
              color: '#00FFFF',
              fontFamily: 'monospace',
              fontSize: '13px',
            },
          }}
        />
        <UpdateBanner />
        <InstallPWA />
        <Routes>
          <Route path="/" element={<LoginGate><Morpheus /></LoginGate>} />
          <Route path="/Morpheus" element={<LoginGate><Morpheus /></LoginGate>} />
          <Route path="/Home" element={<Home />} />
          <Route path="/SecurityBlock" element={<SecurityBlock />} />
          <Route path="/DigitalAssets" element={<LoginGate><DigitalAssets /></LoginGate>} />
          <Route path="/download-schema" element={<LoginGate><DownloadSchema /></LoginGate>} />
          <Route path="/export-source" element={<LoginGate><ExportSource /></LoginGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}
