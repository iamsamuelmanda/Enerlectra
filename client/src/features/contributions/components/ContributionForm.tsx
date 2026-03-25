// client/src/features/contributions/components/ContributionForm.tsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Phone, DollarSign, ShieldCheck, Loader2 } from 'lucide-react';
import { contributionService } from '@/features/contributions/services/contributionService';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  clusterId: string;
  onSuccess?: () => void;
}

export default function ContributeForm({ clusterId,`n        userId: user.id, onSuccess }: Props) {
  const { user } = useAuth();

  const [amountUSD, setAmountUSD] = useState<number | ''>(10);
  const [provider, setProvider] = useState<'mtn' | 'airtel' | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Load Lenco widget script once (production only)
  useEffect(() => {
    if (document.getElementById('lenco-inline-js')) return;

    const script = document.createElement('script');
    script.id = 'lenco-inline-js';
    script.src = 'https://pay.lenco.co/js/v1/inline.js';
    script.async = true;
    script.onload = () => console.log('Lenco production widget loaded');
    script.onerror = () => console.error('Failed to load Lenco widget');
    document.body.appendChild(script);
  }, []);

  const amountValid = amountUSD !== '' && amountUSD > 0 && amountUSD <= 10000;
  const phoneValid = phone.length === 9;
  const formValid = amountValid && !!provider && phoneValid && !!user;

  const handleSubmit = async () => {
    if (!formValid || !user) {
      toast.error('Please complete all fields');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Opening secure payment...');

    try {
      await contributionService.initiatePayment({
        clusterId,`n        userId: user.id,
        amountUsd: Number(amountUSD),
        provider: provider!,
        phoneNumber: phone,
        onSuccess: (reference) => {
          toast.success(`Payment processed! Ref: ${reference}`, { id: toastId });
          onSuccess?.();
        },
        onClose: () => {
          toast.dismiss(toastId);
          toast('Payment window closed');
        },
      });
    } catch (err: any) {
      toast.error(err.message || 'Payment could not be started', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass p-6 md:p-10 rounded-2xl space-y-8">
      <h3 className="text-2xl font-bold text-gradient flex items-center gap-3">
        <DollarSign className="w-7 h-7" />
        Contribute Now
      </h3>

      {/* Amount */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</div>
        <input
          type="number"
          value={amountUSD}
          onChange={(e) => setAmountUSD(e.target.value === '' ? '' : Number(e.target.value))}
          step="0.01"
          min="1"
          max="10000"
          className={`peer w-full pl-10 pr-4 py-4 bg-transparent border-b-2 ${
            amountValid ? 'border-[var(--border-glass)]' : 'border-red-500'
          } text-2xl text-white focus:border-[var(--brand-primary)] outline-none`}
          placeholder=" "
        />
        <label className="absolute left-10 top-4 text-[var(--text-secondary)] transition-all peer-focus:-translate-y-5 peer-focus:text-sm peer-focus:text-[var(--brand-primary)]">
          Amount (USD)
        </label>
      </div>

      {/* Providers */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setProvider('mtn')}
          className={`glass py-5 rounded-xl flex flex-col items-center gap-2 transition-all ${
            provider === 'mtn' ? 'ring-2 ring-purple-500 scale-105' : 'hover:scale-102'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white font-bold flex items-center justify-center">
            MTN
          </div>
          <span>MTN MoMo</span>
        </button>

        <button
          type="button"
          onClick={() => setProvider('airtel')}
          className={`glass py-5 rounded-xl flex flex-col items-center gap-2 transition-all ${
            provider === 'airtel' ? 'ring-2 ring-purple-500 scale-105' : 'hover:scale-102'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-pink-600 text-white font-bold flex items-center justify-center">
            Airtel
          </div>
          <span>Airtel Money</span>
        </button>
      </div>

      {/* Phone */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">+260</div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
          className={`peer w-full pl-16 pr-4 py-4 bg-transparent border-b-2 ${
            phoneValid ? 'border-[var(--border-glass)]' : 'border-red-500'
          } text-lg text-white focus:border-[var(--brand-primary)] outline-none`}
          placeholder=" "
        />
        <label className="absolute left-16 top-4 text-[var(--text-secondary)] transition-all peer-focus:-translate-y-5 peer-focus:text-sm peer-focus:text-[var(--brand-primary)]">
          Mobile Number (9 digits)
        </label>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !formValid}
        className="w-full py-4 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] rounded-xl text-white font-semibold disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        {loading ? 'Opening payment...' : 'Request Payment'}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
        <ShieldCheck className="w-4 h-4 text-green-400" />
        Secured by Lenco
      </div>
    </div>
  );
}
