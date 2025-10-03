import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { handleWixWebhook } from './api/webhooks/wix.js';
import { handleElevenLabsInit } from './api/elevenlabs/init.js';
import { testCallConfiguration } from './api/test/call-config.js';
import { phoneImportService } from './lib/services/phone-import.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true, // Allow all origins for development
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    headers: req.headers,
    query: req.query,
    bodySize: JSON.stringify(req.body).length
  });
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WIX to ElevenLabs Ingest System',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      ingest: '/api/webhooks/wix',
      fetch: '/api/elevenlabs/init',
      health: '/'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// WIX Webhook Endpoint (Ingest)
app.post('/api/webhooks/wix', handleWixWebhook);
app.get('/api/webhooks/wix', (req, res) => {
  res.json({
    message: 'WIX webhook endpoint - POST only',
    expected_content_type: 'application/json',
    description: 'Receives WIX form submissions and stores normalized lead data'
  });
});

// ElevenLabs Init Endpoint (Fetch)
app.post('/api/elevenlabs/init', handleElevenLabsInit);
app.get('/api/elevenlabs/init', (req, res) => {
  res.json({
    message: 'ElevenLabs init endpoint - POST only',
    expected_content_type: 'application/json',
    description: 'Returns lead data for ElevenLabs agent initialization'
  });
});

// Test endpoints for development
app.get('/test/sample-wix', (req, res) => {
  const sampleWixPayload = {
    instanceId: 'test-instance',
    submissionId: 'test-submission-123',
    namespace: 'test',
    formName: 'Contact Form',
    contactId: 'test-contact-456',
    contact: {
      id: 'test-contact-456',
      firstName: 'John',
      lastName: 'Doe',
      phones: ['+12814562323'],
      emails: ['john.doe@example.com'],
      address: {
        streetAddress: {
          number: '123',
          name: 'Main Street'
        },
        city: 'Austin',
        subdivision: 'TX',
        postalCode: '78701'
      }
    },
    submissions: [{
      id: 'sub-1',
      formName: 'Roofing Quote',
      value: {
        'field:project_type': 'Tile Roofing',
        'field:notes': 'Need estimate for roof replacement',
        'field:phone': '+12814562323'
      }
    }]
  };

  res.json({
    message: 'Sample WIX payload for testing',
    payload: sampleWixPayload,
    testUrl: '/api/webhooks/wix',
    instructions: 'POST this payload to the WIX webhook endpoint to test'
  });
});

// Test ElevenLabs configuration
app.get('/api/test/call-config', testCallConfiguration);

// Phone number import endpoints
app.post('/api/phone/import', async (req, res) => {
  console.log('📞 Importing Twilio phone number to ElevenLabs...');

  try {
    const result = await phoneImportService.importTwilioPhoneNumber();

    if (result.error) {
      console.error('❌ Phone import failed:', result.error);
      res.status(400).json({
        ok: false,
        error: result.error
      });
      return;
    }

    // If successful, show the phone_number_id that should be added to .env
    console.log('✅ Phone import successful!');
    console.log(`📝 Add this to your .env file: ELEVENLABS_PHONE_NUMBER_ID=${result.phone_number_id}`);

    res.json({
      ok: true,
      phone_number_id: result.phone_number_id,
      phone_number: result.phone_number,
      label: result.label,
      message: result.message,
      instruction: `Add ELEVENLABS_PHONE_NUMBER_ID=${result.phone_number_id} to your .env file`
    });
  } catch (error) {
    console.error('❌ Phone import exception:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error during phone import'
    });
  }
});

app.get('/api/phone/list', async (req, res) => {
  console.log('📞 Listing ElevenLabs phone numbers...');

  try {
    const result = await phoneImportService.listPhoneNumbers();

    if (result.error) {
      console.error('❌ Phone list failed:', result.error);
      res.status(400).json({
        ok: false,
        error: result.error
      });
      return;
    }

    res.json({
      ok: true,
      phone_numbers: result
    });
  } catch (error) {
    console.error('❌ Phone list exception:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error during phone list'
    });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  res.status(500).json({
    ok: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Not found',
    path: req.originalUrl,
    available_endpoints: [
      'GET /',
      'GET /health',
      'POST /api/webhooks/wix',
      'POST /api/elevenlabs/init',
      'GET /test/sample-wix',
      'GET /api/test/call-config',
      'POST /api/phone/import',
      'GET /api/phone/list'
    ]
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 WIX to ElevenLabs Ingest System`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /                    - Service info`);
  console.log(`   GET  /health             - Health check`);
  console.log(`   POST /api/webhooks/wix   - WIX webhook (ingest + auto-call)`);
  console.log(`   POST /api/elevenlabs/init - ElevenLabs fetch`);
  console.log(`   GET  /test/sample-wix    - Sample test payload`);
  console.log(`   GET  /api/test/call-config - Test ElevenLabs config`);
  console.log(`   POST /api/phone/import   - Import Twilio phone number`);
  console.log(`   GET  /api/phone/list     - List ElevenLabs phone numbers`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Install ngrok: npm install -g ngrok`);
  console.log(`   2. Expose server: ngrok http ${PORT}`);
  console.log(`   3. Add ElevenLabs API credentials to .env file`);
  console.log(`   4. Use ngrok URL for WIX webhook and ElevenLabs config`);
  console.log(`\n📊 Environment:`);
  console.log(`   Redis: ${process.env.UPSTASH_REDIS_REST_URL ? '✅ Configured' : '⚠️  In-memory fallback'}`);
  console.log(`   Webhook Secret: ${process.env.WIX_WEBHOOK_SECRET ? '✅ Set' : '⚠️  Not set (optional)'}`);
  console.log(`   ElevenLabs API: ${process.env.ELEVENLABS_API_KEY ? '✅ Configured' : '❌ Missing (required for calls)'}`);
  console.log(`   ElevenLabs Agent: ${process.env.ELEVENLABS_AGENT_ID ? '✅ Set' : '❌ Missing (required for calls)'}`);
  console.log(`   ElevenLabs Phone: ${process.env.ELEVENLABS_PHONE_NUMBER_ID ? '✅ Set' : '❌ Missing (required for calls)'}`);
  console.log(`   TTL: ${process.env.LEAD_TTL_SEC || 86400} seconds\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

export default app;