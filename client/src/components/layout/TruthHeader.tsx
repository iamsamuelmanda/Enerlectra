import { useEffect, useState } from 'react';

export function TruthHeader() {
  const [rate, setRate] = useState<number | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    const fetchRate = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        setRate(data.rates.ZMW); // Defaulting to ZMW for now, but the UI is ready for any currency
      } catch (e) {
        console.error("FX Source Offline");
      }
    };

    fetchRate();
    return () => clearInterval(timer);
  }, []);

  // Format: "27 MARCH 2026"
  const formattedDate = time.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).toUpperCase();

  return (
    <div className="flex flex-col md:flex-row justify-between items-center px-4 py-2 bg-white/5 rounded-t-xl border-x border-t border-white/10 font-mono text-[9px] md:text-[10px] tracking-tighter text-gray-400 gap-2">
      <div className="flex gap-3 items-center">
        <span className="flex items-center gap-1">
          USD/ZMW: <span className="text-emerald-400 font-bold">{rate ? rate.toFixed(4) : '---'}</span>
        </span>
        <span className="text-white/10">|</span>
        <span className="text-gray-300 font-bold">{formattedDate}</span>
        <span className="text-white/10">|</span>
        <span>{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })}</span>
      </div>
      
      <div className="flex items-center gap-1.5 border-t md:border-t-0 border-white/5 pt-2 md:pt-0 w-full md:w-auto justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="text-emerald-500/80 uppercase tracking-widest">Enerlectra Protocol Online</span>
      </div>
    </div>
  );
}