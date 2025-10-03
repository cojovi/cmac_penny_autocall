# Penny WIX Ingest Endpoint - Implementation Documentation

## Project Overview

This project implements a serverless ingest endpoint system that bridges WIX form submissions with ElevenLabs AI agent "Penny". The system normalizes WIX form data and stores it for retrieval when ElevenLabs initiates calls.

## Architecture Decisions

### 1. Technology Stack
- **Runtime**: Node.js 18.x (Vercel-compatible)
- **Deployment**: Vercel serverless functions
- **Storage**: Upstash Redis (production) with in-memory fallback (development)
- **Language**: TypeScript with ES modules

**Reasoning**: Vercel provides excellent serverless function support with automatic scaling, and Upstash Redis offers a serverless Redis solution that integrates seamlessly with Vercel.

### 2. Storage Strategy
- **Primary**: Upstash Redis with TTL-based expiration
- **Fallback**: In-memory Map for local development
- **Key Strategy**: Dual indexing by phone number (`ph:+E164`) and submission ID (`sub:<id>`)

**Reasoning**: Dual indexing ensures leads can be retrieved by either phone number (from call context) or submission ID (from ElevenLabs parameters). TTL prevents data accumulation and ensures GDPR compliance.

### 3. Data Normalization
- **Phone Numbers**: E.164 format standardization
- **Address Parsing**: Intelligent extraction from various WIX address formats
- **Field Mapping**: Direct mapping to ElevenLabs variable names
- **Content Sanitization**: Basic profanity filtering in notes

**Reasoning**: Consistent data format ensures reliable retrieval and prevents issues with phone number matching. The normalization handles various WIX form structures while maintaining compatibility with ElevenLabs expectations.

### 4. Error Handling Strategy
- **WIX Endpoint**: Returns 200 with error details for webhook reliability
- **ElevenLabs Endpoint**: Always returns 200 with defaults to prevent call blocking
- **Logging**: Comprehensive error logging for debugging

**Reasoning**: WIX webhooks require 200 responses to mark as delivered. ElevenLabs calls should never fail due to missing data, so defaults are provided.

## Implementation Details

### File Structure
```
/api
  /webhooks
    wix.ts                 # WIX webhook receiver
  /elevenlabs
    init.ts                # ElevenLabs data fetcher
/lib
  store.ts                 # Storage abstraction layer
  normalize.ts             # WIX data normalization
package.json               # Dependencies and project config
vercel.json               # Vercel deployment configuration
```

### Key Components

#### 1. Storage Layer (`lib/store.ts`)
- Abstracts Redis vs in-memory storage
- Handles TTL management
- Provides consistent API for lead storage/retrieval

#### 2. Normalization Layer (`lib/normalize.ts`)
- Maps WIX form fields to ElevenLabs variables
- Handles phone number E.164 conversion
- Extracts address components from various formats
- Sanitizes user content

#### 3. WIX Webhook (`api/webhooks/wix.ts`)
- Receives and validates WIX form submissions
- Normalizes data and stores with dual indexing
- Returns success confirmation to WIX

#### 4. ElevenLabs Fetcher (`api/elevenlabs/init.ts`)
- Retrieves lead data by phone or submission ID
- Returns normalized data for ElevenLabs consumption
- Provides fallback defaults to prevent call failures

## Environment Configuration

### Required Variables
- `UPSTASH_REDIS_REST_URL`: Redis connection URL
- `UPSTASH_REDIS_REST_TOKEN`: Redis authentication token
- `LEAD_TTL_SEC`: Data expiration time (default: 86400 seconds)

### Optional Variables
- `WIX_WEBHOOK_SECRET`: Shared secret for webhook validation

## Security Considerations

1. **Webhook Validation**: Optional secret header validation for WIX webhooks
2. **Data Sanitization**: Content filtering in notes field
3. **TTL Management**: Automatic data expiration for privacy compliance
4. **Error Handling**: No sensitive data exposure in error responses

## Deployment Process

1. **Local Development**:
   ```bash
   npm install
   vercel dev
   ```

2. **Production Deployment**:
   ```bash
   vercel deploy
   ```

3. **Environment Setup**: Configure environment variables in Vercel dashboard

## Integration Workflow

1. **WIX Configuration**: Set webhook URL to `/api/webhooks/wix`
2. **ElevenLabs Configuration**: Enable fetch webhook pointing to `/api/elevenlabs/init`
3. **Testing**: Submit WIX form and verify data storage
4. **Call Testing**: Trigger test call to verify data retrieval

## Monitoring and Troubleshooting

### Key Metrics
- Webhook delivery success rate
- Data retrieval success rate
- Error frequency and types

### Common Issues
1. **Phone Number Mismatch**: Ensure E.164 format consistency
2. **Missing Data**: Check WIX form field mapping
3. **Call Failures**: Verify ElevenLabs endpoint configuration

## Future Enhancements

1. **Enhanced Security**: IP allowlisting, bearer token authentication
2. **Data Validation**: Schema validation for incoming WIX data
3. **Analytics**: Detailed logging and metrics collection
4. **Multi-tenant Support**: Organization-based data isolation

## Performance Considerations

- **Cold Start**: Vercel functions have minimal cold start overhead
- **Concurrency**: Serverless functions auto-scale based on demand
- **Storage**: Redis provides sub-millisecond response times
- **Memory**: In-memory fallback suitable for development only

This implementation provides a robust, scalable foundation for the WIX-to-ElevenLabs integration while maintaining simplicity and reliability.
