import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, Settings, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}

const navItems = [
  { path: '/',        label: 'Communities', icon: LayoutDashboard },
  { path: '/wallet',  label: 'My Wallet',   icon: Wallet          },
  { path: '/trading', label: 'Trading',     icon: TrendingUp      },
  { path: '/admin',   label: 'Admin',       icon: Settings        },
];

export function Sidebar({ collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-[72px]' : 'w-60'
      )}
      style={{
        background: 'rgba(13, 13, 26, 0.8)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo area */}
      <div className={cn(
        'flex items-center h-16 px-4 flex-shrink-0',
        collapsed ? 'justify-center' : 'gap-3'
      )}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            boxShadow: '0 0 16px rgba(102, 126, 234, 0.4)',
          }}
        >
          <Zap size={18} className="text-white" fill="white" />
        </div>
        {!collapsed && (
          <span
            className="font-display font-bold text-base"
            style={{
              background: 'linear-gradient(135deg, #667eea, #a78bfa)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Enerlectra
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-xl transition-all duration-150 group',
                collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
              )}
              style={active ? {
                background: 'rgba(102, 126, 234, 0.15)',
                border: '1px solid rgba(102, 126, 234, 0.25)',
              } : {
                background: 'transparent',
                border: '1px solid transparent',
              }}
            >
              <item.icon
                size={18}
                style={{ color: active ? '#a78bfa' : 'rgba(240,240,255,0.45)' }}
                className="flex-shrink-0 transition-colors group-hover:text-purple-300"
              />
              {!collapsed && (
                <span
                  className="text-sm font-medium transition-colors"
                  style={{ color: active ? '#f0f0ff' : 'rgba(240,240,255,0.5)' }}
                >
                  {item.label}
                </span>
              )}
              {!collapsed && active && (
                <div
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Toggle button */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center rounded-xl w-full transition-all duration-150',
            collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
          )}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(240,240,255,0.3)',
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <>
              <ChevronLeft size={16} />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}