# WIX to ElevenLabs Ingest System

A serverless ingest endpoint system that bridges WIX form submissions with ElevenLabs AI agent "Penny". The system normalizes WIX form data and stores it for retrieval when ElevenLabs initiates calls.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 3. Expose with ngrok

```bash
# Install ngrok if you don't have it
npm install -g ngrok

# Expose your local server
ngrok http 3000
```

Use the ngrok URL for your WIX webhook and ElevenLabs configuration.

## API Endpoints

### WIX Webhook (Ingest) - `POST /api/webhooks/wix`
Receives WIX form submissions and stores normalized lead data.

**Sample curl test:**
```bash
curl -X POST http://localhost:3000/api/webhooks/wix \
  -H "Content-Type: application/json" \
  -d '{
    "submissionId": "test-123",
    "contact": {
      "firstName": "John",
      "lastName": "Doe",
      "phones": ["+12814562323"]
    },
    "submissions": [{
      "value": {
        "field:project_type": "Roofing",
        "field:notes": "Need estimate"
      }
    }]
  }'
```

### ElevenLabs Init (Fetch) - `POST /api/elevenlabs/init`
Returns lead data for ElevenLabs agent initialization.

**Sample curl test:**
```bash
curl -X POST http://localhost:3000/api/elevenlabs/init \
  -H "Content-Type: application/json" \
  -d '{"from": "+12814562323"}'
```

### Other Endpoints
- `GET /` - Service information
- `GET /health` - Health check
- `GET /test/sample-wix` - Sample test payload

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required:**
- `PORT` - Server port (default: 3000)

**Optional:**
- `UPSTASH_REDIS_REST_URL` - Redis URL (uses in-memory if not set)
- `UPSTASH_REDIS_REST_TOKEN` - Redis token
- `LEAD_TTL_SEC` - Data expiration time (default: 86400 = 24 hours)
- `WIX_WEBHOOK_SECRET` - Webhook validation secret

### WIX Configuration

1. In your WIX site, go to Settings → Webhooks
2. Add a new webhook for form submissions
3. Set URL to: `https://cojovi.ngrok.dev/api/webhooks/wix`
4. (Optional) Add header: `X-Webhook-Secret: your_secret_here`

### ElevenLabs Configuration

1. In ElevenLabs → Agent → Security tab
2. Enable "Fetch initiation client data from webhook"
3. Set URL to: `https://cojovi.ngrok.dev/api/elevenlabs/init`
4. Save settings

## Data Flow

```
WIX Form → Webhook → Normalize → Store → ElevenLabs → Fetch → Agent
```

1. **WIX Form Submission**: User submits form on WIX site
2. **Webhook**: WIX sends data to `/api/webhooks/wix`
3. **Normalize**: Convert WIX format to ElevenLabs variables
4. **Store**: Save with dual indexing (phone + submission ID)
5. **ElevenLabs Call**: When call starts, ElevenLabs hits `/api/elevenlabs/init`
6. **Fetch**: Return lead data for agent context
7. **Agent**: Penny uses the data in conversation

## Data Normalization

WIX form data is normalized to these ElevenLabs variables:

- `first_name`, `last_name`, `lead_full_name`
- `lead_phone` (E.164 format)
- `address_line1`, `city`, `state`, `zip`
- `notes` (sanitized)
- `request_type`, `location`, `source_site`
- `wix_submission_id`, `wix_contact_id`

## Storage

- **Production**: Upstash Redis with TTL
- **Development**: In-memory fallback
- **Indexing**: Dual keys (`ph:+1234567890` and `sub:submission-id`)

## Scripts

```bash
npm run dev        # Start development server with hot reload
npm run build      # Compile TypeScript to JavaScript
npm run start      # Start production server
npm run type-check # Check TypeScript types
```

## Testing

### 1. Test WIX Webhook

```bash
# Get sample payload
curl http://localhost:3000/test/sample-wix

# Test webhook
curl -X POST http://localhost:3000/api/webhooks/wix \
  -H "Content-Type: application/json" \
  -d @sample-payload.json
```

### 2. Test ElevenLabs Fetch

```bash
curl -X POST http://localhost:3000/api/elevenlabs/init \
  -H "Content-Type: application/json" \
  -d '{"from": "+12814562323"}'
```

### 3. End-to-End Test

1. Submit WIX form → Check logs for successful storage
2. Make test call → Verify ElevenLabs gets lead data
3. Check agent variables are populated

## Troubleshooting

### Common Issues

**Phone Number Mismatch**
- Ensure phone numbers are in E.164 format (+1XXXXXXXXXX)
- Check normalization in logs

**Missing Lead Data**
- Verify storage keys match between ingest and fetch
- Check TTL hasn't expired (24 hours default)

**WIX Webhook Fails**
- Verify webhook secret matches
- Check WIX webhook delivery status

**ElevenLabs Not Getting Data**
- Confirm webhook URL is correct in ElevenLabs settings
- Check that phone number from call matches stored data

### Logs

All requests and errors are logged to console. Key log messages:

- `WIX webhook:` - Ingest processing
- `Lead data stored:` - Successful storage
- `ElevenLabs init:` - Fetch requests
- `Lead data found:` - Successful retrieval

## Production Deployment

For production, consider:

1. **Redis**: Set up Upstash Redis for persistent storage
2. **Security**: Enable webhook secret validation
3. **Monitoring**: Add health checks and alerting
4. **SSL**: Ensure HTTPS endpoints for webhooks

## Architecture

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WIX Form  │───▶│  Ingest         │───▶│   Storage       │
│             │    │  /webhooks/wix  │    │   Redis/Memory  │
└─────────────┘    └─────────────────┘    └─────────────────┘
                                                     │
┌─────────────┐    ┌─────────────────┐              │
│ ElevenLabs  │◀───│  Fetch          │◀─────────────┘
│   Agent     │    │  /elevenlabs/   │
└─────────────┘    └─────────────────┘
```

This system is now ready for local development and ngrok exposure!