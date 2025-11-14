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

      // Transform LeadData to match the dynamic_variables structure used in outbound calls
      // This ensures consistency whether data comes from webhook fetch or direct call payload
      const firstName = (leadData.first_name || '').trim();
      const lastName = (leadData.last_name || '').trim();
      
      const dynamicVariables = {
        // Required variables for first message template
        honorific: firstName ? 'Mr.' : '', // Only use honorific if we have a name
        request_type: (leadData.request_type || 'roofing inquiry').trim(),
        source_site: (leadData.source_site || 'our website').trim(),
        agent_name: 'Penny',
        last_name: lastName,
        last_name_suffix: (leadData.last_name_suffix || '').trim(),

        // Lead information
        lead_full_name: (leadData.lead_full_name || `${firstName} ${lastName}`).trim(),
        first_name: firstName,
        lead_phone: leadData.lead_phone || '',
        customer_address: (leadData.address_line1 || '').trim(), // Map to address_line1 for ElevenLabs agent
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
        status: leadData.status || 'new_lead',
        preferred_callback_time: leadData.preferred_callback_time || 'now',
        consent_to_call_now: leadData.consent_to_call_now ?? true
      };

      console.log('📋 Returning dynamic variables to ElevenLabs:', JSON.stringify(dynamicVariables, null, 2));

      // Return the same structure as outbound call dynamic_variables
      res.status(200).json(dynamicVariables);
      return;
    }

    // No lead data found - return safe defaults with required structure
    console.log('No lead data found, returning defaults:', {
      phoneKey,
      submissionKey,
      searchedPhone: phoneE164
    });

    const defaults = {
      honorific: '',
      request_type: 'General Inquiry',
      source_site: 'unknown',
      agent_name: 'Penny',
      last_name: '',
      last_name_suffix: '',
      lead_full_name: '',
      first_name: '',
      lead_phone: phoneE164 || '',
      customer_address: '',
      address_line1: '',
      city: '',
      state: '',
      zip: '',
      notes: '',
      location: '',
      wix_submission_id: '',
      wix_contact_id: '',
      status: 'new_lead',
      preferred_callback_time: 'now',
      consent_to_call_now: true
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
    // Always return 200 with safe defaults matching dynamic_variables structure
    const safeDefaults = {
      honorific: '',
      request_type: 'General Inquiry',
      source_site: 'error_fallback',
      agent_name: 'Penny',
      last_name: '',
      last_name_suffix: '',
      lead_full_name: '',
      first_name: '',
      lead_phone: '',
      customer_address: '',
      address_line1: '',
      city: '',
      state: '',
      zip: '',
      notes: '',
      location: '',
      wix_submission_id: '',
      wix_contact_id: '',
      status: 'new_lead',
      preferred_callback_time: 'now',
      consent_to_call_now: true
    };

    res.status(200).json(safeDefaults);
  }
}