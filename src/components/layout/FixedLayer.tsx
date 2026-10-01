import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders screen-anchored UI (tab bar, sheets, dialogs, Session action bar,
 * rest timer, status-bar strip) into `#fixed-layer`, a fixed layer outside the
 * app root (see index.html / index.css). Children position themselves with
 * `absolute` against the layer, which stands in for the screen.
 *
 * Why a layer:
 * - The app root is a size container (`@container/app`), and WebKit can treat
 *   a size container as the containing block for `position: fixed` children.
 * - In the installed iPhone app, iOS can report a viewport that stops short of
 *   the screen bottom by the status bar's height, so "fixed to the bottom"
 *   floats above it. The layer is sized from the real screen there
 *   (lib/deviceShape).
 *
 * The layer is also named `app`, so children keep the `@3xl/app:` queries.
 */
export function FixedLayer({ children }: { children: ReactNode }) {
  const layer = document.getElementById('fixed-layer') ?? document.body
  return createPortal(children, layer)
}
