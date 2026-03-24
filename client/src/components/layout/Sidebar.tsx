import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, Settings, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}

const navItems = [
  { path: '/',        label: 'Grid Nodes',  icon: LayoutDashboard },
  { path: '/wallet',  label: 'My Assets',   icon: Wallet          },
  { path: '/trading', label: 'P2P Market',  icon: TrendingUp      },
  { path: '/admin',   label: 'System',      icon: Settings        },
];

export function Sidebar({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <nav
      className={cn(
        'hidden md:flex flex-col transition-all duration-300 h-full border-r border-white/5 bg-[#05050a]/80 backdrop-blur-2xl',
        collapsed ? 'w-[80px]' : 'w-64'
      )}
    >
      <div className={cn(
        'flex items-center h-20 px-6 border-b border-white/5',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-primary/20">
          <Zap size={20} className="text-white fill-white/20" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-display font-black text-lg tracking-tighter text-white uppercase leading-none">Enerlectra</span>
            <span className="text-[7px] uppercase tracking-[0.3em] text-brand-primary font-bold">Node Operator</span>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                'flex items-center rounded-2xl transition-all group relative',
                collapsed ? 'justify-center p-4' : 'gap-4 px-4 py-3',
                active ? 'bg-white/5 border border-white/10' : 'hover:bg-white/[0.02]'
              )}
            >
              <item.icon
                size={20}
                className={cn("transition-colors", active ? "text-brand-primary" : "text-white/40 group-hover:text-white/70")}
              />
              {!collapsed && (
                <span className={cn("text-sm font-bold tracking-tight", active ? "text-white" : "text-white/50 group-hover:text-white/80")}>
                  {item.label}
                </span>
              )}
              {active && <div className="absolute left-0 w-1 h-6 bg-brand-primary rounded-r-full shadow-[0_0_10px_#A855F7]" />}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/5">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white/30 hover:bg-white/[0.06] transition-all"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </nav>
  );
}