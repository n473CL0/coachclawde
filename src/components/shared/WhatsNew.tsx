import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Check, MessageCircleHeart, Sparkles, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { ClawdeMark } from './ClawdeMark'
import { BottomSheet } from './BottomSheet'
import { markVersionSeen, unseenReleases } from '../../lib/appVersion'
import type { Release } from '../../lib/releaseNotes'

/**
 * Shows "What's new" once, the first time the app is opened after an update.
 * Mounted inside the onboarded app shell, so brand-new athletes (marked as
 * seen when they finish onboarding) never get it.
 */
export function ReleaseNotesGate() {
  const [pending, setPending] = useState<Release[]>(() => unseenReleases())
  if (pending.length === 0) return null
  return (
    <WhatsNewSheet
      releases={pending}
      onClose={() => {
        markVersionSeen()
        setPending([])
      }}
    />
  )
}

/** Bottom sheet listing one or more releases, newest first. */
export function WhatsNewSheet({ releases, onClose }: { releases: Release[]; onClose: () => void }) {
  const navigate = useNavigate()
  const latest = releases[0]
  const action = latest.action
  return (
    <BottomSheet label={`What's new in version ${latest.version}`} onClose={onClose}>
      <div className="flex flex-col items-center text-center px-6 pt-6 pb-4">
        <ClawdeMark size={64} cheer sweat />
        <p className="text-2xs font-semibold text-[#d97756] uppercase tracking-widest mt-3">
          What's new · v{latest.version}
        </p>
        <h2 className="text-xl font-bold text-[#f5f5f0] mt-1 leading-tight">You asked, we built it</h2>
        <p className="text-sm text-[#6a6a6a] mt-2 leading-relaxed">{latest.headline}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
        {releases.map((r) => (
          <ReleaseSection key={r.version} release={r} showVersion={releases.length > 1} />
        ))}
      </div>

      <div className="px-5 pt-3 pb-safe border-t border-[#1a1a1a]">
        <p className="text-xs text-[#6a6a6a] text-center mb-3">
          Thanks for all the feedback. Keep it coming!
        </p>
        <div className="pb-2 flex flex-col gap-2">
          {action?.note && <p className="text-xs text-[#a8a29e] text-center leading-relaxed">{action.note}</p>}
          {action && (
            <Button
              fullWidth
              size="lg"
              variant="secondary"
              onClick={() => {
                onClose()
                navigate(action.to)
              }}
            >
              <RefreshCw size={18} />
              {action.label}
            </Button>
          )}
          <Button fullWidth size="lg" onClick={onClose}>Let's go</Button>
        </div>
      </div>
    </BottomSheet>
  )
}

function ReleaseSection({ release, showVersion }: { release: Release; showVersion: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      {showVersion && (
        <p className="text-xs font-semibold text-[#a8a29e]">
          v{release.version} · {format(parseISO(release.date), 'd MMM yyyy')}
        </p>
      )}
      {release.fromFeedback.length > 0 && (
        <NoteList
          icon={<MessageCircleHeart size={14} />}
          title="From your feedback"
          items={release.fromFeedback}
          accent
        />
      )}
      {release.alsoNew && release.alsoNew.length > 0 && (
        <NoteList icon={<Sparkles size={14} />} title="Also new" items={release.alsoNew} />
      )}
    </section>
  )
}

function NoteList({
  icon, title, items, accent,
}: { icon: React.ReactNode; title: string; items: string[]; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'bg-[#d97756]/8 border-[#d97756]/25' : 'bg-[#161616] border-[#2a2a2a]'}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-3 ${accent ? 'text-[#d97756]' : 'text-[#6a6a6a]'}`}>
        {icon}
        {title}
      </p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Check size={10} strokeWidth={3} />
            </span>
            <span className="text-sm text-[#e5e5e0] leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
