import { Request, Response } from 'express';
import { store } from '../../lib/store.js';
import { normalizeWixData, WixSubmission } from '../../lib/normalize.js';
import { outboundCallService } from '../../lib/services/outbound-call.js';

export async function handleWixWebhook(req: Request, res: Response): Promise<void> {
  try {
    console.log('Received WIX webhook:', {
      method: req.method,
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Validate webhook secret if configured
    const secret = req.headers['x-webhook-secret'] as string || req.query.secret as string;
    const expectedSecret = process.env.WIX_WEBHOOK_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
      console.warn('WIX webhook unauthorized - secret mismatch');
      res.status(401).json({
        ok: false,
        error: 'Unauthorized - invalid webhook secret'
      });
      return;
    }

    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      console.error('WIX webhook invalid body:', req.body);
      res.status(400).json({
        ok: false,
        error: 'Invalid request body - expected JSON object'
      });
      return;
    }

    // Handle WIX data structure - check if wrapped in 'data' object
    let wixData: WixSubmission = req.body;
    if (req.body.data && typeof req.body.data === 'object') {
      console.log('🔄 WIX data wrapped in data object, unwrapping...');
      wixData = req.body.data;
    }

    // Validate required fields
    if (!wixData.submissionId) {
      console.error('WIX webhook missing submissionId:', wixData);
      res.status(400).json({
        ok: false,
        error: 'Missing required field: submissionId'
      });
      return;
    }

    // Normalize WIX data to ElevenLabs format
    const normalizedData = normalizeWixData(wixData);

    console.log('Normalized lead data:', {
      submissionId: wixData.submissionId,
      phone: normalizedData.lead_phone,
      name: normalizedData.lead_full_name,
      requestType: normalizedData.request_type
    });

    // Validate phone number (required for lookup)
    if (!normalizedData.lead_phone) {
      console.warn('WIX webhook missing or invalid phone number:', {
        submissionId: wixData.submissionId,
        originalPhone: wixData.contact?.phones?.[0] || 'none'
      });

      // Still store the data but warn
      // Don't fail the webhook as WIX expects 200
    }

    // Generate storage keys
    const phoneKey = normalizedData.lead_phone ? `ph:${normalizedData.lead_phone}` : '';
    const submissionKey = `sub:${wixData.submissionId}`;

    // Store lead data with dual indexing
    const storedKeys = await store.storeLeadData(phoneKey, submissionKey, normalizedData);

    console.log('Lead data stored successfully:', {
      keys: storedKeys,
      submissionId: wixData.submissionId,
      phone: normalizedData.lead_phone
    });

    // 🚀 INITIATE OUTBOUND CALL AUTOMATICALLY
    let callResult = null;
    if (normalizedData.lead_phone) {
      console.log('🔥 Triggering outbound call for new lead...', {
        phone: normalizedData.lead_phone,
        name: normalizedData.lead_full_name
      });

      // Initiate the call with retry logic and a small delay
      callResult = await outboundCallService.initiateCallWithRetry(normalizedData, {
        maxRetries: 2,
        delayBeforeCall: 2000 // 2 second delay to ensure data is fully stored
      });

      console.log('Outbound call result:', {
        status: callResult.status,
        callId: callResult.call_id,
        message: callResult.message,
        error: callResult.error
      });
    } else {
      console.warn('⚠️ Skipping outbound call - no valid phone number found');
    }

    // Success response for WIX (always return success, even if call fails)
    res.status(200).json({
      ok: true,
      submissionId: wixData.submissionId,
      keys: storedKeys,
      message: 'Lead data processed and stored successfully',
      call: callResult ? {
        status: callResult.status,
        call_id: callResult.call_id,
        initiated: callResult.status === 'initiated'
      } : { status: 'skipped', reason: 'No phone number' }
    });

  } catch (error) {
    console.error('WIX webhook processing error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Always return 200 to WIX to prevent webhook retries
    // Log the error but don't fail the webhook delivery
    res.status(200).json({
      ok: false,
      error: 'Internal processing error',
      message: 'Error logged for investigation'
    });
  }
}