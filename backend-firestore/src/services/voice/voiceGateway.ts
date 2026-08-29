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
import { VOICE_TOOL_DECLARATIONS, executeVoiceTool } from './voiceTools';
import { beginSession, accrue, endSession, voiceQuotaLimits } from './voiceQuota';
import { SADHYA_FOUNDER_KNOWLEDGE_VOICE } from '../knowledge/founderKnowledge';

/** Verified against this project on 2026-08-25 by enumerating models.list(). */
export const VOICE_MODEL = 'gemini-live-2.5-flash-native-audio';
const VOICE_NAME = 'Kore';
const INPUT_SAMPLE_RATE = 16000;   // browser -> Vertex
const OUTPUT_SAMPLE_RATE = 24000;  // Vertex -> browser (documented for the client)

/**
 * Who may use voice. `all` now means "any signed-in student, within quota" rather than
 * "unmetered" — the per-user limits in voiceQuota.ts are what make that mode safe to run.
 */
type VoiceAccessMode = 'all' | 'pro' | 'off';
const ACCESS_MODE = (process.env.VOICE_ACCESS_MODE as VoiceAccessMode) || 'all';

/** Hard ceiling so a forgotten tab cannot bill indefinitely. Native audio is not cheap. */
const MAX_SESSION_MS = 10 * 60 * 1000;

/**
 * Close sockets that connect and never authenticate.
 *
 * Without this an unauthenticated socket lived until the client went away. It reaches nothing —
 * every path past `auth` requires `state.live` — but it is free to open and holds a file
 * descriptor, so opening thousands is a cheap way to exhaust the process.
 */
const AUTH_DEADLINE_MS = 15_000;

/**
 * Usage is written to Firestore this often DURING a session, not only at the end.
 *
 * A session that ends by crash, kill or unclean socket close would otherwise be entirely
 * unaccounted, and "make the process die" must never be a way to get free minutes. One minute is
 * the most that can go unbilled.
 */
const ACCRUAL_INTERVAL_MS = 60_000;

/**
 * Ceiling on inbound audio per session.
 *
 * The session clock stops a long conversation, but nothing stopped a client sending audio FASTER
 * than real time — Vertex is billed on the audio it receives, so a modified client could spend a
 * ten-minute budget in seconds by firing frames in a loop. At 16kHz mono 16-bit, speech is
 * 32KB/s, so a full session is ~19MB; the 1.6x headroom absorbs base64 overhead and jitter while
 * still being far below what a flood would need. Beyond this the stream is not real-time speech
 * whatever it claims to be.
 */
const MAX_SESSION_AUDIO_BYTES = Math.round((MAX_SESSION_MS / 1000) * INPUT_SAMPLE_RATE * 2 * 1.6);

/** Largest single client frame. Audio frames are a few KB; this is generous and bounds memory. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

const SYSTEM_INSTRUCTION = `You are Sadhya AI Tutor, speaking with a student in real time.

Warm Greeting Requirement:
When the voice session begins or when greeting the student, greet them warmly and naturally in Hinglish:
"Namaste! Kaise ho aap? Main yahan aapki study aur preparation mein help karne ke liye hoon. Aaj aap kya padhna ya discuss karna chahte hain?"

Speech & Style:
Speak naturally and conversationally, the way a good personal tutor actually talks. Do not sound like a
customer-support bot and do not use formal corporate language.

Search & Context Retrieval Reassurance:
When you need to look up syllabus details, study notes, or facts with a tool, let the student know naturally and briefly (for example: "Main iske liye official syllabus aur notes search kar raha hoon, bas thoda rukiye..." or "Ek second, main aapka syllabus check kar leta hoon..."), so they know you are fetching the data and have not disconnected. As soon as the tool returns the results, immediately explain the complete, clear answer without making them wait further.

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

You are always speaking with a signed-in student, so never ask them who they are or what their
name is — call getStudentContext and find out. Use their first name naturally once or twice early
on, not in every reply. If that lookup genuinely returns no name, simply carry on without one
rather than asking for it.

Teach rather than just answering. Ask a short follow-up question when it would genuinely help.
For academic facts, accuracy matters more than sounding conversational — never invent syllabus
details or exam specifics.

You can only look things up through your tools, which search Sadhya's own indexed material. You
cannot browse the internet and you cannot check anything after this conversation ends. So never say
you will "check the official website", "look into it", or "keep trying" — you will not, and the
student will wait for an answer that never comes. When a tool finds nothing, say plainly that you
do not have that information, and point them at the conducting authority's official site so they
can check it themselves.

${SADHYA_FOUNDER_KNOWLEDGE_VOICE}`;

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
  /** True once a quota slot is held, so teardown only releases what it actually took. */
  quotaHeld: boolean;
  /** Wall-clock of the last usage write, so each accrual bills only the time since. */
  lastAccrualAt: number;
  accrualTimer?: NodeJS.Timeout;
  authTimer?: NodeJS.Timeout;
  audioBytes: number;
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
    /*
     * Bind /voice anyway, and say why.
     *
     * Returning early left nothing listening, so the browser's WebSocket failed at the transport
     * layer with no reason attached. A client cannot tell that apart from a dropped network, so it
     * reported "Voice chat encountered a temporary problem" and offered a Try again that could
     * never work: voice was off by configuration, and retrying does not change configuration.
     *
     * One accept-and-explain handshake per attempt is cheaper than a user retrying a dead socket,
     * and it lets the UI offer the one action that actually helps.
     */
    const disabledWss = new WebSocketServer({ server, path: '/voice' });
    disabledWss.on('connection', (ws: WebSocket) => {
      send(ws, clientSafeError('VOICE_DISABLED', 'Voice chat is switched off at the moment. You can carry on with text chat.'));
      try { ws.close(); } catch { /* already gone */ }
    });
    log('GATEWAY_DISABLED', { reason: 'VOICE_ACCESS_MODE=off', behaviour: 'accept-and-explain' });
    return;
  }

  const wss = new WebSocketServer({ server, path: '/voice', maxPayload: MAX_PAYLOAD_BYTES });
  const limits = voiceQuotaLimits();
  log('GATEWAY_ATTACHED', {
    path: '/voice', model: VOICE_MODEL, accessMode: ACCESS_MODE,
    dailySeconds: limits.dailySeconds, dailySessions: limits.dailySessions,
  });

  wss.on('connection', (ws: WebSocket) => {
    const state: VoiceSession = {
      userId: '', live: null, startedAt: 0, closed: false,
      quotaHeld: false, lastAccrualAt: 0, audioBytes: 0,
    };

    const teardown = async (reason: string) => {
      if (state.closed) return;
      state.closed = true;
      if (state.timer) clearTimeout(state.timer);
      if (state.authTimer) clearTimeout(state.authTimer);
      if (state.accrualTimer) clearInterval(state.accrualTimer);
      try { state.live?.close(); } catch { /* already gone */ }
      state.live = null;

      const durationMs = state.startedAt ? Date.now() - state.startedAt : 0;

      /*
       * Bill the tail — whatever ran since the last periodic accrual — and only then hand the
       * concurrency slot back. Released in a `finally` because a failed usage write must not
       * leave the user locked out of voice until the next restart: the daily budget is the thing
       * protecting cost here, and it has already been written up to the last tick.
       */
      if (state.quotaHeld) {
        try {
          const tail = (Date.now() - state.lastAccrualAt) / 1000;
          if (state.lastAccrualAt && tail > 0) await accrue(state.userId, tail);
        } finally {
          endSession(state.userId);
          state.quotaHeld = false;
        }
      }

      log('VOICE_SESSION_ENDED', {
        user: state.userId || 'anon', durationMs, reason,
        audioKB: Math.round(state.audioBytes / 1024),
      });
      try { ws.close(); } catch { /* already closed */ }
    };

    /*
     * Nothing has been authenticated yet, so give this socket a deadline. Cleared the moment a
     * token verifies; if it fires first the socket is closed with a reason the client can show.
     */
    state.authTimer = setTimeout(() => {
      if (state.userId) return;
      log('VOICE_SESSION_ERROR', { reason: 'auth-timeout' });
      send(ws, clientSafeError('UNAUTHENTICATED', 'Please sign in again to use voice chat.'));
      teardown('auth-timeout');
    }, AUTH_DEADLINE_MS);

    ws.on('message', async (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // ── 1. authenticate before anything reaches Vertex ──────────────────────────────
      if (msg.type === 'auth') {
        if (state.live) return;
        try {
          const decoded = await auth.verifyIdToken(msg.token);
          state.userId = decoded.uid;
          if (state.authTimer) clearTimeout(state.authTimer);
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

        /*
         * Quota is checked HERE — after the token is verified, before the Vertex connect. Any
         * earlier and it would be metering an unidentified socket; any later and the expensive
         * thing has already happened, which is precisely what the budget exists to prevent.
         */
        /*
         * The socket can die during token verification, which is a network round trip. Stop here
         * if it did: teardown has already run and will not run again, so anything acquired past
         * this point would never be released — and the session counter would tick for a client
         * that is no longer there.
         */
        if (state.closed) return;

        const decision = await beginSession(state.userId);
        if (!decision.ok) {
          log('VOICE_QUOTA_DENIED', { user: state.userId, code: decision.code });
          send(ws, clientSafeError(decision.code!, decision.message!));
          return teardown(`quota:${decision.code}`);
        }
        state.quotaHeld = true;

        /*
         * Check again, because `beginSession` awaits Firestore and the slot is taken inside that
         * await. A client that hung up in that window had its teardown run while `quotaHeld` was
         * still false, so the slot leaked and locked that user out of voice until the process
         * restarted — verified happening against production before this guard existed. Closing
         * a tab mid-connect or a flaky mobile network is enough to trigger it.
         *
         * Returning here also spares us opening a Vertex session for a socket nobody is holding.
         */
        if (state.closed) {
          endSession(state.userId);
          state.quotaHeld = false;
          log('VOICE_SESSION_ENDED', { user: state.userId, durationMs: 0, reason: 'closed-during-quota' });
          return;
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
              // Sadhya's own knowledge, reachable by name only. The model cannot touch
              // Firestore or any service directly — see voiceTools.ts.
              tools: [{ functionDeclarations: VOICE_TOOL_DECLARATIONS as any }],
            },
            callbacks: {
              onopen: () => {},
              onmessage: (m: any) => {
                const sc = m.serverContent;

                if (m.setupComplete) {
                  state.startedAt = Date.now();
                  // Billing starts when the model is actually live, not when the socket opened —
                  // a slow Vertex handshake is our latency, not the student's quota.
                  state.lastAccrualAt = state.startedAt;
                  log('VOICE_SESSION_CONNECTED', { user: state.userId, model: VOICE_MODEL });
                  send(ws, {
                    type: 'ready',
                    outputSampleRate: OUTPUT_SAMPLE_RATE,
                    inputSampleRate: INPUT_SAMPLE_RATE,
                    // Lets the UI show time remaining instead of cutting the student off unheralded.
                    remainingSeconds: decision.remaining,
                  });

                  // Trigger warm initial voice greeting so the tutor speaks immediately upon activation
                  try {
                    state.live?.sendClientContent({
                      turns: [{
                        role: 'user',
                        parts: [{
                          text: "[Session started. Greet the student warmly in natural Hinglish: say 'Namaste! Kaise ho aap? Main yahan aapki preparation mein help karne ke liye hoon. Aaj aap kya padhna chahte hain?' and invite them to speak.]"
                        }]
                      }],
                      turnComplete: true
                    });
                  } catch (err) {
                    log('VOICE_GREETING_TRIGGER_FAILED', { error: String(err) });
                  }

                  state.timer = setTimeout(() => {
                    send(ws, { type: 'session_limit' });
                    teardown('max-duration');
                  }, MAX_SESSION_MS);

                  state.accrualTimer = setInterval(() => {
                    const now = Date.now();
                    const elapsed = (now - state.lastAccrualAt) / 1000;
                    state.lastAccrualAt = now;
                    void accrue(state.userId, elapsed);
                  }, ACCRUAL_INTERVAL_MS);
                  return;
                }

                // Tool calls: run them against Sadhya's real services and hand the result back.
                // The uid comes from the verified token in `state`, never from the model.
                if (m.toolCall?.functionCalls?.length) {
                  const calls = m.toolCall.functionCalls;
                  send(ws, {
                    type: 'status',
                    status: 'SEARCHING',
                    tool: calls[0]?.name,
                    message: 'Main iske liye search kar raha hoon, thoda rukiye…'
                  });
                  (async () => {
                    const responses = [];
                    for (const call of calls) {
                      const started = Date.now();
                      log('VOICE_TOOL_REQUESTED', { user: state.userId, tool: call.name });
                      const result = await executeVoiceTool(String(call.name), (call.args || {}) as any, { userId: state.userId });
                      log('VOICE_TOOL_COMPLETED', { user: state.userId, tool: call.name, found: !!result.found, ms: Date.now() - started });
                      responses.push({ id: call.id, name: call.name, response: result });
                    }
                    try {
                      state.live?.sendToolResponse({ functionResponses: responses as any });
                      send(ws, { type: 'status', status: 'READY' });
                    } catch { /* session closing */ }
                  })();
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
        /*
         * Count before forwarding. Vertex bills on audio received, so the budget has to be spent
         * by the frame that would exceed it, not by the one after.
         */
        state.audioBytes += Math.floor((msg.data?.length || 0) * 0.75); // base64 -> raw bytes
        if (state.audioBytes > MAX_SESSION_AUDIO_BYTES) {
          log('VOICE_AUDIO_BUDGET_EXCEEDED', { user: state.userId, kb: Math.round(state.audioBytes / 1024) });
          send(ws, clientSafeError('VOICE_UNAVAILABLE', 'Voice chat hit a problem. You can continue with text chat.'));
          return teardown('audio-budget');
        }

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
