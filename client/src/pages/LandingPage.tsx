import React from 'react';
import {
  Zap, Shield, TrendingUp, Users, Globe, ArrowRight,
  CheckCircle, BarChart3, Sun, Wallet, Lock, Smartphone, Layers
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import EnerlectraLogo from '../components/EnerlectraLogo';

interface LandingPageProps {
  onGetStarted: () => void;
  onViewMarketplace: () => void;
  onEnterApp: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onViewMarketplace, onEnterApp }) => {
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      
      {/* ═══════════════════════════════════════════════════════════
          HERO SECTION
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-mesh-gradient opacity-30" />
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        </div>

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
          
          {/* Navigation */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <EnerlectraLogo size="small" animated={false} showTagline={false} />
              <div>
                <h1 className="text-2xl font-display font-bold text-white">Enerlectra</h1>
                <p className="text-slate-400 text-sm">The Energy Internet</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onViewMarketplace}>
                Marketplace
              </Button>
              <Button variant="secondary" size="sm" onClick={onEnterApp}>
                Enter App
              </Button>
              <Button variant="primary" size="sm" onClick={onGetStarted}>
                Get Started
              </Button>
            </div>
          </nav>

          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto space-y-8">
            <Badge variant="purple" size="lg" className="animate-pulse-slow">
              Beta Launch - Zambia
            </Badge>

            <h1 className="text-5xl md:text-7xl font-display font-bold text-white leading-tight animate-slide-up">
              Own Your Energy.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
                Power Your Future.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
              Africa's first community-owned solar energy platform. 
              Contribute capital, earn real energy, and trade surplus power—all on blockchain.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Button 
                variant="primary" 
                size="lg"
                icon={Zap}
                onClick={onGetStarted}
                className="w-full sm:w-auto"
              >
                Start Contributing
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                icon={Layers}
                onClick={onViewMarketplace}
                className="w-full sm:w-auto"
              >
                View Marketplace
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-12 animate-slide-up" style={{ animationDelay: '0.3s' }}>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-emerald-400 mb-1">100%</div>
                <div className="text-sm text-slate-400">Clean Energy</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">1 USD</div>
                <div className="text-sm text-slate-400">= 100 PCUs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">30%</div>
                <div className="text-sm text-slate-400">Ownership Cap</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">24/7</div>
                <div className="text-sm text-slate-400">Live Tracking</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════════════ */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-16">
            <Badge variant="info" size="lg" className="mb-4">
              Simple Process
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
              How Enerlectra Works
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              From contribution to consumption—four simple steps to energy ownership
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <Card hover className="relative">
              <div className="absolute -top-4 left-6">
                <div className="w-12 h-12 rounded-xl gradient-success flex items-center justify-center text-white font-bold text-xl shadow-glow">
                  1
                </div>
              </div>
              <div className="pt-8">
                <div className="w-14 h-14 rounded-xl glass-strong flex items-center justify-center mb-4">
                  <Wallet className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Contribute</h3>
                <p className="text-slate-400 text-sm">
                  Buy ownership units (PCUs) in solar clusters. 1 USD = 100 PCUs. Pay via MTN or Airtel Money.
                </p>
              </div>
            </Card>

            {/* Step 2 */}
            <Card hover className="relative">
              <div className="absolute -top-4 left-6">
                <div className="w-12 h-12 rounded-xl gradient-success flex items-center justify-center text-white font-bold text-xl shadow-glow">
                  2
                </div>
              </div>
              <div className="pt-8">
                <div className="w-14 h-14 rounded-xl glass-strong flex items-center justify-center mb-4">
                  <Sun className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Generate</h3>
                <p className="text-slate-400 text-sm">
                  Solar panels produce energy. Your ownership percentage determines your kWh entitlement.
                </p>
              </div>
            </Card>

            {/* Step 3 */}
            <Card hover className="relative">
              <div className="absolute -top-4 left-6">
                <div className="w-12 h-12 rounded-xl gradient-success flex items-center justify-center text-white font-bold text-xl shadow-glow">
                  3
                </div>
              </div>
              <div className="pt-8">
                <div className="w-14 h-14 rounded-xl glass-strong flex items-center justify-center mb-4">
                  <BarChart3 className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Track</h3>
                <p className="text-slate-400 text-sm">
                  Monitor your production, consumption, and balance in real-time via dashboard.
                </p>
              </div>
            </Card>

            {/* Step 4 */}
            <Card hover className="relative">
              <div className="absolute -top-4 left-6">
                <div className="w-12 h-12 rounded-xl gradient-success flex items-center justify-center text-white font-bold text-xl shadow-glow">
                  4
                </div>
              </div>
              <div className="pt-8">
                <div className="w-14 h-14 rounded-xl glass-strong flex items-center justify-center mb-4">
                  <TrendingUp className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Settle</h3>
                <p className="text-slate-400 text-sm">
                  Surplus earns you credits. Deficit charges fairly. Trade energy peer-to-peer (coming soon).
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FEATURES - THE ENERGY OS
      ═══════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-b from-transparent to-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-16">
            <Badge variant="purple" size="lg" className="mb-4">
              Energy OS Architecture
            </Badge>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
              Six Layers. One Platform.
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Built on Supabase, powered by fairness algorithms, secured by blockchain
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <Card variant="glass-strong">
              <CardHeader 
                title="Identity Layer"
                subtitle="Secure authentication & user profiles"
                icon={Shield}
                iconColor="text-blue-400"
              />
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Supabase Auth integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Role-based access control</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Multi-device sync</span>
                </li>
              </ul>
            </Card>

            <Card variant="glass-strong">
              <CardHeader 
                title="Contribution Layer"
                subtitle="Capital pooling & ownership tracking"
                icon={Wallet}
                iconColor="text-emerald-400"
              />
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>1 USD = 100 PCUs conversion</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Anti-whale protection (30% cap)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Mobile money integration</span>
                </li>
              </ul>
            </Card>

            <Card variant="glass-strong">
              <CardHeader 
                title="Energy Data Layer"
                subtitle="Real-time production & consumption"
                icon={Sun}
                iconColor="text-amber-400"
              />
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Live solar production tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Household consumption meters</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>15-minute interval snapshots</span>
                </li>
              </ul>
            </Card>

            <Card variant="glass-strong">
              <CardHeader 
                title="Allocation Engine"
                subtitle="Fair energy distribution"
                icon={BarChart3}
                iconColor="text-purple-400"
              />
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Ownership % → kWh entitlement</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Dynamic rebalancing</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Priority-based allocation</span>
                </li>
              </ul>
            </Card>

            <Card variant="glass-strong">
              <CardHeader 
                title="Settlement Engine"
                subtitle="Automated billing & payouts"
                icon={TrendingUp}
                iconColor="text-cyan-400"
              />
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Surplus earns credits</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Deficit auto-charged</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Monthly settlement cycles</span>
                </li>
              </ul>
            </Card>

            <Card variant="glass-strong">
              <CardHeader 
                title="Energy Marketplace"
                subtitle="P2P trading (coming soon)"
                icon={Layers}
                iconColor="text-pink-400"
              />
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Peer-to-peer energy trading</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Dynamic pricing engine</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Smart contract automation</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          WHY ENERLECTRA
      ═══════════════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-6">
              <Badge variant="success" size="lg">
                Why Choose Us
              </Badge>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white">
                Energy Democracy
                <br />
                <span className="text-emerald-400">Built for Africa</span>
              </h2>
              <p className="text-lg text-slate-300 leading-relaxed">
                Traditional energy systems are opaque, centralized, and unfair. 
                Enerlectra flips the script: transparent ownership, community control, 
                and fair pricing for everyone.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg gradient-success flex items-center justify-center flex-shrink-0">
                    <Lock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">No Hidden Fees</h4>
                    <p className="text-slate-400 text-sm">
                      Transparent community pricing. No surprise charges, no meter manipulation.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg gradient-success flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">Community Owned</h4>
                    <p className="text-slate-400 text-sm">
                      You're not a customer. You're an owner. Your capital builds infrastructure.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg gradient-success flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">Mobile-First</h4>
                    <p className="text-slate-400 text-sm">
                      Pay with MTN/Airtel Money. Track on your phone. No bank account needed.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg gradient-success flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">100% Clean Energy</h4>
                    <p className="text-slate-400 text-sm">
                      Solar-first. Zero emissions. Good for your wallet, better for the planet.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="glass-strong rounded-2xl p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Platform Status</span>
                  <Badge variant="warning">Beta</Badge>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">Launching Soon</h3>
                  <p className="text-slate-400">Zambia</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass rounded-xl p-4">
                    <div className="text-3xl font-bold text-emerald-400 mb-1">1:100</div>
                    <div className="text-sm text-slate-400">USD to PCU</div>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <div className="text-3xl font-bold text-blue-400 mb-1">30%</div>
                    <div className="text-sm text-slate-400">Max Ownership</div>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <div className="text-3xl font-bold text-purple-400 mb-1">100%</div>
                    <div className="text-sm text-slate-400">Solar Power</div>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <div className="text-3xl font-bold text-amber-400 mb-1">24/7</div>
                    <div className="text-sm text-slate-400">Monitoring</div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <p className="text-sm text-slate-400 mb-3">Beta Features:</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success" size="sm">Mobile Money</Badge>
                    <Badge variant="success" size="sm">Live Tracking</Badge>
                    <Badge variant="success" size="sm">Fair Settlement</Badge>
                    <Badge variant="info" size="sm">P2P Trading Soon</Badge>
                  </div>
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl" />
              <div className="absolute -top-6 -left-6 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          CTA SECTION
      ═══════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/20 via-teal-900/20 to-cyan-900/20" />
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse-slow" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6">
            Ready to Own Your Energy?
          </h2>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Join our beta launch. Start contributing. Earn real energy. 
            Build a sustainable future—one PCU at a time.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              variant="primary" 
              size="lg"
              icon={Zap}
              iconPosition="right"
              onClick={onGetStarted}
              className="w-full sm:w-auto group"
            >
              Start Contributing
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="secondary" 
              size="lg"
              onClick={onViewMarketplace}
              className="w-full sm:w-auto"
            >
              Explore Marketplace
            </Button>
          </div>

          <p className="text-sm text-slate-500 mt-6">
            MTN & Airtel Money accepted • No hidden fees • Reversible beta mode
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <EnerlectraLogo size="small" animated={false} showTagline={false} />
                <div>
                  <h3 className="text-xl font-display font-bold text-white">Enerlectra</h3>
                  <p className="text-slate-400 text-sm">The Energy Internet</p>
                </div>
              </div>
              <p className="text-slate-400 text-sm max-w-md">
                Africa's first community-owned solar energy platform. 
                Building energy democracy, one cluster at a time.
              </p>
              <div className="mt-4">
                <p className="text-xs text-slate-500">Eight Digits Enterprises</p>
                <p className="text-xs text-slate-500">PACRA: 320220038106 • TPIN: 2731311066</p>
                <p className="text-xs text-slate-500">Lusaka, Zambia</p>
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><button onClick={onEnterApp} className="hover:text-white transition-colors">Dashboard</button></li>
                <li><button onClick={onViewMarketplace} className="hover:text-white transition-colors">Marketplace</button></li>
                <li><a href="#" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-500">
              © 2026 Enerlectra. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Badge variant="success" size="sm">MTN Money</Badge>
              <Badge variant="success" size="sm">Airtel Money</Badge>
              <Badge variant="info" size="sm">Supabase</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;