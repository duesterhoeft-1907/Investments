/**
 * Sprachnotiz direkt im Browser aufnehmen und an den Lead hängen.
 * MediaRecorder gibt es überall, wo es zählt – kein Zusatzpaket nötig.
 */
import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { formatDuration } from './format.js';
import { spinner, toast } from './ui.js';

export function voiceRecorder(leadId, onUploaded) {
  const wrap = h('div.voice-box');
  const state = { mode: 'idle', seconds: 0, blob: null, url: '', note: '', levels: new Array(28).fill(0.08), error: '' };

  let recorder = null;
  let chunks = [];
  let stream = null;
  let audioCtx = null;
  let raf = null;
  let ticker = null;

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (ticker) clearInterval(ticker);
    ticker = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  };

  async function start() {
    state.error = '';
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      state.error = 'Dieser Browser unterstützt keine Sprachaufnahme.';
      return draw();
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      state.seconds = 0;

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find((m) => MediaRecorder.isTypeSupported(m));
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        state.blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (state.url) URL.revokeObjectURL(state.url);
        state.url = URL.createObjectURL(state.blob);
        state.mode = 'review';
        cleanup();
        draw();
      };

      // Pegelanzeige aus dem Live-Signal
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) {
        audioCtx = new Ctor();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          state.levels = [...state.levels.slice(1), Math.max(0.08, Math.min(1, peak * 2.4))];
          paintLevels();
          raf = requestAnimationFrame(loop);
        };
        loop();
      }

      recorder.start();
      state.mode = 'recording';
      ticker = setInterval(() => { state.seconds += 1; paintTimer(); }, 1000);
      draw();
    } catch {
      state.error = 'Zugriff auf das Mikrofon wurde abgelehnt.';
      cleanup();
      draw();
    }
  }

  const discard = () => {
    if (state.url) URL.revokeObjectURL(state.url);
    Object.assign(state, { mode: 'idle', seconds: 0, blob: null, url: '', note: '', levels: new Array(28).fill(0.08) });
    draw();
  };

  async function upload() {
    if (!state.blob) return;
    state.mode = 'uploading';
    draw();
    try {
      const form = new FormData();
      form.append('file', state.blob, `sprachnotiz-${Date.now()}.${state.blob.type.includes('ogg') ? 'ogg' : 'webm'}`);
      form.append('leadId', String(leadId));
      form.append('kind', 'voice');
      form.append('durationS', String(state.seconds));
      form.append('note', state.note);
      await api.upload('/uploads', form);
      discard();
      toast('Sprachnotiz angehängt.');
      await onUploaded();
    } catch (error) {
      state.error = error.message || 'Upload fehlgeschlagen.';
      state.mode = 'review';
      draw();
    }
  }

  let levelBars = [];
  let timerEl = null;

  const paintLevels = () => {
    levelBars.forEach((bar, i) => { bar.style.height = `${state.levels[i] * 100}%`; });
  };
  const paintTimer = () => { if (timerEl) timerEl.textContent = formatDuration(state.seconds); };

  function draw() {
    levelBars = [];
    timerEl = null;

    if (state.mode === 'idle') {
      mount(wrap,
        h('button.row', { style: { gap: '12px', width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '0' }, onclick: start },
          h('span', { style: { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(200,162,74,0.3)', background: 'rgba(200,162,74,0.1)', color: 'var(--gold-300)' } }, icon('mic', 17)),
          h('span',
            h('span', { style: { display: 'block', fontSize: '14px', fontWeight: '500' } }, 'Sprachnotiz aufnehmen'),
            h('span.faint', { style: { display: 'block', fontSize: '12px' } }, 'Gesprächsnotiz diktieren statt tippen'))),
        state.error ? h('p', { style: { marginTop: '8px', fontSize: '12px', color: '#f0a5a2' } }, state.error) : null);
      return;
    }

    if (state.mode === 'recording') {
      const bars = state.levels.map((level) => {
        const bar = h('i', { style: { height: `${level * 100}%` } });
        levelBars.push(bar);
        return bar;
      });
      timerEl = h('span.mono', { style: { fontSize: '14px', color: '#f0a5a2' } }, formatDuration(state.seconds));
      mount(wrap, h('div.row', { style: { gap: '12px' } },
        h('button.rec-btn.live', { 'aria-label': 'Aufnahme beenden', onclick: () => recorder?.stop() }, icon('square', 14)),
        h('div.levels', bars),
        timerEl));
      return;
    }

    mount(wrap, h('div.stack', { style: { gap: '12px' } },
      state.url ? h('audio', { src: state.url, controls: true, style: { width: '100%' } }) : null,
      h('input.input', { placeholder: 'Kurze Beschreibung (optional)', style: { padding: '9px 12px', fontSize: '14px' },
        value: state.note, oninput: (e) => { state.note = e.target.value; } }),
      h('div.row', { style: { gap: '8px' } },
        h('button.btn.btn-primary.btn-sm', { disabled: state.mode === 'uploading', onclick: upload },
          state.mode === 'uploading' ? spinner(14) : icon('upload', 13),
          state.mode === 'uploading' ? 'Wird gespeichert …' : `Anhängen (${formatDuration(state.seconds)})`),
        h('button.btn.btn-ghost.btn-sm', { disabled: state.mode === 'uploading', onclick: discard }, icon('trash', 13), 'Verwerfen')),
      state.error ? h('p', { style: { fontSize: '12px', color: '#f0a5a2' } }, state.error) : null));
  }

  draw();
  return wrap;
}
