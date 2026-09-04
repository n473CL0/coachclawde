import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  accent?: boolean
  glow?: boolean
}

export function Card({ children, className = '', onClick, accent, glow }: CardProps) {
  return (
    <div
      className={`
        bg-[#161616] rounded-3xl border border-[#2a2a2a] overflow-hidden
        ${accent ? 'border-[#d97756]/30' : ''}
        ${glow ? 'shadow-lg shadow-[#d97756]/10' : ''}
        ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform duration-100' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {children}
    </div>
  )
}
