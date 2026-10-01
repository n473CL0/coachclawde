import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Card, CardSection } from '../components/shared/Card'
import { buildWeekPlanPrompt } from '../lib/promptBuilder'
import { importPlanFromJson } from '../lib/export'
import { useAutoSync } from '../hooks/useAutoSync'
import {
  WEEK_DAYS_MON,
  addDays,
  getNextMonday,
  isDayPastThisWeek,
  resolveWeekStart,
  toLocalISODate,
} from '../lib/weekUtils'
import type { DayOfWeek } from '../types'
import { Copy, Check, Download, AlertCircle, X, CalendarClock, ExternalLink } from 'lucide-react'
import { OpenClaudeButton } from '../components/shared/OpenClaudeButton'
import { openClaudeApp } from '../lib/openClaude'
import { format } from 'date-fns'

const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75, 90] as const

export function WeekPlanner() {
  const navigate = useNavigate()
  const { getCurrentWeekPlan, weekPlans, addWeekPlan, updateWeekPlan, profile, loggedSessions } = useAppStore()

  const today = new Date()
  const seedPlan = getCurrentWeekPlan()

  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(seedPlan?.availableDays ?? [])
  const [notes, setNotes] = useState(seedPlan?.userNotes ?? '')
  // Target minutes per session, seeded from the current plan's average so a
  // replan keeps the same length by default.
  const [sessionMinutes, setSessionMinutes] = useState<number>(() => {
    const mins = seedPlan?.sessions.map((s) => s.estimatedMinutes).filter((m) => m > 0) ?? []
    if (!mins.length) return 60
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length
    return SESSION_LENGTH_OPTIONS.reduce<number>((best, o) => (Math.abs(o - avg) < Math.abs(best - avg) ? o : best), 60)
  })
  // Whether the athlete has explicitly opted to plan next week (e.g. they want
  // to train on a weekday that has already passed this week).
  const [planNextWeek, setPlanNextWeek] = useState(
    seedPlan ? seedPlan.weekStartDate === toLocalISODate(getNextMonday(today)) : false
  )
  // Day pending a "this will move the plan to next week" confirmation.
  const [confirmDay, setConfirmDay] = useState<DayOfWeek | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [copied, setCopied] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  // Generate hands off to the Claude app; these track that round trip.
  const [launching, setLaunching] = useState(false)
  const [appMissing, setAppMissing] = useState(false)
  const [awaitingImport, setAwaitingImport] = useState(false)
  const { sync } = useAutoSync()

  // Coming back from the Claude app with a plan to paste: open the import
  // sheet straight away so it's one tap to paste.
  useEffect(() => {
    if (!awaitingImport) return
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      setAwaitingImport(false)
      setShowPrompt(false)
      setShowImport(true)
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => document.removeEventListener('visibilitychange', onReturn)
  }, [awaitingImport])

  // The Monday the plan targets. Days already past this week force next week;
  // otherwise the plan stays in the current week.
  const weekStart = resolveWeekStart(selectedDays, today, planNextWeek)
  const weekEnd = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, 'dd MMM')} – ${format(weekEnd, 'dd MMM')}`
  const weekStartISO = toLocalISODate(weekStart)
  // A plan already exists for the *target* week — importing replaces it.
  const existingPlan = weekPlans.find((p) => p.weekStartDate === weekStartISO)

  function toggleDay(day: DayOfWeek) {
    const alreadySelected = selectedDays.includes(day)
    // Picking a day that has already passed this week is only possible next
    // week — confirm the shift before selecting it.
    if (!planNextWeek && !alreadySelected && isDayPastThisWeek(day, today)) {
      setConfirmDay(day)
      return
    }
    setSelectedDays((prev) =>
      alreadySelected ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function confirmPlanNextWeek() {
    if (!confirmDay) return
    setPlanNextWeek(true)
    setSelectedDays((prev) => (prev.includes(confirmDay) ? prev : [...prev, confirmDay]))
    setConfirmDay(null)
  }

  function switchToThisWeek() {
    setPlanNextWeek(false)
    // Drop any selected days that have already passed this week.
    setSelectedDays((prev) => prev.filter((d) => !isDayPastThisWeek(d, today)))
  }

  function buildPrompt() {
    const prompt = buildWeekPlanPrompt(selectedDays, notes, sessionMinutes, existingPlan, weekStart, profile, loggedSessions)
    setPromptText(prompt)
    return prompt
  }

  async function copyPrompt(prompt: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      return true
    } catch {
      // Clipboard may be unavailable (e.g. insecure context).
      setCopied(false)
      return false
    }
  }

  /**
   * One tap: build the prompt, copy it, and jump straight into the Claude app
   * so the athlete only has to paste. Falls back to the prompt sheet (with a
   * claude.ai link) when the clipboard or the app isn't available.
   */
  async function handleGeneratePrompt() {
    const prompt = buildPrompt()
    setAppMissing(false)
    const copiedOk = await copyPrompt(prompt)
    if (!copiedOk) {
      setShowPrompt(true)
      return
    }
    setLaunching(true)
    const opened = await openClaudeApp()
    setLaunching(false)
    // Always leave the prompt sheet up behind the hand-off: "opened" is only a
    // guess (on desktop, the browser's "Open Claude?" dialog counts), so the
    // athlete needs the prompt and the claude.ai link if they cancel.
    setAppMissing(!opened)
    setShowPrompt(true)
    if (opened) setAwaitingImport(true)
  }

  /** Show the prompt instead of launching Claude (e.g. to paste elsewhere). */
  async function handleShowPrompt() {
    const prompt = buildPrompt()
    setAppMissing(false)
    setShowPrompt(true)
    await copyPrompt(prompt)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(promptText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function flashCopied() {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleImport() {
    setImportError('')
    setImporting(true)
    try {
      const plan = importPlanFromJson(importJson)
      if (existingPlan) {
        // Replanning a week shouldn't erase work already done. Carry over the
        // planned sessions that have a completed log so those days stay on the
        // week (matched by plannedSessionId) and keep the new plan's sessions
        // too — completed days and the freshly planned ones both survive. We
        // keep the existing plan id so the completed logs stay attached to it.
        const completedPlannedIds = new Set(
          loggedSessions
            .filter((ls) => ls.status === 'complete')
            .map((ls) => ls.plannedSessionId)
        )
        const preserved = existingPlan.sessions.filter((s) => completedPlannedIds.has(s.id))
        updateWeekPlan(existingPlan.id, {
          ...plan,
          id: existingPlan.id,
          sessions: [...preserved, ...plan.sessions],
        })
      } else {
        addWeekPlan({ ...plan, availableDays: selectedDays, userNotes: notes })
      }
      setShowImport(false)
      // Sync plans in background after import
      sync('plans')
      navigate('/')
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Invalid JSON')
    } finally {
      setImporting(false)
    }
  }

  const dayIndex = (day: DayOfWeek) => WEEK_DAYS_MON.indexOf(day)
  const orderedDays = [...selectedDays].sort((a, b) => dayIndex(a) - dayIndex(b))

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a] pb-24">
      <PageHeader
        title="Plan Your Week"
        subtitle={weekLabel}
        backTo="/"
      />

      <div className="flex flex-col gap-5 px-4 pt-4">
        {/* Day selector */}
        <Card>
          <CardSection>
            <p className="text-sm font-medium text-[#a8a29e] mb-4">Which days can you train?</p>
            <div className="flex justify-between gap-1.5">
              {WEEK_DAYS_MON.map((day) => {
                const selected = selectedDays.includes(day)
                // Days earlier than today can't be trained this week, so dim
                // them — tapping one prompts to move the plan to next week.
                const past = !planNextWeek && isDayPastThisWeek(day, today)
                return (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    aria-pressed={selected}
                    title={past ? `${day} has already passed this week` : undefined}
                    className={`
                      aspect-square flex-1 flex items-center justify-center rounded-full text-sm font-semibold transition-all duration-150
                      ${selected
                        ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/25 scale-105'
                        : past
                          ? 'bg-[#141414] text-[#3a3a3a] border border-[#222] hover:text-[#5a5a5a]'
                          : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:bg-[#222] hover:text-[#a8a29e]'
                      }
                    `}
                  >
                    {day[0]}
                  </button>
                )
              })}
            </div>
            {orderedDays.length > 0 && (
              <p className="text-xs text-[#6a6a6a] mt-3 text-center">
                {orderedDays.length} day{orderedDays.length !== 1 ? 's' : ''} selected: {orderedDays.join(', ')}
              </p>
            )}
            {planNextWeek && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#161616] border border-[#2a2a2a] px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs text-[#a8a29e]">
                  <CalendarClock size={14} className="text-[#d97756]" />
                  Planning for next week
                </span>
                <button
                  onClick={switchToThisWeek}
                  className="text-xs font-medium text-[#d97756] hover:underline"
                >
                  Plan this week
                </button>
              </div>
            )}
          </CardSection>
        </Card>

        {/* Session length */}
        <Card>
          <CardSection>
            <p className="text-sm font-medium text-[#a8a29e] mb-3">How long per session?</p>
            <div className="flex gap-1.5">
              {SESSION_LENGTH_OPTIONS.map((mins) => (
                <button
                  key={mins}
                  onClick={() => setSessionMinutes(mins)}
                  aria-pressed={sessionMinutes === mins}
                  className={`
                    flex-1 rounded-xl py-2 text-sm font-semibold transition-all duration-150
                    ${sessionMinutes === mins
                      ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/25'
                      : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:bg-[#222] hover:text-[#a8a29e]'
                    }
                  `}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </CardSection>
        </Card>

        {/* Notes */}
        <Card>
          <CardSection>
            <p className="text-sm font-medium text-[#a8a29e] mb-3">Any extra context for Claude?</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Going out Wednesday night, make Thursday light. Left shoulder feeling tight this week."
              rows={3}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-[#d97756]/50 transition-colors"
            />
          </CardSection>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Button
              onClick={handleGeneratePrompt}
              disabled={selectedDays.length === 0}
              loading={launching}
              fullWidth
              size="lg"
            >
              {!launching && <ExternalLink size={18} />}
              {launching ? 'Opening Claude…' : 'Generate & Open Claude'}
            </Button>
            <button
              onClick={handleShowPrompt}
              disabled={selectedDays.length === 0}
              className="self-center text-xs text-[#6a6a6a] hover:text-[#a8a29e] py-1.5 px-3 disabled:opacity-40"
            >
              or just copy the prompt
            </button>
          </div>

          {existingPlan && (
            <div className="bg-[#d97756]/10 rounded-2xl border border-[#d97756]/20 px-4 py-3 flex items-start gap-3">
              <AlertCircle size={16} className="text-[#d97756] mt-0.5 shrink-0" />
              <p className="text-xs text-[#d97756]">
                You already have a plan for {planNextWeek ? 'next' : 'this'} week. Importing a new one will replace it.
              </p>
            </div>
          )}

          <Button variant="secondary" onClick={() => setShowImport(true)} fullWidth>
            <Download size={18} />
            Import Plan from Claude
          </Button>
        </div>

        {/* How it works */}
        <div className="rounded-2xl bg-[#161616] border border-[#2a2a2a] p-4">
          <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-widest mb-3">How it works</p>
          <div className="flex flex-col gap-2.5">
            {[
              ['1', 'Select your training days above'],
              ['2', 'Pick a session length and add any notes (injuries, events, energy)'],
              ['3', 'Tap Generate — your prompt (profile, recent history, rules) is copied and the Claude app opens'],
              ['4', 'Paste it into a new chat and send'],
              ['5', 'Copy the JSON Claude replies with, come back, and paste it into the import sheet'],
            ].map(([n, text]) => (
              <div key={n} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[#d97756]/15 text-[#d97756] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                <p className="text-sm text-[#6a6a6a]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prompt Modal */}
      {showPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col" onClick={() => setShowPrompt(false)}>
          <div
            className="mt-auto bg-[#111] rounded-t-3xl border-t border-[#2a2a2a] flex flex-col slide-up max-h-[90svh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[#f5f5f0]">
                  {appMissing ? "Claude app didn't open" : 'Claude Prompt Ready'}
                </h3>
                {copied && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <Check size={13} /> Copied
                  </span>
                )}
              </div>
              <button onClick={() => setShowPrompt(false)} className="text-[#4a4a4a] hover:text-[#f5f5f0]">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-[#6a6a6a] px-5 pb-3">
              {appMissing
                ? 'Your prompt is copied. Open Claude in your browser (or try the app again) and paste it into a new chat.'
                : copied
                  ? 'Copied to your clipboard — paste it into Claude.'
                  : 'Copy this and paste it into Claude.'}
            </p>
            <div className="flex-1 overflow-y-auto mx-4 mb-4">
              <pre className="bg-[#0a0a0a] rounded-2xl border border-[#2a2a2a] p-4 text-xs text-[#a8a29e] whitespace-pre-wrap font-mono leading-relaxed">
                {promptText}
              </pre>
            </div>
            <div className="px-4 pb-6 pt-2 flex flex-col gap-2">
              <OpenClaudeButton
                text={promptText}
                onCopied={flashCopied}
                appMissing={appMissing}
                onOpened={() => setAwaitingImport(true)}
              />
              <Button variant="ghost" onClick={handleCopy} fullWidth>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy again'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col" onClick={() => setShowImport(false)}>
          <div
            className="mt-auto bg-[#111] rounded-t-3xl border-t border-[#2a2a2a] flex flex-col slide-up max-h-[90svh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-base font-semibold text-[#f5f5f0]">Import Plan</h3>
              <button onClick={() => setShowImport(false)} className="text-[#4a4a4a] hover:text-[#f5f5f0]">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-[#6a6a6a] px-5 pb-3">
              Paste the JSON block from Claude's response below.
            </p>
            <div className="flex-1 px-4 overflow-y-auto">
              <textarea
                value={importJson}
                onChange={(e) => { setImportJson(e.target.value); setImportError('') }}
                placeholder='Paste the JSON block here... (the content between ```json and ```)'
                rows={10}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-xs text-[#f5f5f0] placeholder-[#2a2a2a] resize-none focus:outline-none focus:border-[#d97756]/50 font-mono"
              />
              {importError && (
                <div className="mt-2 flex items-start gap-2 text-red-400 bg-red-500/10 rounded-xl p-3">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <p className="text-xs">{importError}</p>
                </div>
              )}
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3">
              <Button variant="secondary" onClick={() => setShowImport(false)} fullWidth>Cancel</Button>
              <Button onClick={handleImport} disabled={!importJson.trim()} loading={importing} fullWidth>
                Import Week
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Move-to-next-week confirmation */}
      {confirmDay && (
        <ConfirmDialog
          icon={<CalendarClock size={20} />}
          title="Plan for next week?"
          confirmLabel="Plan next week"
          onConfirm={confirmPlanNextWeek}
          onCancel={() => setConfirmDay(null)}
        >
          {confirmDay} has already passed this week. Selecting it will plan your whole week for
          next week instead.
        </ConfirmDialog>
      )}
    </div>
  )
}
