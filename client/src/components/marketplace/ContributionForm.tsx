/**
 * Contribution Form Component
 * Handles user contributions to clusters
 */

import { useState, useEffect } from 'react';
import { marketplaceApi } from '../../services/marketplaceApi';
import { useExchangeRate } from '../../hooks/useExchangeRate';
import type { User } from '@supabase/supabase-js';
import type { Cluster } from '../../services/supabase';
import toast from 'react-hot-toast';

interface ContributionFormProps {
  user: User | null;
  cluster: Cluster | null;
  onContributionSuccess?: () => void;
}

export default function ContributionForm({ user, cluster, onContributionSuccess }: ContributionFormProps) {
  const { rate, convertToZMW } = useExchangeRate();
  const [amountUSD, setAmountUSD] = useState(10);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<any>(null);

  // Validate contribution when amount or cluster changes
  useEffect(() => {
    if (user && cluster && amountUSD > 0) {
      validateContribution();
    }
  }, [amountUSD, cluster, user]);

  const validateContribution = async () => {
    if (!user || !cluster) return;

    try {
      setValidating(true);
      const result = await marketplaceApi.validateContribution({
        userId: user.id,
        clusterId: cluster.id,
        amountUSD,
      });
      setValidation(result);
    } catch (error) {
      console.error('Validation failed:', error);
      setValidation({ allowed: false, errorMessage: 'Validation failed' });
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Please sign in to contribute');
      return;
    }

    if (!cluster) {
      toast.error('Please select a community first');
      return;
    }

    if (amountUSD < 1 || amountUSD > 1000) {
      toast.error('Amount must be between $1 and $1,000');
      return;
    }

    if (validation && !validation.allowed) {
      toast.error(validation.errorMessage || 'Contribution not allowed');
      return;
    }

    try {
      setLoading(true);

      const contribution = await marketplaceApi.createContribution({
        userId: user.id,
        clusterId: cluster.id,
        amountUSD,
        paymentMethod: 'MTN_MOBILE_MONEY',
      });

      toast.success(
        `Successfully contributed $${amountUSD} (K${convertToZMW(amountUSD).toFixed(2)}) to ${cluster.name}`,
        { duration: 5000, icon: '⚡' }
      );

      // Reset form
      setAmountUSD(10);
      setValidation(null);

      // Callback
      if (onContributionSuccess) {
        onContributionSuccess();
      }
    } catch (error: any) {
      console.error('Contribution failed:', error);
      toast.error(error.response?.data?.error?.message || 'Contribution failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const amountZMW = convertToZMW(amountUSD);
  const pcus = amountUSD * 100;

  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-9.83-3.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.86-7.01L19.42 4h-.01l-1.1 2-2.76 5H8.53l-.13-.27L6.16 6l-.95-2-.94-2H1v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.13 0-.25-.11-.25-.25z"/>
        </svg>
        Make Contribution
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Amount (USD)
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            value={amountUSD}
            onChange={(e) => setAmountUSD(Number(e.target.value))}
            disabled={!user || !cluster || loading}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed text-lg font-semibold"
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">
              ≈ K{amountZMW.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ZMW
            </span>
            <span className="text-purple-600 font-semibold">
              {pcus.toLocaleString()} PCUs
            </span>
          </div>
        </div>

        {/* Validation Status */}
        {validating && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Validating...
          </div>
        )}

        {validation && !validating && (
          <div className={`p-3 rounded-lg border-l-4 ${
            validation.allowed 
              ? 'bg-green-50 border-green-500' 
              : 'bg-red-50 border-red-500'
          }`}>
            <div className="flex items-start gap-2">
              {validation.allowed ? (
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              )}
              <div className="flex-1">
                <p className={`text-sm font-semibold ${
                  validation.allowed ? 'text-green-800' : 'text-red-800'
                }`}>
                  {validation.allowed ? 'Contribution Valid' : 'Contribution Not Allowed'}
                </p>
                {!validation.allowed && (
                  <p className="text-sm text-red-700 mt-1">
                    {validation.errorMessage}
                  </p>
                )}
                {validation.details && (
                  <div className="mt-2 space-y-1 text-xs">
                    {validation.details.projectedOwnershipPct !== undefined && (
                      <p className="text-gray-700">
                        Projected Ownership: <strong>{validation.details.projectedOwnershipPct.toFixed(2)}%</strong>
                      </p>
                    )}
                    {validation.details.currentClass && (
                      <p className="text-gray-700">
                        Current Class: <strong>{validation.details.currentClass}</strong>
                      </p>
                    )}
                    {validation.details.maxAllowedUSD && (
                      <p className="text-gray-700">
                        Max Allowed: <strong>${validation.details.maxAllowedUSD}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!user || !cluster || loading || validating || (validation && !validation.allowed)}
          className={`
            w-full py-3 px-6 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2
            ${(!user || !cluster || loading || validating || (validation && !validation.allowed))
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-purple-800 hover:shadow-lg hover:-translate-y-0.5'
            }
          `}
        >
          {loading ? (
            <>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
              </svg>
              {!user ? 'Sign In Required' : !cluster ? 'Select Community' : 'Add Contribution'}
            </>
          )}
        </button>

        {/* Info Note */}
        <p className="text-xs text-gray-600 italic">
          {user && cluster 
            ? `Contributing to ${cluster.name} • 1 USD = 100 PCUs • Max $1,000 per contribution`
            : 'Sign in and select a community to contribute'
          }
        </p>
      </form>
    </div>
  );
}