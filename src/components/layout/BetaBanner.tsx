import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BETA_BANNER_BG, BETA_FEEDBACK_URL, showsBetaBanner } from '../../lib/betaBanner'

/**
 * Slim strip across the top of the app asking beta testers to join the
 * WhatsApp feedback group. The whole strip is one link (easy to tap on a
 * phone) and opens in a new tab so the app stays open behind it. No close
 * button, so testers can always find the group.
 */
export function BetaBanner() {
  // While the banner shows, tint the browser bar to match it.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return
    const previous = meta.content
    meta.content = BETA_BANNER_BG
    return () => {
      meta.content = previous
    }
  }, [])

  return (
    <a className="beta-banner" href={BETA_FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
      This is a beta test. <strong className="font-semibold underline">Join the WhatsApp group</strong> to post
      feedback and ideas.
    </a>
  )
}

/** The banner, except on screens where leaving mid-task would lose work. */
export function BetaBannerSlot() {
  const { pathname } = useLocation()
  return showsBetaBanner(pathname) ? <BetaBanner /> : null
}
