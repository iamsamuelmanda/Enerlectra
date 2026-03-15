import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { contributionService } from '../services/contributionService';
import { Card } from '../../../components/ui/Card';
import { Smartphone, AlertCircle, Phone } from 'lucide-react';
import { useLogStore } from '../../../store/logStore';

interface ContributionFormProps {
  clusterId: string;
  onSuccess?: () => void;
}

export function ContributionForm({ clusterId, onSuccess }: ContributionFormProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(10);
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { addLog } = useLogStore();

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(parseInt(e.target.value) || 1);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value);
  };

  const validatePhone = (phone: string): boolean => {
    return /^260[0-9]{9}$/.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      addLog({ type: 'error', message: 'Please sign in to contribute' });
      return;
    }
    if (amount < 1) {
      addLog({ type: 'error', message: 'Minimum contribution is $1' });
      return;
    }
    if (!phoneNumber) {
      addLog({ type: 'error', message: 'Please enter your mobile money phone number' });
      return;
    }
    if (!validatePhone(phoneNumber)) {
      addLog({ type: 'error', message: 'Phone number must be in format 260XXXXXXXXX' });
      return;
    }

    setLoading(true);
    addLog({ type: 'info', message: `Initiating ${provider.toUpperCase()} payment of $${amount}...` });

    try {
      await contributionService.createContribution(
        user.id,
        clusterId,
        amount,
        provider,
        phoneNumber
      );
      
      addLog({ type: 'success', message: `Payment request sent! Check your phone to complete.` });
      setAmount(10);
      setPhoneNumber('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      addLog({ type: 'error', message: err.message || 'Failed to submit contribution' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="glass" padding="md">
      <h3 className="text-lg font-semibold mb-4">Contribute to this community</h3>
      {!user ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-200 text-sm">Please sign in to contribute.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-purple-200 mb-1">Amount (USD)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={handleAmountChange}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm text-purple-200 mb-2">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider('mtn')}
                disabled={loading}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                  provider === 'mtn'
                    ? 'bg-purple-600 border-purple-400'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Smartphone className="w-5 h-5" />
                <span className="text-sm">MTN</span>
              </button>
              <button
                type="button"
                onClick={() => setProvider('airtel')}
                disabled={loading}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                  provider === 'airtel'
                    ? 'bg-purple-600 border-purple-400'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Smartphone className="w-5 h-5" />
                <span className="text-sm">Airtel</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-purple-200 mb-1">Mobile Money Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-purple-300" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="260966860393"
                className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                disabled={loading}
              />
            </div>
            <p className="text-xs text-purple-300 mt-1">
              Enter your phone number starting with 260
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              'Request Payment'
            )}
          </button>
        </form>
      )}
    </Card>
  );
}