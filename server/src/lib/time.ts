/**
 * Alle Zeitstempel liegen als UTC-Text ("YYYY-MM-DD HH:MM:SS") in SQLite,
 * damit datetime()-Vergleiche in SQL funktionieren. Nach aussen (JSON) geben
 * wir ISO-8601 mit Z aus, damit der Browser korrekt lokalisiert.
 */
export function nowSql(): string {
  return toSql(new Date());
}

export function toSql(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function fromSql(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIso(value: string | null | undefined): string | null {
  const d = fromSql(value);
  return d ? d.toISOString() : null;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function secondsBetween(a: string, b: string): number {
  const from = fromSql(a);
  const to = fromSql(b);
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}
