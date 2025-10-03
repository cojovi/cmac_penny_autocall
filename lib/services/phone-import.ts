interface ElevenLabsPhoneImportResponse {
  phone_number_id?: string;
  phone_number?: string;
  label?: string;
  error?: string;
  message?: string;
}

export class PhoneImportService {
  private elevenLabsApiKey: string;
  private baseUrl: string;

  constructor() {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  async importTwilioPhoneNumber(): Promise<ElevenLabsPhoneImportResponse> {
    if (!this.elevenLabsApiKey) {
      return {
        error: 'ELEVENLABS_API_KEY not configured'
      };
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioToken || !twilioPhone) {
      return {
        error: 'Twilio credentials not configured. Need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER'
      };
    }

    try {
      console.log('Importing Twilio phone number to ElevenLabs:', {
        phone: twilioPhone,
        hasSid: !!twilioSid,
        hasToken: !!twilioToken
      });

      const importPayload = {
        phone_number: twilioPhone,
        label: `Twilio-${twilioPhone}`,
        sid: twilioSid,
        token: twilioToken
      };

      const apiUrl = `${this.baseUrl}/convai/phone-numbers`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(importPayload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('ElevenLabs phone import error:', {
          status: response.status,
          statusText: response.statusText,
          body: responseData
        });

        return {
          error: responseData.message || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      console.log('✅ Twilio phone number imported successfully:', {
        phoneNumberId: responseData.phone_number_id,
        phoneNumber: responseData.phone_number,
        label: responseData.label
      });

      return {
        phone_number_id: responseData.phone_number_id,
        phone_number: responseData.phone_number,
        label: responseData.label,
        message: 'Phone number imported successfully'
      };

    } catch (error) {
      console.error('Failed to import Twilio phone number:', {
        error: error instanceof Error ? error.message : String(error),
        phone: twilioPhone
      });

      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async listPhoneNumbers(): Promise<any> {
    if (!this.elevenLabsApiKey) {
      return {
        error: 'ELEVENLABS_API_KEY not configured'
      };
    }

    try {
      const apiUrl = `${this.baseUrl}/convai/phone-numbers`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        };
      }

      const phoneNumbers = await response.json();
      console.log('ElevenLabs phone numbers:', phoneNumbers);
      return phoneNumbers;

    } catch (error) {
      console.error('Failed to list phone numbers:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

// Singleton instance
export const phoneImportService = new PhoneImportService();