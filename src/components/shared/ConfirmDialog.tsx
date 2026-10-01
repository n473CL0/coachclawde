import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface ConfirmDialogProps {
  icon: ReactNode
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Centered confirmation modal. Tapping the backdrop cancels. Portalled to
 * <body> so it can be opened from inside rows, tiles and other overflow-hidden
 * or transformed containers.
 */
export function ConfirmDialog({
  icon, title, children, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel,
}: ConfirmDialogProps) {
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm bg-[#111] rounded-3xl border border-[#2a2a2a] p-6 flex flex-col gap-4 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0 text-[#d97756]">
            {icon}
          </div>
          <h3 className="text-base font-semibold text-[#f5f5f0]">{title}</h3>
        </div>
        <div className="text-sm text-[#a8a29e] leading-relaxed">{children}</div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onCancel} fullWidth>{cancelLabel}</Button>
          <Button onClick={onConfirm} fullWidth>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
