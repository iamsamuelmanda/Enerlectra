/**
 * Response validation utilities for external API calls
 */

/**
 * Validates Lenco API response structure
 */
export function validateLencoResponse(response: any): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid Lenco response: not an object');
  }
  if (!('success' in response) || !('message' in response) || !('data' in response)) {
    throw new Error('Invalid Lenco response: missing required fields');
  }
  if (response.success !== undefined && typeof response.success !== 'boolean') {
    throw new Error('Invalid Lenco response: success must be boolean');
  }
}

/**
 * Validates exchange rate API response
 */
export function validateExchangeRateResponse(response: any): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid exchange rate response: not an object');
  }
  if (!('result' in response) || !('conversion_rates' in response)) {
    throw new Error('Invalid exchange rate response: missing required fields');
  }
  if (response.result !== 'success') {
    throw new Error(`Exchange rate API error: ${response['error-type'] || 'unknown'}`);
  }
  if (!response.conversion_rates || typeof response.conversion_rates !== 'object') {
    throw new Error('Invalid exchange rate response: missing conversion_rates');
  }
}

/**
 * Validates webhook payload structure
 */
export function validateWebhookPayload(payload: any): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid webhook payload: not an object');
  }
  if (!('reference' in payload) || !('status' in payload) || !('providerRef' in payload)) {
    throw new Error('Invalid webhook payload: missing required fields');
  }
  const validStatuses = ['SUCCESSFUL', 'FAILED', 'PENDING'];
  if (!validStatuses.includes(payload.status)) {
    throw new Error(`Invalid webhook status: ${payload.status}`);
  }
}