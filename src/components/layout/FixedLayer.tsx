import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders screen-anchored UI (tab bar, Session action bar, rest timer, status
 * bar strip) into `#fixed-layer` — a full-viewport, fixed layer outside the
 * app root (see index.html / index.css).
 *
 * Why: the app root is a size container (`@container/app`), and WebKit treats a
 * size container as the containing block for `position: fixed` descendants.
 * Inside it, "fixed to the bottom" means fixed to the bottom of the *app*, so
 * on iOS the tab bar rode up on short pages and scrolled with long ones. The
 * layer is itself a fixed `inset-0` box (so it *is* the viewport) and is also
 * named `app`, so children keep the same `@3xl/app:` queries.
 */
export function FixedLayer({ children }: { children: ReactNode }) {
  const layer = document.getElementById('fixed-layer') ?? document.body
  return createPortal(children, layer)
}
