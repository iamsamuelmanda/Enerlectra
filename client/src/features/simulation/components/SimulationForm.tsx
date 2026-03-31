import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Brain, Sparkles, Loader2, AlertCircle, Terminal } from 'lucide-react';
import { SimulationResultView } from './SimulationResult';

interface SimulationFormProps {
  clusterData: any;
}

export function SimulationForm({ clusterData }: SimulationFormProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logIndex, setLogIndex] = useState(0);

  // TECHNICAL LOG SEQUENCE
  const systemLogs = [
    "> INITIALIZING NEURAL LINK...",
    "> FETCHING NODE TELEMETRY [ID: " + (clusterData?.id?.slice(0, 8) || 'GLOBAL') + "]",
    "> SYNCHRONIZING WITH ZESCO GRID STANDARDS...",
    "> CALCULATING CURRENCY VOLATILITY (USD/ZMW)...",
    "> CLAUDE 3.5 SONNET: ANALYZING STRESS SCENARIO...",
    "> GENERATING PROBABILISTIC ROI MODELS...",
    "> FINALIZING STRATEGIC REPORT..."
  ];

  // LOG ANIMATION TIMER
  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLogIndex((prev) => (prev + 1) % systemLogs.length);
      }, 1000); // Cycles every second
    } else {
      setLogIndex(0);
    }
    return () => clearInterval(interval);
  }, [loading, systemLogs.length]);

  const handleSimulate = async () => {
    if (!prompt.trim()) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(${import.meta.env.VITE_API_URL}/api/simulation/run, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clusterData, 
          prompt: prompt.trim() 
        }),
      });

      if (!response.ok) {
        throw new Error('Simulation Engine Offline');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error('[SIMULATION ERROR]', err);
      setError(err.message || 'Failed to connect to Claude AI Engine');
    } finally {
      setLoading(false);
    }
  };

  if (result) return <SimulationResultView data={result} onReset={() => setResult(null)} />;

  return (
    <Card variant="raised" padding="xl" className="border-brand-primary/20 bg-brand-primary/5 relative overflow-hidden">
      {/* Background Glow Effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-primary/10 blur-[100px] rounded-full" />
      
      <div className="space-y-8 relative z-10">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-primary/20 rounded-2xl ring-1 ring-brand-primary/30">
              <Brain className="text-brand-primary" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-white tracking-tight">Simulation Terminal</h2>
              <p className="text-[10px] text-brand-primary font-black uppercase tracking-[0.3em]">AI-Driven Grid Analytics</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 glass rounded-full border-white/5">
            <Terminal size={12} className="text-muted" />
            <span className="text-[10px] font-mono-dm text-muted">v2.4_SONNET</span>
          </div>
        </div>

        {/* Input or Loading State */}
        {loading ? (
          <div className="h-40 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col items-center gap-3 text-brand-primary">
              <Loader2 className="animate-spin" size={32} />
              <div className="font-mono-dm text-[11px] font-bold tracking-[0.2em] text-center px-4">
                {systemLogs[logIndex]}
              </div>
            </div>
            
            <div className="w-full max-w-xs space-y-2">
              <div className="progress-track bg-white/5 h-1.5">
                <div 
                  className="progress-fill shadow-[0_0_15px_rgba(102,126,234,0.5)] transition-all duration-700 ease-out" 
                  style={{ width: `${((logIndex + 1) / systemLogs.length) * 100}%` }} 
                />
              </div>
              <p className="text-[9px] text-center text-muted uppercase tracking-widest animate-pulse">
                Uplinking to Enerlectra Intelligence Node...
              </p>
            </div>
          </div>
        ) : (
          <div className="relative group">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe an economic or grid scenario... (e.g. 'Simulate a 30% drop in solar yield during the rainy season in Lusaka.')"
              className="w-full h-40 glass border-glass p-5 rounded-2xl text-white placeholder:text-muted/50 focus:outline-none focus:border-brand-primary/50 focus:ring-4 focus:ring-brand-primary/5 transition-all resize-none leading-relaxed text-sm"
            />
            {error && (
              <div className="absolute bottom-4 left-4 flex items-center gap-2 text-danger text-[10px] font-bold bg-danger/10 px-3 py-1 rounded-full border border-danger/20 animate-bounce">
                <AlertCircle size={12} />
                {error.toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        {!loading && (
          <div className="space-y-4">
            <button
              onClick={handleSimulate}
              disabled={!prompt.trim()}
              className="w-full h-14 btn-primary rounded-xl flex items-center justify-center gap-3 font-bold disabled:opacity-30 disabled:grayscale transition-all hover:scale-[1.01] active:scale-[0.98]"
            >
              <Sparkles size={18} />
              <span className="tracking-widest uppercase text-xs">Execute Neural Logic</span>
            </button>
            <p className="text-[9px] text-center text-muted uppercase tracking-[0.2em] opacity-50">
              Target Node: {clusterData?.location?.district || 'ZAMBIA_HUB'} // CRC_O832-7
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

