/**
 * Seed data for development/testing
 */

-- ============================================================================
-- SEED USERS
-- ============================================================================

INSERT INTO users (id, name, email, phone, location, current_class, total_invested_usd, cluster_count) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Sarah Mwape', 'sarah.mwape@example.com', '+260977123456', 'Lusaka', 'INVESTOR', 180.00, 2),
('550e8400-e29b-41d4-a716-446655440002', 'John Banda', 'john.banda@example.com', '+260966234567', 'Lusaka', 'STARTER', 50.00, 1),
('550e8400-e29b-41d4-a716-446655440003', 'Grace Phiri', 'grace.phiri@example.com', '+260955345678', 'Kabwe', 'ANCHOR', 2500.00, 3),
('550e8400-e29b-41d4-a716-446655440004', 'Michael Zulu', 'michael.zulu@example.com', '+260977456789', 'Ndola', 'INVESTOR', 450.00, 2);

-- ============================================================================
-- SEED CLUSTERS
-- ============================================================================

INSERT INTO clusters (
  id, name, location, lifecycle_state,
  target_usd, current_usd, funding_pct,
  target_kw, target_storage_kwh, monthly_kwh,
  participant_count, deadline
) VALUES
(
  '650e8400-e29b-41d4-a716-446655440001',
  'Lusaka East Solar Community',
  'Lusaka',
  'FUNDING',
  1000.00,
  667.00,
  66.7,
  15.0,
  30.0,
  2025.0,
  3,
  NOW() + INTERVAL '12 days'
),
(
  '650e8400-e29b-41d4-a716-446655440002',
  'Kabwe Central Solar + Battery',
  'Kabwe',
  'FUNDING',
  1500.00,
  675.00,
  45.0,
  20.0,
  60.0,
  2700.0,
  2,
  NOW() + INTERVAL '28 days'
),
(
  '650e8400-e29b-41d4-a716-446655440003',
  'Ndola South Solar',
  'Ndola',
  'FUNDING',
  800.00,
  736.00,
  92.0,
  10.0,
  0.0,
  1350.0,
  2,
  NOW() + INTERVAL '5 days'
);

-- ============================================================================
-- SEED CONTRIBUTIONS
-- ============================================================================

INSERT INTO contributions (
  user_id, cluster_id,
  amount_usd, amount_zmw, exchange_rate, pcus,
  status, payment_method,
  projected_ownership_pct, early_investor_bonus,
  grace_period_expires_at, created_at, completed_at
) VALUES
-- Sarah's contributions
(
  '550e8400-e29b-41d4-a716-446655440001',
  '650e8400-e29b-41d4-a716-446655440001',
  120.00, 3300.00, 27.50, 120.00,
  'COMPLETED', 'MTN_MOBILE_MONEY',
  18.52, 1.10,
  NOW() + INTERVAL '24 hours',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '5 days'
),
(
  '550e8400-e29b-41d4-a716-446655440001',
  '650e8400-e29b-41d4-a716-446655440002',
  60.00, 1650.00, 27.50, 60.00,
  'COMPLETED', 'MTN_MOBILE_MONEY',
  8.89, 1.10,
  NOW() + INTERVAL '24 hours',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days'
),
-- John's contribution
(
  '550e8400-e29b-41d4-a716-446655440002',
  '650e8400-e29b-41d4-a716-446655440001',
  50.00, 1375.00, 27.50, 50.00,
  'COMPLETED', 'AIRTEL_MONEY',
  7.71, 1.10,
  NOW() + INTERVAL '24 hours',
  NOW() - INTERVAL '4 days',
  NOW() - INTERVAL '4 days'
),
-- Grace's contributions
(
  '550e8400-e29b-41d4-a716-446655440003',
  '650e8400-e29b-41d4-a716-446655440002',
  500.00, 13750.00, 27.50, 500.00,
  'COMPLETED', 'BANK_TRANSFER',
  74.07, 1.10,
  NOW() + INTERVAL '24 hours',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '7 days'
);

-- Refresh materialized views
SELECT refresh_marketplace_views();