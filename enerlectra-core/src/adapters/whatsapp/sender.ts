// enerlectra-core/src/adapters/whatsapp/sender.ts
import dotenv from 'dotenv';

dotenv.config();

export interface Button {
  type: 'url' | 'phone' | 'quick_reply';
  text: string;
  value: string;
}

export interface SendWhatsAppParams {
  mobile: string;
  bodyValues: Record<string, string>; // Maps variables explicitly: {"1": "Value"}
  templateId?: string; // Optional: Defaults to AUTHKEY_ELLIE_TEMPLATE_ID
  countryCode?: string; // Optional: Defaults to 260
  buttons?: Button[]; // Optional: Interactive buttons for the template
}

export interface SendResult {
  success: boolean;
  status: 'sent' | 'failed';
  providerMessageId?: string;
  error?: string;
  raw?: any;
}

export class WhatsAppClient {
  private readonly url =
    'https://console.authkey.io/restapi/requestjson.php';

  /**
   * Dispatches a structured WhatsApp template notification via the Authkey REST JSON gateway.
   * Leverages native fetch and defaults parameters from active environment profiles.
   */
  async sendTemplate({
    mobile,
    bodyValues,
    templateId,
    countryCode,
    buttons,
  }: SendWhatsAppParams): Promise<SendResult> {
    const authKey = process.env.AUTHKEY_API_TOKEN;
    const defaultTemplateId =
      process.env.AUTHKEY_ELLIE_TEMPLATE_ID || '40109';
    const defaultCountryCode =
      process.env.AUTHKEY_COUNTRY_CODE || '260';

    if (!authKey) {
      throw new Error(
        'CRITICAL: AUTHKEY_API_TOKEN is missing inside active profile environment configurations.'
      );
    }

    const activeTemplate = templateId || defaultTemplateId;
    const activeCountryCode = countryCode || defaultCountryCode;

    try {
      // Clean phone inputs
      let cleanMobile = mobile.replace(/[\s\+\-\(\)]/g, '');

      // If the mobile number already starts with the country code,
      // strip it so Authkey doesn't double-prefix it.
      if (cleanMobile.startsWith(activeCountryCode)) {
        cleanMobile = cleanMobile.slice(activeCountryCode.length);
      }

      const payload = {
        country_code: activeCountryCode,
        mobile: cleanMobile,
        wid: activeTemplate,
        type: 'text',
        bodyValues,
        ...(buttons && buttons.length > 0
          ? {
              buttons: buttons.map((btn) => ({
                type: btn.type,
                text: btn.text,
                value: btn.value,
              })),
            }
          : {}),
      };

      console.log(`[TRACE][Authkey_Payload_Verification] {
        Method: POST,
        URL: ${this.url},
        Headers: {
          Authorization: 'Basic ${authKey.substring(0, 4)}...',
          'Content-Type': 'application/json'
        },
        Body: ${JSON.stringify(payload, null, 2)}
      }`);

      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // HTTP-level failure
      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          `[Authkey Transmission Failure] HTTP ${response.status}:`,
          errorText
        );

        return {
          success: false,
          status: 'failed',
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      // Parse provider response
      const outputData = await response.json();

      // IMPORTANT: This is the actual response from Authkey.
      console.log('[TRACE][Authkey_Response]', {
        httpStatus: response.status,
        ok: response.ok,
        body: outputData,
      });

      // Authkey returns "Success" with a capital S.
      const providerStatus = String(
        outputData?.status ?? ''
      ).toLowerCase();

      const isSuccess =
        providerStatus === 'success' ||
        outputData?.success === true;

      // Log our interpretation of Authkey's response.
      console.log('[TRACE][Authkey_Result]', {
        providerStatus,
        isSuccess,
        providerMessageId:
          outputData?.uuid ||
          outputData?.logId ||
          outputData?.LogID ||
          'processed',
      });

      // Provider-level failure
      if (!isSuccess) {
        console.error(
          '[Authkey Gateway Error Payload]:',
          outputData
        );

        return {
          success: false,
          status: 'failed',
          error:
            outputData?.error ||
            outputData?.message ||
            'Gateway parameter validation rejection',
          raw: outputData,
        };
      }

      // Provider accepted the request.
      return {
        success: true,
        status: 'sent',
        providerMessageId:
          outputData?.uuid ||
          outputData?.logId ||
          outputData?.LogID ||
          'processed',
        raw: outputData,
      };
    } catch (networkException: any) {
      console.error(
        '[Authkey Outbound Connection Error]:',
        networkException
      );

      return {
        success: false,
        status: 'failed',
        error:
          networkException?.message ||
          'Internal connection/timeout error',
      };
    }
  }
}

// Export a singleton instance for direct, clean use throughout the server application
export const whatsAppClient = new WhatsAppClient();
