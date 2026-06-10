-- Run after 008_renwasol_transactions.sql to confirm demo data
SELECT meter_number, customer_phone, amount, status, token, failure_reason, created_at
FROM public.transactions
ORDER BY created_at;
