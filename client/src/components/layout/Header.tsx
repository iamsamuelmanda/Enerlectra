import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Zap, Wallet, LayoutDashboard, LogOut, Menu } from "lucide-react";

export function Header() {
  const { user, signOut } = useAuth(); // Ensure this matches your hook's export
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/signin");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <header className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="p-2 bg-brand-primary rounded-lg group-hover:rotate-12 transition-transform">
            <Zap size={20} className="text-black fill-current" />
          </div>
          <span className="font-display font-black text-2xl uppercase tracking-tighter italic">
            Enerlectra
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/" icon={<LayoutDashboard size={16} />} label="Grid" />
          <NavLink to="/wallet" icon={<Wallet size={16} />} label="Wallet" />
        </nav>

        <div className="flex items-center gap-4">
          {user ? (
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all text-xs font-bold uppercase tracking-widest"
            >
              <LogOut size={14} />
              <span>Disconnect</span>
            </button>
          ) : (
            <button 
              onClick={() => navigate("/signin")}
              className="btn-primary px-6 py-2 text-xs"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-brand-primary uppercase tracking-widest transition-colors">
      {icon}
      <span>{label}</span>
    </Link>
  );
}
