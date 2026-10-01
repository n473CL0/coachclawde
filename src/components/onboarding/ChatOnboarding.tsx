import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Send } from 'lucide-react'
import { ClaudeMark } from '../shared/ClaudeMark'
import { Button } from '../shared/Button'
import {
  activeQuestions,
  answerLabel,
  nextQuestion,
  type ChatAnswer,
  type ChatAnswers,
  type ChatQuestion,
  type QuestionId,
} from '../../lib/onboardingChat'

interface ChatOnboardingProps {
  answers: ChatAnswers
  onAnswer: (id: QuestionId, answer: ChatAnswer) => void
  /** Clear the answer to `id` (and everything after it) so it can be re-answered. */
  onRewind: (id: QuestionId) => void
  onContinue: () => void
}

const DONE_ID = '__done'
const DONE_LINES = ["That's everything I need. Nearly done: just a few details about you."]

/** How long Clawde "types" before a bubble appears, scaled to its length. */
function typingDelay(line: string, isFirst: boolean): number {
  if (isFirst) return 450
  return Math.min(1300, 350 + line.length * 9)
}

/**
 * The first-run onboarding conversation. Clawde asks the scripted questions
 * from `lib/onboardingChat` one at a time; the athlete answers with chips or a
 * short text reply. Tapping an earlier answer rewinds the chat to that question.
 */
export function ChatOnboarding({ answers, onAnswer, onRewind, onContinue }: ChatOnboardingProps) {
  const questions = activeQuestions(answers)
  const current = nextQuestion(answers)
  const currentId = current?.id ?? DONE_ID
  const currentLines = current ? current.coach(answers) : DONE_LINES

  // How many of each question's coach bubbles have been revealed. Once a
  // question has been fully shown it stays shown, so rewinding to it doesn't
  // replay the typing.
  const [revealed, setRevealed] = useState<Record<string, number>>({})
  // Answers cleared by a rewind, so the composer starts from them.
  const [drafts, setDrafts] = useState<ChatAnswers>({})
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

  // Keep the latest message in view.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [currentId, shownCount])

  function rewind(id: QuestionId) {
    // Keep every answer being cleared as a draft, so re-answering the later
    // questions is just a quick tap through.
    setDrafts((d) => ({ ...d, ...answers }))
    onRewind(id)
  }

  const answered = current ? questions.slice(0, questions.indexOf(current)) : questions

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col gap-2 px-4 pt-4 pb-4">
        {answered.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            {q.coach(answers).map((line, i, lines) => (
              <CoachBubble key={i} text={line} showAvatar={i === lines.length - 1} />
            ))}
            <UserBubble text={answerLabel(q, answers[q.id]!)} onClick={() => rewind(q.id)} />
          </div>
        ))}

        <div key={currentId} className="flex flex-col gap-2">
          {currentLines.slice(0, shownCount).map((line, i) => (
            <CoachBubble key={i} text={line} showAvatar={!typing && i === shownCount - 1} animate />
          ))}
          {typing && <TypingBubble />}
        </div>

        {answered.length > 0 && !typing && current && (
          <p className="text-[10px] text-[#4a4a4a] text-center mt-1">Tap any of your answers to change it</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-[#1a1a1a] px-4 pt-3 pb-safe">
        {typing ? (
          <div className="h-12" aria-hidden />
        ) : current ? (
          <Composer
            key={current.id}
            question={current}
            answers={answers}
            draft={drafts[current.id]}
            onSubmit={(a) => onAnswer(current.id, a)}
          />
        ) : (
          <div className="pb-2 fade-in">
            <Button size="lg" fullWidth onClick={onContinue}>
              Continue <ArrowRight size={18} />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- bubbles ----------------------------------------------------------------

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
          <span
            key={i}
            className="typing-dot w-1.5 h-1.5 rounded-full bg-[#6a6a6a]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
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

// --- composer ---------------------------------------------------------------

function Composer({
  question, answers, draft, onSubmit,
}: {
  question: ChatQuestion
  answers: ChatAnswers
  draft: ChatAnswer | undefined
  onSubmit: (answer: ChatAnswer) => void
}) {
  if (question.kind === 'single') return <SingleChoice question={question} selected={draft} onSubmit={onSubmit} />
  if (question.kind === 'multi') {
    const initial = Array.isArray(draft) ? draft : question.preselect?.(answers) ?? []
    return <MultiChoice question={question} initial={initial} onSubmit={onSubmit} />
  }
  return <TextReply question={question} initial={typeof draft === 'string' ? draft : ''} onSubmit={onSubmit} />
}

function chipClass(active: boolean): string {
  return `px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150 active:scale-95 ${
    active
      ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
      : 'bg-[#1a1a1a] text-[#a8a29e] border border-[#2a2a2a] hover:text-[#f5f5f0]'
  }`
}

function SingleChoice({
  question, selected, onSubmit,
}: { question: ChatQuestion; selected: ChatAnswer | undefined; onSubmit: (a: ChatAnswer) => void }) {
  const options = question.options ?? []
  const withHints = options.some((o) => o.hint)
  return (
    <div className={`fade-in pb-2 ${withHints ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}`}>
      {options.map((o) =>
        withHints ? (
          <button
            key={o.value}
            onClick={() => onSubmit(o.value)}
            className={`flex items-center justify-between gap-3 text-left px-4 py-2.5 rounded-2xl border transition-all duration-150 active:scale-[0.98] ${
              selected === o.value
                ? 'bg-[#d97756]/12 border-[#d97756]/50'
                : 'bg-[#161616] border-[#2a2a2a] hover:border-[#3a3a3a]'
            }`}
          >
            <span className="text-sm font-semibold text-[#f5f5f0]">{o.label}</span>
            {o.hint && <span className="text-xs text-[#6a6a6a] text-right">{o.hint}</span>}
          </button>
        ) : (
          <button key={o.value} onClick={() => onSubmit(o.value)} className={chipClass(selected === o.value)}>
            {o.label}
          </button>
        )
      )}
    </div>
  )
}

function MultiChoice({
  question, initial, onSubmit,
}: { question: ChatQuestion; initial: string[]; onSubmit: (a: ChatAnswer) => void }) {
  const [selected, setSelected] = useState<string[]>(initial)
  const toggle = (v: string) =>
    setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))
  // Keep answers in the option order, whatever order they were tapped in.
  const ordered = (question.options ?? []).map((o) => o.value).filter((v) => selected.includes(v))

  return (
    <div className="fade-in flex flex-col gap-3 pb-2">
      <div className="flex flex-wrap gap-2">
        {(question.options ?? []).map((o) => {
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

function TextReply({
  question, initial, onSubmit,
}: { question: ChatQuestion; initial: string; onSubmit: (a: ChatAnswer) => void }) {
  const [value, setValue] = useState(initial)
  const trimmed = value.trim()
  const inputClass =
    'flex-1 min-w-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#4a4a4a] focus:outline-none focus:border-[#d97756]/50 transition-colors'

  function send() {
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <div className="fade-in flex flex-col gap-2 pb-2">
      <div className="flex items-end gap-2">
        {question.multiline ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={question.placeholder}
            rows={3}
            autoFocus
            className={`${inputClass} resize-none`}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(question.kind === 'number' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder={question.placeholder}
            inputMode={question.kind === 'number' ? 'numeric' : 'text'}
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
      {question.optional && (
        <button onClick={() => onSubmit('')} className="self-center text-xs text-[#6a6a6a] hover:text-[#a8a29e] py-1.5 px-3">
          Skip
        </button>
      )}
    </div>
  )
}
