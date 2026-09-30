import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Slide-up bottom sheet over a dimmed backdrop. Tapping the backdrop closes it.
 * Portalled to <body> so it can be opened from inside tiles, rows and other
 * overflow-hidden containers. Lay the content out as a flex column: give the
 * scrolling middle `flex-1 overflow-y-auto`.
 */
export function BottomSheet({
  label, onClose, children,
}: {
  /** Accessible name for the dialog. */
  label: string
  onClose: () => void
  children: ReactNode
}) {
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="mt-auto w-full max-w-md mx-auto bg-[#111] rounded-t-3xl border-t border-[#2a2a2a] flex flex-col slide-up max-h-[88svh]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
