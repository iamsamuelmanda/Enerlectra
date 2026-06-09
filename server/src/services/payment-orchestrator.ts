import { supabase } from '../../../enerlectra-core/src/lib/supabase';
import { PaymentOrchestrator } from '../../../enerlectra-core/src/domain/payment/payment-orchestrator';
import { TreasuryService } from '../../../enerlectra-core/src/domain/treasury/treasury-service';

const treasury = new TreasuryService(supabase);
export const paymentOrchestrator = new PaymentOrchestrator(supabase, treasury);
