import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { applyPendingUpdate } from './lib/appUpdate'
import type { ReactNode } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { BottomNav } from './components/layout/BottomNav'
import { SideNav } from './components/layout/SideNav'
import { FixedLayer } from './components/layout/FixedLayer'
import { BetaBannerSlot } from './components/layout/BetaBanner'
import { useAppStore } from './store/useAppStore'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { CheckIn } from './pages/CheckIn'
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
import { useKeyboardInset } from './hooks/useKeyboardInset'

function App() {
  useKeyboardInset()

  return (
    <AuthProvider>
      <BrowserRouter>
        <UpdateOnNavigate />
        {/* The `app` container drives the phone ↔ iPad layout switch: container
            queries (`@3xl/app:`) rather than media queries, so the shell
            responds to the space it actually has. */}
        <div className="@container/app w-full min-h-svh relative bg-[#0a0a0a] overflow-x-clip">
          {/* Backs the translucent iOS status bar so content scrolling up on
              header-less screens (Home) doesn't run under the clock and
              Dynamic Island. Zero-height where there's no top inset. */}
          <FixedLayer>
            <div aria-hidden className="absolute top-0 inset-x-0 h-(--safe-top) bg-[#0a0a0a]/90 backdrop-blur-xl pointer-events-none" />
          </FixedLayer>
          <BetaBannerSlot />
          <Routes>
            <Route path="/login" element={<PhoneColumn><Login /></PhoneColumn>} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <Routes>
                    <Route path="/onboarding" element={<PhoneColumn><Onboarding /></PhoneColumn>} />
                    <Route path="/check-in" element={<RequireOnboarded><PhoneColumn><CheckIn /></PhoneColumn></RequireOnboarded>} />
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

/**
 * A downloaded update waits while the athlete is mid-workout or mid-chat;
 * leaving that screen is the next safe moment to switch to it.
 */
function UpdateOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => {
    applyPendingUpdate()
  }, [pathname])
  return null
}

/** Single centred phone-width column, for the screens without navigation. */
function PhoneColumn({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-md mx-auto min-h-svh relative">{children}</div>
}

/**
 * Signed-in shell. Phones: one column with the floating tab bar. At 48rem+
 * (iPad, wide windows): sidebar on the left and a wider content column.
 */
function MainApp() {
  return (
    <div className="flex min-h-svh">
      <SideNav />
      <main className="app-main flex-1 min-w-0 @3xl/app:pr-(--safe-right)">
        <div className="w-full max-w-md @3xl/app:max-w-xl @5xl/app:max-w-2xl mx-auto min-h-svh relative">
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
        </div>
      </main>
      <BottomNav />
      <ReleaseNotesGate />
    </div>
  )
}

export default App
