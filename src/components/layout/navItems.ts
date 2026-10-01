import { Home, Clock, TrendingUp, type LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  icon: LucideIcon
  label: string
}

/** Primary destinations, shared by the phone tab bar and the iPad sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/progress', icon: TrendingUp, label: 'Progress' },
]

// Routes that take over the full screen and hide both the tab bar and sidebar.
const FULLSCREEN_ROUTES = ['/session/', '/plan']

export function isFullscreenRoute(pathname: string): boolean {
  return FULLSCREEN_ROUTES.some((r) => pathname.startsWith(r))
}
