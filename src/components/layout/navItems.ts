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

// Screens reached from a page header (with a back button) rather than a tab.
// On phones they hide the tab bar; the iPad sidebar stays, since it links to
// them directly.
const NO_TAB_BAR_ROUTES = ['/settings']

export function isFullscreenRoute(pathname: string): boolean {
  return FULLSCREEN_ROUTES.some((r) => pathname.startsWith(r))
}

export function hidesTabBar(pathname: string): boolean {
  return isFullscreenRoute(pathname) || NO_TAB_BAR_ROUTES.some((r) => pathname.startsWith(r))
}
