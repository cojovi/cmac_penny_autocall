import { Request, Response } from 'express';
import { store } from '../../lib/store.js';
import { toE164 } from '../../lib/normalize.js';

interface ElevenLabsRequest {
  from?: string;
  to?: string;
  caller?: string;
  callee?: string;
  sid?: string;
  [key: string]: any;
}

export async function handleElevenLabsInit(req: Request, res: Response): Promise<void> {
  try {
    console.log('ElevenLabs init request:', {
      method: req.method,
      headers: req.headers,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    const requestData: ElevenLabsRequest = {
      ...req.body,
      ...req.query
    };

    // Extract phone number from various possible fields
    const possiblePhones = [
      requestData.from,
      requestData.to,
      requestData.caller,
      requestData.callee
    ].filter(Boolean);

    let phoneE164 = '';
    for (const phone of possiblePhones) {
      const normalized = toE164(String(phone));
      if (normalized) {
        phoneE164 = normalized;
        break;
      }
    }

    console.log('Phone extraction result:', {
      originalPhones: possiblePhones,
      normalizedPhone: phoneE164
    });

    // Generate lookup keys
    const phoneKey = phoneE164 ? `ph:${phoneE164}` : '';
    const submissionKey = requestData.sid ? `sub:${requestData.sid}` : '';

    console.log('Lookup keys:', { phoneKey, submissionKey });

    // Attempt to retrieve lead data
    const leadData = await store.getLeadData(phoneKey, submissionKey);

    if (leadData) {
      console.log('Lead data found and returned:', {
        submissionId: leadData.wix_submission_id,
        phone: leadData.lead_phone,
        name: leadData.lead_full_name
      });

      // Return the flat JSON for ElevenLabs variable binding
      res.status(200).json(leadData);
      return;
    }

    // No lead data found - return safe defaults
    console.log('No lead data found, returning defaults:', {
      phoneKey,
      submissionKey,
      searchedPhone: phoneE164
    });

    const defaults = {
      first_name: '',
      last_name: '',
      lead_full_name: '',
      lead_phone: phoneE164 || '',
      address_line1: '',
      city: '',
      state: '',
      zip: '',
      notes: '',
      request_type: 'General Inquiry',
      location: '',
      source_site: 'unknown',
      wix_submission_id: '',
      wix_contact_id: ''
    };

    res.status(200).json(defaults);

  } catch (error) {
    console.error('ElevenLabs init error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    // NEVER return error status - this would block the call
    // Always return 200 with safe defaults
    const safeDefaults = {
      first_name: '',
      last_name: '',
      lead_full_name: '',
      lead_phone: '',
      address_line1: '',
      city: '',
      state: '',
      zip: '',
      notes: '',
      request_type: 'General Inquiry',
      location: '',
      source_site: 'error_fallback',
      wix_submission_id: '',
      wix_contact_id: ''
    };

    res.status(200).json(safeDefaults);
  }
}