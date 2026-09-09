/**
 * Der Service Worker.
 *
 * Er hat genau zwei Aufgaben, und beide sind bewusst klein gehalten:
 *
 *   1. Push annehmen und als Meldung anzeigen.
 *   2. Bei fehlendem Netz eine ehrliche Seite zeigen statt des Dinosauriers.
 *
 * Was er ausdrücklich NICHT tut: Skripte und Stile zwischenspeichern. Genau
 * daran ist die Anfrage-Strecke schon einmal gescheitert – ein alter Stand im
 * Zwischenspeicher, und die Seite bleibt leer, ohne dass jemand sieht warum.
 * Ein Zwischenspeicher, der Programmcode hält, muss versionsfest sein; dieser
 * hier soll es gar nicht erst versuchen.
 *
 * Die Push-Meldungen kommen ohne Inhalt. Der Server schickt nur ein Klopfen,
 * den Text holt sich diese Datei selbst über die angemeldete Sitzung. So
 * steht kein Wort aus einer Kundenanfrage bei einem fremden Push-Dienst.
 */

const SPEICHER = 'capital-schale-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(
    caches.open(SPEICHER).then((speicher) => speicher.addAll([OFFLINE])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((name) => name !== SPEICHER).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Nur Seitenaufrufe abfangen – alles andere geht unberührt ins Netz. */
self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== 'GET' || anfrage.mode !== 'navigate') return;

  ereignis.respondWith(
    fetch(anfrage).catch(() => caches.match(OFFLINE)),
  );
});

self.addEventListener('push', (ereignis) => {
  ereignis.waitUntil(melden());
});

async function melden() {
  let titel = '21 Capital Invest';
  let text = 'Es gibt etwas Neues.';
  let ziel = '/app';
  let dringend = false;

  try {
    const antwort = await fetch('/api/notifications?limit=1', { credentials: 'include' });
    if (antwort.ok) {
      const daten = await antwort.json();
      const neueste = (daten.notifications || [])[0];
      if (neueste) {
        titel = neueste.title || titel;
        text = neueste.body || '';
        ziel = neueste.link || ziel;
        dringend = neueste.urgency === 'high';
      }
    }
  } catch (fehler) {
    // Kein Netz oder abgemeldet: dann eben die allgemeine Meldung. Nichts
    // anzuzeigen wäre falsch – der Browser zeigt sonst von sich aus eine.
  }

  await self.registration.showNotification(titel, {
    body: text,
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: 'capital-lead',
    renotify: true,
    requireInteraction: dringend,
    data: { ziel },
  });
}

self.addEventListener('notificationclick', (ereignis) => {
  ereignis.notification.close();
  const ziel = ereignis.notification.data?.ziel || '/app';

  ereignis.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Ein bereits offenes Fenster wird benutzt, statt ein zweites zu öffnen –
    // sonst sammeln sich über den Tag fünf Tabs derselben Anwendung.
    for (const klient of fenster) {
      if (new URL(klient.url).origin === self.location.origin) {
        await klient.focus();
        if ('navigate' in klient) await klient.navigate(ziel);
        return;
      }
    }
    await self.clients.openWindow(ziel);
  })());
});
