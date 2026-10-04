import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, ListChecks, FileCode2, BarChart3, Trophy } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const getItems = (isAdmin: boolean) => [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  ...(isAdmin ? [{ to: '/problems', label: 'Problems', icon: FileCode2 }] : []),
  { to: '/assessments', label: 'Assessments', icon: ListChecks },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  ...(isAdmin ? [{ to: '/reports', label: 'Reports', icon: BarChart3 }] : [])
]

export default function Sidebar() {
  const location = useLocation()
  const { user } = useAuth()
  const items = getItems(user?.role === 'admin')
  return (
    <aside className="hidden md:block w-[240px] shrink-0 sticky top-14 h-[calc(100vh-56px)] bg-white border-r border-slate-200 py-3 pr-3 pl-0" aria-label="Main navigation">
      <nav className="space-y-1 px-4" role="navigation" aria-label="Sidebar">
        {items.map((item) => {
          const Icon = item.icon
          const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}


