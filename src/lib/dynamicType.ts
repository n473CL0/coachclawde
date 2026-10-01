/**
 * iOS Dynamic Type for the web app.
 *
 * WebKit only exposes the user's iOS text-size setting through the system font
 * keywords, so the app's rem-based sizes would otherwise ignore it entirely.
 * We read the size of `-apple-system-body` and scale the root font size to
 * match. Everything sized in rem (all Tailwind text, spacing and the layout
 * tokens) then follows the setting.
 *
 * - iOS / iPadOS only: macOS Safari also supports the keyword (at 13px), and
 *   applying it there would shrink the whole app on a Mac.
 * - Normalised so iOS's default "Large" setting (17px body) keeps the 16px
 *   root the layouts were designed at.
 * - Clamped: the largest accessibility sizes would overflow a phone layout
 *   built around rows of controls, so we cap the root at 150%.
 *
 * Re-checked whenever the app becomes visible again, since the setting is
 * changed in the Settings app while this one is in the background.
 */

const IOS_DEFAULT_BODY_PX = 17
const DESIGN_ROOT_PX = 16
const MIN_ROOT_PX = 14
const MAX_ROOT_PX = 24

function supportsIOSDynamicType(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    CSS.supports('font', '-apple-system-body') &&
    // Only iOS/iPadOS WebKit supports this; it rules out macOS Safari.
    CSS.supports('-webkit-touch-callout', 'none')
  )
}

function applyDynamicType() {
  const probe = document.createElement('span')
  probe.style.font = '-apple-system-body'
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  document.body.appendChild(probe)
  const bodyPx = parseFloat(getComputedStyle(probe).fontSize)
  probe.remove()
  if (!bodyPx) return

  const rootPx = Math.min(MAX_ROOT_PX, Math.max(MIN_ROOT_PX, (bodyPx / IOS_DEFAULT_BODY_PX) * DESIGN_ROOT_PX))
  document.documentElement.style.fontSize = `${rootPx}px`
}

/** Call once at startup. No-op outside iOS / iPadOS. */
export function watchDynamicType() {
  if (!supportsIOSDynamicType()) return
  applyDynamicType()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyDynamicType()
  })
}
