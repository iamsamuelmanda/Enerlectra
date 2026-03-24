import { Menu, Zap, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#020205]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onMenuClick} className="md:hidden p-2 -ml-2 text-white/70 hover:text-white transition-colors">
            <Menu size={22} />
          </button>
          <Link to="/" className="flex items-center gap-2 group">
            <Zap size={18} className="text-brand-primary" />
            <span className="font-bold tracking-tighter text-lg uppercase italic">Enerlectra</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <button onClick={() => signOut()} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors">
              <LogOut size={14} />
            </button>
          ) : (
            <Link to="/signin" className="px-4 py-1.5 rounded-full bg-brand-primary text-black text-xs font-bold">Access</Link>
          )}
        </div>
      </div>
    </header>
  );
}
