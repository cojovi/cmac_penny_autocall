📁 Project Structure

  hook/
  ├── api/
  │   ├── webhooks/wix.ts       # WIX webhook receiver
  │   └── elevenlabs/init.ts    # ElevenLabs data fetcher
  ├── lib/
  │   ├── store.ts              # Storage layer (Redis/in-memory)
  │   └── normalize.ts          # Data normalization
  ├── server.ts                 # Express server
  ├── package.json              # Dependencies & scripts
  ├── tsconfig.json            # TypeScript config
  ├── .env                     # Local environment
  ├── .env.example             # Environment template
  └── README.md                # Complete documentation

  🚀 Quick Start Commands

  # Install dependencies
  npm install

  # Start development server
  npm run dev

  # In another terminal, expose with ngrok
  npx ngrok http 3000

  🔌 Endpoints Ready

  1. WIX Webhook: POST /api/webhooks/wix - Receives and stores form data
  2. ElevenLabs Fetch: POST /api/elevenlabs/init - Returns lead data for calls
  3. Health Check: GET /health - System status
  4. Test Helper: GET /test/sample-wix - Sample payload for testing

  🎯 Key Features

  - Dual Storage: Redis (production) + in-memory fallback (development)
  - Phone Normalization: E.164 format for reliable matching
  - Data Sanitization: Content filtering and PII protection
  - Error Resilience: Never blocks calls even if data missing
  - Comprehensive Logging: Full request/response tracking

  🔧 Configuration

  The system works out-of-the-box for local development. For production:
  - Set up Upstash Redis for persistent storage
  - Configure webhook secrets for security
  - Use the ngrok URL in WIX and ElevenLabs settings

  The system is now ready to handle your WIX → Twilio → ElevenLabs pipeline!
