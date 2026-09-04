import { type ButtonHTMLAttributes, type ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  fullWidth?: boolean
  loading?: boolean
}

const variants = {
  primary: 'bg-[#d97756] hover:bg-[#c9663f] text-white font-semibold shadow-lg shadow-[#d97756]/20 active:scale-95',
  secondary: 'bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#f5f5f0] border border-[#2e2e2e] active:scale-95',
  ghost: 'bg-transparent hover:bg-[#1a1a1a] text-[#a8a29e] active:scale-95',
  danger: 'bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/20 active:scale-95',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-5 py-3 text-base rounded-2xl',
  lg: 'px-6 py-4 text-lg rounded-2xl',
}

export function Button({ variant = 'primary', size = 'md', children, fullWidth, loading, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 transition-all duration-150 select-none
        ${variants[variant]} ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled || loading ? 'opacity-50 pointer-events-none' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
