// SOLMAR — Streets of the Sun. All sound is synthesised with WebAudio: no audio
// files, no network. Created lazily on the first user gesture.
let ctx = null;
let master = null;
let engineOsc = null, engineGain = null;
let sirenOsc = null, sirenGain = null, sirenTimer = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
  const g = ctx.createGain(); g.gain.value = vol || 0.3;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

export const sfx = {
  shoot() { noiseBurst(0.12, 0.5, 2600); tone(180, 0.08, 'square', 0.12, 60); },
  crash() { noiseBurst(0.25, 0.5, 700); tone(90, 0.2, 'sawtooth', 0.15, 40); },
  blip() { tone(880, 0.09, 'sine', 0.18); tone(1320, 0.12, 'sine', 0.12); },
  cash() { tone(1046, 0.1, 'triangle', 0.2); setTimeout(() => tone(1568, 0.16, 'triangle', 0.2), 90); },
  horn() { tone(370, 0.25, 'sawtooth', 0.12); tone(466, 0.25, 'sawtooth', 0.1); },
  wasted() { tone(392, 0.5, 'sawtooth', 0.15, 180); setTimeout(() => tone(311, 0.7, 'sawtooth', 0.15, 130), 350); },
  click() { tone(660, 0.05, 'square', 0.08); },
  heal() { tone(523, 0.12, 'sine', 0.15); setTimeout(() => tone(784, 0.2, 'sine', 0.15), 110); },
};

// Engine hum: one oscillator whose pitch follows speed. Call every frame.
export function updateEngine(driving, speed01) {
  if (!ctx) return;
  if (!driving) {
    if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    return;
  }
  if (!engineOsc) {
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
  engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, ctx.currentTime, 0.1);
}

// Two-tone police siren while any cruiser is chasing.
export function updateSiren(active) {
  if (!ctx) return;
  if (!active) {
    if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    return;
  }
  if (!sirenOsc) {
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start();
    let high = true;
    sirenTimer = setInterval(() => {
      if (!sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setValueAtTime(high ? 880 : 660, ctx.currentTime);
    }, 450);
  }
  sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
}

export function stopAllLoops() {
  updateEngine(false, 0);
  updateSiren(false);
  if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
}
