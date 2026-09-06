/**
 * Der Puls der Anwendung.
 *
 * Auf Shared Hosting gibt es keine dauerhaften Verbindungen, also fragen wir
 * regelmäßig nach neuen Ereignissen. Für den Nutzer fühlt sich das wie Push
 * an – bei einer Reaktionsfrist von Minuten sind drei Sekunden Verzögerung
 * ohne Bedeutung.
 *
 * Zwei Feinheiten, die den Unterschied machen:
 *   - Im Hintergrundtab wird der Abstand vervierfacht (spart Anfragen).
 *   - Bei Fehlern wächst der Abstand schrittweise, statt weiter zu hämmern.
 */
import { api } from './api.js';

const listeners = new Map();
let cursor = 0;
let timer = null;
let baseInterval = 3000;
let failures = 0;
let running = false;

export const pulse = {
  /** @returns {() => void} Abmeldung */
  on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  },

  start() {
    if (running) return;
    running = true;
    tick();
    document.addEventListener('visibilitychange', onVisibility);
  },

  stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  },

  /** Sofort nachfragen – nach eigenen Aktionen, damit die Ansicht nicht nachhinkt. */
  poke() {
    if (!running) return;
    if (timer) clearTimeout(timer);
    tick();
  },
};

function emit(type, payload) {
  for (const handler of listeners.get(type) || []) {
    try {
      handler(payload);
    } catch (error) {
      console.error('[pulse] Empfänger für "%s" ist gescheitert:', type, error);
    }
  }
}

function onVisibility() {
  // Beim Zurückkehren sofort nachfragen statt bis zum nächsten Takt zu warten.
  if (!document.hidden) pulse.poke();
}

async function tick() {
  if (!running) return;
  try {
    const data = await api.get(`/events?since=${cursor}`);
    failures = 0;
    baseInterval = data.pollIntervalMs || baseInterval;

    if (data.cursor > cursor) cursor = data.cursor;

    emit('counts', { unread: data.unread, chatUnread: data.chatUnread });
    emit('presence', data.online || []);

    for (const event of data.events || []) {
      emit(event.type, { ...event.payload, leadId: event.lead_id, channelId: event.channel_id });
      emit('*', event);
    }
  } catch (error) {
    failures += 1;
    if (error?.status === 401) {
      // Sitzung abgelaufen – der Rahmen entscheidet, was passiert.
      emit('unauthorized', {});
      pulse.stop();
      return;
    }
  }

  if (!running) return;
  const backoff = Math.min(failures, 5) * baseInterval;
  const idle = document.hidden ? 4 : 1;
  timer = setTimeout(tick, baseInterval * idle + backoff);
}
