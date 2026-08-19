// This module previously duplicated ctx-coupled (Telegram-specific) versions of
// resolveCluster/getPhoneNumber. The channel-agnostic implementations now live in
// ./resolve-user.ts (actorId-based, backed by the shared Redis selected-cluster cache).
// Re-exported here for backwards compatibility with existing imports.
export { resolveCluster, getPhoneNumber } from './resolve-user.js';
