import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_ITEMS, isFullscreenRoute } from './navItems'

/**
 * Floating tab bar for phone widths: a pill that hovers above the home
 * indicator and stays within the phone column. Hidden at sidebar widths
 * (see SideNav) and on full-screen routes. Geometry lives in the `--tabbar-*`
 * tokens in index.css, which pages clear with `pb-tabbar`.
 */
export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  if (isFullscreenRoute(location.pathname)) return null

  return (
    <nav aria-label="Primary" className="fixed z-40 tabbar-dock @3xl/app:hidden">
      <div className="flex h-full rounded-(--tabbar-radius) p-(--tabbar-pad) bg-[#161616]/85 backdrop-blur-xl ring-1 ring-inset ring-[#2a2a2a] shadow-lg shadow-black/50">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-(--tabbar-item-radius) transition-colors duration-150 ${
                active ? 'bg-[#d97756]/15 text-[#d97756]' : 'text-[#6a6a6a] hover:text-[#a8a29e]'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[0.6875rem] font-medium leading-none">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
