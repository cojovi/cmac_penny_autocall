import { Request, Response } from 'express';
import { outboundCallService } from '../../lib/services/outbound-call.js';

export async function testCallConfiguration(req: Request, res: Response): Promise<void> {
  try {
    console.log('Testing ElevenLabs call configuration...');

    const configTest = await outboundCallService.testConfiguration();

    const response = {
      timestamp: new Date().toISOString(),
      configuration: {
        elevenlabs_api_key: process.env.ELEVENLABS_API_KEY ? '✅ Set' : '❌ Missing',
        elevenlabs_agent_id: process.env.ELEVENLABS_AGENT_ID ? '✅ Set' : '❌ Missing',
        configured: configTest.configured,
        error: configTest.error || null
      },
      status: configTest.configured ? 'ready' : 'needs_configuration',
      message: configTest.configured
        ? '✅ ElevenLabs API configured and ready for outbound calls'
        : '⚠️ ElevenLabs API not configured - calls will be skipped',
      next_steps: configTest.configured ? [
        'System ready to make outbound calls',
        'Submit a WIX form to test end-to-end flow'
      ] : [
        'Add ELEVENLABS_API_KEY to your .env file',
        'Add ELEVENLABS_AGENT_ID to your .env file',
        'Restart the server',
        'Test again at /api/test/call-config'
      ]
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Configuration test failed',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}