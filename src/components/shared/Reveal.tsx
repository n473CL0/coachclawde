import { useEffect, useRef, useState, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** Stagger index — each step adds a small delay for a cascading reveal */
  index?: number
  className?: string
}

/**
 * Fades + lifts its children into view the first time they scroll onto screen,
 * matching the gentle reveal-on-scroll motion of the Claude app. Respects
 * prefers-reduced-motion by showing content immediately.
 */
export function Reveal({ children, index = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const el = ref.current
    if (!el || shown) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className}`}
      style={{ transitionDelay: shown ? `${Math.min(index, 6) * 60}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}
