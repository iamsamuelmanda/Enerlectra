// === src/App.tsx ===
// Refactored with premium UI components + Landing Page

import { useState, useEffect } from 'react';
import {
  Activity, Zap, TrendingUp, Users, DollarSign,
  BarChart3, LogIn, User, Brain, Settings, Layers,
  CheckCircle, Wifi, WifiOff, Globe
} from 'lucide-react';

// Services & Hooks
import { apiService } from './services/api';
import { useAuth } from './contexts/AuthContext';
import { useSocket } from './contexts/SocketContext';
import { useOffline } from './hooks/useOffline';
import { useAuth as useSupabaseAuth } from './hooks/useAuth';
import { Cluster } from './services/supabase';
import toast from 'react-hot-toast';

// UI Components
import { Button } from './components/ui/Button';
import { Card, CardHeader, CardStat } from './components/ui/Card';
import { Badge } from './components/ui/Badge';
import { Alert } from './components/ui/Alert';

// Page Components
import LandingPage from './pages/LandingPage';

// Existing components
import EnhancedLoginModal from './components/EnhancedLoginModal';
import AIInsightsPanel from './components/AIInsightsPanel';
import EnhancedFeaturesPanel from './components/EnhancedFeaturesPanel';
import EnerlectraLogo from './components/EnerlectraLogo';
import LoadingScreen from './components/LoadingScreen';
import OfflineIndicator from './components/OfflineIndicator';
import AutoUpdateIndicator from './components/AutoUpdateIndicator';

// Marketplace components
import SupabaseAuth from './components/auth/SupabaseAuth';
import UserPortfolio from './components/marketplace/UserPortfolio';
import ClusterList from './components/marketplace/ClusterList';
import ContributionForm from './components/marketplace/ContributionForm';
import OwnershipTable from './components/marketplace/OwnershipTable';
import ExchangeRateDisplay from './components/marketplace/ExchangeRateDisplay';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type ConnectionStatus = 'checking' | 'connected' | 'offline' | 'error';
type ActiveTab = 'dashboard' | 'marketplace';

interface EnergyListing {
  id: string | number;
  amount: number;
  pricePerKwh: number;
  description?: string;
}

interface PricePoint {
  time: string;
  price: number;
  description?: string;
}

interface Stats {
  totalVolume: number;
  activeTraders: number;
  energyPrice: number;
  priceChange: string;
}

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
const EnerlectraDashboard = () => {

  // ── State ──────────────────────────────────
  const [stats, setStats] = useState<Stats>({
    totalVolume: 2500000,
    activeTraders: 1234,
    energyPrice: 0.12,
    priceChange: '+5.2%',
  });

  const [priceData, setPriceData] = useState<PricePoint[]>([
    { time: '09:00', price: 0.11 },
    { time: '10:00', price: 0.12 },
    { time: '11:00', price: 0.13 },
    { time: '12:00', price: 0.12 },
    { time: '13:00', price: 0.14 },
  ]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [listings, setListings] = useState<EnergyListing[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [showEnhancedFeatures, setShowEnhancedFeatures] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [ownershipRefreshKey, setOwnershipRefreshKey] = useState(0);
  const [showLanding, setShowLanding] = useState(true);

  // ── Context ────────────────────────────────
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected: wsConnected } = useSocket();
  const { isOnline, syncStatus } = useOffline();
  const { user: supabaseUser } = useSupabaseAuth();

  // ── Effects ────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setIsLoading(false);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const healthData = await response.json();
          console.log('Backend connected:', healthData);
          setConnectionStatus('connected');
          fetchMarketData();
        } else {
          setConnectionStatus('error');
        }
      } catch (error) {
        console.error('Connection failed:', error);
        setConnectionStatus('offline');
      }
    };

    if (!isLoading) testConnection();
  }, [isLoading]);

  useEffect(() => {
    const handleTradeCompleted = (event: CustomEvent) => {
      const { type, amount, cost } = event.detail;
      toast.success(
        `${type === 'buy' ? 'Purchased' : 'Sold'} ${amount} kWh for ${cost.toFixed(2)} ZMW`,
        { duration: 5000 }
      );
      fetchMarketData();
    };

    const handleOfferCreated = (event: CustomEvent) => {
      const { energyAmount, pricePerKwh } = event.detail;
      toast(`New offer: ${energyAmount} kWh at ${pricePerKwh} ZMW/kWh`, {
        duration: 6000,
        style: { background: '#3B82F6', color: '#FFFFFF' },
      });
    };

    const handleMarketUpdate = (event: CustomEvent) => {
      const { volume, value } = event.detail;
      toast.success(
        `Market update: ${volume} kWh traded for ${value.toFixed(2)} ZMW`,
        { duration: 4000 }
      );
      fetchMarketData();
    };

    window.addEventListener('trade-completed', handleTradeCompleted as EventListener);
    window.addEventListener('offer-created', handleOfferCreated as EventListener);
    window.addEventListener('market-update', handleMarketUpdate as EventListener);

    return () => {
      window.removeEventListener('trade-completed', handleTradeCompleted as EventListener);
      window.removeEventListener('offer-created', handleOfferCreated as EventListener);
      window.removeEventListener('market-update', handleMarketUpdate as EventListener);
    };
  }, []);

  // ── Functions ──────────────────────────────
  const fetchMarketData = async () => {
    try {
      const pricingRes = await apiService.getPricing();
      const pricing = pricingRes.data?.data;
      const clusterPricing: Array<{
        clusterId: string;
        location: any;
        basePrice: number;
        currentPrice: number;
        availableKWh: number;
        utilizationPercent: number;
      }> = pricing?.clusterPricing || [];

      const mappedListings: EnergyListing[] = clusterPricing.map(p => ({
        id: p.clusterId,
        amount: Math.round(p.availableKWh || 0),
        pricePerKwh: p.currentPrice,
        description: `${p.location?.region || 'Unknown'} • Utilization ${p.utilizationPercent}%`,
      }));
      setListings(mappedListings);

      if (clusterPricing.length > 0) {
        const totalMarketValue = clusterPricing.reduce(
          (sum, p) => sum + p.availableKWh * p.currentPrice, 0
        );
        const avgPrice =
          clusterPricing.reduce((sum, p) => sum + p.currentPrice, 0) / clusterPricing.length;

        const newPriceData: PricePoint[] = clusterPricing.slice(0, 6).map((p, index) => ({
          time: `${9 + index}:00`,
          price: p.currentPrice,
          description: `${p.location?.region || 'Region'} • ${p.utilizationPercent}%`,
        }));

        setStats(prev => ({
          ...prev,
          totalVolume: Math.round(totalMarketValue * 100) / 100,
          energyPrice: parseFloat((pricing?.baseRate?.effectiveRate ?? avgPrice).toFixed(3)),
          activeTraders: mappedListings.length * 15,
        }));

        setPriceData(newPriceData);
      }
    } catch (error) {
      console.error('Failed to fetch market data:', error);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);

  // ── Loading ────────────────────────────────
  if (isLoading) return <LoadingScreen progress={loadingProgress} />;

  // ── Landing Page ───────────────────────────
  if (showLanding) {
    return (
      <LandingPage 
        onGetStarted={() => {
          setShowLanding(false);
          setShowLoginModal(true);
        }}
        onViewMarketplace={() => {
          setShowLanding(false);
          setActiveTab('marketplace');
        }}
        onEnterApp={() => {
          setShowLanding(false);
        }}
      />
    );
  }

  // ─────────────────────────────────────────
  // MAIN APP RENDER
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">

      <OfflineIndicator />
      <AutoUpdateIndicator />

      {/* ═══════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════ */}
      <div className="glass-dark border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">

            {/* Logo */}
            <div className="flex items-center space-x-4">
              <EnerlectraLogo size="small" animated={false} showTagline={false} />
              <div>
                <h1 className="text-2xl font-display font-bold text-white">Enerlectra</h1>
                <p className="text-slate-400 text-sm">The Energy Internet</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center glass rounded-xl p-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'dashboard'
                    ? 'gradient-blue text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('marketplace')}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'marketplace'
                    ? 'gradient-purple text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                Marketplace
                <Badge variant="purple" size="sm">BETA</Badge>
              </button>
            </div>

            {/* Status + Auth */}
            <div className="flex items-center gap-3">
              <Badge 
                variant={connectionStatus === 'connected' ? 'success' : connectionStatus === 'checking' ? 'warning' : 'error'}
                size="sm"
              >
                {connectionStatus === 'connected' ? 'Live Data' : connectionStatus === 'checking' ? 'Connecting...' : 'Demo Mode'}
              </Badge>

              <Badge 
                variant={wsConnected ? 'success' : 'error'}
                icon={wsConnected ? Wifi : WifiOff}
                size="sm"
              >
                {wsConnected ? 'Live' : 'Offline'}
              </Badge>

              <Badge 
                variant={isOnline ? 'success' : 'warning'}
                icon={Globe}
                size="sm"
              >
                {isOnline ? 'Online' : 'Offline'}
              </Badge>

              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    icon={Settings}
                    onClick={() => setShowEnhancedFeatures(!showEnhancedFeatures)}
                  >
                    <span className="hidden sm:inline">Enhanced</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    icon={Brain}
                    onClick={() => setShowAIInsights(!showAIInsights)}
                  >
                    <span className="hidden sm:inline">AI</span>
                  </Button>
                  <div className="flex items-center gap-2 text-white">
                    <User className="w-4 h-4" />
                    <span className="text-sm hidden sm:inline">{user?.name || 'User'}</span>
                  </div>
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={logout}
                  >
                    Logout
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="primary"
                  icon={LogIn}
                  onClick={() => setShowLoginModal(true)}
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PAGE CONTENT
      ═══════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ══════════════════════════════════════════════════════════
            DASHBOARD TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fade-in">

            {/* Welcome Section */}
            <div className="text-center">
              <div className="mb-6">
                <EnerlectraLogo size="large" animated={true} showTagline={true} />
              </div>
              <h2 className="text-4xl font-display font-bold text-white mb-4">
                Welcome to The Energy Internet
              </h2>
              <p className="text-slate-300 text-lg mb-6 max-w-2xl mx-auto">
                Join the future of African energy trading with blockchain-powered efficiency
              </p>

              {!isAuthenticated ? (
                <div className="flex items-center justify-center gap-4">
                  <Button 
                    variant="primary" 
                    size="lg"
                    onClick={() => setShowLoginModal(true)}
                  >
                    Get Started
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg"
                    icon={Layers}
                    onClick={() => setActiveTab('marketplace')}
                  >
                    View Marketplace
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center flex-wrap gap-4">
                  <Alert variant="success" className="max-w-md">
                    Welcome back, {user?.name}!
                  </Alert>
                  <Button 
                    variant="secondary"
                    icon={Settings}
                    onClick={() => setShowEnhancedFeatures(!showEnhancedFeatures)}
                  >
                    Test Enhanced Features
                  </Button>
                  <Button 
                    variant="outline"
                    icon={Brain}
                    onClick={() => setShowAIInsights(!showAIInsights)}
                  >
                    View AI Insights
                  </Button>
                  <Button 
                    variant="primary"
                    icon={Layers}
                    onClick={() => setActiveTab('marketplace')}
                  >
                    Go to Marketplace
                  </Button>
                </div>
              )}
            </div>

            {/* Enhanced Features Panel */}
            {showEnhancedFeatures && (
              <div className="animate-slide-down">
                <EnhancedFeaturesPanel />
              </div>
            )}

            {/* AI Insights Panel */}
            {showAIInsights && (
              <div className="animate-slide-down">
                <AIInsightsPanel />
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <CardStat
                label="Energy Price"
                value={`$${stats.energyPrice}/kWh`}
                icon={DollarSign}
                iconColor="text-emerald-400"
                trend={{ value: stats.priceChange, positive: true }}
              />

              <CardStat
                label="Total Volume"
                value={formatCurrency(stats.totalVolume)}
                icon={TrendingUp}
                iconColor="text-blue-400"
              />

              <CardStat
                label="Active Traders"
                value={stats.activeTraders.toLocaleString()}
                icon={Users}
                iconColor="text-purple-400"
              />

              <CardStat
                label="Market Status"
                value={connectionStatus === 'connected' ? 'Live' : 'Demo'}
                icon={Activity}
                iconColor="text-orange-400"
              />
            </div>

            {/* Live Energy Listings */}
            {connectionStatus === 'connected' && listings.length > 0 && (
              <Card>
                <CardHeader 
                  title="Live Energy Listings"
                  icon={Zap}
                  iconColor="text-amber-400"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {listings.map(listing => (
                    <Card key={listing.id} variant="glass-dark" hover>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-white font-semibold">{listing.amount} kWh</span>
                        <span className="text-emerald-400 font-bold">${listing.pricePerKwh}/kWh</span>
                      </div>
                      <p className="text-slate-400 text-sm">{listing.description}</p>
                    </Card>
                  ))}
                </div>
              </Card>
            )}

            {/* Price Chart */}
            <Card>
              <CardHeader 
                title={connectionStatus === 'connected' ? 'Live Energy Prices' : 'Energy Price Trend'}
                icon={BarChart3}
                iconColor="text-slate-400"
              />
              <div className="space-y-4">
                {priceData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 glass-dark rounded-xl">
                    <div className="flex-1">
                      <span className="text-white font-medium">{item.time}</span>
                      {item.description && (
                        <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                      )}
                    </div>
                    <span className="text-white font-bold mx-4">${item.price}/kWh</span>
                    <div className="w-32 bg-slate-700 rounded-full h-2">
                      <div
                        className="gradient-blue h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(item.price / 0.14) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader title="System Status" icon={Activity} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Backend URL</span>
                    <span className="text-white font-medium">/api (proxied)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Connection</span>
                    <Badge variant={connectionStatus === 'connected' ? 'success' : 'error'}>
                      {connectionStatus}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">WebSocket</span>
                    <Badge variant={wsConnected ? 'success' : 'error'}>
                      {wsConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Offline Mode</span>
                    <Badge variant={isOnline ? 'success' : 'warning'}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Data Mode</span>
                    <span className="text-white font-medium">
                      {connectionStatus === 'connected' ? 'Live Data' : 'Demo Data'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active Listings</span>
                    <span className="text-white font-medium">{listings.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Authentication</span>
                    <Badge variant={isAuthenticated ? 'success' : 'error'}>
                      {isAuthenticated ? 'Logged In' : 'Guest'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Supabase</span>
                    <Badge variant={supabaseUser ? 'success' : 'default'}>
                      {supabaseUser ? supabaseUser.email?.split('@')[0] : 'Not signed in'}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            MARKETPLACE TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'marketplace' && (
          <div className="space-y-8 animate-fade-in">

            {/* Marketplace Header */}
            <Card variant="glass-strong" padding="lg">
              <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                <div>
                  <h2 className="text-3xl font-display font-bold text-white flex items-center gap-3 mb-2">
                    <Layers className="w-8 h-8 text-purple-400" />
                    Energy Ownership Marketplace
                  </h2>
                  <p className="text-slate-400">
                    Contribute to solar clusters. Earn real energy. Own your power.
                  </p>
                </div>
                <ExchangeRateDisplay />
              </div>

              <Alert variant="info" title="Beta Mode">
                All contributions are reversible during beta. Anti-whale protection active (max 30% ownership per cluster). If this doesn't feel fair, we stop.
              </Alert>
            </Card>

            {/* Supabase Auth */}
            <Card>
              <CardHeader 
                title="Account"
                icon={User}
                iconColor="text-purple-400"
              />
              <SupabaseAuth />
            </Card>

            {/* User Portfolio */}
            <Card>
              <UserPortfolio user={supabaseUser} />
            </Card>

            {/* Energy Communities */}
            <Card>
              <CardHeader 
                title="Energy Communities"
                icon={Zap}
                iconColor="text-amber-400"
              />
              <ClusterList onSelectCluster={setSelectedCluster} />
            </Card>

            {/* Contribution Form */}
            {selectedCluster && (
              <Card>
                <h3 className="text-xl font-bold text-white mb-2">
                  Contributing to:{' '}
                  <span className="text-purple-400">{selectedCluster.name}</span>
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  Select amount below. Anti-whale engine will validate before submission.
                </p>
                <ContributionForm
                  user={supabaseUser}
                  cluster={selectedCluster}
                  onContributionSuccess={() => {
                    setOwnershipRefreshKey(k => k + 1);
                    toast.success('Ownership table updated!');
                  }}
                />
              </Card>
            )}

            {/* Ownership Table */}
            <Card>
              <OwnershipTable
                key={ownershipRefreshKey}
                clusterId={selectedCluster?.id ?? null}
                clusterName={selectedCluster?.name}
              />
            </Card>

            {/* Footer */}
            <div className="text-center py-8 border-t border-white/10">
              <p className="text-slate-400 text-sm">
                Enerlectra Marketplace • Powered by Supabase + Backend API
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Anti-whale engine • Immutable snapshots • Settlement engine
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <EnhancedLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
};

export default EnerlectraDashboard;