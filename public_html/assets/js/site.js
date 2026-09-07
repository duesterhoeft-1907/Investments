/**
 * Startseite – das Wenige, was hier Skript braucht.
 *
 * Die Seite steht vollständig ohne JavaScript: der Text kommt vom Server,
 * jeder Weg ist ein Link. Hier wird nur eingeblendet, was ins Bild kommt,
 * und sanft zu den Ankern gescrollt.
 */

const reveals = document.querySelectorAll('.reveal');

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      // Ein knapper Versatz, damit Geschwister nacheinander erscheinen
      // statt gleichzeitig aufzupoppen.
      entry.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
      entry.target.classList.add('is-in');
      seen.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  reveals.forEach((el) => seen.observe(el));
} else {
  // Ohne Beobachter oder ohne Bewegungswunsch: alles sofort sichtbar.
  reveals.forEach((el) => el.classList.add('is-in'));
}

// Anker weich anfahren, ohne die Adresszeile vollzuschreiben.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.querySelector(link.getAttribute('href'));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
