const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});
const currencyFmt = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const compactFmt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

export const formatDate = (iso?: string | null) => (iso ? dateFmt.format(new Date(iso)) : '–');
export const formatTime = (iso?: string | null) => (iso ? timeFmt.format(new Date(iso)) : '–');
export const formatDateTime = (iso?: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : '–');
export const formatCurrency = (value?: number | null) => currencyFmt.format(value ?? 0);
export const formatCompactCurrency = (value?: number | null) => `${compactFmt.format(value ?? 0)} €`;

/** "vor 3 Min." / "in 2 Std." – Anzeige relativ zur Gegenwart. */
export function formatRelative(iso?: string | null): string {
  if (!iso) return '–';
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;

  const units: Array<[number, string, string]> = [
    [60_000, 'Sek.', 'Sekunden'],
    [3_600_000, 'Min.', 'Minuten'],
    [86_400_000, 'Std.', 'Stunden'],
    [604_800_000, 'Tg.', 'Tagen'],
  ];

  if (abs < 45_000) return past ? 'gerade eben' : 'gleich';
  for (const [limit, short] of units) {
    if (abs < limit) {
      const divisor = limit === 60_000 ? 1000 : limit === 3_600_000 ? 60_000 : limit === 86_400_000 ? 3_600_000 : 86_400_000;
      const value = Math.round(abs / divisor);
      return past ? `vor ${value} ${short}` : `in ${value} ${short}`;
    }
  }
  return formatDate(iso);
}

/** Sekunden als kompakte Dauer: 45s · 7:20 · 2 Std. 5 Min. */
export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '–';
  if (seconds < 60) return `${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}:${String(seconds % 60).padStart(2, '0')} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std. ${minutes % 60} Min.`;
  return `${Math.floor(hours / 24)} Tg. ${hours % 24} Std.`;
}

/** Verbleibende Zeit bis zur SLA-Deadline, inklusive Überschreitung. */
export function countdown(dueIso?: string | null): { text: string; overdue: boolean; seconds: number } {
  if (!dueIso) return { text: '–', overdue: false, seconds: 0 };
  const seconds = Math.round((new Date(dueIso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;
  const text =
    abs >= 3600
      ? `${Math.floor(abs / 3600)}:${String(Math.floor((abs % 3600) / 60)).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${mm}:${String(ss).padStart(2, '0')}`;
  return { text: seconds < 0 ? `+${text}` : text, overdue: seconds < 0, seconds };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export const STATUS_TONE: Record<string, { bg: string; text: string; dot: string }> = {
  new: { bg: 'bg-gold-500/12', text: 'text-gold-300', dot: 'bg-gold-400' },
  contacted: { bg: 'bg-steel-400/12', text: 'text-steel-400', dot: 'bg-steel-400' },
  qualified: { bg: 'bg-orchid-400/12', text: 'text-orchid-400', dot: 'bg-orchid-400' },
  proposal: { bg: 'bg-blue-400/12', text: 'text-blue-300', dot: 'bg-blue-400' },
  won: { bg: 'bg-emerald-400/12', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  lost: { bg: 'bg-white/6', text: 'text-white/45', dot: 'bg-white/35' },
};

export const ACTIVITY_META: Record<string, { label: string; icon: string; tone: string }> = {
  lead_created: { label: 'Anfrage', icon: 'sparkles', tone: 'text-gold-300' },
  assignment: { label: 'Zuweisung', icon: 'user-check', tone: 'text-steel-400' },
  first_contact: { label: 'Erstkontakt', icon: 'zap', tone: 'text-emerald-300' },
  call: { label: 'Anruf', icon: 'phone', tone: 'text-steel-400' },
  email: { label: 'E-Mail', icon: 'mail', tone: 'text-orchid-400' },
  whatsapp: { label: 'WhatsApp', icon: 'message-circle', tone: 'text-emerald-300' },
  meeting: { label: 'Termin', icon: 'calendar', tone: 'text-blue-300' },
  note: { label: 'Notiz', icon: 'sticky-note', tone: 'text-white/70' },
  voice_note: { label: 'Sprachnotiz', icon: 'mic', tone: 'text-gold-300' },
  status_change: { label: 'Status', icon: 'git-branch', tone: 'text-white/70' },
  portal_login: { label: 'Portal', icon: 'log-in', tone: 'text-steel-400' },
  client_message: { label: 'Kundennachricht', icon: 'message-square', tone: 'text-gold-300' },
  offer_sent: { label: 'Angebot', icon: 'file-text', tone: 'text-emerald-300' },
  system: { label: 'System', icon: 'settings', tone: 'text-white/50' },
};

/** Sehr kleiner Markdown-Renderer für Angebotstexte (Überschriften, Listen, Tabellen, fett). */
export function renderMarkdown(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  const out: string[] = [];
  const lines = md.split('\n');
  let listOpen = false;
  let tableRows: string[][] = [];

  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };
  const flushTable = () => {
    if (!tableRows.length) return;
    const [head, ...body] = tableRows;
    out.push('<table><thead><tr>');
    out.push(head.map((c) => `<th>${inline(c)}</th>`).join(''));
    out.push('</tr></thead><tbody>');
    for (const row of body) {
      out.push(`<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
    }
    out.push('</tbody></table>');
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^\s*\|(.+)\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // Trennzeile
      tableRows.push(cells);
      continue;
    }
    flushTable();

    if (!line.trim()) { closeList(); continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { closeList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }

    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  flushTable();
  return out.join('');
}
