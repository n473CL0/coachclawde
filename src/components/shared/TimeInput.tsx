import { useState } from 'react'

/**
 * A duration as separate hours / minutes / seconds boxes, so "1:52:40" can't
 * be misread the way free-text "mm:ss" can. Calls `onChange` with total
 * seconds (0 while empty). `showHours` defaults to on.
 */
export function TimeInput({
  seconds, onChange, showHours = true, label = 'Time',
}: {
  seconds: number
  onChange: (s: number) => void
  showHours?: boolean
  label?: string
}) {
  const split = (t: number) => ({
    h: t ? String(Math.floor(t / 3600)) : '',
    m: t ? String(Math.floor((t % 3600) / 60)) : '',
    s: t ? String(t % 60).padStart(2, '0') : '',
  })
  const [parts, setParts] = useState(() => split(seconds))

  function set(key: 'h' | 'm' | 's', raw: string) {
    const v = raw.replace(/[^0-9]/g, '').slice(0, key === 'h' ? 2 : 2)
    const next = { ...parts, [key]: v }
    setParts(next)
    const total = (Number(next.h) || 0) * 3600 + Math.min(59, Number(next.m) || 0) * 60 + Math.min(59, Number(next.s) || 0)
    onChange(showHours ? total : (Number(next.m) || 0) * 60 + Math.min(59, Number(next.s) || 0))
  }

  const box = 'w-14 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-2 py-2 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 tabular-nums'
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      {showHours && (
        <>
          <input className={box} inputMode="numeric" placeholder="h" aria-label="Hours" value={parts.h} onChange={(e) => set('h', e.target.value)} />
          <span className="text-[#4a4a4a]">:</span>
        </>
      )}
      <input className={box} inputMode="numeric" placeholder="mm" aria-label="Minutes" value={parts.m} onChange={(e) => set('m', e.target.value)} />
      <span className="text-[#4a4a4a]">:</span>
      <input className={box} inputMode="numeric" placeholder="ss" aria-label="Seconds" value={parts.s} onChange={(e) => set('s', e.target.value)} />
    </div>
  )
}
