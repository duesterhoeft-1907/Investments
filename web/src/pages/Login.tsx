import { motion } from 'framer-motion';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuroraBackground, Button, Field, inputClass, Spinner } from '../components/ui';
import { useSession } from '../lib/session';

export default function Login() {
  const { user, loading, login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Spinner size={30} />
      </div>
    );
  }
  if (user) return <Navigate to="/app" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ink-950 px-5">
      <AuroraBackground intensity={0.7} />

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <Link to="/" className="font-display text-xl font-semibold tracking-[0.24em] gold-text">
            21 CAPITAL INVEST
          </Link>
          <p className="mt-2 text-xs tracking-[0.16em] text-white/30 uppercase">Lead & CRM Suite</p>
        </div>

        <form onSubmit={submit} className="glass space-y-5 rounded-[--radius-card] p-7">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-gold-300">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-semibold text-white">Anmelden</h1>
              <p className="text-xs text-white/40">Interner Zugang für Berater</p>
            </div>
          </div>

          <Field label="E-Mail" required>
            <input
              type="email" className={inputClass} value={email} autoComplete="username"
              onChange={(e) => setEmail(e.target.value)} required
            />
          </Field>

          <Field label="Passwort" required>
            <input
              type="password" className={inputClass} value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} required
            />
          </Field>

          {error ? (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </motion.p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Spinner size={16} /> : null}
            {busy ? 'Wird geprüft …' : 'Anmelden'}
            {busy ? null : <ArrowRight className="size-4" />}
          </Button>

          <div className="rounded-xl border border-white/8 bg-ink-900/50 p-3.5 text-[11px] leading-relaxed text-white/40">
            <p className="mb-1.5 flex items-center gap-1.5 font-medium text-white/55">
              <ShieldCheck className="size-3.5 text-gold-500/70" /> Demo-Zugänge
            </p>
            <p>
              <code className="text-gold-200/80">admin@21capitalinvest.de</code> · Geschäftsführung
              <br />
              <code className="text-gold-200/80">j.ahrens@21capitalinvest.de</code> · Berater Edelmetalle
              <br />
              Passwort für alle: <code className="text-gold-200/80">Invest2026!</code>
            </p>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-white/30">
          <Link to="/" className="transition-colors hover:text-gold-300">
            ← Zur öffentlichen Anfrage-Strecke
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
