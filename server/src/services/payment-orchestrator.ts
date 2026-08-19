import { supabase } from '../../../enerlectra-core/src/lib/supabase.js';
import { PaymentOrchestrator } from '../../../enerlectra-core/src/domain/payment/payment-orchestrator.js';
import { TreasuryService } from '../../../enerlectra-core/src/domain/treasury/treasury-service.js';

const treasury = new TreasuryService(supabase);
export const paymentOrchestrator = new PaymentOrchestrator(supabase, treasury);

