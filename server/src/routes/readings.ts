// src/routes/readings.ts
import { Router } from "express";
import { supabase } from "../../../enerlectra-core/src/lib/supabase";
import { mintPCUForExportReading } from "../services/pcuMinting";
import { reconcileEnergyAllocation } from "../../../enerlectra-core/src/engines/energyReconciliation";

// Helper for period
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const router = Router();

/**
 * POST /readings/ingest
 * Ingest meter readings and automatically mint PCU for solar_export / solar_generation.
 */
router.post("/readings/ingest", async (req, res) => {
  const { readings = [] } = req.body;

  if (!Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: "readings array is required" });
  }

  const results = [];

  for (const reading of readings) {
    const {
      id,
      cluster_id,
      user_id,
      meter_type,
      reading_kwh,
      delta_kwh,
      reporting_period: bodyPeriod,
      ...rest
    } = reading;

    if (!cluster_id || !user_id || !meter_type) {
      results.push({
        id,
        success: false,
        error: "cluster_id, user_id, and meter_type are required",
      });
      continue;
    }

    try {
      const reporting_period = bodyPeriod || getCurrentPeriod();

      const { error: ingestError } = await supabase
        .from("meter_readings")
        .insert({
          cluster_id,
          user_id,
          meter_type,
          reading_kwh,
          delta_kwh,
          reporting_period,
          ingest_at: new Date().toISOString(),
          ...rest,
        });

      if (ingestError) {
        results.push({
          id,
          success: false,
          error: ingestError.message,
        });
        continue;
      }

      // 1 PCU = 1 kWh for valid export / generation
      const amount_pcu = delta_kwh || 0;

      // Mint PCU when reading is valid export or generation
      if (
        meter_type === "solar_export" ||
        meter_type === "solar_generation"
      ) {
        try {
          await mintPCUForExportReading({
            id,
            user_id,
            delta_kwh: amount_pcu,
          });
        } catch (mintError: any) {
          console.error("[READINGS INGEST - PCU MINTING ERROR]", mintError);
          // Non-fatal; ingestion still succeeded
        }
      }

      results.push({
        id,
        success: true,
      });
    } catch (error: any) {
      console.error("[READINGS INGEST ERROR]", error);
      results.push({
        id,
        success: false,
        error: error.message,
      });
    }
  }

  res.json({ results });
});

/**
 * POST /clusters/:clusterId/reconcile
 * Reconcile a cluster's readings against ownership for a given period.
 */
router.post("/clusters/:clusterId/reconcile", async (req, res) => {
  const { clusterId } = req.params;
  const { period } = req.body;

  try {
    const targetPeriod = period || getCurrentPeriod();

    const { data: readings, error: readingsError } = await supabase
      .from("meter_readings")
      .select("*")
      .eq("cluster_id", clusterId)
      .eq("reporting_period", targetPeriod);

    if (readingsError) {
      console.error("[RECONCILE READINGS ERROR]", readingsError);
      throw readingsError;
    }

    
    const { data: ownership, error: ownershipError } = await supabase
      .from("ownership_snapshots")
      .select("user_id, pct")  
      .eq("cluster_id", clusterId)
      .eq("period", targetPeriod);

    if (ownershipError) {
      console.error("[RECONCILE OWNERSHIP ERROR]", ownershipError);
      throw ownershipError;
    }

    if (!readings || !ownership || readings.length === 0) {
      return res.status(400).json({
        error:
          "Insufficient physical data or ownership snapshots for reconciliation",
      });
    }

    const formattedReadings = readings.map((r: any) => ({
      clusterId: r.cluster_id,
      unitId: r.unit_id,
      userId: r.user_id,
      readingKwh: r.reading_kwh,
      meterType: r.meter_type,
      reportingPeriod: r.reporting_period,
      source: r.source ?? "telegram",
    }));

    // ✅ FIXED: Changed ownership_pct → pct
    const formattedOwnership = ownership.map((o: any) => ({
      userId: o.user_id,
      ownershipPct: o.pct,  // ← FIXED HERE
    }));

    const result = reconcileEnergyAllocation({
      readings: formattedReadings,
      ownership: formattedOwnership,
      clusterId,
      period: targetPeriod,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[RECONCILE ERROR]", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;