// client/src/features/contributions/components/ContributionForm.tsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Phone, DollarSign, ShieldCheck, Loader2 } from 'lucide-react';
import { initiateContributionPayment } from '@/features/contributions/services/contributionService';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  clusterId: string;
  onSuccess?: () => void;
}

export default function ContributeForm({ clusterId, onSuccess }: Props) {
  const { user } = useAuth();

  const [amountUSD, setAmountUSD] = useState<number | ''>(10);
  const [provider, setProvider] = useState<'mtn' | 'airtel' | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const amountValid = amountUSD !== '' && amountUSD > 0 && amountUSD <= 10000;
  const phoneValid = phone.length === 9;
  const formValid = amountValid && !!provider && phoneValid && !!user;

  // Debug panel
  useEffect(() => {
    console.log('ContributionForm.tsx:26 Form state updated:', {
      amountUSD,
      provider,
      phone,
      phoneLength: phone.length,
      phoneValid,
      amountValid,
      formValid,
      userId: user?.id,
    });
  }, [amountUSD, provider, phone, formValid, user]);

  const handleProviderClick = (p: 'mtn' | 'airtel') => {
    console.log(`${p.toUpperCase()} clicked - provider set to ${p}`);
    setProvider(p);
  };

  const handleSubmit = async () => {
    console.log('ContributionForm.tsx:46 Request Payment clicked! formValid:', formValid);

    if (!user) return toast.error('Please sign in first');
    if (!formValid) return toast.error('Please fill all fields correctly');

    setLoading(true);
    const toastId = toast.loading('Initiating payment...');

    try {
      const result = await initiateContributionPayment({
        clusterId,
        amountUsd: Number(amountUSD),
        provider: provider!,
        phoneNumber: phone,
      });

      toast.success(result.message || 'Payment request sent! Check your phone.', { id: toastId });
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Payment failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass p-6 rounded-2xl space-y-6">
      {/* Amount */}
      <div>
        <label className="text-sm text-purple-300">Amount (USD)</label>
        <input
          type="number"
          value={amountUSD}
          onChange={(e) => setAmountUSD(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full bg-transparent border-b-2 border-purple-500/30 text-3xl font-semibold focus:outline-none"
        />
      </div>

      {/* Providers */}
      <div className="flex gap-3">
        {(['mtn', 'airtel'] as const).map((p) => (
          <button
            key={p}
            onClick={() => handleProviderClick(p)}
            className={`flex-1 py-3 rounded-xl font-medium transition-all ${
              provider === p 
                ? 'bg-purple-600 text-white ring-2 ring-purple-400 scale-105' 
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Phone */}
      <div className="relative">
        <div className="flex items-center bg-white/5 border-b-2 border-purple-500/30 rounded-t-xl px-4">
          <span className="text-purple-300">+260</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
              setPhone(digits);
              console.log('ContributionForm.tsx:253 Phone input changed:', { value: digits, digits });
            }}
            placeholder="977123456"
            className="flex-1 bg-transparent py-4 text-lg focus:outline-none"
          />
        </div>
        {phone && !phoneValid && (
          <p className="text-xs text-red-400 mt-1">Must be exactly 9 digits</p>
        )}
      </div>

      {/* Debug Panel */}
      <div className="text-xs bg-purple-950/50 p-3 rounded-xl text-purple-300">
        <strong>Debug Info:</strong><br />
        Amount valid: {amountValid ? '✅ YES' : '❌ NO'}<br />
        Provider: {provider || 'none'}<br />
        Phone: {phone} ({phone.length} digits) {phoneValid ? '✅' : '❌'}<br />
        User signed in: {user ? '✅' : '❌'}<br />
        <strong>Form valid: {formValid ? '✅ READY TO SEND' : '❌ Button disabled'}</strong>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !formValid}
        className="w-full py-4 bg-gradient-to-r from-purple-600 to-violet-600 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="animate-spin" />}
        {loading ? 'Processing...' : 'Request Payment'}
      </button>
    </div>
  );
}