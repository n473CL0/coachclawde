import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Send } from 'lucide-react'
import { ClaudeMark } from '../shared/ClaudeMark'
import { Button } from '../shared/Button'
import { TimeInput } from '../shared/TimeInput'
import {
  answerLabel, fieldsOf, optionsOf, splitInline, walk,
  type ChatOption, type CompoundField, type Flow, type FlowAnswers, type FlowContext, type FlowNode, type FlowValue,
} from '../../lib/flow'
import { WEEK_DAYS_MON, toLocalISODate } from '../../lib/weekUtils'

interface ChatFlowProps {
  flow: Flow
  answers: FlowAnswers
  ctx: FlowContext
  onAnswer: (id: string, answer: FlowValue) => void
  /** Clear the answer to `id` (and everything after it) so it can be re-answered. */
  onRewind: (id: string) => void
  /** Bubbles Clawde says once the flow is finished. */
  endLines: string[]
  /** Shown under the closing bubbles (e.g. the confirmation card). */
  endContent?: ReactNode
  /** The composer area once finished (e.g. a Continue button). */
  endAction: ReactNode
  /** Earlier answers to start composers from (re-entering the tree at a node). */
  initialDrafts?: FlowAnswers
}

const DONE_ID = '__done'

/** How long Clawde "types" before a bubble appears, scaled to its length. */
function typingDelay(line: string, isFirst: boolean): number {
  if (isFirst) return 450
  return Math.min(1300, 350 + line.length * 9)
}

/**
 * A chat with Clawde, driven by a flow-as-data graph (lib/flow): onboarding's
 * goal tree, a check-in, or the migration check-in. Clawde asks one node at a
 * time; the athlete answers with chips or a short reply. Tapping an earlier
 * answer rewinds the chat to that question.
 */
export function ChatFlow({ flow, answers, ctx, onAnswer, onRewind, endLines, endContent, endAction, initialDrafts }: ChatFlowProps) {
  const { path, next } = walk(flow, answers)
  const current: FlowNode | undefined = flow.nodes[next]
  const currentId = current?.id ?? DONE_ID
  const currentLines = current ? current.coach(answers, ctx) : endLines

  // How many of each node's coach bubbles have been revealed. Once shown, a
  // node stays shown, so rewinding to it doesn't replay the typing.
  const [revealed, setRevealed] = useState<Record<string, number>>({})
  // Answers cleared by a rewind, so the composer starts from them.
  const [drafts, setDrafts] = useState<FlowAnswers>(initialDrafts ?? {})
  const shownCount = revealed[currentId] ?? 0
  const typing = shownCount < currentLines.length
  const nextLine = currentLines[shownCount] ?? ''

  useEffect(() => {
    if (!typing) return
    const t = setTimeout(
      () => setRevealed((r) => ({ ...r, [currentId]: shownCount + 1 })),
      typingDelay(nextLine, shownCount === 0),
    )
    return () => clearTimeout(t)
  }, [typing, currentId, shownCount, nextLine])

  // Keep the latest message in view: scroll to a sentinel after the sticky
  // composer (the true end of the page), so a closing card isn't hidden
  // behind the composer.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [currentId, shownCount, typing])

  function rewind(id: string) {
    // Keep every answer being cleared as a draft, so re-answering the later
    // questions is just a quick tap through.
    setDrafts((d) => ({ ...d, ...answers }))
    onRewind(id)
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col gap-2 px-4 pt-4 pb-4">
        {path.map((id) => {
          const node = flow.nodes[id]
          return (
            <div key={id} className="flex flex-col gap-2">
              {node.coach(answers, ctx).map((line, i, lines) => (
                <CoachBubble key={i} text={line} showAvatar={i === lines.length - 1} />
              ))}
              <UserBubble text={answerLabel(node, answers[id]!, answers)} onClick={() => rewind(id)} />
            </div>
          )
        })}

        <div key={currentId} className="flex flex-col gap-2">
          {currentLines.slice(0, shownCount).map((line, i) => (
            <CoachBubble key={i} text={line} showAvatar={!typing && i === shownCount - 1} animate />
          ))}
          {typing && <TypingBubble />}
          {!current && !typing && endContent && <div className="fade-in">{endContent}</div>}
        </div>

        {path.length > 0 && !typing && current && (
          <p className="text-2xs text-[#4a4a4a] text-center mt-1">Tap any of your answers to change it</p>
        )}
      </div>

      {/* Composer: rides on top of the keyboard (`--kb`) so the reply box stays in view. */}
      <div className="kb-dock sticky bottom-(--kb) bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-[#1a1a1a] px-4 pt-3 pb-safe">
        {typing ? (
          <div className="h-12" aria-hidden />
        ) : current ? (
          <Composer key={current.id} node={current} answers={answers} draft={drafts[current.id]} onSubmit={(a) => onAnswer(current.id, a)} />
        ) : (
          <div className="pb-2 fade-in">{endAction}</div>
        )}
      </div>
      <div ref={bottomRef} aria-hidden />
    </div>
  )
}

// --- bubbles --------------------------------------------------------------------

function Avatar({ visible }: { visible: boolean }) {
  return (
    <div className="w-8 shrink-0 flex items-end">
      {visible && <ClaudeMark size={30} idle={false} />}
    </div>
  )
}

function CoachBubble({ text, showAvatar, animate }: { text: string; showAvatar: boolean; animate?: boolean }) {
  return (
    <div className={`flex items-end gap-2 pr-10 ${animate ? 'fade-in' : ''}`}>
      <Avatar visible={showAvatar} />
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl rounded-bl-md px-3.5 py-2.5">
        <p className="text-sm text-[#e5e5e0] leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-2">
      <Avatar visible />
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl rounded-bl-md px-4 py-3.5 flex gap-1" aria-label="Clawde is typing">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-[#6a6a6a]" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )
}

function UserBubble({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div className="flex justify-end pl-12 mb-2">
      <button
        onClick={onClick}
        className="bg-[#d97756] text-white rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm text-left leading-relaxed whitespace-pre-wrap active:scale-[0.98] transition-transform"
        aria-label={`Change answer: ${text}`}
      >
        {text}
      </button>
    </div>
  )
}

// --- composers ------------------------------------------------------------------

function chipClass(active: boolean): string {
  return `px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150 active:scale-95 ${
    active
      ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
      : 'bg-[#1a1a1a] text-[#a8a29e] border border-[#2a2a2a] hover:text-[#f5f5f0]'
  }`
}

const inputClass =
  'flex-1 min-w-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#4a4a4a] focus:outline-none focus:border-[#d97756]/50 transition-colors'

function SkipChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="self-center text-xs text-[#a8a29e] hover:text-[#f5f5f0] py-2 px-3 rounded-xl border border-[#2a2a2a] bg-[#161616]">
      {label}
    </button>
  )
}

function Composer({
  node, answers, draft, onSubmit,
}: {
  node: FlowNode
  answers: FlowAnswers
  draft: FlowValue | undefined
  onSubmit: (answer: FlowValue) => void
}) {
  switch (node.kind) {
    case 'single':
      return <SingleChoice options={optionsOf(node, answers)} selected={typeof draft === 'string' ? draft : undefined} onSubmit={onSubmit} />
    case 'multi': {
      const initial = Array.isArray(draft) ? draft : node.preselect?.(answers) ?? []
      return <MultiChoice node={node} options={optionsOf(node, answers)} initial={initial} onSubmit={onSubmit} />
    }
    case 'date':
      return <DateReply node={node} initial={typeof draft === 'string' && draft !== node.skip?.value ? draft : ''} onSubmit={onSubmit} />
    case 'days':
      return <DaysReply initial={draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {}} onSubmit={onSubmit} />
    case 'compound':
      return <CompoundReply node={node} fields={fieldsOf(node, answers)} initial={draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : undefined} onSubmit={onSubmit} />
    default:
      return <TextReply node={node} initial={typeof draft === 'string' ? draft : ''} onSubmit={onSubmit} />
  }
}

function SingleChoice({
  options, selected, onSubmit,
}: { options: ChatOption[]; selected: string | undefined; onSubmit: (a: FlowValue) => void }) {
  const [open, setOpen] = useState<ChatOption | null>(() => {
    const s = splitInline(selected)
    return options.find((o) => o.input && o.value === s.value) ?? null
  })
  const withHints = options.some((o) => o.hint)

  if (open) return <InlineInput option={open} initial={splitInline(selected).payload} onBack={() => setOpen(null)} onSubmit={onSubmit} />

  return (
    <div className={`fade-in pb-2 ${withHints ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}`}>
      {options.map((o) => {
        const active = selected === o.value || (!!o.input && splitInline(selected).value === o.value)
        const click = () => (o.input ? setOpen(o) : onSubmit(o.value))
        return withHints ? (
          <button
            key={o.value}
            onClick={click}
            className={`flex items-center justify-between gap-3 text-left px-4 py-2.5 rounded-2xl border transition-all duration-150 active:scale-[0.98] ${
              active ? 'bg-[#d97756]/12 border-[#d97756]/50' : 'bg-[#161616] border-[#2a2a2a] hover:border-[#3a3a3a]'
            }`}
          >
            <span className="text-sm font-semibold text-[#f5f5f0]">{o.label}</span>
            {o.hint && <span className="text-xs text-[#6a6a6a] text-right">{o.hint}</span>}
          </button>
        ) : (
          <button key={o.value} onClick={click} className={chipClass(active)}>
            {o.label}{o.input ? '…' : ''}
          </button>
        )
      })}
    </div>
  )
}

/** The input revealed by an option like "A time…" or "Yes, a date…". */
function InlineInput({
  option, initial, onBack, onSubmit,
}: { option: ChatOption; initial: string; onBack: () => void; onSubmit: (a: FlowValue) => void }) {
  const [text, setText] = useState(initial)
  const [seconds, setSeconds] = useState(Number(initial) || 0)
  const today = toLocalISODate(new Date())
  const ok = option.input === 'duration' ? seconds > 0 : option.input === 'date' ? text >= today : !!text.trim()
  const payload = option.input === 'duration' ? String(seconds) : text.trim()
  return (
    <div className="fade-in flex flex-col gap-3 pb-2">
      <p className="text-xs text-[#a8a29e]">{option.label}</p>
      {option.input === 'duration' && <TimeInput seconds={seconds} showHours={option.hours} onChange={setSeconds} label={option.label} />}
      {option.input === 'date' && (
        <input type="date" value={text} min={today} onChange={(e) => setText(e.target.value)} className={inputClass} style={{ colorScheme: 'dark' }} autoFocus />
      )}
      {option.input === 'text' && (
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={option.placeholder} className={inputClass} autoFocus />
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button fullWidth disabled={!ok} onClick={() => onSubmit(`${option.value}:${payload}`)}>Done</Button>
      </div>
    </div>
  )
}

function MultiChoice({
  node, options, initial, onSubmit,
}: { node: FlowNode; options: ChatOption[]; initial: string[]; onSubmit: (a: FlowValue) => void }) {
  const [selected, setSelected] = useState<string[]>(initial)
  const toggle = (v: string) =>
    setSelected((s) => {
      if (s.includes(v)) return s.filter((x) => x !== v)
      // "All good" clears the rest; picking anything else clears "All good".
      if (node.exclusive === v) return [v]
      const base = node.exclusive ? s.filter((x) => x !== node.exclusive) : s
      if (node.max && base.length >= node.max) return base
      return [...base, v]
    })
  // Keep answers in the option order, whatever order they were tapped in.
  const ordered = options.map((o) => o.value).filter((v) => selected.includes(v))

  return (
    <div className="fade-in flex flex-col gap-3 pb-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.includes(o.value)
          return (
            <button key={o.value} onClick={() => toggle(o.value)} aria-pressed={active} className={chipClass(active)}>
              <span className="inline-flex items-center gap-1.5">
                {active && <Check size={14} strokeWidth={2.5} />}
                {o.label}
              </span>
            </button>
          )
        })}
      </div>
      <Button fullWidth onClick={() => onSubmit(ordered)} disabled={ordered.length === 0}>
        Done
      </Button>
    </div>
  )
}

function TextReply({ node, initial, onSubmit }: { node: FlowNode; initial: string; onSubmit: (a: FlowValue) => void }) {
  const [value, setValue] = useState(initial)
  const trimmed = value.trim()

  function send() {
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <div className="fade-in flex flex-col gap-2 pb-2">
      <div className="flex items-end gap-2">
        {node.multiline ? (
          <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={node.placeholder} rows={3} autoFocus className={`${inputClass} resize-none`} />
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(node.kind === 'number' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder={node.placeholder}
            inputMode={node.kind === 'number' ? 'numeric' : 'text'}
            autoFocus
            className={inputClass}
          />
        )}
        <button
          onClick={send}
          disabled={!trimmed}
          aria-label="Send"
          className="w-12 h-12 shrink-0 rounded-2xl bg-[#d97756] text-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
        >
          <Send size={18} />
        </button>
      </div>
      {node.optional && <SkipChip label="Skip" onClick={() => onSubmit('')} />}
      {node.skip && <SkipChip label={node.skip.label} onClick={() => onSubmit(node.skip!.value)} />}
    </div>
  )
}

function DateReply({ node, initial, onSubmit }: { node: FlowNode; initial: string; onSubmit: (a: FlowValue) => void }) {
  const [value, setValue] = useState(initial)
  const today = toLocalISODate(new Date())
  return (
    <div className="fade-in flex flex-col gap-2 pb-2">
      <div className="flex items-center gap-2">
        <input type="date" value={value} min={today} onChange={(e) => setValue(e.target.value)} className={inputClass} style={{ colorScheme: 'dark' }} aria-label="Date" />
        <Button onClick={() => onSubmit(value)} disabled={!value || value < today}>Done</Button>
      </div>
      {node.skip && <SkipChip label={node.skip.label} onClick={() => onSubmit(node.skip!.value)} />}
    </div>
  )
}

/** Tap a day once for training, twice for a match, three times to clear. */
function DaysReply({ initial, onSubmit }: { initial: Record<string, string>; onSubmit: (a: FlowValue) => void }) {
  const [days, setDays] = useState<Record<string, string>>(initial)
  const cycle = (d: string) =>
    setDays((cur) => {
      const nextKind = !cur[d] ? 'training' : cur[d] === 'training' ? 'match' : undefined
      const copy = { ...cur }
      if (nextKind) copy[d] = nextKind
      else delete copy[d]
      return copy
    })
  const any = Object.keys(days).length > 0
  return (
    <div className="fade-in flex flex-col gap-3 pb-2">
      <div className="flex justify-between gap-1.5">
        {WEEK_DAYS_MON.map((d) => {
          const kind = days[d]
          return (
            <button
              key={d}
              onClick={() => cycle(d)}
              aria-label={`${d}: ${kind ?? 'free'}`}
              className={`flex-1 aspect-square max-w-12 rounded-full text-xs font-semibold flex flex-col items-center justify-center ${
                kind === 'match' ? 'bg-[#d97756] text-white' : kind === 'training' ? 'bg-[#d97756]/25 text-[#f5f5f0] border border-[#d97756]/50' : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a]'
              }`}
            >
              {d[0]}
              {kind && <span className="text-[0.55rem] leading-none mt-0.5">{kind === 'match' ? 'MATCH' : 'TRAIN'}</span>}
            </button>
          )
        })}
      </div>
      <Button fullWidth onClick={() => onSubmit(days)}>{any ? 'Done' : 'No fixed days'}</Button>
    </div>
  )
}

function CompoundReply({
  node, fields, initial, onSubmit,
}: { node: FlowNode; fields: CompoundField[]; initial: Record<string, string> | undefined; onSubmit: (a: FlowValue) => void }) {
  const [values, setValues] = useState<Record<string, string>>(
    () => initial ?? Object.fromEntries(fields.filter((f) => f.initial).map((f) => [f.key, f.initial!])),
  )
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }))
  const complete = fields.every((f) => f.optional || (values[f.key] && values[f.key] !== '0'))
  const anyLift = fields.some((f) => f.kind === 'lift' && /^\d+(\.\d+)?x\d+$/.test(values[f.key] ?? ''))
  const ok = complete && (!fields.some((f) => f.kind === 'lift') || anyLift)

  return (
    <div className="fade-in flex flex-col gap-3 pb-2">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <span className="text-2xs uppercase tracking-widest text-[#6a6a6a]">{f.label}</span>
          {f.kind === 'chips' && (
            <div className="flex flex-wrap gap-2">
              {(f.options ?? []).map((o) => (
                <button key={o.value} onClick={() => set(f.key, o.value)} aria-pressed={values[f.key] === o.value} className={chipClass(values[f.key] === o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {f.kind === 'duration' && (
            <TimeInput
              key={String(f.hours?.(values))}
              seconds={Number(values[f.key]) || 0}
              showHours={f.hours?.(values) ?? true}
              onChange={(s) => set(f.key, s ? String(s) : '')}
              label={f.label}
            />
          )}
          {f.kind === 'lift' && <LiftInput value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />}
        </div>
      ))}
      <Button fullWidth disabled={!ok} onClick={() => onSubmit(values)}>Done</Button>
      {node.skip && <SkipChip label={node.skip.label} onClick={() => onSubmit(node.skip!.value)} />}
    </div>
  )
}

/** kg × reps, stored as "100x5". */
function LiftInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [kg, reps] = value.split('x')
  const box = 'w-20 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-2 py-2 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50'
  const emit = (k: string, r: string) => onChange(k && r ? `${k}x${r}` : k || r ? `${k}x${r}` : '')
  return (
    <div className="flex items-center gap-2">
      <input className={box} inputMode="decimal" placeholder="kg" aria-label="Weight in kg" value={kg ?? ''} onChange={(e) => emit(e.target.value.replace(/[^0-9.]/g, ''), reps ?? '')} />
      <span className="text-[#4a4a4a]">×</span>
      <input className={box} inputMode="numeric" placeholder="reps" aria-label="Reps" value={reps ?? ''} onChange={(e) => emit(kg ?? '', e.target.value.replace(/[^0-9]/g, ''))} />
    </div>
  )
}
