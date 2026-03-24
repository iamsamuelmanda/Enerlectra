import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const navLinks = [
    { name: 'Communities', path: '/' },
    { name: 'Wallet', path: '/wallet' },
    { name: 'Trading', path: '/trading' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] px-6 py-4">
      <div className="max-w-7xl mx-auto glass border-glass rounded-[2rem] px-8 py-3 flex items-center justify-between shadow-2xl backdrop-blur-2xl">
        
        {/* LOGO SECTION */}
        <Link to="/" className="flex items-center gap-4 group">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-primary/30 blur-xl rounded-full group-hover:bg-brand-primary/50 transition-all" />
            <div className="relative w-10 h-10 glass border-brand-primary/40 rotate-45 flex items-center justify-center overflow-hidden">
              <Zap className="-rotate-45 text-white fill-brand-primary/20 group-hover:scale-110 transition-transform" size={18} />
            </div>
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="text-xl font-display font-black tracking-tighter text-white uppercase">Enerlectra</span>
            <span className="text-[8px] uppercase tracking-[0.3em] text-brand-primary font-bold">Fair Energy Ownership</span>
          </div>
        </Link>

        {/* NAVIGATION */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all",
                location.pathname === link.path 
                  ? "bg-brand-primary/10 text-brand-primary" 
                  : "text-muted hover:text-white hover:bg-white/5"
              )}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* AUTH / ACTION */}
        <div className="flex items-center gap-4">
          {user ? (
            <button 
              onClick={signOut}
              className="group flex items-center gap-2 text-xs font-bold text-muted hover:text-white transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary to-purple-600 flex items-center justify-center text-[10px] text-white">
                {user.email?.[0].toUpperCase()}
              </div>
              <span>Disconnect</span>
            </button>
          ) : (
            <Link to="/signin" className="btn-primary px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
              Access Terminal <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}