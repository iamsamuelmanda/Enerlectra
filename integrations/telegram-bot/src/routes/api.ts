import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../middleware/auth';
import { requireApiKey } from '../middleware/apiKey';
import { trackCustomerImport } from '../services/metrics'; // ← new import

const router = Router();

// Health check
router.get('/health', (_, res) => res.json({ status: 'ok' }));

// Operator onboarding
router.post('/onboarding/operator', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, painPoint } = req.body;
    const { data: org, error } = await supabase
      .from('organisations')
      .insert({ name, type: 'operator' })
      .select('id')
      .single();
    if (error) throw error;

    if (painPoint) {
      await supabase.from('events').insert({
        organisation_id: org.id,
        category: 'onboarding',
        event_type: 'pain_point_reported',
        payload: { painPoint },
      });
    }
    res.status(201).json({ orgId: org.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Customer import (authenticated)
router.post('/customers/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const { orgId, rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' });
    }
    const customers = rows.map((r: any) => ({
      organisation_id: orgId,
      external_customer_id: r.external_customer_id || null,
      full_name: r.full_name || null,
      phone: r.phone || null,
      meter_number: r.meter_number || null,
    }));
    const { error } = await supabase.from('customers').insert(customers);
    if (error) throw error;

    // Log metric – use orgId as the actor (API doesn't have a user context)
    await trackCustomerImport(orgId, orgId, rows.length);

    res.status(201).json({ imported: rows.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Event feed (authenticated)
router.get('/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.query;
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

