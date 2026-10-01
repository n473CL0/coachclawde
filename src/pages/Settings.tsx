import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../store/useSettingsStore'
import { useAppStore } from '../store/useAppStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { Card, CardSection } from '../components/shared/Card'
import { SyncIndicator } from '../components/shared/SyncIndicator'
import { UserCircle, CheckCircle, AlertCircle, RefreshCw, LogOut, Sparkles, ChevronRight, Gift } from 'lucide-react'
import { WhatsNewSheet } from '../components/shared/WhatsNew'
import { APP_VERSION } from '../lib/appVersion'
import { RELEASES } from '../lib/releaseNotes'
import { ageFromBirthDate, isValidBirthDate } from '../lib/dateUtils'
import { toLocalISODate } from '../lib/weekUtils'

export function Settings() {
  const navigate = useNavigate()
  const { user, configured, signOut } = useAuth()
  const { syncStatus, syncError } = useSettingsStore()
  const { profile, setProfile } = useAppStore()
  const { sync } = useAutoSync()

  const [name, setName] = useState(profile.name ?? '')
  const [weight, setWeight] = useState(String(profile.weightKg))
  const [height, setHeight] = useState(String(profile.heightCm))
  const [sex, setSex] = useState<'male' | 'female'>(profile.sex)
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '')
  const age = ageFromBirthDate(birthDate)
  const [profileSaved, setProfileSaved] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  function handleSaveProfile() {
    // Never wipe a previously-set name with a blank field.
    const nextName = name.trim() || profile.name
    setName(nextName)
    setProfile({
      name: nextName,
      weightKg: Number(weight) || profile.weightKg,
      heightCm: Number(height) || profile.heightCm,
      sex,
      // Blank clears it; a half-typed or out-of-range date keeps the old one.
      birthDate: birthDate === '' ? undefined : isValidBirthDate(birthDate) ? birthDate : profile.birthDate,
    })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
    // Push the freshly-saved profile so details survive a future restore.
    void sync('profile')
  }

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a] pb-tabbar">
      <PageHeader title="Settings" backTo="/progress" />

      <div className="flex flex-col gap-5 px-4 pt-4">
        {/* Account & Sync */}
        <div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">
            Account &amp; Sync
          </p>
          <Card accent={!!user}>
            <CardSection>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle size={18} className="text-[#f5f5f0] shrink-0" />
                  <span className="text-sm font-semibold text-[#f5f5f0] truncate">
                    {user?.email ?? (configured ? 'Signed out' : 'Local mode')}
                  </span>
                </div>
                <SyncIndicator />
              </div>

              {user ? (
                <div className="flex flex-col gap-3">
                  <div className="text-xs text-[#6a6a6a] leading-relaxed bg-[#1a1a1a] rounded-2xl px-4 py-3">
                    <p className="font-medium text-[#a8a29e] mb-1">✓ Syncing to your account</p>
                    <p>Workouts and plans save to the cloud automatically, and load each time you open the app. Sign in on any device to pick up where you left off.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => sync('all')} fullWidth>
                      <RefreshCw size={14} />
                      Sync now
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => signOut()} fullWidth>
                      <LogOut size={14} />
                      Sign out
                    </Button>
                  </div>
                  {syncStatus === 'error' && (
                    <div className="flex items-start gap-2 text-red-400 bg-red-500/10 rounded-xl p-3">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <p className="text-xs">{syncError}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#6a6a6a] leading-relaxed">
                  {configured
                    ? 'You are signed out. Data is stored only on this device until you sign in.'
                    : 'Running in local-only mode — no backend is configured, so data stays on this device.'}
                </p>
              )}
            </CardSection>
          </Card>
        </div>

        {/* Profile */}
        <div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">Profile</p>
          <Card>
            <CardSection className="flex flex-col gap-3">
              <p className="text-xs text-[#6a6a6a] leading-relaxed">
                Saved to your account and included in the plan prompt so Claude can program around your details.
              </p>
              <Field label="Name">
                <input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Weight (kg)">
                  <input
                    inputMode="decimal"
                    placeholder="81"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Height (cm)">
                  <input
                    inputMode="numeric"
                    placeholder="184"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field
                label="Date of birth"
                hint={age !== undefined ? `${age} years old. Claude uses this to pitch your training.` : 'Optional. Claude uses your age to pitch your training.'}
              >
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  min="1900-01-01"
                  max={toLocalISODate(new Date())}
                  style={{ colorScheme: 'dark' }}
                  className={inputClass}
                />
              </Field>
              <Field label="Gender">
                <div className="grid grid-cols-2 gap-2">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setSex(g)}
                      aria-pressed={sex === g}
                      className={`px-4 py-3 rounded-2xl text-sm font-medium capitalize transition-all duration-150 ${
                        sex === g
                          ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                          : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </Field>
              <Button variant="secondary" onClick={handleSaveProfile} fullWidth>
                {profileSaved ? <CheckCircle size={16} /> : null}
                {profileSaved ? 'Saved' : 'Save profile'}
              </Button>
            </CardSection>
          </Card>
        </div>

        {/* Onboarding */}
        <div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">Onboarding</p>
          <Card>
            <button onClick={() => navigate('/onboarding')} className="w-full text-left">
              <CardSection className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0">
                  <Sparkles size={18} className="text-[#d97756]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f5f5f0]">Redo onboarding</p>
                  <p className="text-xs text-[#6a6a6a] mt-0.5">
                    Rebuild your background and start a fresh program block.
                  </p>
                </div>
                <ChevronRight size={16} className="text-[#4a4a4a] shrink-0" />
              </CardSection>
            </button>
          </Card>
        </div>

        {/* What's new */}
        <div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">About</p>
          <Card>
            <button onClick={() => setShowWhatsNew(true)} className="w-full text-left">
              <CardSection className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0">
                  <Gift size={18} className="text-[#d97756]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f5f5f0]">What's new</p>
                  <p className="text-xs text-[#6a6a6a] mt-0.5">Coach Claude v{APP_VERSION} · release notes</p>
                </div>
                <ChevronRight size={16} className="text-[#4a4a4a] shrink-0" />
              </CardSection>
            </button>
          </Card>
        </div>
      </div>

      {showWhatsNew && <WhatsNewSheet releases={RELEASES} onClose={() => setShowWhatsNew(false)} />}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-[#a8a29e]">{label}</p>
      {hint && <p className="text-[10px] text-[#4a4a4a]">{hint}</p>}
      {children}
    </div>
  )
}

const inputClass = 'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 transition-colors'
