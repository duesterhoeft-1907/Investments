/** Wiederkehrende Bausteine der Oberfläche. */
import { h, svg } from './dom.js';
import { icon } from './icons.js';
import { countdown, formatDuration, initials } from './format.js';

export function card(className = '', ...children) {
  return h('div.glass' + (className ? '.' + className.split(' ').join('.') : ''), ...children);
}

export function button(label, { variant = 'primary', size = '', iconName, onclick, disabled, type = 'button', className = '' } = {}) {
  const classes = ['btn', 'btn-' + variant];
  if (size) classes.push('btn-' + size);
  if (className) classes.push(...className.split(' '));
  return h(
    'button.' + classes.join('.'),
    { onclick, disabled, type },
    iconName ? icon(iconName, size === 'sm' ? 13 : 15) : null,
    label,
  );
}

export function field(label, control, { required, hint, error } = {}) {
  return h(
    'label.field',
    h('span.label', label, required ? h('span.required', '*') : null, hint ? h('span.hint', hint) : null),
    control,
    error ? h('span.error', error) : null,
  );
}

export function statusBadge(status, label) {
  return h('span.badge.badge-' + status, h('span.dot'), label);
}

/**
 * Bildmarke einer Person.
 *
 * Mit Profilbild das Bild, ohne die Initialen in ihrer Farbe. Das Bild
 * liegt darüber statt an seiner Stelle: fehlt es oder lädt es nicht,
 * stehen darunter weiter die Initialen, und es bleibt kein leeres
 * Kästchen zurück.
 *
 * Der vierte Parameter darf ein Objekt sein ({ avatar, online }) oder
 * wie bisher nur der Anwesenheitszustand – es gibt zu viele Aufrufer,
 * um sie alle anzufassen.
 */
export function avatar(name, accent = '#21b4a6', size = 36, opts) {
  const { avatar: bild, online } = (opts && typeof opts === 'object') ? opts : { online: opts };

  const el = h(
    'span.avatar',
    {
      title: name,
      style: {
        width: size + 'px',
        height: size + 'px',
        fontSize: Math.max(10, Math.round(size * 0.36)) + 'px',
        background: `linear-gradient(140deg, ${accent}42, ${accent}18)`,
        color: accent,
        border: `1px solid ${accent}55`,
      },
    },
    initials(name),
  );

  if (bild) {
    const img = h('img.avatar-bild', {
      src: bild, alt: '', loading: 'lazy', decoding: 'async',
      width: String(size), height: String(size),
    });
    // Lädt es nicht, verschwindet es – die Initialen darunter bleiben.
    img.addEventListener('error', () => img.remove(), { once: true });
    el.appendChild(img);
  }

  if (online !== undefined) {
    const dotSize = Math.max(8, Math.round(size * 0.28));
    el.appendChild(
      h('span.presence.' + (online ? 'on' : 'off'), { style: { width: dotSize + 'px', height: dotSize + 'px' } }),
    );
  }
  return el;
}

export function spinner(size = 18) {
  return h('span.spinner', { style: { width: size + 'px', height: size + 'px' } });
}

export function empty(title, hint) {
  return h('div.empty', h('p.title', title), hint ? h('p.hint', hint) : null);
}

export function progress(value, tone = 'accent') {
  return h('div.progress.' + tone, h('i', { style: { width: Math.max(0, Math.min(100, value)) + '%' } }));
}

export function aurora() {
  return h('div.aurora', h('span'), h('span'), h('span'), h('div.grid'));
}

/**
 * Reaktionsuhr. Läuft die Frist noch, tickt sie sekündlich; nach dem
 * Erstkontakt zeigt sie die gemessene Zeit.
 */
export function slaClock(lead, size = '') {
  const el = h('span.sla' + (size ? '.' + size : ''));

  const paint = () => {
    el.replaceChildren();
    if (lead.firstContactAt) {
      el.className = 'sla ' + (size ? size + ' ' : '') + (lead.slaBreached ? 'overdue' : 'ok');
      el.title = lead.slaBreached ? 'SLA überschritten' : 'Innerhalb der SLA beantwortet';
      el.append(h('span.dot'), formatDuration(lead.responseSeconds));
      return false;
    }
    if (!lead.slaDueAt) {
      el.className = 'sla ' + (size ? size + ' ' : '') + 'running';
      el.append('–');
      return false;
    }
    const { text, state } = countdown(lead.slaDueAt);
    el.className = 'sla ' + (size ? size + ' ' : '') + state;
    el.title = state === 'overdue' ? 'Reaktionszeit überschritten' : 'Verbleibende Reaktionszeit';
    el.append(h('span.dot'), text);
    return true;
  };

  if (paint()) {
    const id = setInterval(() => {
      if (!el.isConnected) {
        clearInterval(id);
        return;
      }
      paint();
    }, 1000);
  }
  return el;
}

/** Kurzer Hinweis am unteren Rand – für Bestätigungen und Fehler. */
export function toast(message, tone = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = h('div.toast-host');
    document.body.appendChild(host);
  }
  const el = h('div.toast.toast-' + tone, message);
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

/** Kleines Balkendiagramm als reines SVG – keine Diagrammbibliothek nötig. */
export function barChart(rows, { height = 200, color = 'var(--accent-500)' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const barHeight = 22;
  const gap = 8;
  const labelWidth = 132;
  const width = 460;
  const total = rows.length * (barHeight + gap);

  return svg(
    'svg',
    { viewBox: `0 0 ${width} ${Math.max(height, total)}`, width: '100%', height: Math.max(height, total), role: 'img' },
    rows.map((row, i) => {
      const y = i * (barHeight + gap);
      const w = Math.max(2, ((width - labelWidth - 60) * row.value) / max);
      return svg(
        'g',
        {},
        svg('text', { x: labelWidth - 10, y: y + 15, 'text-anchor': 'end', fill: 'var(--text-dim)', 'font-size': '11' }, row.label),
        svg('rect', { x: labelWidth, y, width: w, height: barHeight, rx: 6, fill: row.color || color, opacity: '0.85' }),
        svg('text', { x: labelWidth + w + 8, y: y + 15, fill: 'var(--text-dim)', 'font-size': '11' }, String(row.value)),
      );
    }),
  );
}

/** Flächendiagramm für den Verlauf. */
export function areaChart(points, { height = 220, width = 700 } = {}) {
  if (!points.length) return empty('Noch keine Daten im Zeitraum.');

  const padding = { top: 16, right: 12, bottom: 26, left: 30 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...points.map((p) => p.value), ...points.map((p) => p.second || 0));

  const x = (i) => padding.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
  const y = (v) => padding.top + innerH - (innerH * v) / max;

  const line = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key] || 0).toFixed(1)}`).join(' ');
  const area = `${line('value')} L${x(points.length - 1).toFixed(1)},${padding.top + innerH} L${x(0).toFixed(1)},${padding.top + innerH} Z`;

  const gridLines = [0, 0.5, 1].map((f) =>
    svg('line', {
      x1: padding.left, x2: width - padding.right,
      y1: padding.top + innerH * f, y2: padding.top + innerH * f,
      stroke: 'rgba(var(--auf), 0.05)',
    }),
  );

  return svg(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', preserveAspectRatio: 'none' },
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: 'areaFill', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0%', 'stop-color': '#21b4a6', 'stop-opacity': '0.42' }),
        svg('stop', { offset: '100%', 'stop-color': '#21b4a6', 'stop-opacity': '0' }),
      ),
    ),
    gridLines,
    svg('path', { d: area, fill: 'url(#areaFill)' }),
    svg('path', { d: line('value'), fill: 'none', stroke: '#21b4a6', 'stroke-width': '2' }),
    points.some((p) => p.second) ? svg('path', { d: line('second'), fill: 'none', stroke: '#3fae86', 'stroke-width': '2' }) : null,
    points.map((p, i) =>
      i % Math.ceil(points.length / 6) === 0
        ? svg('text', { x: x(i), y: height - 6, 'text-anchor': 'middle', fill: 'var(--text-dim)', 'font-size': '10' }, p.label)
        : null,
    ),
    svg('text', { x: 4, y: padding.top + 4, fill: 'var(--text-dim)', 'font-size': '10' }, String(max)),
  );
}

export { icon };


/**
 * Das Wortbild der Marke.
 *
 * Die Datei stammt unverändert aus dem Auftritt des Unternehmens; sie ist
 * hell auf durchsichtigem Grund und steht deshalb nur auf dunklen Flächen.
 * `alt` bleibt leer, wo direkt daneben der Name im Text steht – sonst liest
 * ein Screenreader ihn zweimal.
 */
export function logo(height = 30, { alt = '21 Capital Invest' } = {}) {
  return h('img.brand-logo', {
    src: '/assets/brand/logo.png',
    alt,
    width: String(Math.round(height * 3)),
    height: String(height),
    style: { height: height + 'px', width: 'auto', display: 'block' },
  });
}
