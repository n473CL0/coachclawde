import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

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
    setTimer({
      isActive: true,
      endTime: Date.now() + seconds * 1000,
      durationSeconds: seconds,
      label,
    })
  }

  function skipTimer() {
    clearTimer()
  }

  const progress = timer.durationSeconds > 0
    ? 1 - remaining / timer.durationSeconds
    : 0

  return { remaining, progress, isActive: timer.isActive, label: timer.label, startTimer, skipTimer }
}
