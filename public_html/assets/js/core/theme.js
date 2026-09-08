/**
 * Hell oder dunkel.
 *
 * Die Wahl steht als data-theme am <html>-Element und in localStorage.
 * Wer nichts gewählt hat, bekommt, was das Betriebssystem sagt – das
 * entscheidet in app.css eine @media-Regel, hier steht dann gar nichts.
 *
 * Warum die Wahl nicht auf dem Server liegt: sie gehört zum Gerät, nicht
 * zum Menschen. Wer am Schreibtisch dunkel arbeitet, will abends auf dem
 * Telefon vielleicht hell. Und sie muss vor dem ersten Bild feststehen,
 * sonst blitzt die falsche Fassung auf – dafür sorgt das kurze Skript im
 * Kopf jeder Seite, nicht diese Datei.
 */
import { h } from './dom.js';
import { icon } from './icons.js';

const SCHLUESSEL = '21ci-theme';

/** Was gerade gilt – auch wenn nichts gewählt wurde. */
export function aktuell() {
  const gesetzt = document.documentElement.dataset.theme;
  if (gesetzt === 'light' || gesetzt === 'dark') return gesetzt;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function setzen(wert) {
  document.documentElement.dataset.theme = wert;
  try {
    localStorage.setItem(SCHLUESSEL, wert);
  } catch {
    // Privater Modus, gesperrter Speicher: dann gilt die Wahl eben nur
    // für diese Seite. Kein Grund, das Umschalten zu verweigern.
  }
  document.dispatchEvent(new CustomEvent('themewechsel', { detail: wert }));
}

export function umschalten() {
  setzen(aktuell() === 'dark' ? 'light' : 'dark');
}

/**
 * Die Schaltfläche.
 *
 * Sie zeigt, wohin es geht, nicht wo man ist: im Dunkeln eine Sonne. Das
 * ist die Lesart, die Leute erwarten – der Knopf verspricht das Ergebnis.
 */
export function umschalter(klasse = '') {
  const el = h('button.theme-knopf' + (klasse ? '.' + klasse : ''), {
    type: 'button',
    'aria-live': 'polite',
  });

  const malen = () => {
    const hell = aktuell() === 'light';
    el.replaceChildren(icon(hell ? 'mond' : 'sonne', 15));
    el.title = hell ? 'Dunkle Ansicht' : 'Helle Ansicht';
    el.setAttribute('aria-label', el.title);
  };

  el.addEventListener('click', () => { umschalten(); malen(); });
  document.addEventListener('themewechsel', malen);
  malen();
  return el;
}
