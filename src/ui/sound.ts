// Tiny synthesized sounds (no audio files): goal horn and crowd swell.
let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function horn() {
  try {
    const c = ac();
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.08);
    gain.gain.setValueAtTime(0.18, t + 1.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(gain).connect(c.destination);
    for (const f of [155, 196, 233]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start(t);
      o.stop(t + 2.5);
    }
  } catch {
    /* audio unavailable */
  }
}

export function chime() {
  try {
    const c = ac();
    const t = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.6);
      o.connect(g).connect(c.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.7);
    });
  } catch {
    /* audio unavailable */
  }
}
