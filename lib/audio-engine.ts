import type { SoundId } from "./sounds";
import { getSavedBlob } from "./offline-store";

// All synthesized loops tile over this period. Every modulation frequency
// used below is an integer / DURATION, so a single buffer-based sound loops
// seamlessly, and event-based sounds (heartbeat/lullaby/womb) repeat their
// schedule every DURATION seconds.
const DURATION = 12;
const SAMPLE_RATE = 44100;

/** How long gain ramps take when a sound is toggled on/off or its volume changes. */
const CROSSFADE_SECONDS = 1.5;

type AnyAudioContext = AudioContext | OfflineAudioContext;

/** One musical beat at ~80 BPM, scaled so 16 beats = exactly 12 s */
const BEAT = 12 / 16; // 0.75 s

/** MIDI note number → Hz */
function midiToHz(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/**
 * Melody: Brahms-esque phrase in C major, 16 beats / 12 s.
 * [startBeat, durationBeats (unused by chime but good to read), midiNote, velocity]
 */
const LULLABY_MELODY: Array<[number, number, number, number]> = [
  [0, 1.5, 67, 0.55], // G4  — gentle opening
  [1.5, 0.5, 69, 0.5], // A4
  [2, 1.5, 72, 0.7], // C5  — first rise
  [3.5, 0.5, 71, 0.6], // B4  (warm passing tone)
  [4, 2.0, 72, 0.75], // C5  — hold, peak of phrase A
  [6, 1.0, 74, 0.65], // D5
  [7, 1.0, 76, 0.7], // E5  — peak
  [8, 1.5, 74, 0.6], // D5  — begin descent
  [9.5, 0.5, 72, 0.55], // C5
  [10, 1.0, 71, 0.5], // B4  — winding down
  [11, 1.0, 67, 0.45], // G4  — resolve, loops into next cycle
];

/**
 * Accompaniment: I – V/vi – V – I progression
 * [startBeat, bassHz, innerVoiceHz]
 */
const LULLABY_CHORDS: Array<[number, number, number]> = [
  [0, midiToHz(48), midiToHz(64)], // C3 + E4  (I)
  [4, midiToHz(47), midiToHz(62)], // B2 + D4  (colour chord)
  [8, midiToHz(43), midiToHz(67)], // G2 + G4  (V)
  [12, midiToHz(48), midiToHz(64)], // C3 + E4  (resolve, into next loop)
];

/** Schedule one 12-second lullaby cycle starting at `cycleStart`. */
function scheduleLullaby(ctx: AnyAudioContext, dest: AudioNode, cycleStart: number) {
  for (const [beat, , midi, vel] of LULLABY_MELODY) {
    chime(ctx, dest, cycleStart + beat * BEAT, midiToHz(midi), vel);
  }
  for (const [beat, bassHz, chordHz] of LULLABY_CHORDS) {
    const t = cycleStart + beat * BEAT;
    bassPluck(ctx, dest, t, bassHz, 0.22);
    bassPluck(ctx, dest, t + 0.01, chordHz, 0.14); // tiny stagger = softer blend
  }
}

/* -------------------------------------------------------------------------- */
/*  Raw noise generators (mono Float32 buffers)                               */
/* -------------------------------------------------------------------------- */

function makeNoiseBuffer(ctx: BaseAudioContext, kind: "white" | "pink" | "brown") {
  const length = SAMPLE_RATE * DURATION;
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);

  if (kind === "white") {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else if (kind === "pink") {
    // Paul Kellet's pink noise filter
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.11;
    }
  } else {
    // brown / red noise
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

function noiseSource(ctx: AnyAudioContext, kind: "white" | "pink" | "brown") {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, kind);
  src.loop = true;
  return src;
}

/** Slow amplitude wobble. freq must be an integer / DURATION for seamless loop. */
function addTremolo(ctx: AnyAudioContext, input: AudioNode, freq: number, depth: number) {
  const out = ctx.createGain();
  const base = ctx.createGain();
  base.gain.value = 1 - depth;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = freq;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain);
  lfoGain.connect(out.gain);
  base.connect(out.gain); // bias so gain oscillates around (1-depth)+/-depth
  input.connect(out);
  lfo.start();
  return out;
}

/**
 * Percussive low thump for heartbeats.
 * `time` is an absolute AudioContext timestamp (ctx.currentTime + offset),
 * NOT a 0..DURATION offset — callers are responsible for the translation.
 */
function thump(ctx: AnyAudioContext, dest: AudioNode, time: number, vel: number, freq = 60) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.6, time);
  osc.frequency.exponentialRampToValueAtTime(freq, time + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vel, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
  osc.connect(g);
  g.connect(dest);
  osc.start(time);
  osc.stop(time + 0.3);
}

/** Soft bell-like note for the music box. `time` is an absolute AudioContext timestamp. */
function chime(ctx: AnyAudioContext, dest: AudioNode, time: number, freq: number, vel = 0.6) {
  const decayTime = 2.4;

  // Higher notes are naturally piercing — ease them back a little
  const freqNorm = Math.min(1, Math.max(0, (freq - 200) / 1200));
  const peakGain = vel * (0.55 - freqNorm * 0.18);

  // Fundamental — triangle body
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = freq;

  // 2nd harmonic — adds a delicate sparkle
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;

  // Slightly-detuned tine — chorus shimmer like a real music-box tine
  const osc3 = ctx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = freq * 1.003;

  // Shared envelope: snappy attack → mid-level sustain → long tail
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(peakGain, time + 0.012);
  env.gain.exponentialRampToValueAtTime(peakGain * 0.55, time + 0.07);
  env.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

  const g2 = ctx.createGain();
  g2.gain.value = 0.28;
  const g3 = ctx.createGain();
  g3.gain.value = 0.18;

  osc1.connect(env);
  osc2.connect(g2);
  g2.connect(env);
  osc3.connect(g3);
  g3.connect(env);
  env.connect(dest);

  const stopAt = time + decayTime + 0.05;
  osc1.start(time);
  osc1.stop(stopAt);
  osc2.start(time);
  osc2.stop(stopAt);
  osc3.start(time);
  osc3.stop(stopAt);
}

/** Gentle sine bass pluck, for harmonic support beneath melody notes. */
function bassPluck(ctx: AnyAudioContext, dest: AudioNode, time: number, freq: number, vel = 0.28) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(vel, time + 0.025);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
  osc.connect(env);
  env.connect(dest);
  osc.start(time);
  osc.stop(time + 1.7);
}

/* -------------------------------------------------------------------------- */
/*  Continuous (buffer-based) sound graphs                                    */
/*  Each returns a node that should be connected into the sound's gain.       */
/*  These run forever via AudioBufferSourceNode.loop and need no scheduler.   */
/* -------------------------------------------------------------------------- */

const CONTINUOUS_IDS = new Set<SoundId>([
  "white",
  "pink",
  "brown",
  "rain",
  "ocean",
  "fan",
  "wind",
  "stream",
]);

/** Sounds built from absolutely-scheduled events that must repeat every DURATION. */
const EVENT_IDS = new Set<SoundId>(["heartbeat", "womb", "lullaby"]);

function buildContinuous(ctx: AnyAudioContext, id: SoundId): AudioNode {
  switch (id) {
    case "white": {
      const src = noiseSource(ctx, "white");
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 11000;
      src.connect(lp);
      src.start();
      return lp;
    }
    case "pink": {
      const src = noiseSource(ctx, "pink");
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 8000;
      src.connect(lp);
      src.start();
      return lp;
    }
    case "brown": {
      const src = noiseSource(ctx, "brown");
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1600;
      src.connect(lp);
      src.start();
      return lp;
    }
    case "rain": {
      const src = noiseSource(ctx, "white");
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 700;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 8500;
      src.connect(hp);
      hp.connect(lp);
      src.start();
      return addTremolo(ctx, lp, 1 / 3, 0.12);
    }
    case "ocean": {
      const src = noiseSource(ctx, "brown");
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 650;
      src.connect(lp);
      src.start();
      return addTremolo(ctx, lp, 1 / 6, 0.55);
    }
    case "fan": {
      const src = noiseSource(ctx, "brown");
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const peak = ctx.createBiquadFilter();
      peak.type = "peaking";
      peak.frequency.value = 220;
      peak.gain.value = 6;
      peak.Q.value = 2;
      src.connect(lp);
      lp.connect(peak);
      src.start();
      return addTremolo(ctx, peak, 6, 0.08);
    }
    case "wind": {
      const src = noiseSource(ctx, "pink");
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 500;
      bp.Q.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1 / 4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      src.connect(bp);
      src.start();
      lfo.start();
      return addTremolo(ctx, bp, 1 / 4, 0.4);
    }
    case "stream": {
      const src = noiseSource(ctx, "white");
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1100;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 7000;
      src.connect(hp);
      hp.connect(lp);
      src.start();
      return addTremolo(ctx, lp, 2, 0.18);
    }
    default:
      return ctx.createGain();
  }
}

/**
 * Schedule one DURATION-long cycle of an event-based sound (heartbeat/womb/lullaby)
 * starting at absolute time `cycleStart`. Returns the nodes created so a future
 * teardown could disconnect them if ever needed (currently they free themselves
 * after they finish playing, same as the original synth code).
 */
function scheduleEventCycle(
  ctx: AnyAudioContext,
  id: SoundId,
  dest: AudioNode,
  cycleStart: number,
) {
  if (id === "heartbeat") {
    for (let beat = 0; beat < DURATION; beat++) {
      thump(ctx, dest, cycleStart + beat + 0.0, 1.0);
      thump(ctx, dest, cycleStart + beat + 0.28, 0.6);
    }
  } else if (id === "womb") {
    for (let beat = 0; beat < DURATION; beat++) {
      thump(ctx, dest, cycleStart + beat + 0.0, 0.8, 70);
      thump(ctx, dest, cycleStart + beat + 0.3, 0.45, 70);
    }
  } else if (id === "lullaby") {
    scheduleLullaby(ctx, dest, cycleStart);
  }
}

/* -------------------------------------------------------------------------- */
/*  Offline mix rendering (unchanged purpose: produce a cacheable WAV Blob)   */
/* -------------------------------------------------------------------------- */

export interface ActiveSound {
  id: SoundId;
  volume: number; // 0..1
}

/**
 * Render a mix of active sounds to a seamless looping WAV Blob.
 * Used by offline-store.ts to pre-bake a sound for instant, synthesis-free
 * playback later — NOT used for live mixing anymore (see SoundscapeEngine).
 */
export async function renderMix(active: ActiveSound[]): Promise<Blob> {
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE * DURATION, SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  for (const { id, volume } of active) {
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(master);

    if (CONTINUOUS_IDS.has(id)) {
      const node = buildContinuous(ctx, id);
      node.connect(g);
    } else if (EVENT_IDS.has(id)) {
      scheduleEventCycle(ctx, id, g, 0);
    }
  }

  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const samples = buffer.getChannelData(0);
  const length = samples.length;
  const bytesPerSample = 2;
  const dataSize = length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/* -------------------------------------------------------------------------- */
/*  Live engine: one persistent AudioContext, one GainNode per active sound,  */
/*  crossfaded on toggle/volume-change, plus a lookahead scheduler for the    */
/*  event-based sounds.                                                      */
/* -------------------------------------------------------------------------- */

const SCHEDULER_INTERVAL_MS = 100;
/** How far ahead of "now" we schedule events. Must exceed the tick interval
 * with margin so a delayed timer (e.g. background tab throttling) can't
 * cause a gap. */
const SCHEDULE_AHEAD_SECONDS = 0.3;

interface VoiceHandle {
  id: SoundId;
  gain: GainNode;
  /** Continuous sounds: the single looping source, stopped on teardown. */
  source?: AudioBufferSourceNode;
  /** Event sounds: lookahead scheduler state. */
  scheduler?: {
    timer: ReturnType<typeof setInterval>;
    /** Absolute ctx time of the start of the next not-yet-scheduled cycle. */
    nextCycleStart: number;
  };
}

export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<SoundId, VoiceHandle>();
  /** Cache of decoded offline-rendered buffers, keyed by sound id. */
  private decodedCache = new Map<SoundId, AudioBuffer>();

  /** Lazily create (or resume) the AudioContext. Must be called from a user gesture the first time. */
  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private getMaster(): GainNode {
    this.getContext();
    // getContext() always initializes master alongside ctx.
    return this.master as GainNode;
  }

  /** True once at least one sound has ever been started (i.e. ctx exists). */
  get isInitialized(): boolean {
    return this.ctx !== null;
  }

  get isSuspended(): boolean {
    return this.ctx?.state === "suspended";
  }

  /** Try to decode a cached offline-rendered WAV for `id`, if present. */
  private async getDecodedBuffer(id: SoundId): Promise<AudioBuffer | null> {
    const cached = this.decodedCache.get(id);
    if (cached) return cached;
    try {
      const blob = await getSavedBlob(id);
      if (!blob) return null;
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = this.getContext();
      // decodeAudioData detaches/consumes the buffer, so no reuse concerns here.
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      this.decodedCache.set(id, decoded);
      return decoded;
    } catch (err) {
      console.error(`Failed to decode offline buffer for ${id}:`, err);
      return null;
    }
  }

  /** Start a continuous (buffer-based) sound's source + gain, gain starting at 0. */
  private async startContinuousVoice(id: SoundId): Promise<VoiceHandle> {
    const ctx = this.getContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.getMaster());

    // Prefer a pre-rendered, pre-decoded buffer (cheaper: no live synthesis
    // graph running). Fall back to live synthesis if nothing is cached yet.
    const decoded = await this.getDecodedBuffer(id);
    let source: AudioBufferSourceNode;
    if (decoded) {
      source = ctx.createBufferSource();
      source.buffer = decoded;
      source.loop = true;
      source.connect(gain);
      source.start();
    } else {
      const node = buildContinuous(ctx, id);
      node.connect(gain);
      // buildContinuous's internal source already called .start(); we don't
      // get a direct handle to it here, so teardown is handled by disconnecting
      // the gain node's whole subgraph (see stopVoice).
      source = undefined as unknown as AudioBufferSourceNode;
    }

    return { id, gain, source };
  }

  /** Start an event-based sound's gain + recurring scheduler, gain starting at 0. */
  private startEventVoice(id: SoundId): VoiceHandle {
    const ctx = this.getContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.getMaster());

    const scheduleUpTo = (boundary: number, state: { nextCycleStart: number }) => {
      while (state.nextCycleStart < boundary) {
        scheduleEventCycle(ctx, id, gain, state.nextCycleStart);
        state.nextCycleStart += DURATION;
      }
    };

    const state = { nextCycleStart: ctx.currentTime };
    scheduleUpTo(ctx.currentTime + SCHEDULE_AHEAD_SECONDS, state);

    const timer = setInterval(() => {
      scheduleUpTo(ctx.currentTime + SCHEDULE_AHEAD_SECONDS, state);
    }, SCHEDULER_INTERVAL_MS);

    return { id, gain, scheduler: { timer, nextCycleStart: state.nextCycleStart } };
  }

  /** Ramp a voice's gain to `target` over CROSSFADE_SECONDS. */
  private rampGain(voice: VoiceHandle, target: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const g = voice.gain.gain;
    g.cancelScheduledValues(now);
    // Anchor the ramp at the current actual value to avoid a click if a
    // previous ramp was interrupted mid-flight.
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + CROSSFADE_SECONDS);
  }

  /** Fully stop and tear down a voice (after it has been faded to ~0). */
  private teardownVoice(voice: VoiceHandle) {
    if (voice.scheduler) {
      clearInterval(voice.scheduler.timer);
    }
    if (voice.source) {
      try {
        voice.source.stop();
      } catch {
        /* already stopped */
      }
    }
    // Disconnecting the gain node disconnects everything feeding into it too
    // (synthesis graphs for non-cached continuous sounds, event oscillators
    // that haven't fired yet get silently dropped since they're scheduled
    // but not yet started... actually started ones will still play out their
    // short envelope, which is inaudible under a faded-to-zero gain).
    voice.gain.disconnect();
  }

  /**
   * Bring a sound to `volume` (0..1), crossfading in if it isn't already
   * playing. Safe to call repeatedly (e.g. on slider drag).
   */
  async setVolume(id: SoundId, volume: number): Promise<void> {
    const existing = this.voices.get(id);
    if (existing) {
      this.rampGain(existing, volume);
      return;
    }
    if (volume <= 0) return;

    // Reserve the slot synchronously so rapid toggles don't race and start
    // two voices for the same id while the async setup below is in flight.
    const placeholder: VoiceHandle = EVENT_IDS.has(id)
      ? this.startEventVoice(id)
      : ({ id, gain: this.getContext().createGain() } as VoiceHandle);
    this.voices.set(id, placeholder);

    if (EVENT_IDS.has(id)) {
      this.rampGain(placeholder, volume);
      return;
    }

    // Continuous sound: replace the placeholder gain with the real voice
    // once async decode/setup finishes, preserving target volume.
    const voice = await this.startContinuousVoice(id);
    placeholder.gain.disconnect();
    this.voices.set(id, voice);
    // Re-check: caller may have toggled off again while we were awaiting.
    if (this.voices.get(id) === voice) {
      this.rampGain(voice, volume);
    }
  }

  /** Crossfade a sound out and tear it down once silent. */
  stop(id: SoundId): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    this.rampGain(voice, 0);
    setTimeout(() => this.teardownVoice(voice), CROSSFADE_SECONDS * 1000 + 50);
  }

  /** Immediately silence and tear down every active sound, no crossfade. */
  stopAll(): void {
    for (const [id, voice] of this.voices) {
      this.voices.delete(id);
      try {
        voice.gain.gain.cancelScheduledValues(this.getContext().currentTime);
        voice.gain.gain.value = 0;
      } catch {
        /* ctx may already be gone */
      }
      this.teardownVoice(voice);
    }
  }

  setMasterVolume(volume: number): void {
    const ctx = this.getContext();
    const g = this.getMaster().gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(volume, ctx.currentTime + 0.08);
  }

  /** Ramp master gain to 0 over `seconds`, then call `onComplete` (e.g. to pause/stop). */
  fadeOutMaster(seconds: number, onComplete: () => void): void {
    const ctx = this.getContext();
    const g = this.getMaster().gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + seconds);
    setTimeout(onComplete, seconds * 1000 + 50);
  }

  /** Restore master gain to `volume` immediately (e.g. after a fade-out completes). */
  resetMasterVolume(volume: number): void {
    const ctx = this.getContext();
    const g = this.getMaster().gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(volume, ctx.currentTime);
  }

  get isAnyActive(): boolean {
    return this.voices.size > 0;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  destroy(): void {
    this.stopAll();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.decodedCache.clear();
  }
}
