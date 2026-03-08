// ─── Voice Feedback Sounds: Generated audio cues via AudioContext ───
// Tiny synthesised tones for state transitions — no external files needed.
// Each sound is 50-150ms, pleasant and subtle.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx || audioCtx.state === "closed") {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Play a short tone with given frequency, duration, and waveform */
function playTone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = "sine",
  volume: number = 0.15,
  rampDown: boolean = true,
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);

  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + durationMs / 1000);
}

/** Play a two-tone "ding" for a pleasant chime effect */
function playChime(freq1: number, freq2: number, durationMs: number = 100, volume: number = 0.12) {
  const ctx = getAudioContext();
  if (!ctx) return;

  // First tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(freq1, ctx.currentTime);
  gain1.gain.setValueAtTime(volume, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + durationMs / 1000);

  // Second tone (slightly delayed)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(freq2, ctx.currentTime + 0.06);
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.setValueAtTime(volume, ctx.currentTime + 0.06);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06 + durationMs / 1000);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(ctx.currentTime);
  osc2.stop(ctx.currentTime + 0.06 + durationMs / 1000);
}

// ─── Public API ─────────────────────────────────────────────────

/** Soft ascending "ding" — start listening */
export function playStartListening() {
  playChime(880, 1174.66, 100, 0.10);  // A5 → D6
}

/** Low descending "boop" — stop listening / start processing */
export function playStopListening() {
  playTone(523.25, 80, "sine", 0.10);  // C5
}

/** Gentle double "click" — response ready */
export function playResponseReady() {
  // Two soft high tones in quick succession
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(1046.5, 50, "sine", 0.08);  // C6
  setTimeout(() => playTone(1318.51, 60, "sine", 0.10), 80);  // E6
}

/** Short buzz — error */
export function playError() {
  playTone(220, 200, "sawtooth", 0.06);  // A3 sawtooth
}

/** Subtle click — action executed (e.g. quick command) */
export function playActionClick() {
  playTone(1500, 40, "sine", 0.08);
}
