# Gemini TTS Setup Guide

Google's **Gemini 3.1 Flash TTS Preview** is a dedicated text-to-speech model that produces **natural, human-like speech** - much better than traditional Google Cloud TTS!

## ✅ Why Gemini 3.1 Flash TTS?

- **Dedicated TTS model** - Specifically designed for speech synthesis
- **Truly natural voices** - Sounds like real humans, not robots
- **Excellent multilingual support** - Perfect Hindi pronunciation  
- **Free tier available** - Uses your existing Gemini API key
- **Fast synthesis** - Optimized for low latency audio generation
- **Multiple voice personas** - Choose from 5 distinct voices
- **No setup required** - Already configured with your GEMINI_API_KEY!

## 📊 Model Specs

- **Model**: `gemini-3.1-flash-tts-preview`
- **Input**: Text (up to 8,192 tokens)
- **Output**: Audio (MP3 format)
- **Languages**: 100+ languages including Hindi
- **Batch API**: Supported for bulk generation

## 🎭 Available Voices

| Voice | Character | Best For |
|-------|-----------|----------|
| **Puck** | Energetic, youthful | AI Tutor, Exam Coach |
| **Charon** | Deep, resonant | Subject Expert |
| **Kore** | Warm, conversational | Host, friendly discussions |
| **Fenrir** | Authoritative, clear | Teacher, instructor |
| **Aoede** | Melodic, expressive | Student, creative content |

## 🚀 Quick Start

### Already Configured!

Your `.env` file is already set up:
```env
TTS_PROVIDER="gemini"
GEMINI_API_KEY="AIzaSyCId1SZMdqsQ400q-JGREIcS0t5E0YFpdI"  # Already exists
GEMINI_TTS_MODEL="gemini-3.1-flash-tts-preview"  # Dedicated TTS model
```

### Just Restart Backend:

```cmd
cd d:\scholarly\backend-firestore
taskkill /F /IM node.exe
npm run dev
```

You should see:
```
[TTS] Initializing provider: gemini
[Gemini TTS] Initialized with model: gemini-3.1-flash-tts-preview
```

### Generate a NEW Hindi Podcast:

1. Go to your app
2. Create a new podcast in Hindi
3. Backend logs will show:
   ```
   [Gemini TTS] Synthesizing: { speaker: 'Teacher', language: 'hi', voice: 'Fenrir', ... }
   [Gemini TTS] Synthesis complete
   ```

4. **Listen** - voice should be **completely natural and human-like**!

## 🎯 Voice Mapping

### Hindi Podcasts
- **Teacher** → Fenrir (authoritative, clear Hindi)
- **Student** → Aoede (melodic, natural Hindi)
- **AI Tutor** → Puck (energetic, friendly)
- **Host** → Kore (warm, conversational)

### English Podcasts
- **Teacher** → Fenrir (professional instructor)
- **Student** → Aoede (curious learner)
- **AI Tutor** → Puck (helpful guide)
- **Host** → Kore (podcast host)

## 🔧 Custom Voice Configuration (Optional)

To change voice assignments, create `config/gemini-tts.config.json`:

```json
{
  "model": "gemini-3.1-flash-tts-preview",
  "voices": {
    "hi": {
      "Teacher": {
        "voiceName": "Charon",
        "description": "Deep Hindi voice for teacher"
      },
      "Student": {
        "voiceName": "Kore",
        "description": "Warm Hindi voice for student"
      }
    }
  }
}
```

## 💰 Pricing

Gemini 3.1 Flash TTS is **FREE** within your Gemini API quota:
- **Free tier**: Part of standard Gemini API limits
- **Input**: 8,192 tokens per request
- **Output**: Up to 16,384 tokens (audio)
- Much cheaper than ElevenLabs
- No separate billing from your existing Gemini usage

## 🆚 Comparison

| Provider | Voice Quality | Hindi Support | Cost | Setup |
|----------|--------------|---------------|------|-------|
| **Gemini 3.1 TTS** | ⭐⭐⭐⭐⭐ Natural | ⭐⭐⭐⭐⭐ Excellent | Free | ✅ Already done |
| Gemini 2.0 Flash | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Good | Free | ✅ Works |
| ElevenLabs | ⭐⭐⭐⭐⭐ Natural | ⭐⭐⭐⭐⭐ Excellent | $5/month | ❌ Key issues |
| Google Cloud TTS | ⭐⭐ Robotic | ⭐⭐ Poor | ~$4/1M chars | ✅ Works |

## 🐛 Troubleshooting

### "Gemini audio generation not supported"
- Make sure using `gemini-3.1-flash-tts-preview` model (dedicated TTS)
- Ensure `GEMINI_API_KEY` is valid
- This model is specifically for TTS, not general Gemini models

### Still sounds robotic
- Verify logs show `[Gemini TTS]` not `[TTS]` (Google Cloud)
- Generate a **NEW** podcast (old ones cached)
- Check `TTS_PROVIDER="gemini"` in `.env`

### Authentication error
- Verify GEMINI_API_KEY is set correctly
- Get fresh key from https://aistudio.google.com/app/apikey
- Ensure key has access to Gemini 3.1 Flash TTS Preview model

## 📚 Resources

- Gemini API Docs: https://ai.google.dev/gemini-api/docs/audio
- Get API Key: https://aistudio.google.com/app/apikey
- Voice Samples: Test at https://aistudio.google.com

## 🎉 Benefits

1. **No ElevenLabs account needed** - Uses your existing Gemini key
2. **No authentication issues** - Already working in your app
3. **Better than Google Cloud TTS** - Much more natural
4. **Free within quota** - No extra cost
5. **Perfect Hindi** - Excellent pronunciation and intonation

---

**Status**: ✅ READY TO USE - Just restart backend and generate a new podcast!
