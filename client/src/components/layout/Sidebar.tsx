import { LayoutGrid, Wallet, Repeat, Settings, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils/cn';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();

  const menuItems = [
    { icon: LayoutGrid, label: 'Grid Nodes', path: '/' },
    { icon: Wallet, label: 'My Assets', path: '/wallet' },
    { icon: Repeat, label: 'P2P Market', path: '/trading' },
    { icon: Settings, label: 'System', path: '/admin/pilot' },
  ];

  return (
    <div className={cn(
      "h-full flex flex-col bg-[#05050a]/50 backdrop-blur-xl border-r border-white/5 transition-all duration-300",
      collapsed ? "w-20" : "w-64"
    )}>
      {/* MOBILE CLOSE HEADER */}
      <div className="flex items-center justify-between p-6 md:hidden">
        <span className="font-bold uppercase tracking-tighter italic">Menu</span>
        <button onClick={onNavigate} className="p-2 text-white/50 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-2">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                isActive ? "bg-brand-primary/10 text-brand-primary" : "text-white/40 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon size={20} className={cn(isActive ? "text-brand-primary" : "text-white/40 group-hover:text-white")} />
              {!collapsed && <span className="font-medium text-sm tracking-tight">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* DESKTOP TOGGLE */}
      <button 
        onClick={onToggle}
        className="hidden md:flex items-center justify-center p-4 border-t border-white/5 text-white/20 hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>
    </div>
  );
}
