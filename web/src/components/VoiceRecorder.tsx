import { AnimatePresence, motion } from 'framer-motion';
import { Mic, Square, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatDuration } from '../lib/format';
import { Button, Spinner } from './ui';

/**
 * Sprachnotiz direkt im Browser aufnehmen (MediaRecorder) und an den Lead
 * anhängen. Die Aufnahme landet als Anhang am Aktivitätsstream und ist damit
 * Teil der Dokumentation.
 */
export function VoiceRecorder({ leadId, onUploaded }: { leadId: number; onUploaded: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [levels, setLevels] = useState<number[]>(Array(28).fill(0.08));
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => {
    cleanup();
    if (url) URL.revokeObjectURL(url);
  }, [cleanup, url]);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Dieser Browser unterstützt keine Sprachaufnahme.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setSeconds(0);

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setBlob(recorded);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(recorded);
        });
        setState('review');
        cleanup();
      };

      // Pegelanzeige aus dem Live-Signal
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevels((prev) => [...prev.slice(1), Math.max(0.08, Math.min(1, peak * 2.4))]);
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      }

      recorder.start();
      setState('recording');
    } catch {
      setError('Zugriff auf das Mikrofon wurde abgelehnt.');
      cleanup();
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  function discard() {
    if (url) URL.revokeObjectURL(url);
    setUrl('');
    setBlob(null);
    setNote('');
    setSeconds(0);
    setLevels(Array(28).fill(0.08));
    setState('idle');
  }

  async function upload() {
    if (!blob) return;
    setState('uploading');
    try {
      const form = new FormData();
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('file', blob, `sprachnotiz-${Date.now()}.${ext}`);
      form.append('leadId', String(leadId));
      form.append('kind', 'voice');
      form.append('durationS', String(seconds));
      form.append('note', note);
      await api.upload('/uploads', form);
      discard();
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
      setState('review');
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-ink-900/50 p-3.5">
      <AnimatePresence mode="wait">
        {state === 'idle' ? (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button
              type="button"
              onClick={start}
              className="flex w-full items-center gap-3 text-left transition-opacity hover:opacity-85"
            >
              <span className="flex size-10 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-300">
                <Mic className="size-4.5" />
              </span>
              <span>
                <span className="block text-sm font-medium text-white/85">Sprachnotiz aufnehmen</span>
                <span className="block text-xs text-white/35">Gesprächsnotiz diktieren statt tippen</span>
              </span>
            </button>
          </motion.div>
        ) : null}

        {state === 'recording' ? (
          <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
            <button
              type="button"
              onClick={stop}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger text-white animate-[pulse-ring_2s_infinite]"
              aria-label="Aufnahme beenden"
            >
              <Square className="size-4" fill="currentColor" />
            </button>
            <div className="flex h-9 flex-1 items-center gap-[2px]">
              {levels.map((level, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-gold-400/70 transition-[height] duration-75"
                  style={{ height: `${level * 100}%`, minHeight: 3 }}
                />
              ))}
            </div>
            <span className="font-mono text-sm tabular-nums text-red-300">{formatDuration(seconds)}</span>
          </motion.div>
        ) : null}

        {state === 'review' || state === 'uploading' ? (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {url ? <audio src={url} controls className="w-full" /> : null}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kurze Beschreibung (optional)"
              className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold-500/50"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={upload} disabled={state === 'uploading'}>
                {state === 'uploading' ? <Spinner size={14} /> : <Upload className="size-3.5" />}
                {state === 'uploading' ? 'Wird gespeichert …' : `Anhängen (${formatDuration(seconds)})`}
              </Button>
              <Button size="sm" variant="ghost" onClick={discard} disabled={state === 'uploading'}>
                <Trash2 className="size-3.5" /> Verwerfen
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
