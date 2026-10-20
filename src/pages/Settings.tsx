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
import { UserCircle, CheckCircle, AlertCircle, RefreshCw, LogOut, Sparkles, ChevronRight, Gift, MessageCircle, ShieldCheck } from 'lucide-react'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { goalOrLegacy } from '../lib/goalProfile'
import { WhatsNewSheet } from '../components/shared/WhatsNew'
import { APP_VERSION } from '../lib/appVersion'
import { getDeviceShape } from '../lib/deviceShape'
import { RELEASES } from '../lib/releaseNotes'
import { ageFromBirthDate, isValidBirthDate } from '../lib/dateUtils'
import { toLocalISODate } from '../lib/weekUtils'
import { fromWeight, toWeight, type DistanceUnit, type WeightUnit } from '../lib/units'

export function Settings() {
  const navigate = useNavigate()
  const { user, configured, signOut } = useAuth()
  const { syncStatus, syncError, units, setUnits } = useSettingsStore()
  const { profile, setProfile } = useAppStore()
  const { sync } = useAutoSync()

  const [name, setName] = useState(profile.name ?? '')
  const [weight, setWeight] = useState(String(toWeight(profile.weightKg, units.weight)))
  const [height, setHeight] = useState(String(profile.heightCm))
  const [sex, setSex] = useState<'male' | 'female'>(profile.sex)
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '')
  const age = ageFromBirthDate(birthDate)
  const [profileSaved, setProfileSaved] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [confirmHealth, setConfirmHealth] = useState(false)
  const checkInsOn = !profile.goal?.checkInsOff
  const healthFlags = profile.goal?.health.flags ?? []

  function setCheckIns(on: boolean) {
    const goal = goalOrLegacy(profile)
    setProfile({ goal: { ...goal, checkInsOff: !on, updatedAt: new Date().toISOString() } })
    void sync('profile')
  }

  /**
   * Health-screen answers are special-category data: let the athlete delete
   * them. Injuries stay (they're edited by the athlete and safety-critical),
   * but the medical flags and conservative mode go.
   */
  function deleteHealthInfo() {
    if (!profile.goal) return
    const flags = profile.injuries.length ? (['injury'] as const) : []
    setProfile({ goal: { ...profile.goal, health: { ...profile.goal.health, flags: [...flags], conservative: undefined, cleared: undefined }, updatedAt: new Date().toISOString() } })
    void sync('profile')
    setConfirmHealth(false)
  }

  function setWeightUnit(u: WeightUnit) {
    // Keep the body-weight field showing the same weight in the new unit.
    if (Number(weight)) setWeight(String(toWeight(fromWeight(Number(weight), units.weight), u)))
    setUnits({ weight: u })
  }

  function handleSaveProfile() {
    // Never wipe a previously-set name with a blank field.
    const nextName = name.trim() || profile.name
    setName(nextName)
    setProfile({
      name: nextName,
      weightKg: Number(weight) ? fromWeight(Number(weight), units.weight) : profile.weightKg,
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
    <div className="flex flex-col min-h-svh bg-[#0a0a0a] pb-edge">
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
                Saved to your account and included in the plan prompt so Clawde can program around your details.
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
                <Field label={`Weight (${units.weight})`}>
                  <input
                    inputMode="decimal"
                    placeholder={units.weight === 'lb' ? '180' : '81'}
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
                hint={age !== undefined ? `${age} years old. Clawde uses this to pitch your training.` : 'Optional. Clawde uses your age to pitch your training.'}
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

        {/* Units */}
        <div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">Units</p>
          <Card>
            <CardSection className="flex flex-col gap-3">
              <p className="text-xs text-[#6a6a6a] leading-relaxed">
                How weights and distances are shown on this device. Clawde always plans in metric; the app converts.
              </p>
              <Field label="Weight">
                <UnitToggle options={['kg', 'lb'] as WeightUnit[]} value={units.weight} onChange={setWeightUnit} />
              </Field>
              <Field label="Distance">
                <UnitToggle options={['km', 'mi'] as DistanceUnit[]} value={units.distance} onChange={(d) => setUnits({ distance: d })} />
              </Field>
            </CardSection>
          </Card>
        </div>

        {/* Check-ins & health */}
        <div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">Check-ins & privacy</p>
          <Card>
            <CardSection className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0">
                <MessageCircle size={18} className="text-[#d97756]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f5f5f0]">Suggest weekly check-ins</p>
                <p className="text-xs text-[#6a6a6a] mt-0.5">A one-minute chat at the end of the week. Never required.</p>
              </div>
              <button
                role="switch"
                aria-checked={checkInsOn}
                aria-label="Suggest weekly check-ins"
                onClick={() => setCheckIns(!checkInsOn)}
                className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 ${checkInsOn ? 'bg-[#d97756]' : 'bg-[#2a2a2a]'}`}
              >
                <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${checkInsOn ? 'translate-x-5' : ''}`} />
              </button>
            </CardSection>
            <div className="border-t border-[#2a2a2a]" />
            <CardSection className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-[#d97756]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f5f5f0]">Health screen</p>
                <p className="text-xs text-[#6a6a6a] mt-0.5 leading-relaxed">
                  {healthFlags.some((f) => f !== 'injury')
                    ? 'We keep only which boxes you ticked (never any details) so plans stay safe. You can delete them.'
                    : 'Nothing stored beyond your injury list. We only ever keep which boxes you tick, never details.'}
                </p>
                {healthFlags.some((f) => f !== 'injury') && (
                  <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmHealth(true)}>
                    Delete health information
                  </Button>
                )}
              </div>
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
                    Start over with a new goal. Your history stays.
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
                  <p className="text-xs text-[#6a6a6a] mt-0.5">Coach Clawde v{APP_VERSION} · release notes</p>
                </div>
                <ChevronRight size={16} className="text-[#4a4a4a] shrink-0" />
              </CardSection>
            </button>
          </Card>
          <DisplayInfo />
        </div>
      </div>

      {showWhatsNew && <WhatsNewSheet releases={RELEASES} onClose={() => setShowWhatsNew(false)} />}
      {confirmHealth && (
        <ConfirmDialog
          icon={<ShieldCheck size={20} />}
          title="Delete health information?"
          confirmLabel="Delete"
          onConfirm={deleteHealthInfo}
          onCancel={() => setConfirmHealth(false)}
        >
          This removes the medical flags from your health screen, and plans stop being kept extra conservative.
          Your injury list stays (edit it by redoing onboarding).
        </ConfirmDialog>
      )}
    </div>
  )
}

/**
 * One line of screen geometry: what the app measured and what iOS reports.
 * Lets a tester screenshot the real numbers if the layout sits wrong on a
 * device we can't test.
 */
function DisplayInfo() {
  const shape = getDeviceShape()
  const probe = (side: string) => {
    const el = document.createElement('div')
    el.style.cssText = `position:absolute;visibility:hidden;padding-top:env(safe-area-inset-${side})`
    document.body.appendChild(el)
    const px = Math.round(parseFloat(getComputedStyle(el).paddingTop))
    el.remove()
    return px
  }
  const parts = [
    `${screen.width}×${screen.height}`,
    `viewport ${window.innerWidth}×${window.innerHeight}`,
    `safe ${probe('top')}/${probe('bottom')}`,
    shape.screenRadius ? `corners ${shape.screenRadius}pt` : 'corners —',
    shape.standalone ? `app${shape.viewportGap ? ` +${shape.viewportGap}` : ''}` : 'browser',
  ]
  return <p className="text-2xs text-[#3a3a3a] text-center mt-3 tabular-nums">Display: {parts.join(' · ')}</p>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-[#a8a29e]">{label}</p>
      {hint && <p className="text-2xs text-[#4a4a4a]">{hint}</p>}
      {children}
    </div>
  )
}

const inputClass = 'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 transition-colors'

function UnitToggle<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 ${
            value === o
              ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
              : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
