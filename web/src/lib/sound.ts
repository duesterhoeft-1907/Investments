/**
 * Kurzer Signalton fuer neue Leads – per WebAudio erzeugt, damit keine
 * Audiodatei ausgeliefert werden muss. Der erste Ton kommt erst nach einer
 * Nutzerinteraktion, das ist Browser-Politik und kein Fehler.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function playAlert(urgency: 'normal' | 'high' | 'critical' = 'normal'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  const notes = urgency === 'critical' ? [880, 1174, 1568] : urgency === 'high' ? [740, 988] : [660];

  notes.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.11;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.075, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.36);
  });
}
