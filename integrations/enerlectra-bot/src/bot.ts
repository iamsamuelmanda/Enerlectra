import dotenv from 'dotenv';
dotenv.config();


import { Context, Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import express from 'express';
import {
  supabase
} from 'enerlectra-core';
import { logger } from 'enerlectra-core/src/core/services/logger.js';
import { resolveUserId, getPhoneNumber } from 'enerlectra-core/src/core/services/resolve-user.js';
import { resolveCluster } from 'enerlectra-core/src/core/services/cluster.js';
import type { BotContext, BotSession } from './types/context.js';
import { redis, PENDING_TTL_SECONDS, REDIS_KEY_PREFIX } from 'enerlectra-core/src/infrastructure/redis.js';
import crypto from 'node:crypto';

// OCR / reading services
import { MeterOcrResult, MeterType, readMeterOCR, setLogger as setOcrLogger } from 'enerlectra-core/src/core/services/ocr.js';
import { validateReading } from 'enerlectra-core/src/core/services/validation.js';
import { calculateValue, type ValueEstimate } from 'enerlectra-core/src/core/services/tariff-calculator.js';
import { OCRRateLimiter } from 'enerlectra-core/src/core/services/rate-limiter.js';
import { createPendingRedemption, requestLencoPayout } from 'enerlectra-core/src/core/services/settlement.js';
import { computeSettlementScore, type SettlementScoreResult } from 'enerlectra-core/src/core/services/settlementScore.js';
import { decideSettlement, type SettlementDecision } from 'enerlectra-core/src/core/services/settlementDecision.js';
import { backfillPCUWalletForUser, mintPCUForExportReading } from 'enerlectra-core/src/core/services/pcuMinting.js';
import { transferPCU } from 'enerlectra-core/src/core/services/pcuTransfer.js';

// Imported handlers (all extracted commands & actions)
import {
  handleRead,
  handleStart,
  handleSupport,
  LinkOrganizationHandler,
  StartResetMeterHandler,
  SelectResetMeterTypeHandler,
  ConfirmResetMeterHandler
} from 'enerlectra-core/src/index.js';

import {
  ResetmeterConfirmPayload,
} from 'enerlectra-core/src/core/handlers/handlers/commands/resetmeter.handler.js';
import { SupportHandler } from 'enerlectra-core/src/core/handlers/handlers/commands/support.handler.js';
import { TelegramAdapter } from 'enerlectra-core/src/adapters/telegram/telegram-adapter.js';
import { kernel } from 'enerlectra-core';
import { handleRoleSelection } from './actions/role.js';
import { startQuickSupport } from './actions/support.js';

// Operator / Organisation actions
import {
  handleOrgCustomers,
  handleOrgEnergyFeed,
  handleOrgAlerts,
  handleOrgSettings,
  handleAddCustomer,
} from './actions/organization.js';

// Operator visibility actions
import {
  handleTransactionDashboard,
  handleFailedTransactions,
  startSearch,
  startCustomerView,
  handleRecentActivity,
  handleTransactionDetail,
} from './actions/operator.js';