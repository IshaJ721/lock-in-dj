import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import { loadSettings } from './utils/settings'
import Toast from './components/Toast'

function App() {
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding showToast={showToast} />} />
        <Route path="/dashboard" element={<Dashboard showToast={showToast} />} />
        <Route path="/" element={<RedirectBasedOnState />} />
      </Routes>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

function RedirectBasedOnState() {
  const settings = loadSettings()

  if (!settings.user.loggedIn) {
    return <Navigate to="/login" replace />
  }

  if (!settings.user.onboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return <Navigate to="/dashboard" replace />
}

export default App
