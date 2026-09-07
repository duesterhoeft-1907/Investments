/**
 * Ziehen und Ablegen – mit Zeigereignissen, nicht mit der HTML5-Schnittstelle.
 *
 * Der Grund ist schlicht: HTML5-Drag-and-Drop gibt es auf Touchgeräten nicht.
 * Wer die Zuordnung am iPad öffnet, hätte sonst eine Oberfläche vor sich, die
 * nichts tut. Zeigereignisse decken Maus, Stift und Finger mit demselben Code
 * ab.
 *
 * Bewusst klein gehalten: ein Ziehbares, eine Ablagefläche, ein Geist, der
 * dem Finger folgt. Alles Weitere entscheidet die Seite.
 */

const zones = new Set();
let active = null;

/** Was gezogen werden kann. `payload` bekommt die Ablagefläche zu sehen. */
export function dragSource(el, { payload, onStart, onEnd } = {}) {
  el.classList.add('draggable');
  // Ohne das scrollt der Finger die Seite, statt die Karte zu ziehen.
  el.style.touchAction = 'none';

  el.addEventListener('pointerdown', (event) => {
    // Nur die linke Maustaste; und nichts, worauf man auch klicken kann.
    if (event.button !== 0) return;
    if (event.target.closest('button, a, select, input, textarea')) return;

    const start = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let ghost = null;

    const move = (e) => {
      if (!ghost) {
        // Erst ab ein paar Pixeln ziehen – sonst wird jeder Klick zum Zug.
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        ghost = makeGhost(el, e);
        active = { payload, el, ghost, zone: null };
        el.classList.add('is-dragging');
        el.setPointerCapture(pointerId);
        onStart?.();
      }

      ghost.style.transform = `translate3d(${e.clientX - ghost._dx}px, ${e.clientY - ghost._dy}px, 0)`;
      highlight(findZone(e.clientX, e.clientY, payload));
    };

    const up = (e) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);

      if (!ghost) return;   // war doch nur ein Klick

      const zone = findZone(e.clientX, e.clientY, payload);
      ghost.remove();
      el.classList.remove('is-dragging');
      highlight(null);
      active = null;
      onEnd?.();

      if (zone) zone.handler(payload);
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });

  return el;
}

/** Wohin abgelegt werden darf. */
export function dropZone(el, { accepts, onDrop } = {}) {
  const entry = { el, accepts: accepts ?? (() => true), handler: onDrop ?? (() => {}) };
  zones.add(entry);
  // Die Seite baut sich bei jeder Änderung neu auf; alte Flächen müssen weg,
  // sonst zeigt der Zeiger irgendwann auf Knoten, die es nicht mehr gibt.
  queueMicrotask(() => {
    for (const z of [...zones]) {
      if (!z.el.isConnected) zones.delete(z);
    }
  });
  return el;
}

function makeGhost(el, event) {
  const box = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('is-dragging');
  Object.assign(ghost.style, {
    position: 'fixed', left: '0', top: '0', margin: '0',
    width: box.width + 'px', pointerEvents: 'none', zIndex: '9999',
  });
  ghost._dx = event.clientX - box.left;
  ghost._dy = event.clientY - box.top;
  ghost.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
  document.body.append(ghost);
  return ghost;
}

function findZone(x, y, payload) {
  for (const zone of zones) {
    if (!zone.el.isConnected) continue;
    const box = zone.el.getBoundingClientRect();
    const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    if (inside && zone.accepts(payload)) return zone;
  }
  return null;
}

function highlight(zone) {
  for (const z of zones) {
    if (z.el.isConnected) z.el.classList.toggle('drop-over', z === zone);
  }
  if (active) active.zone = zone;
}
