-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: SYSTEM ACCOUNTS
-- ═══════════════════════════════════════════════════════════════

-- Create SYSTEM anchor accounts
-- These represent external energy sources/sinks

INSERT INTO accounts (
  account_type,
  unit,
  label
) VALUES
  ('SYSTEM', 'KWH', 'External Energy Source (Grid)'),
  ('SYSTEM', 'ZMW', 'External Currency Source');

-- ═══════════════════════════════════════════════════════════════
-- SEED COMPLETE
-- ═══════════════════════════════════════════════════════════════