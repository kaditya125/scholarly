/**
 * Voice gateway — bridges a browser WebSocket to a Vertex AI Gemini Live session.
 *
 * Why a separate gateway rather than extending the chat controller: text chat streams over
 * SSE, which is one-directional. Voice needs audio flowing both ways at once, so it gets its
 * own transport. Nothing here touches the existing chat path.
 *
 * The browser never sees Google credentials. It authenticates to US with a Firebase ID token;
 * this process holds the Vertex service account and opens the Live session server-side, then
 * relays audio frames. A leaked client token grants a voice session and nothing more.
 *
 * ── Realtime pacing matters ──────────────────────────────────────────────────────────────
 * Audio must reach Vertex at roughly wall-clock speed. Feeding ~4s of speech in ~0.8s during
 * bring-up produced a silent session: no transcription, no reply, no error — the server's
 * voice-activity detection never saw an end-of-speech. An AudioWorklet paces naturally, so
 * the gateway simply forwards frames as they arrive and never batches or buffers ahead.
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { GoogleGenAI, Modality, type Session } from '@google/genai';
import { auth } from '../../config/firebase';
import { env } from '../../config/env';
import { paymentsService } from '../payments.service';

/** Verified against this project on 2026-08-25 by enumerating models.list(). */
export const VOICE_MODEL = 'gemini-live-2.5-flash-native-audio';
const VOICE_NAME = 'Kore';
const INPUT_SAMPLE_RATE = 16000;   // browser -> Vertex
const OUTPUT_SAMPLE_RATE = 24000;  // Vertex -> browser (documented for the client)

/**
 * Who may use voice. Prototype default is `all`; flip to `pro` to gate on the same
 * entitlement authority the payment system enforces. Phase 4 replaces this with real quotas.
 */
type VoiceAccessMode = 'all' | 'pro' | 'off';
const ACCESS_MODE = (process.env.VOICE_ACCESS_MODE as VoiceAccessMode) || 'all';

/** Hard ceiling so a forgotten tab cannot bill indefinitely. Native audio is not cheap. */
const MAX_SESSION_MS = 10 * 60 * 1000;

const SYSTEM_INSTRUCTION = `You are Sadhya AI Tutor, speaking with a student in real time.

Speak naturally and conversationally, the way a good tutor actually talks. Do not sound like a
customer-support bot and do not use formal corporate language.

Keep spoken answers short — usually one to three sentences — unless the student asks you to go
deeper. This is speech, not an essay; long monologues are hard to follow by ear.

Be warm, patient and encouraging. Adapt to the student's cues: if they sound confused, slow down
and simplify; if they sound frustrated, get calmer and more practical; if they sound excited,
match that energy. Do not announce that you are doing this and do not overuse emotional phrases.

Never claim to be human or to have human feelings.

If the student interrupts you, stop immediately and listen. Do not finish your sentence.
If the student pauses briefly, wait — do not jump in.

The student may speak English, Hindi or a mix of both. Reply naturally in whichever they are
using, including Hinglish. Do not ask them to pick a language.

Teach rather than just answering. Ask a short follow-up question when it would genuinely help.
For academic facts, accuracy matters more than sounding conversational — never invent syllabus
details or exam specifics.`;

type ClientMsg =
  | { type: 'auth'; token: string }
  | { type: 'audio'; data: string }
  | { type: 'text'; text: string }
  | { type: 'end' };

interface VoiceSession {
  userId: string;
  live: Session | null;
  startedAt: number;
  timer?: NodeJS.Timeout;
  closed: boolean;
}

const log = (event: string, fields: Record<string, unknown> = {}) => {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`[voice] ${event}${pairs ? ' ' + pairs : ''}`);
};

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

/** Never leak Vertex/transport internals to the browser — map to something a user can act on. */
function clientSafeError(code: string, message: string) {
  return { type: 'error', code, message };
}

export function attachVoiceGateway(server: Server) {
  if (ACCESS_MODE === 'off') {
    log('GATEWAY_DISABLED', { reason: 'VOICE_ACCESS_MODE=off' });
    return;
  }

  const wss = new WebSocketServer({ server, path: '/voice' });
  log('GATEWAY_ATTACHED', { path: '/voice', model: VOICE_MODEL, accessMode: ACCESS_MODE });

  wss.on('connection', (ws: WebSocket) => {
    const state: VoiceSession = { userId: '', live: null, startedAt: 0, closed: false };

    const teardown = async (reason: string) => {
      if (state.closed) return;
      state.closed = true;
      if (state.timer) clearTimeout(state.timer);
      try { state.live?.close(); } catch { /* already gone */ }
      state.live = null;
      const durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
      log('VOICE_SESSION_ENDED', { user: state.userId || 'anon', durationMs, reason });
      try { ws.close(); } catch { /* already closed */ }
    };

    ws.on('message', async (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // ── 1. authenticate before anything reaches Vertex ──────────────────────────────
      if (msg.type === 'auth') {
        if (state.live) return;
        try {
          const decoded = await auth.verifyIdToken(msg.token);
          state.userId = decoded.uid;
        } catch {
          log('VOICE_SESSION_ERROR', { reason: 'bad-token' });
          send(ws, clientSafeError('UNAUTHENTICATED', 'Please sign in again to use voice chat.'));
          return teardown('unauthenticated');
        }

        if (ACCESS_MODE === 'pro') {
          const ent = await paymentsService.hasActivePro(state.userId);
          if (!ent.active) {
            log('VOICE_ENTITLEMENT_DENIED', { user: state.userId });
            send(ws, clientSafeError('VOICE_REQUIRES_PRO', 'Voice chat is available on Sadhya Pro.'));
            return teardown('not-entitled');
          }
        }

        try {
          const ai = new GoogleGenAI({
            vertexai: true,
            project: env.GOOGLE_VERTEX_PROJECT,
            location: env.GOOGLE_VERTEX_LOCATION,
          });

          state.live = await ai.live.connect({
            model: VOICE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: SYSTEM_INSTRUCTION,
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
              // Both directions transcribed so the UI can show a live transcript.
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              // Lets the model read tone/pace and adapt delivery, rather than us faking
              // sentiment from keywords.
              enableAffectiveDialog: true,
              // Server-side VAD: this is what makes barge-in work without timers.
              realtimeInputConfig: { automaticActivityDetection: {} },
            },
            callbacks: {
              onopen: () => {},
              onmessage: (m: any) => {
                const sc = m.serverContent;

                if (m.setupComplete) {
                  state.startedAt = Date.now();
                  log('VOICE_SESSION_CONNECTED', { user: state.userId, model: VOICE_MODEL });
                  send(ws, { type: 'ready', outputSampleRate: OUTPUT_SAMPLE_RATE, inputSampleRate: INPUT_SAMPLE_RATE });
                  state.timer = setTimeout(() => {
                    send(ws, { type: 'session_limit' });
                    teardown('max-duration');
                  }, MAX_SESSION_MS);
                  return;
                }

                // Barge-in: the server detected the user talking over the model. Tell the
                // client to drop whatever audio it still has queued, immediately.
                if (sc?.interrupted) send(ws, { type: 'interrupted' });

                if (sc?.inputTranscription?.text) send(ws, { type: 'transcript', role: 'user', text: sc.inputTranscription.text });
                if (sc?.outputTranscription?.text) send(ws, { type: 'transcript', role: 'ai', text: sc.outputTranscription.text });

                for (const part of (sc?.modelTurn?.parts || [])) {
                  if (part.inlineData?.data) send(ws, { type: 'audio', data: part.inlineData.data });
                }

                if (sc?.generationComplete) send(ws, { type: 'generation_complete' });
                if (sc?.turnComplete) send(ws, { type: 'turn_complete' });
                if (m.goAway) send(ws, { type: 'going_away' });
              },
              onerror: (e: any) => {
                log('VOICE_SESSION_ERROR', { user: state.userId, detail: String(e?.message || e?.reason || 'unknown').slice(0, 120) });
                send(ws, clientSafeError('VOICE_UNAVAILABLE', 'Voice chat hit a problem. You can continue with text chat.'));
                teardown('live-error');
              },
              onclose: () => teardown('live-closed'),
            },
          });

          log('VOICE_SESSION_CREATED', { user: state.userId, model: VOICE_MODEL });
        } catch (e: any) {
          log('VOICE_SESSION_ERROR', { user: state.userId, detail: String(e?.message || e).slice(0, 120) });
          send(ws, clientSafeError('VOICE_CONNECT_FAILED', "I couldn't connect to voice chat. Please try again."));
          teardown('connect-failed');
        }
        return;
      }

      // ── 2. everything past this point requires an established session ───────────────
      if (!state.live) return;

      if (msg.type === 'audio') {
        // Forwarded frame-by-frame, never batched: see the pacing note at the top.
        try {
          state.live.sendRealtimeInput({
            audio: { data: msg.data, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
          });
        } catch { /* session closing */ }
        return;
      }

      if (msg.type === 'text') {
        try {
          state.live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: msg.text }] }], turnComplete: true });
        } catch { /* session closing */ }
        return;
      }

      if (msg.type === 'end') return teardown('client-ended');
    });

    ws.on('close', () => teardown('socket-closed'));
    ws.on('error', () => teardown('socket-error'));
  });
}
