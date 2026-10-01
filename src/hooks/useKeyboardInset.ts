import { useEffect } from 'react'

/**
 * Publishes the on-screen keyboard's height as the `--kb` CSS variable on
 * <html>, plus a `data-keyboard` attribute while it's open.
 *
 * iOS (Safari and installed PWAs) doesn't shrink the layout viewport when the
 * keyboard opens — it only shrinks the *visual* viewport — so anything pinned
 * with `position: fixed; bottom: 0` ends up behind the keyboard. The gap
 * between the two viewports is the keyboard, and sheets lift themselves by it
 * (see `BottomSheet`). On Android, `interactive-widget=resizes-content` in the
 * viewport meta resizes the layout instead, so this stays at 0 there.
 *
 * Mount once, at the app root.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let frame = 0
    let wasOpen = false

    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // A pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
        const zoomed = vv.scale > 1.01
        // Measured against the fixed layer that sheets live in: the real
        // screen height in the installed iPhone app (where the reported
        // viewport can stop short), otherwise the viewport.
        const base = document.getElementById('fixed-layer')?.clientHeight || window.innerHeight
        const gap = Math.round(base - vv.height - vv.offsetTop)
        // Ignore small differences (toolbar collapse, rounding).
        const open = !zoomed && gap > 80
        root.style.setProperty('--kb', open ? `${gap}px` : '0px')
        root.toggleAttribute('data-keyboard', open)

        // Keep the field being typed into visible once the keyboard lands.
        if (open && !wasOpen) {
          const el = document.activeElement
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        }
        wasOpen = open
      })
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--kb')
      root.removeAttribute('data-keyboard')
    }
  }, [])
}
