import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Slide-up bottom sheet over a dimmed backdrop. Tapping the backdrop closes it
 * unless `dismissOnBackdrop` is false (use that when the sheet holds typed
 * input that a stray tap shouldn't throw away).
 *
 * Portalled to <body> so it can be opened from inside tiles, rows and other
 * overflow-hidden containers. Lay the content out as a flex column: give the
 * scrolling middle `flex-1 overflow-y-auto`, and end with a footer that uses
 * `pb-edge` so it clears the home indicator.
 *
 * Device fit: the sheet stays phone-width (a little wider on tablets), lifts
 * itself above the on-screen keyboard via `--kb` (see `useKeyboardInset`) and
 * caps its height to the space left under the status bar.
 */
export function BottomSheet({
  label, onClose, children, dismissOnBackdrop = true,
}: {
  /** Accessible name for the dialog. */
  label: string
  onClose: () => void
  children: ReactNode
  dismissOnBackdrop?: boolean
}) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col pb-(--kb)"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="sheet-panel mt-auto w-full max-w-md md:max-w-lg mx-auto bg-[#111] rounded-t-3xl border-t border-[#2a2a2a] flex flex-col slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

/** The sheet's ✕ — a full 44 × 44 touch target. */
export function SheetCloseButton({ onClose, label = 'Close' }: { onClose: () => void; label?: string }) {
  return (
    <button
      onClick={onClose}
      aria-label={label}
      className="w-11 h-11 -mr-2 -mt-1.5 shrink-0 flex items-center justify-center rounded-full text-[#6a6a6a] hover:text-[#f5f5f0] hover:bg-[#1a1a1a] transition-colors"
    >
      <X size="1.25em" />
    </button>
  )
}
