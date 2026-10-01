/**
 * Screen geometry for the installed (home-screen) iPhone app.
 *
 * 1. The real app height. In standalone mode with a translucent status bar,
 *    iOS can report a layout viewport that is shorter than the screen by about
 *    the status bar's height, so anything pinned to "the bottom" stops short.
 *    The installed app always fills the iPhone screen, so the screen size *is*
 *    the app size. We publish it as `--app-h`, and `#fixed-layer` (where all
 *    screen-anchored UI lives) is sized from it rather than from the viewport.
 *    `--viewport-gap` is how much shorter the reported viewport is.
 *
 * 2. The display's corner radius, so the floating tab bar can sit concentric
 *    with the bezel (equal side and bottom gap, radius = screen radius - gap).
 *    No web API exposes it, so it's looked up by screen size in points. Unknown
 *    sizes fall back to the regular layout.
 *
 * Only applies to iPhones running the installed app. In Safari the bar sits
 * above Safari's own toolbar, not in the screen corners, so neither matters.
 */

/** Display corner radius in points, keyed by portrait `width x height`. */
const IPHONE_CORNER_RADIUS: Record<string, number> = {
  '375x812': 39, // X, XS, 11 Pro, 12/13 mini
  '414x896': 41.5, // XR, XS Max, 11, 11 Pro Max
  '390x844': 47.33, // 12, 12 Pro, 13, 13 Pro, 14
  '428x926': 53.33, // 12/13 Pro Max, 14 Plus
  '393x852': 55, // 14 Pro, 15, 15 Pro, 16
  '430x932': 55, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  '402x874': 62, // 16 Pro, 17, 17 Pro
  '440x956': 62, // 16 Pro Max, 17 Pro Max
  '420x912': 62, // Air
}

export interface DeviceShape {
  standalone: boolean
  appHeight?: number
  viewportGap?: number
  screenRadius?: number
}

let current: DeviceShape = { standalone: false }

/** Last measured geometry, for the diagnostics line in Settings. */
export function getDeviceShape(): DeviceShape {
  return current
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function apply() {
  const root = document.documentElement
  const standalone = isStandalone()
  const iPhone = /iPhone/.test(navigator.userAgent)
  root.toggleAttribute('data-standalone', standalone)

  if (!standalone || !iPhone) {
    root.style.removeProperty('--app-h')
    root.style.removeProperty('--viewport-gap')
    root.style.removeProperty('--screen-radius')
    root.removeAttribute('data-screen-radius')
    current = { standalone }
    return
  }

  // iPhone `screen` dimensions are fixed in portrait terms.
  const short = Math.min(screen.width, screen.height)
  const long = Math.max(screen.width, screen.height)
  // Judge orientation by width, not width vs height: the keyboard shrinks the
  // window's height (a portrait window can end up wider than it is tall) but
  // never its width, which spans the short side in portrait.
  const landscape = window.innerWidth > short + 1
  const appHeight = landscape ? short : long
  // While the keyboard is up the viewport legitimately shrinks; keep the last
  // keyboard-free gap so page padding doesn't jump.
  const viewportGap = root.hasAttribute('data-keyboard')
    ? current.viewportGap ?? 0
    : Math.max(0, appHeight - window.innerHeight)
  root.style.setProperty('--app-h', `${appHeight}px`)
  root.style.setProperty('--viewport-gap', `${viewportGap}px`)

  const screenRadius = IPHONE_CORNER_RADIUS[`${short}x${long}`]
  if (screenRadius) {
    root.style.setProperty('--screen-radius', `${screenRadius}px`)
    root.setAttribute('data-screen-radius', '')
  } else {
    root.style.removeProperty('--screen-radius')
    root.removeAttribute('data-screen-radius')
  }
  current = { standalone, appHeight, viewportGap, screenRadius }
}

/** Call once at startup; re-measures on rotation and resize. */
export function watchDeviceShape() {
  apply()
  // Applying --app-h makes the page at least screen-height (see index.css),
  // which can change the viewport iOS reports, so measure again once that has
  // been laid out.
  requestAnimationFrame(() => requestAnimationFrame(apply))
  window.addEventListener('load', apply)
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)
}
