import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';

function bearer(req: Request): string {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function createResourcesRouter(db: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(db);

  async function tenant(req: Request) {
    return resolver.resolve({
      accessToken: bearer(req),
      organizationId: req.header('x-organization-id') || undefined,
      correlationId: req.header('x-correlation-id') || crypto.randomUUID(),
      requestId: req.header('x-request-id') || crypto.randomUUID(),
      source: 'api',
    });
  }

  router.get('/customers', async (req, res) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('customer.read')) return res.status(403).json({ error: 'Forbidden', permission: 'customer.read' });
      const { data, error } = await db.from('customers')
        .select('id,organization_id,external_ref,name,phone,email,status,metadata,created_at,updated_at')
        .eq('organization_id', t.organizationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json({ customers: data ?? [], organizationId: t.organizationId, canWrite: t.permissions.includes('customer.write') });
    } catch (error) {
      if (error instanceof TenantContextError) return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: 'Failed to load customers' });
    }
  });

  router.post('/customers', async (req, res) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('customer.write')) return res.status(403).json({ error: 'Forbidden', permission: 'customer.write' });
      const b = req.body ?? {};
      if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'Customer name is required' });
      const { data, error } = await db.from('customers').insert({
        organization_id: t.organizationId,
        external_ref: typeof b.externalRef === 'string' ? b.externalRef.trim() || null : null,
        name: b.name.trim(),
        phone: typeof b.phone === 'string' ? b.phone.trim() || null : null,
        email: typeof b.email === 'string' ? b.email.trim() || null : null,
        status: 'ACTIVE',
        metadata: typeof b.metadata === 'object' && b.metadata !== null ? b.metadata : {},
      }).select('id,organization_id,external_ref,name,phone,email,status,metadata,created_at,updated_at').single();
      if (error) throw error;
      return res.status(201).json({ success: true, customer: data, organizationId: t.organizationId });
    } catch (error) {
      if (error instanceof TenantContextError) return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create customer' });
    }
  });

  router.get('/sites', async (req, res) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('site.read')) return res.status(403).json({ error: 'Forbidden', permission: 'site.read' });
      const { data, error } = await db.from('sites')
        .select('id,organization_id,customer_id,name,address,latitude,longitude,status,metadata,created_at,updated_at')
        .eq('organization_id', t.organizationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json({ sites: data ?? [], organizationId: t.organizationId, canWrite: t.permissions.includes('site.write') });
    } catch (error) {
      if (error instanceof TenantContextError) return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: 'Failed to load sites' });
    }
  });

  router.post('/sites', async (req, res) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('site.write')) return res.status(403).json({ error: 'Forbidden', permission: 'site.write' });
      const b = req.body ?? {};
      if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'Site name is required' });

      if (b.customerId) {
        const { data: customer, error } = await db.from('customers').select('id').eq('id', b.customerId).eq('organization_id', t.organizationId).maybeSingle();
        if (error) throw error;
        if (!customer) return res.status(404).json({ error: 'Customer not found in organization' });
      }

      const { data, error } = await db.from('sites').insert({
        organization_id: t.organizationId,
        customer_id: b.customerId ?? null,
        name: b.name.trim(),
        address: typeof b.address === 'string' ? b.address.trim() || null : null,
        latitude: typeof b.latitude === 'number' ? b.latitude : null,
        longitude: typeof b.longitude === 'number' ? b.longitude : null,
        status: 'ACTIVE',
        metadata: typeof b.metadata === 'object' && b.metadata !== null ? b.metadata : {},
      }).select('id,organization_id,customer_id,name,address,latitude,longitude,status,metadata,created_at,updated_at').single();
      if (error) throw error;
      return res.status(201).json({ success: true, site: data, organizationId: t.organizationId });
    } catch (error) {
      if (error instanceof TenantContextError) return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create site' });
    }
  });

  router.get('/assets', async (req, res) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('asset.read')) return res.status(403).json({ error: 'Forbidden', permission: 'asset.read' });
      const { data, error } = await db.from('assets')
        .select('id,organization_id,site_id,customer_id,asset_type,manufacturer,model,serial_number,status,installed_at,metadata,created_at,updated_at')
        .eq('organization_id', t.organizationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json({ assets: data ?? [], organizationId: t.organizationId, canWrite: t.permissions.includes('asset.write') });
    } catch (error) {
      if (error instanceof TenantContextError) return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: 'Failed to load assets' });
    }
  });

  router.post('/assets', async (req, res) => {
    try {
      const t = await tenant(req);
      if (!t.permissions.includes('asset.write')) return res.status(403).json({ error: 'Forbidden', permission: 'asset.write' });
      const b = req.body ?? {};
      if (typeof b.assetType !== 'string' || !b.assetType.trim()) return res.status(400).json({ error: 'Asset type is required' });

      if (b.customerId) {
        const { data: customer, error } = await db.from('customers').select('id').eq('id', b.customerId).eq('organization_id', t.organizationId).maybeSingle();
        if (error) throw error;
        if (!customer) return res.status(404).json({ error: 'Customer not found in organization' });
      }

      if (b.siteId) {
        const { data: site, error } = await db.from('sites').select('id,customer_id').eq('id', b.siteId).eq('organization_id', t.organizationId).maybeSingle();
        if (error) throw error;
        if (!site) return res.status(404).json({ error: 'Site not found in organization' });
        if (b.customerId && site.customer_id && site.customer_id !== b.customerId) return res.status(409).json({ error: 'Site belongs to a different customer' });
      }

      const { data, error } = await db.from('assets').insert({
        organization_id: t.organizationId,
        site_id: b.siteId ?? null,
        customer_id: b.customerId ?? null,
        asset_type: b.assetType.trim(),
        manufacturer: typeof b.manufacturer === 'string' ? b.manufacturer.trim() || null : null,
        model: typeof b.model === 'string' ? b.model.trim() || null : null,
        serial_number: typeof b.serialNumber === 'string' ? b.serialNumber.trim() || null : null,
        status: 'ACTIVE',
        installed_at: b.installedAt ?? null,
        metadata: typeof b.metadata === 'object' && b.metadata !== null ? b.metadata : {},
      }).select('id,organization_id,site_id,customer_id,asset_type,manufacturer,model,serial_number,status,installed_at,metadata,created_at,updated_at').single();
      if (error) throw error;
      return res.status(201).json({ success: true, asset: data, organizationId: t.organizationId });
    } catch (error) {
      if (error instanceof TenantContextError) return res.status(error.code === 'UNAUTHENTICATED' ? 401 : 403).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create asset' });
    }
  });

  return router;
}

export default createResourcesRouter;
