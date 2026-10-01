import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { combine, scheduleEarcon, unlockAudio, type CueHandle } from '../lib/audioCues'

// The pending end-of-rest alarm. Module-level because several components use
// this hook, but only one rest timer runs at a time.
let alarm: CueHandle | null = null

/**
 * Queues three countdown pips and the "rest over" tone on the audio clock, so
 * they sound on time even if the page's timers are throttled. Android also
 * vibrates. Called from the tap that started the rest, which unlocks audio.
 */
function scheduleAlarm(seconds: number) {
  alarm?.cancel()
  unlockAudio()
  const handles: CueHandle[] = []
  for (const k of [3, 2, 1]) {
    if (seconds > k + 1) handles.push(scheduleEarcon('pip', seconds - k, { vibrate: false }))
  }
  handles.push(scheduleEarcon('restOver', seconds))
  alarm = combine(handles)
}

export function useRestTimer() {
  const { timer, setTimer, clearTimer } = useAppStore()
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    // When there's no active timer we leave `remaining` as-is — the overlay is
    // hidden anyway, and the next timer re-syncs `remaining` immediately below.
    if (!timer.isActive || !timer.endTime) return

    const update = () => {
      const now = Date.now()
      const diff = Math.max(0, Math.ceil((timer.endTime! - now) / 1000))
      setRemaining(diff)
      if (diff === 0) {
        clearTimer()
      }
    }

    update()
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [timer.isActive, timer.endTime, clearTimer])

  function startTimer(seconds: number, label: string) {
    scheduleAlarm(seconds)
    setTimer({
      isActive: true,
      endTime: Date.now() + seconds * 1000,
      durationSeconds: seconds,
      label,
    })
  }

  function skipTimer() {
    alarm?.cancel()
    alarm = null
    clearTimer()
  }

  const progress = timer.durationSeconds > 0
    ? 1 - remaining / timer.durationSeconds
    : 0

  return { remaining, progress, isActive: timer.isActive, label: timer.label, startTimer, skipTimer }
}
