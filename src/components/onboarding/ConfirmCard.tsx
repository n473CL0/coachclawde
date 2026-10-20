import type { ConfirmRow } from '../../lib/goalFlow'

/**
 * "Here's what I heard": the profile Clawde will build from, one line per
 * thing. Tapping a line rewinds the chat to the question that set it.
 */
export function ConfirmCard({
  rows, onEdit, anythingElse, onAnythingElse,
}: {
  rows: ConfirmRow[]
  onEdit: (target: string) => void
  anythingElse: string
  onAnythingElse: (v: string) => void
}) {
  return (
    <div className="ml-10 rounded-3xl bg-[#141414] border border-[#d97756]/40 p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-[#f5f5f0]">Your plan, in one card</p>
      {rows.map((r) => (
        <button
          key={r.label}
          onClick={r.target ? () => onEdit(r.target!) : undefined}
          disabled={!r.target}
          className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-left disabled:cursor-default group"
          aria-label={r.target ? `Change ${r.label}: ${r.text}` : undefined}
        >
          <span aria-hidden>{r.icon}</span>
          <span className="text-sm text-[#e5e5e0] leading-snug">
            <span className="block text-2xs uppercase tracking-widest text-[#d97756] font-semibold">{r.label}</span>
            <span className={r.target ? 'group-hover:text-[#f5f5f0]' : ''}>{r.text}</span>
          </span>
        </button>
      ))}
      <label className="flex flex-col gap-1.5 pt-1 border-t border-[#2a2a2a]">
        <span className="text-xs text-[#a8a29e] pt-2">Anything else I should know? <span className="text-[#4a4a4a]">(optional)</span></span>
        <textarea
          value={anythingElse}
          onChange={(e) => onAnythingElse(e.target.value)}
          rows={2}
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-3 py-2 text-base text-[#f5f5f0] placeholder-[#4a4a4a] resize-none focus:outline-none focus:border-[#d97756]/50"
        />
      </label>
    </div>
  )
}
