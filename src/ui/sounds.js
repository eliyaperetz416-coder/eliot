// Rest-timer sounds, synthesised with WebAudio (no files). OUR DESIGN. 'beep' is the default; the others come from the shop.
const tone = (ctx, { at = 0, freq = 880, dur = 0.2, type = 'sine', gain = 0.35, to = null }) => {
  const now = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, now); if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(ctx.destination); o.start(now); o.stop(now + dur + 0.02);
};

export const SOUNDS = {
  beep: (c) => [0, 0.22, 0.44].forEach((d, i) => tone(c, { at: d, freq: i === 2 ? 1175 : 880, dur: 0.18 })),
  bell: (c) => { tone(c, { freq: 1568, dur: 1.1, gain: 0.3 }); tone(c, { freq: 2349, dur: 0.8, gain: 0.12 }); tone(c, { at: 0.5, freq: 1568, dur: 0.9, gain: 0.2 }); },
  gong: (c) => { tone(c, { freq: 110, dur: 1.8, gain: 0.45 }); tone(c, { freq: 165, dur: 1.5, gain: 0.2 }); tone(c, { freq: 233, dur: 1.2, gain: 0.1, type: 'triangle' }); },
  whistle: (c) => { tone(c, { freq: 2600, to: 3000, dur: 0.35, gain: 0.25, type: 'triangle' }); tone(c, { at: 0.45, freq: 2600, to: 3000, dur: 0.55, gain: 0.25, type: 'triangle' }); },
  pulse: (c) => [0, 0.12, 0.24, 0.36, 0.48].forEach((d, i) => tone(c, { at: d, freq: 440 + i * 110, dur: 0.1, type: 'square', gain: 0.12 })),
};
export const playSound = (ctx, id) => { try { (SOUNDS[id] ?? SOUNDS.beep)(ctx); } catch { /* no audio */ } };
