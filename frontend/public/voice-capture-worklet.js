/**
 * Microphone capture worklet for Sadhya voice chat.
 *
 * Runs on the audio render thread, so capture is not affected by React re-renders or main-thread
 * jank. Converts the browser's native rate (usually 48 kHz Float32) to the 16 kHz mono PCM16 that
 * Gemini Live expects, and posts ~100 ms frames back to the main thread.
 *
 * Pacing is deliberate and load-bearing: frames are emitted as audio is actually captured, so the
 * stream reaches Vertex at wall-clock speed. Sending faster than realtime defeats the server's
 * voice-activity detection — during bring-up, pushing 4s of speech in 0.8s produced a completely
 * silent session with no transcript, no reply and no error. Never batch or fast-forward here.
 */
const TARGET_RATE = 16000;
const FRAME_MS = 100;
const SAMPLES_PER_FRAME = (TARGET_RATE * FRAME_MS) / 1000; // 1600

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(SAMPLES_PER_FRAME);
    this._n = 0;
    // Fractional read position into the input block, so resampling stays continuous
    // across process() calls instead of clicking at every block boundary.
    this._pos = 0;
    this._muted = false;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'mute') this._muted = !!e.data.value;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const chan = input[0];
    const ratio = sampleRate / TARGET_RATE; // e.g. 48000/16000 = 3

    // Linear interpolation rather than naive decimation — dropping samples adds aliasing
    // that degrades transcription accuracy on consonants.
    while (this._pos < chan.length) {
      const i0 = Math.floor(this._pos);
      const frac = this._pos - i0;
      const a = chan[i0];
      const b = i0 + 1 < chan.length ? chan[i0 + 1] : a;
      this._buf[this._n++] = a + (b - a) * frac;

      if (this._n >= SAMPLES_PER_FRAME) {
        if (!this._muted) {
          const pcm = new Int16Array(SAMPLES_PER_FRAME);
          let peak = 0;
          for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
            const s = Math.max(-1, Math.min(1, this._buf[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            const abs = s < 0 ? -s : s;
            if (abs > peak) peak = abs;
          }
          // `peak` drives the UI waveform, so the visual reacts to the same samples we send
          // rather than a second, separate analyser.
          this.port.postMessage({ pcm: pcm.buffer, peak }, [pcm.buffer]);
        }
        this._n = 0;
      }
      this._pos += ratio;
    }
    this._pos -= chan.length;
    return true;
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor);
