import { LeadData } from '../store.js';

interface ElevenLabsCallResponse {
  call_id?: string;
  status?: string;
  message?: string;
  error?: string;
}

interface CallOptions {
  maxRetries?: number;
  delayBeforeCall?: number; // milliseconds
}

export class OutboundCallService {
  private elevenLabsApiKey: string;
  private agentId: string;
  private baseUrl: string;

  constructor() {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
    this.agentId = process.env.ELEVENLABS_AGENT_ID || '';
    this.baseUrl = 'https://api.elevenlabs.io/v1';

    if (!this.elevenLabsApiKey) {
      console.warn('⚠️  ELEVENLABS_API_KEY not set - outbound calls disabled');
    }
    if (!this.agentId) {
      console.warn('⚠️  ELEVENLABS_AGENT_ID not set - outbound calls disabled');
    }
  }

  private isConfigured(): boolean {
    return !!(this.elevenLabsApiKey && this.agentId);
  }

  async initiateCall(leadData: LeadData, options: CallOptions = {}): Promise<ElevenLabsCallResponse> {
    if (!this.isConfigured()) {
      console.warn('OutboundCallService not configured, skipping call initiation');
      return {
        status: 'skipped',
        message: 'API credentials not configured'
      };
    }

    if (!leadData.lead_phone) {
      console.error('Cannot initiate call - no phone number provided');
      return {
        status: 'error',
        error: 'No phone number provided'
      };
    }

    try {
      console.log('🔥 Initiating outbound call:', {
        phone: leadData.lead_phone,
        name: leadData.lead_full_name,
        agentId: this.agentId
      });

      // Add optional delay before making the call
      if (options.delayBeforeCall && options.delayBeforeCall > 0) {
        console.log(`Waiting ${options.delayBeforeCall}ms before initiating call...`);
        await new Promise(resolve => setTimeout(resolve, options.delayBeforeCall));
      }

      const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

      // Validate phone number ID
      if (!phoneNumberId) {
        console.error('Cannot initiate call - ELEVENLABS_PHONE_NUMBER_ID not configured');
        console.log('💡 To fix this:');
        console.log('   1. Run: POST /api/phone/import to import your Twilio number');
        console.log('   2. Add the returned phone_number_id to your .env file');
        return {
          status: 'error',
          error: 'ELEVENLABS_PHONE_NUMBER_ID not configured. Run POST /api/phone/import first.'
        };
      }

      const callPayload = {
        agent_id: this.agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: leadData.lead_phone,
        // Provide all required dynamic variables for the ElevenLabs agent
        conversation_initiation_client_data: {
          // Required variables for first message template
          honorific: leadData.first_name ? 'Mr.' : '', // Only use honorific if we have a name
          request_type: leadData.request_type || 'roofing inquiry',
          source_site: 'our website',
          agent_name: 'Penny',
          last_name: leadData.last_name ? ` ${leadData.last_name}` : '',
          last_name_suffix: leadData.last_name_suffix || '',

          // Lead information
          lead_full_name: leadData.lead_full_name || '',
          first_name: leadData.first_name || '',
          lead_phone: leadData.lead_phone || '',
          address_line1: leadData.address_line1 || '',
          city: leadData.city || '',
          state: leadData.state || '',
          zip: leadData.zip || '',
          notes: leadData.notes || '',
          location: leadData.location || '',

          // System tracking
          wix_submission_id: leadData.wix_submission_id || '',
          wix_contact_id: leadData.wix_contact_id || '',

          // Default values for agent workflow
          status: 'new_lead',
          preferred_callback_time: 'now',
          consent_to_call_now: true
        }
      };

      // Use the correct ElevenLabs API endpoint for Twilio outbound calls
      const apiUrl = `${this.baseUrl}/convai/twilio/outbound-call`;
      console.log('🔥 Calling ElevenLabs API:', {
        url: apiUrl,
        hasApiKey: !!this.elevenLabsApiKey,
        agentId: this.agentId,
        phoneNumberId: phoneNumberId,
        targetPhone: leadData.lead_phone
      });
      console.log('📋 Dynamic variables being sent:', JSON.stringify(callPayload.conversation_initiation_client_data, null, 2));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(callPayload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('ElevenLabs API error:', {
          status: response.status,
          statusText: response.statusText,
          body: responseData
        });

        return {
          status: 'error',
          error: responseData.message || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      console.log('✅ Outbound call initiated successfully:', {
        callSid: responseData.callSid,
        conversationId: responseData.conversation_id,
        phone: leadData.lead_phone,
        success: responseData.success,
        message: responseData.message
      });

      return {
        call_id: responseData.callSid,
        conversation_id: responseData.conversation_id,
        status: 'initiated',
        message: responseData.message || 'Call initiated successfully'
      };

    } catch (error) {
      console.error('Failed to initiate outbound call:', {
        error: error instanceof Error ? error.message : String(error),
        phone: leadData.lead_phone,
        agentId: this.agentId
      });

      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async initiateCallWithRetry(leadData: LeadData, options: CallOptions = {}): Promise<ElevenLabsCallResponse> {
    const maxRetries = options.maxRetries || 3;
    let lastError: ElevenLabsCallResponse | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Call attempt ${attempt}/${maxRetries} for ${leadData.lead_phone}`);

      const result = await this.initiateCall(leadData, {
        ...options,
        // Add exponential backoff for retries
        delayBeforeCall: attempt > 1 ? (options.delayBeforeCall || 0) + (attempt - 1) * 2000 : options.delayBeforeCall
      });

      if (result.status === 'initiated' || result.status === 'skipped') {
        return result;
      }

      lastError = result;

      if (attempt < maxRetries) {
        const backoffDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Call attempt ${attempt} failed, retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    console.error(`All ${maxRetries} call attempts failed for ${leadData.lead_phone}`);
    return lastError || {
      status: 'error',
      error: 'All retry attempts exhausted'
    };
  }

  // Test method to validate configuration
  async testConfiguration(): Promise<{ configured: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        error: 'Missing API key or Agent ID'
      };
    }

    try {
      // Test with voices endpoint which is more reliable
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return { configured: true };
      } else {
        const errorText = await response.text();
        console.error('ElevenLabs API test error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        return {
          configured: false,
          error: `API test failed: ${response.status} ${response.statusText} - ${errorText}`
        };
      }
    } catch (error) {
      console.error('ElevenLabs API test exception:', error);
      return {
        configured: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const outboundCallService = new OutboundCallService();