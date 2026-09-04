import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Clock, TrendingUp } from 'lucide-react'

const tabs = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/progress', icon: TrendingUp, label: 'Progress' },
]

// Routes that take over the full screen and hide the bottom nav.
const FULLSCREEN_ROUTES = ['/session/', '/plan']

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  if (FULLSCREEN_ROUTES.some((r) => location.pathname.startsWith(r))) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-[#1a1a1a] pb-safe z-40">
      <div className="flex items-center max-w-md mx-auto">
        {tabs.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors duration-150 ${
                active ? 'text-[#d97756]' : 'text-[#4a4a4a] hover:text-[#6a6a6a]'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-[10px] font-medium ${active ? 'text-[#d97756]' : ''}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
