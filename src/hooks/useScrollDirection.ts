import { useEffect, useRef, useState } from 'react'

export type ScrollDirection = 'up' | 'down'

/**
 * Tracks vertical scroll direction on a scrollable element (defaults to the
 * window). Used to give the Claude mark its playful scroll-up reaction.
 *
 * `bump` flips to true briefly each time the user scrolls up, so a component
 * can re-trigger a one-shot animation without managing timers itself.
 */
export function useScrollDirection(threshold = 6) {
  const [direction, setDirection] = useState<ScrollDirection>('up')
  const [atTop, setAtTop] = useState(true)
  const [bump, setBump] = useState(false)
  const lastY = useRef(0)
  const bumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    lastY.current = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      setAtTop(y < 4)
      const delta = y - lastY.current
      if (Math.abs(delta) < threshold) return

      const next: ScrollDirection = delta > 0 ? 'down' : 'up'
      setDirection(next)

      if (next === 'up') {
        setBump(true)
        if (bumpTimer.current) clearTimeout(bumpTimer.current)
        bumpTimer.current = setTimeout(() => setBump(false), 650)
      }
      lastY.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (bumpTimer.current) clearTimeout(bumpTimer.current)
    }
  }, [threshold])

  return { direction, atTop, bump }
}
