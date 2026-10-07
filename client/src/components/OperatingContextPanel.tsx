import { useEffect, useMemo, useState } from 'react';
import { Settings2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOrganizationContext, updateOrganizationContext, type OrganizationOperatingContext } from '@/lib/operational-api';

const CAPABILITIES = [
  'CUSTOMER_MANAGEMENT','SITE_MANAGEMENT','ASSET_MANAGEMENT','PROJECT_DELIVERY',
  'INSTALLATION','COMMISSIONING','WARRANTY','MAINTENANCE','FIELD_SERVICE',
  'PAYMENT_RECONCILIATION','COLLECTIONS','CUSTOMER_SUPPORT','REMOTE_SERVICE',
  'MONITORING','CONTRACT_MANAGEMENT','PORTFOLIO_REPORTING',
] as const;

const PROFILE_KEYS = {
  businessActivities: 'business_activities',
  customerSegments: 'customer_segments',
  serviceResponsibilities: 'service_responsibilities',
  paymentModels: 'payment_models',
} as const;

function listFromConfig(context: OrganizationOperatingContext | null, key: string): string {
  const value = context?.profileConfiguration?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join(', ') : '';
}

function normalizeList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export default function OperatingContextPanel() {
  const [context, setContext] = useState<OrganizationOperatingContext | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [profileName, setProfileName] = useState('Operating profile');
  const [businessModels, setBusinessModels] = useState('');
  const [businessActivities, setBusinessActivities] = useState('');
  const [customerSegments, setCustomerSegments] = useState('');
  const [serviceResponsibilities, setServiceResponsibilities] = useState('');
  const [paymentModels, setPaymentModels] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeCapabilitySet = useMemo(() => new Set(selectedCapabilities), [selectedCapabilities]);

  useEffect(() => {
    let mounted = true;
    getOrganizationContext().then((response) => {
      if (!mounted) return;
      const next = response.operatingContext;
      setContext(next);
      setCanManage(response.canManage);
      setProfileName(next.profileName ?? 'Operating profile');
      setBusinessModels(next.businessModels.join(', '));
      setBusinessActivities(listFromConfig(next, PROFILE_KEYS.businessActivities));
      setCustomerSegments(listFromConfig(next, PROFILE_KEYS.customerSegments));
      setServiceResponsibilities(listFromConfig(next, PROFILE_KEYS.serviceResponsibilities));
      setPaymentModels(listFromConfig(next, PROFILE_KEYS.paymentModels));
      setSelectedCapabilities(next.capabilities);
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load organization context'));
    return () => { mounted = false; };
  }, []);

  if (!canManage) return null;

  const toggleCapability = (key: string) => {
    setSelectedCapabilities((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const save = async () => {
    setBusy(true);
    try {
      const profileConfiguration = {
        [PROFILE_KEYS.businessActivities]: normalizeList(businessActivities),
        [PROFILE_KEYS.customerSegments]: normalizeList(customerSegments),
        [PROFILE_KEYS.serviceResponsibilities]: normalizeList(serviceResponsibilities),
        [PROFILE_KEYS.paymentModels]: normalizeList(paymentModels),
      };
      const response = await updateOrganizationContext({
        profileName: profileName.trim() || 'Operating profile',
        profileConfiguration,
        businessModels: normalizeList(businessModels),
        capabilities: CAPABILITIES.map((key) => ({
          key,
          status: activeCapabilitySet.has(key) ? 'ENABLED' : 'DISABLED',
          configuration: context?.capabilityConfiguration?.[key] ?? {},
        })),
      });
      setContext(response.operatingContext);
      toast.success('Operating context updated');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update operating context');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 size={17} className="text-amber-300" />
            <h2 className="font-medium">Operating context</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Tell Enerlectra how this organization operates. These settings shape context and recommendations; they never grant permissions.
          </p>
        </div>
        <button onClick={() => setOpen((value) => !value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
          {open ? 'Close' : 'Configure'}
        </button>
      </div>

      {open && (
        <div className="mt-6 space-y-5">
          <label className="block text-sm text-slate-300">Profile name
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
          </label>
          {([
            ['Business models / activities', businessModels, setBusinessModels],
            ['Business activities', businessActivities, setBusinessActivities],
            ['Customer segments', customerSegments, setCustomerSegments],
            ['Service responsibilities', serviceResponsibilities, setServiceResponsibilities],
            ['Payment models', paymentModels, setPaymentModels],
          ] as const).map(([label, value, setter]) => (
            <label key={label} className="block text-sm text-slate-300">
              {label}
              <input value={value} onChange={(e) => setter(e.target.value)} placeholder="Comma-separated; mixed values are allowed" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
            </label>
          ))}
          <div>
            <p className="text-sm text-slate-300">Enabled capabilities</p>
            <p className="mt-1 text-xs text-slate-500">Select only what the organization actually needs today.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CAPABILITIES.map((key) => (
                <button type="button" key={key} onClick={() => toggleCapability(key)} className={activeCapabilitySet.has(key) ? 'rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-left text-xs text-amber-200' : 'rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-slate-500 hover:bg-white/5'}>
                  {key.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => void save()} disabled={busy} className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-medium text-black disabled:opacity-50">
            <Save size={16} /> {busy ? 'Saving…' : 'Save operating context'}
          </button>
        </div>
      )}
    </section>
  );
}