import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { User } from '@supabase/supabase-js';
import { Menu, LogOut, User as UserIcon } from 'lucide-react';

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/10 backdrop-blur-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white hover:text-purple-200"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Enerlectra
            </Link>
          </div>

          <nav className="hidden md:flex items-center space-x-6">
            <Link to="/" className="text-white hover:text-purple-300 transition">Communities</Link>
            <Link to="/wallet" className="text-white hover:text-purple-300 transition">My Wallet</Link>
            <Link to="/trading" className="text-white hover:text-purple-300 transition">Trading</Link>
            {user && (
              <Link to="/admin" className="text-white hover:text-purple-300 transition">Admin</Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-purple-500/30 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-purple-200 hidden sm:inline">
                  {user.email?.split('@')[0]}
                </span>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-white hover:bg-white/10 rounded-lg transition"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <Link
                to="/signin"
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition"
              >
                <UserIcon className="w-4 h-4" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 h-full bg-purple-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex flex-col gap-2 mt-8">
              <Link
                to="/"
                className="text-white hover:bg-purple-800 px-3 py-2 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Communities
              </Link>
              <Link
                to="/wallet"
                className="text-white hover:bg-purple-800 px-3 py-2 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                My Wallet
              </Link>
              <Link
                to="/trading"
                className="text-white hover:bg-purple-800 px-3 py-2 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Trading
              </Link>
              {user && (
                <Link
                  to="/admin"
                  className="text-white hover:bg-purple-800 px-3 py-2 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Admin
                </Link>
              )}
              {!user && (
                <>
                  <hr className="border-white/20 my-2" />
                  <Link
                    to="/signin"
                    className="text-white hover:bg-purple-800 px-3 py-2 rounded-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="text-white hover:bg-purple-800 px-3 py-2 rounded-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}