# WIX to ElevenLabs Ingest System - Setup Guide

This guide will get you up and running in under 10 minutes.

## 📋 Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- ngrok (for exposing local server)

## 🚀 Step-by-Step Setup

### Step 1: Install Dependencies

```bash
cd /path/to/your/hook/directory
npm install
```

### Step 2: Environment Configuration

The system comes with a `.env` file already configured for local development:

```bash
# The .env file is already created with these settings:
PORT=3000
LEAD_TTL_SEC=86400
# Redis is optional - uses in-memory storage locally
```

**You don't need to export any environment variables** - the system reads from the `.env` file automatically.

### Step 3: Start the Server

```bash
npm run dev
```

You should see output like:
```
🚀 WIX to ElevenLabs Ingest System
📡 Server running on port 3000
🌐 Local URL: http://localhost:3000
```

### Step 4: Expose with ngrok

Open a **new terminal** and run:

```bash
# Install ngrok globally if you don't have it
npm install -g ngrok

# Expose your local server
ngrok http 3000
```

You'll get output like:
```
Forwarding    https://abc123def.ngrok.io -> http://localhost:3000
```

**Save this ngrok URL** - you'll need it for WIX and ElevenLabs configuration.

### Step 5: Test the System

Test that everything works:

```bash
# Test health check
curl https://cojovi.ngrok.dev/health
curl https://9cab9468b99a.ngrok.app/health

# Get sample test payload
curl https://cojovi.ngrok.dev/test/sample-wix
curl https://9cab9468b99a.ngrok.app/test/sample-wix

# Test the WIX webhook with sample data
curl -X POST https://cojovi.ngrok.dev/api/webhooks/wix \
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
        "field:notes": "Test submission"
      }
    }]
  }'

# Test ElevenLabs fetch
curl -X POST https://cojovi.ngrok.dev/api/elevenlabs/init \
  -H "Content-Type: application/json" \
  -d '{"from": "+12814562323"}'
```

If the last command returns the lead data, your system is working!

## 🔌 Configure External Services

### WIX Configuration

1. Go to your WIX site dashboard
2. Navigate to **Settings** → **Webhooks** (or **Developer** → **Webhooks**)
3. Create a new webhook:
   - **URL**: `https://cojovi.ngrok.dev/api/webhooks/wix`
   - **Event**: Form submission
   - **Method**: POST
   - **(Optional) Header**: `X-Webhook-Secret: dev_webhook_secret_123`

### ElevenLabs Configuration

1. Go to ElevenLabs dashboard
2. Select your agent ("Penny")
3. Go to **Security** tab
4. Enable **"Fetch initiation client data from webhook"**
5. Set **Webhook URL**: `https://cojovi.ngrok.dev/api/elevenlabs/init`
6. **Save** the settings

### Twilio Configuration

No special Twilio configuration needed - calls route through ElevenLabs automatically.

## 🧪 End-to-End Testing

1. **Submit a WIX form** on your website
2. **Check server logs** - you should see "Lead data stored successfully"
3. **Make a test call** to your ElevenLabs agent
4. **Verify** that Penny has the lead details in the conversation

## 📁 File Locations

Here's where everything is located:

```
hook/
├── .env                 # ✅ Already created - local config
├── .env.example         # Template for production
├── server.ts           # Main server file
├── package.json        # Dependencies
└── README.md           # Full documentation
```

## 🔧 Environment Variables Explained

### Current .env File (for local development):
```bash
PORT=3000                    # Server port
LEAD_TTL_SEC=86400          # 24 hours data retention
```

### For Production (.env.example):
```bash
PORT=3000
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io      # Redis for persistence
UPSTASH_REDIS_REST_TOKEN=your_token_here                  # Redis auth
LEAD_TTL_SEC=86400                                         # Data expiration
WIX_WEBHOOK_SECRET=your_long_random_secret                 # Security
```

## 🚨 Troubleshooting

### Server Won't Start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill any process using port 3000
kill -9 $(lsof -ti:3000)

# Try starting again
npm run dev
```

### ngrok Issues
```bash
# Make sure ngrok is installed
ngrok version

# If not installed:
npm install -g ngrok

# Or download from: https://ngrok.com/download
```

### WIX Webhook Not Working
- Check that your ngrok URL is still active
- Verify the webhook URL in WIX settings
- Look at the server logs for errors

### ElevenLabs Not Getting Data
- Confirm the webhook URL in ElevenLabs settings
- Check that phone numbers match between WIX form and call
- Verify lead data was stored (check server logs)

## ✅ Success Indicators

You'll know everything is working when:

1. ✅ Server starts without errors
2. ✅ ngrok exposes your local server
3. ✅ Test curl commands return expected data
4. ✅ WIX form submissions appear in server logs
5. ✅ ElevenLabs fetch returns lead data
6. ✅ Penny uses lead details in conversations

## 📞 Getting Help

Check the server logs - they contain detailed information about all requests and any errors.

Common log messages:
- `"Lead data stored successfully"` - WIX webhook worked
- `"Lead data found and returned"` - ElevenLabs fetch worked
- `"No lead data found"` - Phone number mismatch or data expired

That's it! Your WIX to ElevenLabs pipeline is now operational. 🎉



Perfect! I've updated the normalization logic to handle the specific WIX payload structure from step2.md. Here's what I changed:

✅ Updated Normalization Logic

The system now properly handles the WIX payload structure you described:

🔄 Key Changes Made:

1. Names: Now looks for field:first_name_* and field:last_name_* patterns first
2. Phone: Handles contact.phones[0].e164Phone structure from step2.md
3. Address: Properly extracts from contact.address.addressLine, city, subdivisions[0].code → "TX"
4. State: Converts subdivisions[0].code to state abbreviation
5. Location: Special handling for "Dallas-Fort Worth" metro area

📝 What "Store and Key the Record" Means:

The system already does this correctly:

1. Storage: Takes the raw WIX payload → normalizes it → stores in Redis/memory
2. Dual Keying: Stores under TWO keys for reliable lookup:
- ph:+12814562323 (phone number in E.164 format)
- sub:f647af33-0cf8-4d43-8437-c2272fb6135b (submission ID)

This ensures ElevenLabs can find the lead data regardless of which identifier it sends.

🔗 Your Webhook URLs:

Use your ngrok URL for configuration:

WIX Webhook: https://9cab9468b99a.ngrok.app/api/webhooks/wix
ElevenLabs Fetch: https://9cab9468b99a.ngrok.app/api/elevenlabs/init

🧪 Test the Updated System:

# Test with step2.md structure
curl -X POST https://9cab9468b99a.ngrok.app/api/webhooks/wix \
-H "Content-Type: application/json" \
-d @test-step2-payload.json

# Then test fetch
curl -X POST https://9cab9468b99a.ngrok.app/api/elevenlabs/init \
-H "Content-Type: application/json" \
-d '{"from": "+12814562323"}'

The system will now correctly extract all the fields according to your step2.md specification and return them in the flat JSON format that ElevenLabs expects!