/**
 * Push aufs Telefon.
 *
 * Der Ablauf ist in jedem Browser derselbe:
 *   1. Service Worker anmelden (er nimmt die Meldungen entgegen),
 *   2. den Menschen um Erlaubnis fragen – ausdrücklich erst auf Knopfdruck,
 *   3. beim Push-Dienst des Browsers anmelden und die Adresse zum Server tragen.
 *
 * Schritt 2 nie ungefragt beim Laden: ein Browser, der einmal abgelehnt hat,
 * fragt nie wieder – dann ist der Weg für dieses Gerät für immer zu.
 */
import { api } from './api.js';

const PFAD = '/sw.js';

export const push = {
  /** Kann dieses Gerät überhaupt Push? iPhone erst ab 16.4 und nur installiert. */
  moeglich() {
    return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  },

  /** Läuft die Anwendung vom Startbildschirm? */
  installiert() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  },

  /** 'granted' | 'denied' | 'default' | 'unmoeglich' */
  stand() {
    return this.moeglich() ? Notification.permission : 'unmoeglich';
  },

  /** Ist dieses Gerät schon angemeldet? */
  async angemeldet() {
    if (!this.moeglich()) return false;
    const registrierung = await navigator.serviceWorker.getRegistration();
    return !!(await registrierung?.pushManager.getSubscription());
  },

  /**
   * Den Service Worker anmelden. Passiert bei jedem Start – er ist auch ohne
   * Push nützlich, weil er ohne Netz eine erklärende Seite zeigt.
   */
  async workerAnmelden() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await navigator.serviceWorker.register(PFAD, { scope: '/' });
    } catch (fehler) {
      console.warn('[push] Service Worker nicht angemeldet:', fehler);
      return null;
    }
  },

  /** Erlaubnis holen und Gerät anmelden. Gibt die Zahl der Geräte zurück. */
  async einschalten() {
    if (!this.moeglich()) {
      throw new Error('Dieses Gerät kann keine Push-Meldungen.');
    }

    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== 'granted') {
      throw new Error(erlaubnis === 'denied'
        ? 'Meldungen sind für diese Seite abgelehnt. Das lässt sich nur in den Einstellungen des Browsers zurücknehmen.'
        : 'Ohne Erlaubnis geht es nicht.');
    }

    const { moeglich, publicKey } = await api.get('/push/key');
    if (!moeglich || !publicKey) {
      throw new Error('Der Server hat keine Push-Schlüssel.');
    }

    const registrierung = await this.workerAnmelden();
    if (!registrierung) throw new Error('Der Service Worker ließ sich nicht anmelden.');
    await navigator.serviceWorker.ready;

    const anmeldung = await registrierung.pushManager.subscribe({
      userVisibleOnly: true,                       // ohne das lehnt Chrome ab
      applicationServerKey: schluesselAlsBytes(publicKey),
    });

    const daten = anmeldung.toJSON();
    const { geraete } = await api.post('/push/subscribe', {
      endpoint: daten.endpoint,
      keys: daten.keys,
    });
    return geraete;
  },

  /** Dieses Gerät wieder abmelden. */
  async ausschalten() {
    const registrierung = await navigator.serviceWorker.getRegistration();
    const anmeldung = await registrierung?.pushManager.getSubscription();
    if (!anmeldung) return 0;

    const { endpoint } = anmeldung.toJSON();
    await anmeldung.unsubscribe();
    const { geraete } = await api.del('/push/subscribe', { endpoint });
    return geraete;
  },

  /** Eine Probe an alle eigenen Geräte. */
  async probe() {
    return api.post('/push/test');
  },
};

/**
 * Der Schlüssel kommt als base64url und muss als Bytefolge übergeben werden.
 * Ohne die Umwandlung lehnt der Browser die Anmeldung wortlos ab.
 */
function schluesselAlsBytes(base64url) {
  const fuellung = '='.repeat((4 - (base64url.length % 4)) % 4);
  const roh = atob((base64url + fuellung).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...roh].map((zeichen) => zeichen.charCodeAt(0)));
}
