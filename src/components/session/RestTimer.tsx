import { useRestTimer } from '../../hooks/useRestTimer'
import { secondsToDisplay } from '../../lib/dateUtils'
import { SkipForward } from 'lucide-react'

export function RestTimerOverlay() {
  const { remaining, progress, isActive, label, skipTimer } = useRestTimer()

  if (!isActive) return null

  const circumference = 2 * Math.PI * 44
  // Draining ring: full at the start of the rest, empty when it runs out.
  // `progress` is the elapsed fraction, so the offset grows as time depletes.
  const strokeDashoffset = circumference * Math.min(1, Math.max(0, progress))

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-end justify-center pb-10">
      <div className="bg-[#111] rounded-3xl border border-[#2a2a2a] p-8 w-72 flex flex-col items-center gap-5 slide-up">
        <p className="text-xs text-[#6a6a6a] uppercase tracking-widest font-medium">Rest</p>
        <p className="text-sm text-[#a8a29e]">{label}</p>

        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#1a1a1a" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke="#d97756"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-200 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-4xl font-bold text-[#f5f5f0] tabular-nums ${remaining <= 5 ? 'timer-pulse' : ''}`}>
              {secondsToDisplay(remaining)}
            </span>
          </div>
        </div>

        <button
          onClick={skipTimer}
          className="flex items-center gap-2 text-sm text-[#6a6a6a] hover:text-[#d97756] transition-colors py-2 px-4 rounded-xl hover:bg-[#d97756]/10"
        >
          <SkipForward size={16} />
          Skip rest
        </button>
      </div>
    </div>
  )
}
