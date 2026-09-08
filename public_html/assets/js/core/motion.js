/**
 * Bewegung.
 *
 * Alles hier ist Zierrat – und Zierrat darf nichts kaputtmachen. Deshalb
 * drei Regeln, an die sich jede Funktion hält:
 *
 *   1. Nur transform, opacity und filter. Alles andere lässt den Browser
 *      das Layout neu rechnen, und auf einem drei Jahre alten Telefon
 *      sieht man das sofort.
 *   2. Wer "Bewegung reduzieren" eingestellt hat, bekommt keine. Nicht
 *      weniger, keine. Für manche Menschen ist das kein Geschmack,
 *      sondern Übelkeit.
 *   3. Zeigergesteuertes gibt es nur, wo es einen Zeiger gibt. Auf dem
 *      Telefon übernimmt der Finger (Druck) und das Scrollen.
 */

/** Hat die Person Bewegung abbestellt? */
export const ruhig = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Gibt es einen echten Zeiger – Maus oder Trackpad? */
export const zeiger = () =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Neigung und Lichtschein unter dem Zeiger.
 *
 * Die Karte kippt ein paar Grad in die Richtung, in die man zeigt, und
 * unter dem Zeiger liegt ein heller Fleck. Das ist der ganze Tiefeneffekt:
 * zwei Zahlen, die als CSS-Variablen am Element landen – gerechnet wird in
 * CSS, nicht hier.
 */
export function neigen(el, { staerke = 7 } = {}) {
  if (ruhig() || !zeiger()) return el;

  let rahmen = 0;
  const bewegen = (e) => {
    if (rahmen) return;
    // Ein Bild pro Frame reicht. Ohne die Bremse rechnet der Browser bei
    // schneller Mausbewegung dreimal so oft, ohne dass man es sieht.
    rahmen = requestAnimationFrame(() => {
      rahmen = 0;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--neig-x', ((0.5 - y) * staerke).toFixed(2) + 'deg');
      el.style.setProperty('--neig-y', ((x - 0.5) * staerke).toFixed(2) + 'deg');
      el.style.setProperty('--schein-x', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--schein-y', (y * 100).toFixed(1) + '%');
    });
  };

  const zurueck = () => {
    cancelAnimationFrame(rahmen);
    rahmen = 0;
    el.style.setProperty('--neig-x', '0deg');
    el.style.setProperty('--neig-y', '0deg');
  };

  el.addEventListener('pointermove', bewegen);
  el.addEventListener('pointerleave', zurueck);
  return el;
}

/**
 * Einblenden, sobald etwas ins Bild kommt.
 *
 * Nicht alles auf einmal beim Laden: was unten steht, blendet erst ein,
 * wenn man dort ankommt. Der Versatz je Element macht daraus eine
 * Bewegung statt eines Blitzes.
 */
export function zeigen(elemente, { versatz = 55, max = 400 } = {}) {
  const liste = [...elemente];
  if (ruhig()) {
    liste.forEach((el) => el.classList.add('ist-da'));
    return;
  }

  liste.forEach((el, i) => {
    el.classList.add('kommt');
    el.style.setProperty('--verzug', Math.min(i * versatz, max) + 'ms');
  });

  // Ohne IntersectionObserver – ältere Browser, Testumgebungen – ist
  // sichtbar besser als unsichtbar.
  if (!('IntersectionObserver' in window)) {
    liste.forEach((el) => el.classList.add('ist-da'));
    return;
  }

  const beobachter = new IntersectionObserver(
    (eintraege) => {
      for (const e of eintraege) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('ist-da');
        beobachter.unobserve(e.target);
      }
    },
    // Der Rand wird nach unten aufgeweitet, nicht verkleinert. Ein
    // negativer Rand sieht ruhiger aus, hat aber eine tote Zone am unteren
    // Bildschirmrand: was dort liegt – hinter der klebenden Steuerleiste
    // etwa – löst nie aus und bleibt für immer unsichtbar. Lieber eine
    // Spur zu früh einblenden als gar nicht.
    { rootMargin: '0px 0px 12% 0px', threshold: 0 },
  );
  liste.forEach((el) => beobachter.observe(el));
}

/**
 * Der Hintergrund folgt dem Scrollen.
 *
 * Die Nebelflecken wandern langsamer als die Seite. Das erzeugt Tiefe,
 * ohne dass irgendwo ein zweites Bild geladen würde.
 */
export function hintergrundBewegen(wurzel = document) {
  if (ruhig()) return () => {};
  const aurora = wurzel.querySelector('.aurora');
  if (!aurora) return () => {};

  let rahmen = 0;
  const rechnen = () => {
    rahmen = 0;
    const y = window.scrollY || 0;
    aurora.style.setProperty('--scroll', (y * 0.06).toFixed(1) + 'px');
  };
  const beimScrollen = () => { if (!rahmen) rahmen = requestAnimationFrame(rechnen); };

  window.addEventListener('scroll', beimScrollen, { passive: true });
  rechnen();
  return () => window.removeEventListener('scroll', beimScrollen);
}

/**
 * Kurzes Rütteln am Telefon, wenn eine Wahl sitzt.
 *
 * Android kennt das, iOS ignoriert es stillschweigend. Zehn Millisekunden
 * sind ein Tippen, kein Alarm.
 */
export function tippen(dauer = 10) {
  if (ruhig()) return;
  navigator.vibrate?.(dauer);
}
