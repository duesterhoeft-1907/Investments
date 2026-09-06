/** Datum, Geld, Dauer – alles auf Deutsch und mit der Zeitzone des Browsers. */

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const currencyFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '–');
export const formatTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '–');
export const formatDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '–');
export const formatCurrency = (value) => currencyFmt.format(value || 0);
export const formatCompact = (value) => `${compactFmt.format(value || 0)} €`;

/** "vor 3 Min." / "in 2 Std." */
export function formatRelative(iso) {
  if (!iso) return '–';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  if (abs < 45000) return past ? 'gerade eben' : 'gleich';

  const units = [
    [60000, 1000, 'Sek.'],
    [3600000, 60000, 'Min.'],
    [86400000, 3600000, 'Std.'],
    [604800000, 86400000, 'Tg.'],
  ];
  for (const [limit, divisor, label] of units) {
    if (abs < limit) {
      const value = Math.round(abs / divisor);
      return past ? `vor ${value} ${label}` : `in ${value} ${label}`;
    }
  }
  return formatDate(iso);
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '–';
  if (seconds < 60) return `${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}:${String(seconds % 60).padStart(2, '0')} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std. ${minutes % 60} Min.`;
  return `${Math.floor(hours / 24)} Tg. ${hours % 24} Std.`;
}

/** Restzeit bis zur Frist – auch negativ, dann mit Pluszeichen. */
export function countdown(dueIso) {
  if (!dueIso) return { text: '–', state: 'running', seconds: 0 };
  const seconds = Math.round((new Date(dueIso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;
  const text =
    abs >= 3600
      ? `${Math.floor(abs / 3600)}:${String(Math.floor((abs % 3600) / 60)).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${mm}:${String(ss).padStart(2, '0')}`;
  return {
    text: seconds < 0 ? `+${text}` : text,
    state: seconds < 0 ? 'overdue' : seconds < 120 ? 'urgent' : 'running',
    seconds,
  };
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export const ACTIVITY_META = {
  lead_created:   { label: 'Anfrage',         color: 'var(--gold-300)' },
  assignment:     { label: 'Zuweisung',       color: 'var(--steel-400)' },
  first_contact:  { label: 'Erstkontakt',     color: '#7fd3a6' },
  call:           { label: 'Anruf',           color: 'var(--steel-400)' },
  email:          { label: 'E-Mail',          color: 'var(--orchid-400)' },
  whatsapp:       { label: 'WhatsApp',        color: '#7fd3a6' },
  meeting:        { label: 'Termin',          color: '#9db6ff' },
  note:           { label: 'Notiz',           color: 'rgba(232,237,243,0.7)' },
  voice_note:     { label: 'Sprachnotiz',     color: 'var(--gold-300)' },
  status_change:  { label: 'Status',          color: 'rgba(232,237,243,0.7)' },
  portal_login:   { label: 'Portal',          color: 'var(--steel-400)' },
  client_message: { label: 'Kundennachricht', color: 'var(--gold-300)' },
  offer_sent:     { label: 'Angebot',         color: '#7fd3a6' },
  system:         { label: 'System',          color: 'rgba(232,237,243,0.5)' },
};

/**
 * Sehr kleiner Markdown-Übersetzer für Angebotstexte: Überschriften, Listen,
 * Tabellen, Zitate, fett und kursiv. Escaped grundsätzlich zuerst, damit aus
 * einem Angebotstext niemals Markup wird.
 */
export function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  const out = [];
  let listOpen = false;
  let table = [];
  let para = [];

  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };
  // Aufeinanderfolgende Zeilen gehören zu einem Absatz – erst eine Leerzeile
  // (oder ein anderes Element) schließt ihn ab. Sonst zerfällt jeder Satz,
  // der im Quelltext umbrochen ist, in einen eigenen Absatz.
  const closePara = () => {
    if (para.length) { out.push(`<p>${para.join(' ')}</p>`); para = []; }
  };
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table;
    out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
    for (const row of rows) out.push('<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    out.push('</tbody></table>');
    table = [];
  };

  for (const raw of String(md || '').split('\n')) {
    const line = raw.trimEnd();

    if (/^\s*\|(.+)\|\s*$/.test(line)) {
      closePara();
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) table.push(cells);
      continue;
    }
    flushTable();

    if (!line.trim()) { closePara(); closeList(); continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) { closePara(); closeList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { closePara(); closeList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }

    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      closePara();
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }

    closeList();
    para.push(inline(line));
  }
  closePara();
  closeList();
  flushTable();
  return out.join('');
}
