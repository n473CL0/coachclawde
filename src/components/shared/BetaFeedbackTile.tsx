import { ExternalLink, MessagesSquare } from 'lucide-react'
import { BETA_FEEDBACK_URL } from '../../lib/betaFeedback'

/**
 * Home tile asking beta testers to join the WhatsApp feedback group. The whole
 * tile is one link and opens in a new tab, so the app stays open behind it.
 */
export function BetaFeedbackTile() {
  return (
    <a
      href={BETA_FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-3xl bg-[#161616] border border-blue-500/25 px-5 py-3 active:scale-[0.98] transition-transform duration-100"
    >
      <div className="w-10 h-10 rounded-2xl bg-blue-500/15 flex items-center justify-center shrink-0">
        <MessagesSquare size={18} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#f5f5f0]">This is a beta test</p>
        <p className="text-xs text-[#6a6a6a] mt-0.5 leading-snug">
          <span className="text-blue-400 font-medium">Join the WhatsApp group</span> to post feedback and ideas.
        </p>
      </div>
      <ExternalLink size={14} className="text-[#3a3a3a] shrink-0" />
    </a>
  )
}
