import { useEffect, useState } from 'react';
import { Activity, Zap, Globe, Clock, TrendingUp } from 'lucide-react';

export function TruthHeader() {
  const [fxRate, setFxRate] = useState<number>(28.45);
  const [premium, setPremium] = useState<number>(1.05);
  const [band, setBand] = useState<string>('standard');
  const [time, setTime] = useState(new Date());
  const [live, setLive] = useState(false);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const base = (import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com')
          .replace(/\/api$/, '');
        const res = await fetch(`${base}/api/protocol/market-state`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        if (typeof data.fxRate === 'number') setFxRate(data.fxRate);
        if (typeof data.currentPremium === 'number') setPremium(data.currentPremium);
        if (data.temporalBand) setBand(data.temporalBand);
        setLive(true);
      } catch {
        setLive(false);
      }
    };
    fetchMarket();
    const interval = setInterval(fetchMarket, 5 * 60 * 1000);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(timer); };
  }, []);

  const pegZMW = fxRate;
  const marketZMW = pegZMW * premium;

  const bandColor = band === 'peak'
    ? 'text-red-400 bg-red-500/20'
    : band === 'off-peak'
    ? 'text-blue-400 bg-blue-500/20'
    : 'text-amber-400 bg-amber-500/20';

  const dateStr = time.toLocaleDateString('en-ZM', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
  const timeStr = time.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  return (
    <div style={{ width: '100%', background: 'rgba(0,0,0,0.9)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '6px 16px', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(20px)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontFamily: 'monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: live ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
            <Activity size={12} style={{ animation: 'pulse 2s infinite' }} />
            <span>{live ? 'Protocol Live' : 'Connecting...'}</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.4)' }}>
            <Clock size={12} />
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{dateStr}</span>
            <span style={{ color: '#667eea', fontWeight: 'bold' }}>{timeStr}</span>
            <span style={{ marginLeft: '4px', padding: '1px 6px', borderRadius: '4px', fontSize: '7px', fontWeight: 'bold' }} className={bandColor}>{band.toUpperCase()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={10} /> Peg (Fixed)</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>K{pegZMW.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
            <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}><TrendingUp size={10} /> Market (TOU)</span>
            <span style={{ fontWeight: 'bold', color: premium > 1.2 ? '#f87171' : premium < 1.0 ? '#60a5fa' : '#fbbf24' }}>K{marketZMW.toFixed(2)}</span>
            <span style={{ fontSize: '6px', color: 'rgba(255,255,255,0.3)' }}>{premium > 1 ? '+' : ''}{((premium - 1) * 100).toFixed(0)}%</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px' }}>
            <span style={{ fontSize: '7px', color: '#667eea' }}>Instant (Now)</span>
            <span style={{ color: '#667eea', fontWeight: '900', fontSize: '11px' }}>K{marketZMW.toFixed(2)}</span>
            <span style={{ fontSize: '6px', color: 'rgba(255,255,255,0.3)' }}>per kWh</span>
          </div>
        </div>

      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '8px', color: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px', marginTop: '4px', fontFamily: 'monospace' }}>
        <Zap size={10} style={{ color: '#f59e0b' }} />
        <span>1 PCU = 1 kWh = $1.00 USD</span>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
        <span>Rate: {fxRate.toFixed(4)} ZMW/USD</span>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
        <span style={{ color: live ? '#10b981' : '#f59e0b' }}>{live ? 'Oracle Connected' : 'Syncing...'}</span>
      </div>
    </div>
  );
}
