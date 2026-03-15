import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/wallet', label: 'My Wallet', icon: Wallet },
    { path: '/trading', label: 'Trading', icon: TrendingUp },
    { path: '/admin', label: 'Admin', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'bg-white/10 backdrop-blur-lg border-r border-white/20 transition-all duration-300 hidden md:block',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className="p-4">
        <button
          onClick={onToggle}
          className="w-full flex justify-end text-white/60 hover:text-white mb-6"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={cn(
                  'flex items-center px-3 py-2 rounded-lg transition-all',
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'text-white/70 hover:bg-purple-600/30 hover:text-white'
                )}
              >
                <item.icon className={cn('w-5 h-5', collapsed ? 'mx-auto' : 'mr-3')} />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}