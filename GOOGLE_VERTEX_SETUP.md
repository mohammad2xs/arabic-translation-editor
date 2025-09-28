# Google Vertex AI Integration Setup Guide

## Current Status

✅ **Google Vertex API key has been integrated into your project**

- Added to `.env.local` as `GOOGLE_VERTEX_KEY`
- Updated `.env.example` with proper configuration
- LLM router is configured to use the key
- Required SDKs are installed

## API Key Analysis

The API key you provided (`AQ.Ab8RN6IFgLecekb7R5Gs4p_4pWoMC3cHECDuf1dRE6G8MTZFvw`) appears to be a Google Cloud API key, but it's not working with the standard Google AI Studio or Vertex AI endpoints. This suggests it might be:

1. **Restricted API key** - doesn't have access to Generative AI services
2. **Different service** - for a different Google Cloud service
3. **Expired/Invalid** - needs to be regenerated

## How to Get the Correct API Key

### Option 1: Google AI Studio (Recommended for development)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API key" in the left sidebar
4. Create a new API key
5. Copy the key (it will look like: `AIzaSy...`)

### Option 2: Google Cloud Console (For production)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Enable the "Vertex AI API" and "Generative AI API"
4. Go to "APIs & Services" > "Credentials"
5. Create an API key or service account
6. For service account, download the JSON key file

### Option 3: Vertex AI (For enterprise)

1. Go to [Vertex AI Console](https://console.cloud.google.com/vertex-ai)
2. Enable the Vertex AI API
3. Create a service account with Vertex AI permissions
4. Download the service account JSON key

## Update Your Configuration

Once you have the correct API key, update your `.env.local` file:

```bash
# For Google AI Studio API key
GOOGLE_API_KEY=AIzaSy...

# For Vertex AI (if using service account)
GOOGLE_VERTEX_KEY=your-service-account-json-here
GOOGLE_VERTEX_PROJECT_ID=your-project-id
GOOGLE_VERTEX_LOCATION=us-central1
```

## Testing the Integration

Run the test script to verify everything works:

```bash
# Test with Google AI Studio
node test-google-ai-studio.mjs

# Test with Vertex AI
node test-vertex-ai-proper.mjs
```

## Project Integration

The LLM router is already configured to:

1. **Prefer Google AI Studio** for API keys
2. **Fallback to Vertex AI** if available
3. **Auto-switch to Gemini** for long context requests
4. **Support both** `GOOGLE_VERTEX_KEY` and `GOOGLE_API_KEY`

## Usage in Your Code

```typescript
import { getLLMRouter } from './lib/llm/router';

const router = getLLMRouter();

// This will automatically use Gemini if configured
const response = await router.chat({
  system: 'You are a helpful assistant.',
  user: 'Hello!',
  maxTokens: 100
});
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: API key doesn't have the right permissions
2. **403 Forbidden**: API key is restricted or expired
3. **404 Not Found**: Wrong endpoint or model name

### Solutions

1. **Check API key permissions** in Google Cloud Console
2. **Enable required APIs** (Vertex AI API, Generative AI API)
3. **Verify project ID** and region settings
4. **Test with different models** (gemini-1.5-pro, gemini-1.5-flash)

## Next Steps

1. Get a valid API key from one of the sources above
2. Update your `.env.local` file
3. Test the integration
4. The project will automatically use Gemini for long context requests

## Support

If you need help:

1. Check the Google Cloud Console for API quotas and permissions
2. Verify your billing account is set up
3. Test with the provided test scripts
4. Check the console logs for detailed error messages
