// src/services/pcuMinting.ts
import { supabase } from "../../../enerlectra-core/src/lib/supabase";

interface MeterReading {
  id: string;
  user_id: string;
  delta_kwh: number;
}

/**
 * Mint PCU for a validated export reading.
 * Called automatically when a meter reading with meter_type = 'solar_export'
 * or 'solar_generation' is validated and saved.
 */
export async function mintPCUForExportReading(
  reading: MeterReading
): Promise<void> {
  const { id: reading_id, user_id, delta_kwh } = reading;

  if (!user_id || delta_kwh <= 0) return;

  // 1 PCU = 1 kWh exported
  const amount_pcu = delta_kwh;

  // 1. Get or create wallet (transaction-like pattern)
  const { data: wallet, error: walletError } = await supabase
    .from("energy_wallets")
    .select("id, available_pcu, lifetime_pcu")
    .eq("user_id", user_id)
    .single();

  if (walletError && walletError.code !== "PGRST116") {
    console.error("[PCU MINTING] Wallet fetch error:", walletError);
    throw walletError;
  }

  try {
    if (!wallet) {
      // Create wallet
      const { error: createError } = await supabase
        .from("energy_wallets")
        .insert({
          user_id,
          available_pcu: amount_pcu,
          lifetime_pcu: amount_pcu,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      if (createError) throw createError;
    } else {
      // Update existing wallet
      const { error: updateError } = await supabase
        .from("energy_wallets")
        .update({
          available_pcu: wallet.available_pcu + amount_pcu,
          lifetime_pcu: wallet.lifetime_pcu + amount_pcu,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);
      if (updateError) throw updateError;
    }

    // 2. Log mint in pcu_mints table (non-fatal)
    try {
      await supabase.from("pcu_mints").insert({
        reading_id,
        user_id,
        amount_pcu,
        minted_at: new Date().toISOString(),
      });
    } catch (mintLogError: any) {
      console.error("[PCU MINTING] Mint log error:", mintLogError);
    }

    // 3. Double-entry ledger (self-contained, no external deps)
    try {
      await supabase.from("ledger_entries").insert({
        from_account_id: "SYSTEM_PCU_POOL",
        to_account_id: `USER_WALLET_${user_id}`,
        amount: amount_pcu,
        unit: "PCU",
        operation_type: "PCU_MINT",
        reference_id: reading_id,
        timestamp: new Date().toISOString(),
        metadata: { reading_id },
      });
    } catch (ledgerError: any) {
      console.error("[PCU MINTING] Ledger entry failed:", ledgerError);
    }

    console.log(
      `[PCU MINTING] Minted ${amount_pcu} PCU for user ${user_id} from reading ${reading_id}`
    );
  } catch (error: any) {
    console.error("[PCU MINTING] Transaction failed:", error);
    throw new Error(`PCU minting failed: ${error.message}`);
  }
}