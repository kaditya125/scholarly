# ElevenLabs TTS Setup Guide

ElevenLabs provides the **most natural, human-like AI voices** available, with excellent support for Hindi and 29+ other languages.

## Why ElevenLabs?

✅ **Truly human-like voices** - No robotic sound  
✅ **Excellent Hindi support** - Natural pronunciation and intonation  
✅ **Multilingual v2 model** - One voice can speak multiple languages naturally  
✅ **Fast synthesis** - Low latency, streaming support  
✅ **Affordable** - Free tier: 10,000 chars/month, Paid: $5/month for 30,000 chars  

## Setup Instructions

### Step 1: Get Your API Key

1. Go to [https://elevenlabs.io](https://elevenlabs.io)
2. Sign up for a free account (or login)
3. Click on your profile icon → "Profile + API key"
4. Copy your API key

### Step 2: Add API Key to Environment

Open `backend-firestore/.env` and update:

```env
# TTS Provider: 'google-cloud' or 'elevenlabs'
TTS_PROVIDER="elevenlabs"

# ElevenLabs API Key
ELEVENLABS_API_KEY="your-actual-api-key-here"
```

### Step 3: Restart Backend

```bash
cd d:\scholarly\backend-firestore
npm run dev
```

## Voice Configuration

The system uses these high-quality voices:

### English Voices
- **Host**: Sarah (warm, professional female)
- **AI Tutor**: Adam (clear, friendly male)
- **Student**: Sarah (young, curious)
- **Teacher**: Adam (authoritative, clear)
- **Subject Expert**: Daniel (knowledgeable male)
- **Exam Coach**: Adam (motivating, encouraging)

### Hindi Voices
All use **multilingual_v2** model for natural Hindi pronunciation:
- **Host**: Sarah (warm female, excellent Hindi)
- **AI Tutor**: Adam (clear male, natural Hindi)
- **Student**: Sarah (young, curious)
- **Teacher**: Adam (authoritative, natural Hindi)
- **Subject Expert**: Daniel (knowledgeable)
- **Exam Coach**: Adam (motivating)

## Custom Voice Configuration (Optional)

To use your own ElevenLabs voices:

1. **Get voice IDs** from ElevenLabs dashboard → Voice Library
2. Create `backend-firestore/config/elevenlabs.config.json`:

```json
{
  "defaultModel": "eleven_multilingual_v2",
  "voices": {
    "hi": {
      "Teacher": {
        "voiceId": "your-custom-voice-id",
        "stability": 0.6,
        "similarityBoost": 0.75,
        "style": 0.1,
        "useSpeakerBoost": true
      }
    }
  }
}
```

## Testing

After setup, generate a **NEW** Hindi podcast:

1. Backend should show:
   ```
   [TTS] Initializing provider: elevenlabs
   [ElevenLabs] Synthesizing: { speaker: 'Teacher', language: 'hi', voiceId: 'pNInz6obpgDQGcFmaJgB', ... }
   ```

2. The generated audio should sound **natural and human-like**, not robotic

## Pricing

| Plan | Price | Characters/month | Cost per 1000 chars |
|------|-------|------------------|---------------------|
| Free | $0 | 10,000 | Free |
| Starter | $5 | 30,000 | $0.17 |
| Creator | $22 | 100,000 | $0.22 |
| Pro | $99 | 500,000 | $0.20 |

**Example**: A 10-minute podcast (~2000 words = ~10,000 characters) costs:
- Free tier: **Free** (1 podcast/month)
- Starter plan: **$1.70** per podcast

## Fallback to Google Cloud

If you don't want to use ElevenLabs, set:

```env
TTS_PROVIDER="google-cloud"
```

The system will fall back to Google Cloud TTS (Wavenet/Neural2 voices).

## Troubleshooting

### "ELEVENLABS_API_KEY not found"
- Check `.env` file has the correct key
- Restart backend after adding key

### "ElevenLabs TTS failed: 401"
- API key is invalid
- Get a fresh key from elevenlabs.io

### "ElevenLabs TTS failed: 422"
- Voice ID not found
- Check voice IDs in your ElevenLabs dashboard

### Still sounds robotic
- Make sure `TTS_PROVIDER="elevenlabs"` (not "google-cloud")
- Generate a NEW podcast (old ones used cached Google voices)
- Check backend logs show `[ElevenLabs] Synthesizing`

## Support

- ElevenLabs Docs: https://docs.elevenlabs.io
- Voice Library: https://elevenlabs.io/voice-library
- API Reference: https://docs.elevenlabs.io/api-reference
