import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { BottomNav } from './components/layout/BottomNav'
import { useAppStore } from './store/useAppStore'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { WeekPlanner } from './pages/WeekPlanner'
import { Session } from './pages/Session'
import { History } from './pages/History'
import { Progress } from './pages/Progress'
import { Program } from './pages/Program'
import { ProgramEdit } from './pages/ProgramEdit'
import { BestEfforts } from './pages/BestEfforts'
import { Settings } from './pages/Settings'
import { ReleaseNotesGate } from './components/shared/WhatsNew'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="w-full max-w-md mx-auto min-h-svh relative bg-[#0a0a0a] overflow-x-clip">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <Routes>
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route
                      path="/*"
                      element={
                        <RequireOnboarded>
                          <MainApp />
                        </RequireOnboarded>
                      }
                    />
                  </Routes>
                </RequireAuth>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

/**
 * First-run gate: until the athlete has completed onboarding, every in-app route
 * redirects to the onboarding chat. Existing accounts are treated as
 * onboarded (see the Supabase column default / `rowToProfile`).
 */
function RequireOnboarded({ children }: { children: ReactNode }) {
  const onboarded = useAppStore((s) => s.profile.onboarded)
  if (!onboarded) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function MainApp() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<WeekPlanner />} />
        <Route path="/session/:id" element={<Session />} />
        <Route path="/history" element={<History />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/progress/best-efforts" element={<BestEfforts />} />
        <Route path="/program" element={<Program />} />
        <Route path="/program/edit" element={<ProgramEdit />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <BottomNav />
      <ReleaseNotesGate />
    </>
  )
}

export default App
