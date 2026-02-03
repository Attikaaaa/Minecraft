let audioCtx = null;
let masterGain = null;
let sfxEnabled = true;
let masterVolume = 0.25;

const ensureContext = () => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
};

const resumeIfNeeded = (ctx) => {
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
};

const playTone = (opts) => {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  resumeIfNeeded(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || "square";
  osc.frequency.setValueAtTime(opts.freq || 220, now);
  if (opts.sweep) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweep), now + (opts.duration || 0.15));
  }
  const volume = (opts.volume ?? 0.2) * masterVolume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (opts.duration || 0.15));
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + (opts.duration || 0.15));
};

const playNoise = (opts) => {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  resumeIfNeeded(ctx);
  const duration = opts.duration || 0.1;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.8;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType || "lowpass";
  filter.frequency.value = opts.filterFreq || 900;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const volume = (opts.volume ?? 0.2) * masterVolume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(now);
  source.stop(now + duration);
};

export const setSfxEnabled = (value) => {
  sfxEnabled = Boolean(value);
};

export const isSfxEnabled = () => sfxEnabled;

export const setSfxVolume = (value) => {
  const next = Math.max(0, Math.min(1, Number(value) || 0));
  masterVolume = next;
  if (masterGain) masterGain.gain.value = masterVolume;
};

export const playSfx = (name) => {
  if (!sfxEnabled) return;
  switch (name) {
    case "break":
      playNoise({ duration: 0.12, volume: 0.35, filterFreq: 600 });
      break;
    case "place":
      playNoise({ duration: 0.05, volume: 0.25, filterFreq: 1200 });
      break;
    case "hurt":
      playTone({ freq: 160, sweep: 90, duration: 0.18, volume: 0.35, type: "sawtooth" });
      break;
    case "eat":
      playTone({ freq: 520, sweep: 380, duration: 0.12, volume: 0.2, type: "triangle" });
      playTone({ freq: 420, sweep: 320, duration: 0.12, volume: 0.18, type: "triangle" });
      break;
    case "door":
      playTone({ freq: 220, sweep: 140, duration: 0.08, volume: 0.22, type: "square" });
      break;
    case "chest":
      playTone({ freq: 260, sweep: 180, duration: 0.1, volume: 0.25, type: "square" });
      break;
    case "furnace":
      playTone({ freq: 180, sweep: 120, duration: 0.09, volume: 0.2, type: "square" });
      break;
    default:
      playTone({ freq: 300, duration: 0.08, volume: 0.15, type: "square" });
      break;
  }
};
