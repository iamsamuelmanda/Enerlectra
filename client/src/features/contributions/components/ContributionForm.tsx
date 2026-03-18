// client/src/features/contributions/components/ContributionForm.tsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Phone, DollarSign, ShieldCheck, Loader2 } from 'lucide-react';
import { initiateContributionPayment } from '@/features/contributions/services/contributionService';
import { useAuth } from '@/hooks/useAuth';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { Link } from 'react-router-dom';

interface Props {
  clusterId: string;
  onSuccess?: () => void;
}

export default function ContributeForm({ clusterId, onSuccess }: Props) {
  const { user } = useAuth();
  const { rate, loading: rateLoading, error: rateError, refresh: refreshRate } = useExchangeRate();

  const [amountUSD, setAmountUSD] = useState<number | ''>(10);
  const [provider, setProvider] = useState<'mtn' | 'airtel' | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Debug: log every form state change
  useEffect(() => {
    console.log('Form state updated:', {
      amountUSD,
      provider,
      phone,
      phoneLength: phone.length,
      phoneValid,
      amountValid,
      userPresent: !!user,
      formValid,
    });
  }, [amountUSD, provider, phone, user]);

  const displayRate = rateLoading || rateError ? 19.45 : rate;
  const zmwAmount = amountUSD ? (amountUSD * displayRate).toFixed(2) : '—';

  const amountValid = amountUSD !== '' && amountUSD > 0 && amountUSD <= 10000;
  const phoneValid = phone.length === 9; // exactly 9 digits
  const formValid = amountValid && !!provider && phoneValid && !!user;

  const handleSubmit = async () => {
    console.log('Request Payment clicked! formValid:', formValid);

    if (!user) {
      toast.error('Please sign in first');
      return;
    }
    if (!amountValid) {
      toast.error('Amount must be between 1 and 10,000 USD');
      return;
    }
    if (!phoneValid) {
      toast.error('Phone must be exactly 9 digits (e.g. 977123456)');
      return;
    }
    if (!provider) {
      toast.error('Please select MTN or Airtel');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Initiating payment...');

    try {
      const result = await initiateContributionPayment({
        clusterId,
        amountUsd: Number(amountUSD),
        provider,
        phoneNumber: phone, // will be prefixed with +260 in service
      });

      console.log('Payment success:', result);
      toast.success(
        `Payment request sent!\nReference: ${result.reference}\nCheck your phone for ${provider.toUpperCase()} prompt.`,
        { id: toastId, duration: 10000 }
      );

      onSuccess?.();
      setAmountUSD(10);
      setProvider(null);
      setPhone('');
    } catch (err: any) {
      console.error('Payment failed:', err);
      toast.error(err.message || 'Payment failed – please try again', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  // Sign-in fallback
  if (!user) {
    return (
      <div className="glass p-8 rounded-2xl text-center space-y-6">
        <h3 className="text-2xl font-bold text-gradient flex items-center justify-center gap-3">
          <DollarSign className="w-7 h-7" />
          Contribute Now
        </h3>
        <p className="text-[var(--text-secondary)]">
          You need to be signed in to contribute to this community.
        </p>
        <Link
          to="/signin"
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] rounded-xl text-white font-semibold hover:brightness-110 transition-all"
        >
          Sign In to Contribute
        </Link>
      </div>
    );
  }

  return (
    <div className="glass p-6 md:p-10 rounded-2xl space-y-8">
      <h3 className="text-2xl font-bold text-gradient flex items-center gap-3">
        <DollarSign className="w-7 h-7" />
        Contribute Now
      </h3>

      {/* Debug panel */}
      <div className="text-xs text-purple-300 bg-purple-900/20 p-3 rounded-lg space-y-1">
        <strong>Debug Info:</strong><br />
        Amount valid: {amountValid ? 'YES' : 'NO'}<br />
        Provider selected: {provider || 'none'}<br />
        Phone valid: {phoneValid ? 'YES' : 'NO'} (length: {phone.length})<br />
        User signed in: {user ? 'YES' : 'NO'}<br />
        <strong>Form valid: {formValid ? 'YES → button enabled' : 'NO → button disabled'}</strong>
      </div>

      {/* Amount */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-medium">$</div>
        <input
          type="number"
          value={amountUSD}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || (Number(val) >= 0 && Number(val) <= 10000)) {
              setAmountUSD(val === '' ? '' : Number(val));
            }
          }}
          step="0.01"
          min="1"
          max="10000"
          placeholder=" "
          className={`peer w-full pl-10 pr-4 py-4 bg-transparent border-b-2 ${
            amountValid ? 'border-[var(--border-glass)]' : 'border-red-500'
          } text-2xl text-white placeholder-transparent focus:border-[var(--brand-primary)] outline-none transition-colors duration-200`}
          id="amount-usd"
        />
        <label
          htmlFor="amount-usd"
          className="absolute left-10 top-4 text-[var(--text-secondary)] text-base transition-all duration-200 peer-focus:-translate-y-5 peer-focus:text-sm peer-focus:text-[var(--brand-primary)] peer-placeholder-shown:top-4 peer-placeholder-shown:text-lg"
        >
          Amount (USD)
        </label>
        {!amountValid && amountUSD !== '' && (
          <p className="text-xs text-red-400 mt-1">Must be between 1 and 10,000</p>
        )}
      </div>

      {/* ZMW preview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
        <span className="text-[var(--text-secondary)]">Equivalent in ZMW:</span>
        {rateLoading ? (
          <span className="text-[var(--text-muted)] animate-pulse flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading rate...
          </span>
        ) : rateError ? (
          <div className="flex items-center gap-2">
            <span className="text-red-400">—</span>
            <button
              onClick={refreshRate}
              className="text-xs text-red-300 hover:text-red-200 underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)]">K {zmwAmount}</span>
            <span className="text-xs bg-[var(--surface-glass)] px-2 py-0.5 rounded-full border border-[var(--border-glass)]">
              1 USD = {displayRate.toFixed(2)} ZMW
            </span>
          </div>
        )}
      </div>

      {/* Providers */}
      <div className="space-y-3">
        <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider">
          Payment Provider
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setProvider('mtn');
              console.log('MTN clicked - provider set to mtn');
            }}
            onMouseDown={(e) => e.preventDefault()}
            aria-pressed={provider === 'mtn'}
            className={`glass px-6 py-5 rounded-xl flex flex-col items-center gap-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
              provider === 'mtn'
                ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-[var(--brand-primary)] scale-105 shadow-glow-purple bg-purple-900/30 border-purple-500'
                : 'hover:scale-102 hover:border-purple-500/50 hover:bg-purple-900/10'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-bold text-xl">
              MTN
            </div>
            <span className="font-medium">MTN MoMo</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setProvider('airtel');
              console.log('Airtel clicked - provider set to airtel');
            }}
            onMouseDown={(e) => e.preventDefault()}
            aria-pressed={provider === 'airtel'}
            className={`glass px-6 py-5 rounded-xl flex flex-col items-center gap-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${
              provider === 'airtel'
                ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-[var(--brand-primary)] scale-105 shadow-glow-purple bg-purple-900/30 border-purple-500'
                : 'hover:scale-102 hover:border-purple-500/50 hover:bg-purple-900/10'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center text-white font-bold text-xl">
              Airtel
            </div>
            <span className="font-medium">Airtel Money</span>
          </button>
        </div>
      </div>

      {/* Phone */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-medium">+260</div>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          value={phone}
          onChange={(e) => {
            const value = e.target.value;
            const digits = value.replace(/\D/g, '');
            console.log('Phone input changed:', { value, digits });
            setPhone(digits.slice(0, 9));
          }}
          onKeyPress={(e) => {
            if (!/[0-9]/.test(e.key)) e.preventDefault();
          }}
          placeholder=" "
          className={`peer w-full pl-16 pr-4 py-4 bg-transparent border-b-2 ${
            phone.length === 9 || phone === '' ? 'border-[var(--border-glass)]' : 'border-red-500'
          } text-lg text-white placeholder-transparent focus:border-[var(--brand-primary)] outline-none transition-colors duration-200`}
          id="phone"
        />
        <label
          htmlFor="phone"
          className="absolute left-16 top-4 text-[var(--text-secondary)] text-base transition-all duration-200 peer-focus:-translate-y-5 peer-focus:text-sm peer-focus:text-[var(--brand-primary)] peer-placeholder-shown:top-4 peer-placeholder-shown:text-lg"
        >
          Mobile Money Number (9 digits)
        </label>
        {phone !== '' && phone.length !== 9 && (
          <p className="text-xs text-red-400 mt-1">Must be exactly 9 digits (e.g. 977123456)</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
        <span>Secured by MTN MoMo & Airtel Money</span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !formValid}
        className="w-full py-4 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] rounded-xl text-white font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110 hover:shadow-xl hover:shadow-brand-glow flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        {loading ? 'Processing Payment...' : 'Request Payment'}
      </button>
    </div>
  );
}