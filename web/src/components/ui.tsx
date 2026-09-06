import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { initials, STATUS_TONE } from '../lib/format';

// ───────────────────────────── Grundformen ─────────────────────────────

export function Card({
  children,
  className = '',
  delay = 0,
  ...rest
}: { children: ReactNode; className?: string; delay?: number } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`glass rounded-[--radius-card] ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-display text-xl font-semibold tracking-tight text-white/95">{children}</h2>
      {hint ? <div className="text-xs text-white/45">{hint}</div> : null}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
} & HTMLMotionProps<'button'>;

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950 font-semibold shadow-[0_8px_28px_-10px_rgba(200,162,74,0.75)] hover:from-gold-200 hover:to-gold-500',
  outline: 'border border-gold-500/45 text-gold-200 hover:bg-gold-500/10',
  ghost: 'text-white/70 hover:text-white hover:bg-white/6',
  subtle: 'bg-white/6 text-white/85 hover:bg-white/10',
  danger: 'bg-danger/15 text-red-300 border border-danger/35 hover:bg-danger/25',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3.5 text-base gap-2.5',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.lost;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone.bg} ${tone.text}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}

export function Avatar({
  name,
  accent = '#C8A24A',
  size = 36,
  online,
  ring,
}: {
  name: string;
  accent?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className={`flex size-full items-center justify-center rounded-full font-semibold ${ring ? 'ring-2 ring-ink-900' : ''}`}
        style={{
          background: `linear-gradient(140deg, ${accent}42, ${accent}18)`,
          color: accent,
          border: `1px solid ${accent}55`,
          fontSize: Math.max(10, size * 0.36),
        }}
        title={name}
      >
        {initials(name)}
      </span>
      {online !== undefined ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-ink-900 ${online ? 'bg-emerald-400' : 'bg-white/25'}`}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
        />
      ) : null}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium tracking-wide text-white/60 uppercase">
        {label}
        {required ? <span className="text-gold-400">*</span> : null}
        {hint ? <span className="ml-auto text-[10px] normal-case tracking-normal text-white/35">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-red-300">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors outline-none focus:border-gold-500/60 focus:bg-ink-900';

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-white/20">{icon}</div> : null}
      <p className="text-sm font-medium text-white/60">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-white/35">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/15 border-t-gold-400"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Lädt"
    />
  );
}

/** Zahl, die beim Erscheinen hochzählt – für Kennzahlen im Dashboard. */
export function Counter({
  value,
  format = (n: number) => String(Math.round(n)),
  className = '',
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  return (
    <motion.span
      key={value}
      className={className}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {format(value)}
    </motion.span>
  );
}

export function Progress({ value, tone = 'gold' }: { value: number; tone?: 'gold' | 'danger' | 'success' }) {
  const colors = {
    gold: 'from-gold-400 to-gold-600',
    danger: 'from-red-400 to-red-600',
    success: 'from-emerald-400 to-emerald-600',
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${colors}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Weicher, animierter Farbverlauf als Seitenhintergrund. */
export function AuroraBackground({ intensity = 1 }: { intensity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-[10%] -top-[20%] size-[55vw] rounded-full blur-[120px] animate-[float_9s_ease-in-out_infinite]"
        style={{ background: `radial-gradient(circle, rgba(200,162,74,${0.16 * intensity}), transparent 68%)` }}
      />
      <div
        className="absolute -right-[15%] top-[10%] size-[48vw] rounded-full blur-[130px] animate-[float_11s_ease-in-out_infinite_reverse]"
        style={{ background: `radial-gradient(circle, rgba(127,168,184,${0.12 * intensity}), transparent 68%)` }}
      />
      <div
        className="absolute bottom-[-25%] left-[25%] size-[52vw] rounded-full blur-[140px] animate-[float_13s_ease-in-out_infinite]"
        style={{ background: `radial-gradient(circle, rgba(168,139,196,${0.1 * intensity}), transparent 68%)` }}
      />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black, transparent 75%)',
        }}
      />
    </div>
  );
}
