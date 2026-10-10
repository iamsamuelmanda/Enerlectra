import { FormEvent, useEffect, useState } from 'react';
import { Database, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { createAsset, createCustomer, createSite, listAssets, listCustomers, listSites, type Asset, type Customer, type Site } from '@/lib/operational-api';

export default function ResourceContextPanel({ onContextChange }: { onContextChange: (context: { customerId?: string; siteId?: string; assetId?: string }) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [siteName, setSiteName] = useState('');
  const [siteCustomerId, setSiteCustomerId] = useState('');
  const [assetType, setAssetType] = useState('');
  const [assetModel, setAssetModel] = useState('');
  const [assetSerial, setAssetSerial] = useState('');
  const [assetCustomerId, setAssetCustomerId] = useState('');
  const [assetSiteId, setAssetSiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [canWrite, setCanWrite] = useState({ customer: false, site: false, asset: false });

  const load = async () => {
    try {
      const [customerResult, siteResult, assetResult] = await Promise.all([listCustomers(), listSites(), listAssets()]);
      setCustomers(customerResult.customers ?? []);
      setSites(siteResult.sites ?? []);
      setAssets(assetResult.assets ?? []);
      setCanWrite({ customer: Boolean(customerResult.canWrite), site: Boolean(siteResult.canWrite), asset: Boolean(assetResult.canWrite) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load business context');
    }
  };

  useEffect(() => { void load(); }, []);

  const submitCustomer = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await createCustomer({ name: customerName }); setCustomerName(''); toast.success('Customer added'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add customer'); }
    finally { setBusy(false); }
  };

  const submitSite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await createSite({ name: siteName, customerId: siteCustomerId || undefined }); setSiteName(''); setSiteCustomerId(''); toast.success('Site added'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add site'); }
    finally { setBusy(false); }
  };

  const submitAsset = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createAsset({ assetType, model: assetModel || undefined, serialNumber: assetSerial || undefined, customerId: assetCustomerId || undefined, siteId: assetSiteId || undefined });
      setAssetType(''); setAssetModel(''); setAssetSerial(''); setAssetCustomerId(''); setAssetSiteId('');
      toast.success('Asset added'); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add asset'); }
    finally { setBusy(false); }
  };

  const customerLabel = (id: string | null) => customers.find((c) => c.id === id)?.name ?? 'No customer';

  return (
    <section className="mb-6 rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Database size={17} className="text-[var(--color-brand)]" /><h2 className="font-medium">Business context</h2></div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-ink-muted)]">Customers, sites and assets give operational situations real context without forcing a CRM or ERP model.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="el-button-secondary p-2" title="Refresh"><RefreshCw size={15} /></button>
          <button onClick={() => setOpen((value) => !value)} className="el-button-secondary">{open ? 'Close' : 'Manage'}</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"><div className="text-2xl font-semibold">{customers.length}</div><div className="text-xs text-[var(--color-ink-muted)]">Customers</div></div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"><div className="text-2xl font-semibold">{sites.length}</div><div className="text-xs text-[var(--color-ink-muted)]">Sites</div></div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] p-3"><div className="text-2xl font-semibold">{assets.length}</div><div className="text-xs text-[var(--color-ink-muted)]">Assets</div></div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <select onChange={(e) => onContextChange({ customerId: e.target.value || undefined })} className="el-input text-xs">
          <option value="">Attach customer to next issue</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <select onChange={(e) => onContextChange({ siteId: e.target.value || undefined })} className="el-input text-xs">
          <option value="">Attach site to next issue</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <select onChange={(e) => onContextChange({ assetId: e.target.value || undefined })} className="el-input text-xs">
          <option value="">Attach asset to next issue</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_type}{asset.model ? ` · ${asset.model}` : ''}</option>)}
        </select>
      </div>

      {open && (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {canWrite.customer && <form onSubmit={submitCustomer} className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">Add customer</h3>
            <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer or account name" className="el-input mt-3" />
            <button disabled={busy} className="el-button-primary"><Plus size={14} /> Add</button>
          </form>}
          {canWrite.site && <form onSubmit={submitSite} className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-medium">Add site</h3>
            <input required value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site name" className="el-input mt-3" />
            <select value={siteCustomerId} onChange={(e) => setSiteCustomerId(e.target.value)} className="el-input mt-2">
              <option value="">Customer optional</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
            <button disabled={busy} className="el-button-primary"><Plus size={14} /> Add</button>
          </form>}
          {canWrite.asset && <form onSubmit={submitAsset} className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-medium">Add asset</h3>
            <input required value={assetType} onChange={(e) => setAssetType(e.target.value)} placeholder="Asset type" className="el-input mt-3" />
            <input value={assetModel} onChange={(e) => setAssetModel(e.target.value)} placeholder="Model (optional)" className="el-input mt-2" />
            <input value={assetSerial} onChange={(e) => setAssetSerial(e.target.value)} placeholder="Serial number (optional)" className="el-input mt-2" />
            <select value={assetCustomerId} onChange={(e) => setAssetCustomerId(e.target.value)} className="el-input mt-2"><option value="">Customer optional</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
            <select value={assetSiteId} onChange={(e) => setAssetSiteId(e.target.value)} className="el-input mt-2"><option value="">Site optional</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
            <button disabled={busy} className="el-button-primary mt-3"><Plus size={14} /> Add</button>
          </form>}
        </div>
      )}

      {!open && (
        <div className="mt-4 text-xs text-[var(--color-ink-muted)]">
          {assets.slice(0, 3).map((asset) => <span key={asset.id} className="mr-3 inline-block">{asset.asset_type} · {customerLabel(asset.customer_id)}</span>)}
        </div>
      )}
    </section>
  );
}