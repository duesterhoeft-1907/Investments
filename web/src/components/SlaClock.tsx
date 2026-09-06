import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { countdown, formatDuration } from '../lib/format';

/**
 * Laufende Reaktionsuhr. Solange kein Erstkontakt vorliegt, tickt sie sekuendlich
 * gegen die SLA-Deadline; danach zeigt sie die gemessene Reaktionszeit an.
 */
export function SlaClock({
  dueAt,
  firstContactAt,
  responseSeconds,
  breached,
  size = 'md',
}: {
  dueAt: string | null;
  firstContactAt: string | null;
  responseSeconds: number | null;
  breached: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [, tick] = useState(0);
  const running = !firstContactAt && Boolean(dueAt);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const text = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'font-display text-3xl',
  }[size];

  if (firstContactAt) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-mono tabular-nums ${text} ${
          breached ? 'text-red-300' : 'text-emerald-300'
        }`}
        title={breached ? 'SLA überschritten' : 'Innerhalb der SLA beantwortet'}
      >
        <span className={`size-1.5 rounded-full ${breached ? 'bg-danger' : 'bg-emerald-400'}`} />
        {formatDuration(responseSeconds)}
      </span>
    );
  }

  if (!dueAt) return <span className={`${text} text-white/30`}>–</span>;

  const { text: label, overdue, seconds } = countdown(dueAt);
  const urgent = seconds < 120;

  return (
    <motion.span
      animate={overdue ? { opacity: [1, 0.5, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1.6 }}
      className={`inline-flex items-center gap-1.5 font-mono tabular-nums ${text} ${
        overdue ? 'text-red-300' : urgent ? 'text-gold-300' : 'text-white/70'
      }`}
      title={overdue ? 'Reaktionszeit überschritten' : 'Verbleibende Reaktionszeit'}
    >
      <span
        className={`size-1.5 rounded-full ${overdue ? 'bg-danger' : urgent ? 'bg-gold-400' : 'bg-white/40'}`}
      />
      {label}
    </motion.span>
  );
}
