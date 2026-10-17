-- 035: Defer the meter-reading/fraud capability until it is validated as
-- an ICP-required operational capability. Migration 034 was exploratory and
-- intentionally removed from the active first-slice database.

drop table if exists public.fraud_alerts;
drop table if exists public.fraud_signals;
drop table if exists public.meter_readings;
