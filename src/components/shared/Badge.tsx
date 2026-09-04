interface BadgeProps {
  label: string
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'easy' | 'moderate' | 'hard'
}

const variants = {
  default: 'bg-[#2a2a2a] text-[#a8a29e]',
  accent: 'bg-[#d97756]/15 text-[#d97756]',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  easy: 'bg-emerald-500/15 text-emerald-400',
  moderate: 'bg-[#d97756]/15 text-[#d97756]',
  hard: 'bg-red-500/15 text-red-400',
}

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {label}
    </span>
  )
}
