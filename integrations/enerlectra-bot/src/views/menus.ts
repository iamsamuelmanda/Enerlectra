// views/menus.ts
// Centralised menu definitions for the Enerlectra Operational Platform
// Every inline keyboard used by the bot is defined here.
// This file is the ONLY place UI layouts live.

import { Markup } from 'telegraf';

// ─── Role identifiers ────────────────────────────────────────────────
export const ROLE_OPTIONS = [
  { id: 'operator', label: '⚡ Operator' },
  { id: 'installer', label: '🔧 Installer' },
  { id: 'property_owner', label: '🏢 Property Owner' },
  { id: 'tenant', label: '🏠 Tenant' },
] as const;

export type UserRole = (typeof ROLE_OPTIONS)[number]['id'];

// ─── Shared helpers ──────────────────────────────────────────────────
/** Simple spacer button (invisible, no callback) */
const spacer = Markup.button.callback(' ', 'noop');

/** Returns a row with two buttons side‑by‑side */
function row(label1: string, callback1: string, label2?: string, callback2?: string) {
  const buttons = [Markup.button.callback(label1, callback1)];
  if (label2 && callback2) buttons.push(Markup.button.callback(label2, callback2));
  return buttons;
}

/** Quick “Back” button to return to the home dashboard of a role */
function backButton(role: UserRole) {
  return Markup.button.callback('🔙 Back', `home:${role}`);
}

// ─── Role‑specific home keyboards ────────────────────────────────────

export const operatorHomeKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📊 Transaction Dashboard', 'demo_operator')],
    [Markup.button.callback('❌ Failed Transactions', 'demo_failed')],
    [Markup.button.callback('🔍 Search Customer', 'demo_search')],
    [Markup.button.callback('👁️ Customer View', 'demo_customer')],
    [Markup.button.callback('🚨 Active Alerts', 'alerts_list')],
    [Markup.button.callback('👥 My Customers', 'op_customers')],
    [Markup.button.callback('⚡ Energy Feed', 'op_energy')],
    [Markup.button.callback('➕ Add Customer', 'op_add_customer')],
    [Markup.button.callback('❓ Ask Ellie', 'quick_support')],          
    [Markup.button.callback('⚙️ Settings', 'operator_settings')],
    [Markup.button.callback('💳 Payments', 'payments_menu')],
  ]);

export const tenantHomeKeyboard = (hasPhone: boolean) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📸 Submit Meter Reading', 'tenant_submit_reading')],
    [Markup.button.callback('💰 PCU Balance', 'tenant_balance')],
    [Markup.button.callback('📜 Reading History', 'tenant_history')],
    [Markup.button.callback('💸 Redeem PCU', 'tenant_redeem')],
    ...(hasPhone ? [] : [[Markup.button.callback('📱 Register Mobile Number', 'tenant_register')]]),
    [Markup.button.callback('🏘️ Browse Communities', 'tenant_clusters')],
    [Markup.button.callback('🔁 Subscribe / Manage Plan', 'tenant_subscribe')],
    [Markup.button.callback('❓ Ask Ellie', 'quick_support')],          
  ]);

export const propertyOwnerHomeKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🏠 My Units / Tenants', 'prop_units')],
    [Markup.button.callback('⚡ Meter Readings', 'prop_readings')],
    [Markup.button.callback('💰 Collections', 'prop_collections')],
    [Markup.button.callback('🔗 Tenant Invite Link', 'prop_invite')],
    [Markup.button.callback('⚙️ Settings', 'prop_settings')],
    [Markup.button.callback('❓ Ask Ellie', 'quick_support')],          
    [Markup.button.callback('💳 Payments', 'payments_menu')],
  ]);

export const installerHomeKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔧 My Installs', 'installer_installs')],
    [Markup.button.callback('⚠️ Faults', 'installer_faults')],
    [Markup.button.callback('📝 Report Fault', 'installer_report_fault')],
    [Markup.button.callback('👥 Clients', 'op_customers')],
    [Markup.button.callback('⚙️ Settings', 'operator_settings')],
    [Markup.button.callback('❓ Ask Ellie', 'quick_support')],          // ← enhanced
  ]);

// ─── Role selection (first‑time onboarding) ─────────────────────────
export const roleSelectionKeyboard = () =>
  Markup.inlineKeyboard(
    ROLE_OPTIONS.map((role) => [Markup.button.callback(role.label, `role:${role.id}`)])
  );

// ─── Common utility keyboards ────────────────────────────────────────
export const refreshButton = (callbackData: string) =>
  Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', callbackData)]]);

export const backToHomeButton = (role: UserRole) =>
  Markup.inlineKeyboard([[backButton(role)]]);

