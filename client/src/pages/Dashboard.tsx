import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useClusters } from '@/features/clusters/hooks/useClusters';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sun, Moon, Plus, Zap, Battery, DollarSign, Users, RefreshCw, AlertCircle } from 'lucide-react';

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { clusters, loading: clustersLoading, error, refresh } = useClusters();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (authLoading || clustersLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-14 h-14 border-4 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[var(--text-secondary)] text-lg">Loading communities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6">
        <Card className="max-w-lg w-full p-10 text-center">
          <AlertCircle className="w-16 h-16 text-[var(--danger)] mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
          <p className="text-[var(--text-secondary)] mb-8">{error}</p>
          <Button onClick={refresh} variant="primary" size="lg">
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-secondary)]/90 backdrop-blur-xl border-b border-[var(--border-glass)]">
        <div className="page-container flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-2xl font-bold tracking-tight text-gradient">
              Enerlectra
            </Link>
            <span className="text-xs px-2.5 py-1 bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-full text-[var(--text-muted)]">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 rounded-lg hover:bg-[var(--surface-glass)] transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm hidden sm:block text-[var(--text-secondary)]">
                  {user.email?.split('@')[0]}
                </span>
                <Button variant="ghost" size="sm" onClick={() => {/* sign out logic */}}>
                  Sign out
                </Button>
              </div>
            ) : (
              <Link to="/signin">
                <Button variant="primary" size="sm">
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="page-container py-10 space-y-12 lg:space-y-16">
        {/* Hero */}
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gradient">
            The Energy Internet
          </h1>
          <p className="text-xl md:text-2xl text-[var(--text-secondary)] max-w-3xl mx-auto">
            Democratizing energy access through community-owned solar infrastructure.
          </p>
          <Button size="lg" className="mt-4">
            <Plus className="w-5 h-5" />
            New Contribution
          </Button>
        </section>

        {/* Stats bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <Card className="stat-card text-center">
            <div className="flex justify-center mb-2">
              <Zap className="w-8 h-8 text-[var(--brand-primary)]" />
            </div>
            <p className="stat-value">3</p>
            <p className="stat-label">Clusters</p>
          </Card>

          <Card className="stat-card text-center">
            <div className="flex justify-center mb-2">
              <Battery className="w-8 h-8 text-[var(--success)]" />
            </div>
            <p className="stat-value">110 kWh</p>
            <p className="stat-label">Storage Target</p>
          </Card>

          <Card className="stat-card text-center">
            <div className="flex justify-center mb-2">
              <DollarSign className="w-8 h-8 text-[var(--warning)]" />
            </div>
            <p className="stat-value">$4,000</p>
            <p className="stat-label">Total Goal</p>
          </Card>

          <Card className="stat-card text-center">
            <div className="flex justify-center mb-2">
              <Users className="w-8 h-8 text-[var(--info)]" />
            </div>
            <p className="stat-value">0</p>
            <p className="stat-label">Participants</p>
          </Card>
        </div>

        {/* Clusters Grid */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="section-heading">Active Communities</h2>
            <button
              onClick={refresh}
              className="text-[var(--brand-primary)] hover:text-[var(--brand-secondary)] flex items-center gap-1.5 text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {clusters.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-6" />
              <h3 className="text-2xl font-semibold mb-3">No communities yet</h3>
              <p className="text-[var(--text-secondary)]">
                New solar clusters will appear here once launched.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {clusters.map(cluster => (
                <ClusterCard key={cluster.id} cluster={cluster} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}