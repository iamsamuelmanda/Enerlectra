# enerlectra-setup.ps1
# Run: .\setup-ellie.ps1

Write-Host "🚀 Enerlectra Energy Reading System Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$baseDir = Get-Location

# Create directory structure
$dirs = @(
    "database/migrations",
    "server/routes",
    "enerlectra-core/src/engines",
    "enerlectra-core/src/types",
    "integrations/telegram-bot/src/handlers"
)

foreach ($dir in $dirs) {
    $path = Join-Path $baseDir $dir
    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "✅ Created: $dir" -ForegroundColor Green
    }
}

# File 1: Database Schema
$sqlContent = @'
-- 001_energy_readings.sql
-- Run this in Supabase SQL Editor

-- Meter readings (Ellie writes here)
create table if not exists meter_readings (
  id uuid default gen_random_uuid() primary key,
  cluster_id text not null,
  unit_id text not null,
  user_id uuid references auth.users(id),
  
  -- The reading
  reading_kwh numeric not null,
  meter_type text check (meter_type in ('grid', 'solar', 'unit')),
  photo_url text,
  ocr_confidence numeric,
  
  -- Metadata
  captured_at timestamptz default now(),
  reporting_period text,
  source text default 'telegram',
  
  -- Validation
  validated boolean default false
);

-- Energy allocations (reconciliation results)
create table if not exists energy_allocations (
  id uuid default gen_random_uuid() primary key,
  cluster_id text not null,
  period text not null,
  
  -- Anchor data
  grid_total_kwh numeric,
  solar_total_kwh numeric,
  
  -- Calculated
  solar_self_consumed numeric,
  grid_purchased numeric,
  
  created_at timestamptz default now(),
  
  unique(cluster_id, period)
);

-- Per-unit energy shares
create table if not exists unit_energy_shares (
  allocation_id uuid references energy_allocations(id),
  unit_id text not null,
  user_id uuid,
  
  ownership_pct numeric,
  actual_kwh numeric,
  solar_allocation_kwh numeric,
  grid_allocation_kwh numeric,
  grid_surplus_deficit numeric,
  
  solar_credit numeric,
  grid_charge numeric,
  net_amount numeric,
  
  primary key (allocation_id, unit_id)
);

-- Enable RLS
alter table meter_readings enable row level security;
alter table energy_allocations enable row level security;
alter table unit_energy_shares enable row level security;
'@

Set-Content -Path "database/migrations/001_energy_readings.sql" -Value $sqlContent
Write-Host "✅ Created: database/migrations/001_energy_readings.sql" -ForegroundColor Green

# File 2: Core Types
$typesContent = @'
// enerlectra-core/src/types/energy.ts

export interface MeterReading {
  id?: string;
  clusterId: string;
  unitId: string;
  userId: string;
  readingKwh: number;
  meterType: 'grid' | 'solar' | 'unit';
  photoUrl?: string;
  ocrConfidence?: number;
  capturedAt?: string;
  reportingPeriod: string;
  source: 'telegram' | 'manual' | 'iot';
  validated?: boolean;
}

export interface EnergyAllocation {
  clusterId: string;
  period: string;
  gridTotalKwh: number;
  solarTotalKwh: number;
  solarSelfConsumed: number;
  gridPurchased: number;
}

export interface UnitEnergyShare {
  userId: string;
  unitId: string;
  ownershipPct: number;
  actualKwh: number;
  solarAllocationKwh: number;
  gridAllocationKwh: number;
  gridSurplusDeficit: number;
  solarCredit: number;
  gridCharge: number;
  netAmount: number;
}

export interface ReconciliationResult {
  allocation: EnergyAllocation;
  unitShares: UnitEnergyShare[];
}
'@

Set-Content -Path "enerlectra-core/src/types/energy.ts" -Value $typesContent
Write-Host "✅ Created: enerlectra-core/src/types/energy.ts" -ForegroundColor Green

# File 3: Reconciliation Engine
$engineContent = @'
// enerlectra-core/src/engines/reconciliation.ts
import { distributeOutcome } from './distribution';
import { 
  MeterReading, 
  EnergyAllocation, 
  UnitEnergyShare,
  ReconciliationResult 
} from '../types/energy';

interface ReconciliationInput {
  readings: MeterReading[];
  ownership: Array<{ userId: string; ownershipPct: number }>;
  clusterId: string;
  period: string;
  gridRate?: number;    // ZMW per kWh
  solarRate?: number;   // ZMW per kWh
}

export function reconcileEnergyAllocation(input: ReconciliationInput): ReconciliationResult {
  const { 
    readings, 
    ownership, 
    clusterId, 
    period,
    gridRate = 0.17,
    solarRate = 0.05
  } = input;

  // 1. Extract anchors
  const gridReading = readings.find(r => r.meterType === 'grid');
  const solarReading = readings.find(r => r.meterType === 'solar');
  const unitReadings = readings.filter(r => r.meterType === 'unit');

  const gridTotal = gridReading?.readingKwh || sumReadings(unitReadings);
  const solarTotal = solarReading?.readingKwh || 0;

  // 2. Calculate energy flows
  const consumption = gridTotal;
  const solarSelfConsumed = Math.min(solarTotal, consumption);
  const gridPurchased = Math.max(0, consumption - solarTotal);

  // 3. Prepare ownership entries for distribution engine
  const ownershipEntries = ownership.map(o => ({
    userId: o.userId,
    pct: o.ownershipPct
  }));

  // 4. Allocate solar based on financial ownership
  const solarDistribution = distributeOutcome(
    ownershipEntries,
    solarSelfConsumed
  );

  // 5. Map consumptions
  const consumptionMap = new Map<string, number>();
  
  if (unitReadings.length > 0) {
    unitReadings.forEach(r => {
      consumptionMap.set(r.unitId, r.readingKwh);
    });
  } else {
    // Fallback: assume equal to solar allocation
    solarDistribution.forEach(s => {
      consumptionMap.set(s.userId, s.allocatedKwh);
    });
  }

  // 6. Calculate shares
  const unitShares: UnitEnergyShare[] = solarDistribution.map(solar => {
    const actualConsumed = consumptionMap.get(solar.userId) || solar.allocatedKwh;
    const gridAllocated = Math.max(0, actualConsumed - solar.allocatedKwh);
    const surplusDeficit = solar.allocatedKwh - actualConsumed;
    
    const solarCredit = solar.allocatedKwh * solarRate;
    const gridCharge = gridAllocated * gridRate;
    
    return {
      userId: solar.userId,
      unitId: solar.userId, // Map appropriately
      ownershipPct: solar.ownershipPct,
      actualKwh: actualConsumed,
      solarAllocationKwh: solar.allocatedKwh,
      gridAllocationKwh: gridAllocated,
      gridSurplusDeficit: surplusDeficit,
      solarCredit,
      gridCharge,
      netAmount: gridCharge - solarCredit
    };
  });

  return {
    allocation: {
      clusterId,
      period,
      gridTotalKwh: gridTotal,
      solarTotalKwh: solarTotal,
      solarSelfConsumed,
      gridPurchased
    },
    unitShares
  };
}

function sumReadings(readings: MeterReading[]): number {
  return readings.reduce((sum, r) => sum + (r.readingKwh || 0), 0);
}
'@

Set-Content -Path "enerlectra-core/src/engines/reconciliation.ts" -Value $engineContent
Write-Host "✅ Created: enerlectra-core/src/engines/reconciliation.ts" -ForegroundColor Green

# File 4: API Routes
$routesContent = @'
// server/routes/readings.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { reconcileEnergyAllocation } from '../../enerlectra-core/src/engines/reconciliation';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// POST /api/readings/ingest
// Ellie posts here
router.post('/ingest', async (req, res) => {
  try {
    const {
      clusterId,
      unitId,
      userId,
      readingKwh,
      meterType,
      photoUrl,
      confidence,
      period
    } = req.body;

    if (!['grid', 'solar', 'unit'].includes(meterType)) {
      return res.status(400).json({ error: 'Invalid meter_type. Use grid|solar|unit' });
    }

    const reportingPeriod = period || getCurrentPeriod();

    const { data: reading, error } = await supabase
      .from('meter_readings')
      .insert({
        cluster_id: clusterId,
        unit_id: unitId,
        user_id: userId,
        reading_kwh: readingKwh,
        meter_type: meterType,
        photo_url: photoUrl,
        ocr_confidence: confidence,
        reporting_period: reportingPeriod,
        source: 'telegram'
      })
      .select()
      .single();

    if (error) throw error;

    // Check if ready to reconcile
    const canReconcile = await checkReconciliationReady(clusterId, reportingPeriod);
    
    if (canReconcile) {
      await triggerReconciliation(clusterId, reportingPeriod);
    }

    res.json({
      status: 'stored',
      readingId: reading.id,
      reconciliationTriggered: canReconcile
    });

  } catch (error: any) {
    console.error('[READINGS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/readings/clusters/:clusterId/status
router.get('/clusters/:clusterId/status', async (req, res) => {
  const { clusterId } = req.params;
  const { period } = req.query;

  try {
    const targetPeriod = (period as string) || getCurrentPeriod();
    
    const { data: readings } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('reporting_period', targetPeriod);

    const hasGrid = readings?.some(r => r.meter_type === 'grid');
    const hasSolar = readings?.some(r => r.meter_type === 'solar');
    const unitReadings = readings?.filter(r => r.meter_type === 'unit') || [];

    // Get expected unit count (you may need to adjust this query)
    const { data: cluster } = await supabase
      .from('clusters')
      .select('id')  // Replace with actual unit count field
      .eq('id', clusterId)
      .single();

    res.json({
      period: targetPeriod,
      completeness: {
        grid: hasGrid,
        solar: hasSolar,
        units: {
          submitted: unitReadings.length,
          expected: 4, // TODO: Get from cluster config
          missing: Math.max(0, 4 - unitReadings.length)
        }
      },
      readings: readings || []
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/readings/clusters/:clusterId/reconcile
router.post('/clusters/:clusterId/reconcile', async (req, res) => {
  const { clusterId } = req.params;
  const { period } = req.body;

  try {
    const result = await triggerReconciliation(clusterId, period || getCurrentPeriod());
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function checkReconciliationReady(clusterId: string, period: string): Promise<boolean> {
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('meter_type')
    .eq('cluster_id', clusterId)
    .eq('reporting_period', period);

  const hasGrid = readings?.some(r => r.meter_type === 'grid');
  const hasSolar = readings?.some(r => r.meter_type === 'solar');
  
  return hasGrid && hasSolar;
}

async function triggerReconciliation(clusterId: string, period: string) {
  // Fetch readings
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('cluster_id', clusterId)
    .eq('reporting_period', period);

  // Fetch ownership from contributions system
  const { data: ownership } = await supabase
    .from('ownership_snapshots')
    .select('user_id, ownership_pct')
    .eq('cluster_id', clusterId)
    .eq('period', period);

  if (!readings || !ownership) {
    throw new Error('Missing data for reconciliation');
  }

  // Transform to expected format
  const formattedReadings = readings.map(r => ({
    clusterId: r.cluster_id,
    unitId: r.unit_id,
    userId: r.user_id,
    readingKwh: r.reading_kwh,
    meterType: r.meter_type,
    photoUrl: r.photo_url,
    ocrConfidence: r.ocr_confidence,
    reportingPeriod: r.reporting_period,
    source: r.source
  }));

  const formattedOwnership = ownership.map(o => ({
    userId: o.user_id,
    ownershipPct: o.ownership_pct
  }));

  // Run engine
  const result = reconcileEnergyAllocation({
    readings: formattedReadings,
    ownership: formattedOwnership,
    clusterId,
    period
  });

  // Store results
  const { data: allocation } = await supabase
    .from('energy_allocations')
    .insert({
      cluster_id: result.allocation.clusterId,
      period: result.allocation.period,
      grid_total_kwh: result.allocation.gridTotalKwh,
      solar_total_kwh: result.allocation.solarTotalKwh,
      solar_self_consumed: result.allocation.solarSelfConsumed,
      grid_purchased: result.allocation.gridPurchased
    })
    .select()
    .single();

  const shares = result.unitShares.map(s => ({
    allocation_id: allocation.id,
    unit_id: s.unitId,
    user_id: s.userId,
    ownership_pct: s.ownershipPct,
    actual_kwh: s.actualKwh,
    solar_allocation_kwh: s.solarAllocationKwh,
    grid_allocation_kwh: s.gridAllocationKwh,
    grid_surplus_deficit: s.gridSurplusDeficit,
    solar_credit: s.solarCredit,
    grid_charge: s.gridCharge,
    net_amount: s.netAmount
  }));

  await supabase.from('unit_energy_shares').insert(shares);

  return result;
}

export default router;
'@

Set-Content -Path "server/routes/readings.ts" -Value $routesContent
Write-Host "✅ Created: server/routes/readings.ts" -ForegroundColor Green

# File 5: Telegram Bot Handler
$botHandlerContent = @'
// integrations/telegram-bot/src/handlers/meterReading.ts
import axios from 'axios';

const API_URL = process.env.ENERLECTRA_API_URL || 'http://localhost:3000/api';

export async function handleMeterPhoto(ctx: any) {
  const photo = ctx.message?.photo?.[ctx.message.photo.length - 1];
  if (!photo) {
    await ctx.reply('No photo detected');
    return;
  }

  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id;

  try {
    await ctx.reply('⏳ Processing meter photo...');

    // Get file from Telegram
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    
    // TODO: OCR here
    // For now, ask user for manual input if OCR fails
    const mockOcr = { value: 0, confidence: 0 };

    // Determine meter type (ask user if not clear)
    await ctx.reply(
      'Which meter is this?\n' +
      '1️⃣ Grid (Main meter)\n' +
      '2️⃣ Solar (Production)\n' +
      '3️⃣ Unit (My consumption)',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Grid', callback_data: 'meter:grid' }],
            [{ text: 'Solar', callback_data: 'meter:solar' }],
            [{ text: 'Unit', callback_data: 'meter:unit' }]
          ]
        }
      }
    );

    // Store temporarily
    ctx.session = { 
      ...ctx.session, 
      pendingPhoto: fileLink.href,
      readingKwh: mockOcr.value 
    };

  } catch (error) {
    console.error('Photo handler error:', error);
    await ctx.reply('❌ Error processing photo. Please try /manual <reading>');
  }
}

export async function handleMeterTypeCallback(ctx: any) {
  const [type, meterType] = ctx.callbackQuery.data.split(':');
  
  if (type !== 'meter') return;

  await ctx.answerCbQuery();
  
  const userId = ctx.from?.id.toString();
  
  // TODO: Get actual cluster/unit mapping from database
  const clusterId = 'test-cluster'; // Get from user profile
  const unitId = 'A1'; // Get from user profile

  try {
    await ctx.editMessageText(`✅ Selected: ${meterType.toUpperCase()} meter\nSending to system...`);

    const response = await axios.post(`${API_URL}/readings/ingest`, {
      clusterId,
      unitId,
      userId,
      readingKwh: 0, // TODO: Get from OCR or ask user
      meterType,
      photoUrl: ctx.session?.pendingPhoto,
      confidence: 0,
      period: getCurrentPeriod()
    });

    await ctx.reply(
      `✅ *Reading Recorded*\n\n` +
      `Type: ${meterType}\n` +
      `Period: ${getCurrentPeriod()}\n` +
      `ID: ${response.data.readingId}\n\n` +
      `You will be notified when reconciliation is complete.`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    await ctx.reply('❌ Failed to save reading. Please contact support.');
  }
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
'@

Set-Content -Path "integrations/telegram-bot/src/handlers/meterReading.ts" -Value $botHandlerContent
Write-Host "✅ Created: integrations/telegram-bot/src/handlers/meterReading.ts" -ForegroundColor Green

# File 6: Bot Main
$botMainContent = @'
// integrations/telegram-bot/src/bot.ts
import { Telegraf, session } from 'telegraf';
import { handleMeterPhoto, handleMeterTypeCallback } from './handlers/meterReading';

const bot = new Telegraf(process.env.BOT_TOKEN || '');

// Session middleware
bot.use(session());

// Commands
bot.command('start', (ctx) => {
  ctx.reply(
    '👋 Hello! I am *Ellie*, your energy meter assistant.\n\n' +
    'Send me a photo of your electricity meter to record your usage.\n\n' +
    'Commands:\n' +
    '/status - Check submission status\n' +
    '/manual <number> - Enter reading manually',
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', async (ctx) => {
  // TODO: Fetch status from API
  await ctx.reply('📊 Checking your cluster status...');
});

bot.command('manual', (ctx) => {
  const text = ctx.message.text;
  const reading = text.split(' ')[1];
  
  if (!reading || isNaN(Number(reading))) {
    return ctx.reply('Usage: /manual 12345');
  }
  
  // TODO: Send to API as manual entry
  ctx.reply(`✅ Manual reading recorded: ${reading} kWh`);
});

// Photo handler
bot.on('photo', handleMeterPhoto);

// Callback queries (meter type selection)
bot.on('callback_query', handleMeterTypeCallback);

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('⚠️ Something went wrong. Please try again.');
});

// Start
console.log('🤖 Ellie is starting...');
bot.launch();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
'@

Set-Content -Path "integrations/telegram-bot/src/bot.ts" -Value $botMainContent
Write-Host "✅ Created: integrations/telegram-bot/src/bot.ts" -ForegroundColor Green

# File 7: Bot Package.json
$botPackageContent = @'
{
  "name": "enerlectra-telegram-bot",
  "version": "1.0.0",
  "description": "Ellie - Energy meter reading bot",
  "main": "dist/bot.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/bot.js",
    "dev": "ts-node src/bot.ts"
  },
  "dependencies": {
    "telegraf": "^4.15.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  }
}
'@

Set-Content -Path "integrations/telegram-bot/package.json" -Value $botPackageContent
Write-Host "✅ Created: integrations/telegram-bot/package.json" -ForegroundColor Green

# File 8: Update Server Index (instructions)
$serverUpdate = @'
// Add to your server/index.ts or app.ts:

import readingsRouter from './routes/readings';

// ... existing routes ...

app.use('/api/readings', readingsRouter);

// Now you have:
// POST /api/readings/ingest
// GET  /api/readings/clusters/:clusterId/status
// POST /api/readings/clusters/:clusterId/reconcile
'@

Set-Content -Path "server/index.update.txt" -Value $serverUpdate
Write-Host "✅ Created: server/index.update.txt (instructions)" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✨ Setup Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Phase 1: Database" -ForegroundColor Cyan
Write-Host "  1. Open Supabase SQL Editor"
Write-Host "  2. Run: database/migrations/001_energy_readings.sql"
Write-Host ""
Write-Host "Phase 2: API" -ForegroundColor Cyan
Write-Host "  1. Update server/index.ts (see server/index.update.txt)"
Write-Host "  2. Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are in .env"
Write-Host "  3. Start server: npm run dev"
Write-Host ""
Write-Host "Phase 3: Bot" -ForegroundColor Cyan
Write-Host "  1. cd integrations/telegram-bot"
Write-Host "  2. npm install"
Write-Host "  3. Create .env with BOT_TOKEN and ENERLECTRA_API_URL"
Write-Host "  4. npm run dev"
Write-Host ""
Write-Host "Phase 4: Test" -ForegroundColor Cyan
Write-Host "  1. Message bot /start"
Write-Host "  2. Send photo"
Write-Host "  3. Select meter type"
Write-Host "  4. Check: POST /api/readings/ingest received data"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan