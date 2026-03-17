import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Zap, Menu, X, LogOut, User, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const NAV_LINKS = [
  { to: '/', label: 'Communities' },
  { to: '/wallet', label: 'My Wallet' },
  { to: '/trading', label: 'Trading' },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isLoading: authLoading } = useAuth();   // ← added isLoading
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/signin');
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(13, 13, 26, 0.85)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                boxShadow: '0 0 16px rgba(102, 126, 234, 0.4)',
              }}
            >
              <Zap size={18} className="text-white" fill="white" />
            </div>
            <div className="flex flex-col leading-none">
              <span
                className="font-display font-bold text-lg"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #a78bfa 60%, #764ba2 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Enerlectra
              </span>
              <span className="text-xs" style={{ color: 'rgba(240,240,255,0.4)', fontSize: '0.65rem', letterSpacing: '0.08em' }}>
                THE ENERGY INTERNET
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="nav-link"
                style={isActive(link.to) ? {
                  color: '#a78bfa',
                  background: 'rgba(102, 126, 234, 0.12)',
                } : {}}
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <Link
                to="/admin"
                className="nav-link"
                style={isActive('/admin') ? {
                  color: '#a78bfa',
                  background: 'rgba(102, 126, 234, 0.12)',
                } : {}}
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Right side - with loading state */}
          <div className="hidden md:flex items-center gap-3">
            {authLoading ? (
              // Loading state (prevents flash)
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Loader size={16} className="animate-spin text-purple-400" />
                <span className="text-sm font-medium text-purple-200">Loading...</span>
              </div>
            ) : user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    <User size={12} className="text-white" />
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'rgba(240,240,255,0.8)' }}>
                    {user.email?.split('@')[0]}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="btn-ghost flex items-center gap-1.5"
                  style={{ color: 'rgba(240,240,255,0.4)', fontSize: '0.8rem' }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/signin" className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden btn-ghost"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu (same as before) */}
      {menuOpen && (
        <div
          className="md:hidden"
          style={{
            background: 'rgba(13, 13, 26, 0.98)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '16px',
          }}
        >
          <nav className="flex flex-col gap-1 mb-4">
            {NAV_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="nav-link py-2.5"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <Link to="/admin" className="nav-link py-2.5" onClick={() => setMenuOpen(false)}>
                Admin
              </Link>
            )}
          </nav>

          {authLoading ? (
            <div className="py-3 text-center text-purple-200">Loading account...</div>
          ) : user ? (
            <button onClick={handleSignOut} className="btn-secondary w-full justify-center">
              <LogOut size={14} /> Sign Out
            </button>
          ) : (
            <Link to="/signin" className="btn-primary w-full justify-center" onClick={() => setMenuOpen(false)}>
              Sign In
            </Link>
          )}
        </div>
      )}
    </header>
  );
}