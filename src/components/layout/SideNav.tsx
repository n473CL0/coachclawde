import { useLocation, useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { ClaudeMark } from '../shared/ClaudeMark'
import { NAV_ITEMS, isFullscreenRoute, type NavItem } from './navItems'

const SETTINGS_ITEM: NavItem = { path: '/settings', icon: Settings, label: 'Settings' }

/**
 * Sidebar navigation for iPad and other wide layouts. Shown only when the app
 * container is at least 48rem wide — the same point where BottomNav hides — so
 * tablets get a sidebar instead of a stretched tab bar. Hidden on full-screen
 * routes, like the tab bar.
 */
export function SideNav() {
  const location = useLocation()
  const navigate = useNavigate()

  if (isFullscreenRoute(location.pathname)) return null

  const item = ({ path, icon: Icon, label }: NavItem) => {
    const active = location.pathname === path
    return (
      <button
        key={path}
        onClick={() => navigate(path)}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-3 h-11 px-3 rounded-2xl text-sm font-medium transition-colors duration-150 ${
          active ? 'bg-[#d97756]/15 text-[#d97756]' : 'text-[#6a6a6a] hover:bg-[#161616] hover:text-[#a8a29e]'
        }`}
      >
        <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
        {label}
      </button>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="hidden @3xl/app:flex sidebar-dock shrink-0 sticky top-0 h-svh flex-col gap-1 pr-3 pt-safe pb-edge border-r border-[#1a1a1a]"
    >
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-5">
        <ClaudeMark size={28} idle={false} />
        <span className="text-sm font-semibold text-[#f5f5f0]">Coach Claude</span>
      </div>
      {NAV_ITEMS.map(item)}
      <div className="mt-auto">{item(SETTINGS_ITEM)}</div>
    </nav>
  )
}
