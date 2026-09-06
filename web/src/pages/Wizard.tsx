import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Bitcoin, Building2, ChartCandlestick, Check, ClipboardCopy,
  Coins, Diamond, Gem, Layers, Lock, type LucideIcon, Mail, Palette, Phone,
  ShieldCheck, Sparkles, Timer, TrendingUp, User,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { WizardConfig } from '../lib/types';
import { AuroraBackground, Button, Field, inputClass, Spinner } from '../components/ui';

const ICONS: Record<string, LucideIcon> = {
  coins: Coins, layers: Layers, gem: Gem, 'building-2': Building2, diamond: Diamond,
  palette: Palette, 'trending-up': TrendingUp, 'chart-candlestick': ChartCandlestick, bitcoin: Bitcoin,
};

interface FormState {
  assetClassSlug: string;
  volumeBand: string;
  horizon: string;
  experience: string;
  goal: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  postalCode: string;
  city: string;
  contactPref: string;
  contactWindow: string;
  message: string;
  consentContact: boolean;
  consentMarketing: boolean;
  website: string; // Honeypot
}

const EMPTY: FormState = {
  assetClassSlug: '', volumeBand: '', horizon: '', experience: '', goal: '',
  firstName: '', lastName: '', email: '', phone: '', company: '', postalCode: '', city: '',
  contactPref: 'phone', contactWindow: 'flexibel', message: '',
  consentContact: false, consentMarketing: false, website: '',
};

interface SubmitResult {
  ref: string;
  slaMinutes: number;
  team: string | null;
  assetClass: string | null;
  contact: { name: string; title: string; phone: string; email: string } | null;
  portal: { url: string; token: string; email: string; password: string };
}

const STEPS = ['Fachgebiet', 'Volumen', 'Profil', 'Kontakt', 'Bestätigung'] as const;

export default function Wizard() {
  const [config, setConfig] = useState<WizardConfig | null>(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [fatal, setFatal] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<WizardConfig>('/public/wizard-config')
      .then(setConfig)
      .catch(() => setFatal('Die Anfrage-Strecke ist gerade nicht erreichbar. Bitte später erneut versuchen.'));
  }, []);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step, result]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const selectedAsset = useMemo(
    () => config?.assetClasses.find((a) => a.slug === form.assetClassSlug) ?? null,
    [config, form.assetClassSlug],
  );

  const slaMinutes = selectedAsset?.slaMinutes ?? config?.defaultSlaMinutes ?? 15;

  function validate(current: number): boolean {
    const next: Record<string, string> = {};
    if (current === 0 && !form.assetClassSlug) next.assetClassSlug = 'Bitte ein Fachgebiet wählen.';
    if (current === 1) {
      if (!form.volumeBand) next.volumeBand = 'Bitte ein Anlagevolumen wählen.';
      if (!form.horizon) next.horizon = 'Bitte einen Anlagehorizont wählen.';
    }
    if (current === 3) {
      if (form.firstName.trim().length < 2) next.firstName = 'Bitte Vornamen angeben.';
      if (form.lastName.trim().length < 2) next.lastName = 'Bitte Nachnamen angeben.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = 'Bitte gültige E-Mail-Adresse angeben.';
      if (form.contactPref !== 'email' && form.phone.trim().length < 6) {
        next.phone = 'Für den Rückruf brauchen wir eine Telefonnummer.';
      }
      if (!form.consentContact) next.consentContact = 'Ohne Einwilligung dürfen wir nicht anrufen.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /**
   * `skipValidation` wird gesetzt, wenn der Schritt durch die Auswahl selbst
   * bereits erfuellt ist – der State ist zu diesem Zeitpunkt noch nicht
   * uebernommen, eine erneute Pruefung wuerde auf dem alten Wert scheitern.
   */
  function go(delta: 1 | -1, skipValidation = false) {
    if (delta === 1 && !skipValidation && !validate(step)) return;
    setDirection(delta);
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + delta)));
  }

  async function submit() {
    if (!validate(3)) return;
    setSubmitting(true);
    setErrors({});
    try {
      const payload = await api.post<SubmitResult>('/public/leads', {
        ...form,
        country: 'DE',
        consentContact: true,
      });
      setResult(payload);
      setDirection(1);
      setStep(4);
    } catch (err) {
      if (err instanceof ApiError && err.issues?.length) {
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
        setStep(3);
      } else {
        setErrors({ _: err instanceof Error ? err.message : 'Unbekannter Fehler.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (fatal) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-32 text-center">
          <p className="text-lg text-white/70">{fatal}</p>
        </div>
      </Shell>
    );
  }

  if (!config) {
    return (
      <Shell>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Spinner size={32} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div ref={topRef} />
      <Hero company={config.company.name} slaMinutes={slaMinutes} hidden={step > 0 || Boolean(result)} />

      <div className="mx-auto w-full max-w-3xl px-5 pb-24">
        {!result ? <Stepper step={step} /> : null}

        <div className="relative mt-8 min-h-[26rem]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -48 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 ? (
                <StepAsset
                  config={config}
                  value={form.assetClassSlug}
                  error={errors.assetClassSlug}
                  onSelect={(slug) => {
                    set('assetClassSlug', slug);
                    // Kurze Pause, damit die Auswahl sichtbar quittiert wird.
                    setTimeout(() => go(1, true), 260);
                  }}
                />
              ) : null}
              {step === 1 ? <StepVolume config={config} form={form} set={set} errors={errors} /> : null}
              {step === 2 ? <StepProfile config={config} form={form} set={set} /> : null}
              {step === 3 ? <StepContact config={config} form={form} set={set} errors={errors} slaMinutes={slaMinutes} /> : null}
              {step === 4 && result ? <StepDone result={result} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>

        {!result ? (
          <div className="mt-10 flex items-center justify-between gap-4">
            <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>
              <ArrowLeft className="size-4" /> Zurück
            </Button>

            {errors._ ? <span className="text-sm text-red-300">{errors._}</span> : null}

            {step < 3 ? (
              <Button size="lg" onClick={() => go(1)}>
                Weiter <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={submit} disabled={submitting}>
                {submitting ? <Spinner size={16} /> : <Sparkles className="size-4" />}
                {submitting ? 'Wird gesendet …' : 'Anfrage absenden'}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

// ───────────────────────────── Rahmen ─────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <AuroraBackground />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-7">
        <Link to="/" className="font-display text-lg font-semibold tracking-[0.22em] gold-text">
          21 CAPITAL INVEST
        </Link>
        <Link
          to="/app"
          className="rounded-lg px-3 py-1.5 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
        >
          Mitarbeiter-Login
        </Link>
      </header>
      {children}
    </div>
  );
}

function Hero({ company, slaMinutes, hidden }: { company: string; slaMinutes: number; hidden: boolean }) {
  return (
    <AnimatePresence>
      {!hidden ? (
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl overflow-hidden px-5 pt-6 pb-4 text-center"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/8 px-4 py-1.5 text-xs font-medium text-gold-200"
          >
            <Timer className="size-3.5" />
            Rückmeldung in unter {slaMinutes} Minuten
          </motion.span>

          <h1 className="mt-6 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-white sm:text-5xl">
            Ihr Vermögen verdient
            <br />
            <span className="gold-text">eine schnelle Antwort.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/55">
            Beantworten Sie vier kurze Fragen. Ihre Anfrage geht direkt an das zuständige Fachteam
            von {company} – nicht in ein anonymes Postfach.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/35">
            {[
              [ShieldCheck, 'Keine Weitergabe an Dritte'],
              [Timer, 'Persönlicher Rückruf statt Warteschleife'],
              [Lock, 'Eigener Kundenbereich inklusive'],
            ].map(([Icon, text], i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5 text-gold-500/60" />
                {text as string}
              </span>
            ))}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-2">
            <div className="h-[3px] overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
                initial={false}
                animate={{ width: i < step ? '100%' : i === step ? '55%' : '0%' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span
              className={`hidden text-[10px] font-medium tracking-wide uppercase transition-colors sm:block ${
                i <= step ? 'text-gold-300/85' : 'text-white/25'
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm text-white/50">{subtitle}</p>
    </div>
  );
}

// ───────────────────────────── Schritte ─────────────────────────────

function StepAsset({
  config, value, error, onSelect,
}: {
  config: WizardConfig;
  value: string;
  error?: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div>
      <StepHeading title="Wofür interessieren Sie sich?" subtitle="Ihre Auswahl bestimmt, welches Fachteam sich meldet." />
      <div className="grid gap-3 sm:grid-cols-2">
        {config.assetClasses.map((asset, i) => {
          const Icon = ICONS[asset.icon] ?? Coins;
          const active = value === asset.slug;
          const accent = asset.teamColor ?? '#C8A24A';
          return (
            <motion.button
              key={asset.slug}
              type="button"
              onClick={() => onSelect(asset.slug)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.045, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.985 }}
              className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-colors ${
                active ? 'border-gold-500/70 bg-gold-500/8' : 'border-white/8 bg-ink-850/60 hover:border-white/18'
              }`}
            >
              <div
                className="absolute -right-8 -top-8 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-70"
                style={{ background: accent }}
              />
              <div className="relative flex items-start gap-3.5">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}3d` }}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-white">{asset.name}</h3>
                    {active ? <Check className="size-4 text-gold-400" /> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-white/45">{asset.tagline}</p>
                  {asset.teamName ? (
                    <p className="mt-2.5 text-[10px] tracking-wide text-white/28 uppercase">
                      Team {asset.teamName} · Antwort in {asset.slaMinutes} Min.
                    </p>
                  ) : null}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

type Setter = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

function OptionGrid({
  options, value, onChange, columns = 2,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((opt, i) => (
        <motion.button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.035 }}
          whileTap={{ scale: 0.97 }}
          className={`rounded-xl border px-4 py-3.5 text-sm transition-colors ${
            value === opt.value
              ? 'border-gold-500/70 bg-gold-500/10 text-gold-100'
              : 'border-white/8 bg-ink-850/60 text-white/65 hover:border-white/20 hover:text-white'
          }`}
        >
          {opt.label}
        </motion.button>
      ))}
    </div>
  );
}

function StepVolume({
  config, form, set, errors,
}: {
  config: WizardConfig;
  form: FormState;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-8">
      <div>
        <StepHeading title="Wie viel möchten Sie investieren?" subtitle="Eine Größenordnung genügt – nichts davon ist verbindlich." />
        <OptionGrid options={config.volumeBands} value={form.volumeBand} onChange={(v) => set('volumeBand', v)} columns={2} />
        {errors.volumeBand ? <p className="mt-2 text-sm text-red-300">{errors.volumeBand}</p> : null}
      </div>
      <div>
        <h3 className="mb-3 text-sm font-medium text-white/75">Über welchen Zeitraum?</h3>
        <OptionGrid options={config.horizons} value={form.horizon} onChange={(v) => set('horizon', v)} columns={2} />
        {errors.horizon ? <p className="mt-2 text-sm text-red-300">{errors.horizon}</p> : null}
      </div>
    </div>
  );
}

function StepProfile({ config, form, set }: { config: WizardConfig; form: FormState; set: Setter }) {
  return (
    <div className="space-y-8">
      <div>
        <StepHeading title="Wie erfahren sind Sie?" subtitle="Damit unser Berater das Gespräch richtig ansetzt." />
        <OptionGrid options={config.experience} value={form.experience} onChange={(v) => set('experience', v)} columns={2} />
      </div>
      <div>
        <Field label="Was möchten Sie erreichen?" hint="optional">
          <textarea
            value={form.goal}
            onChange={(e) => set('goal', e.target.value)}
            rows={3}
            placeholder="z. B. Inflationsschutz für das Familienvermögen, Aufbau einer Altersvorsorge …"
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>
    </div>
  );
}

function StepContact({
  config, form, set, errors, slaMinutes,
}: {
  config: WizardConfig;
  form: FormState;
  set: Setter;
  errors: Record<string, string>;
  slaMinutes: number;
}) {
  return (
    <div className="space-y-6">
      <StepHeading
        title="Wie erreichen wir Sie?"
        subtitle={`Ihr Ansprechpartner meldet sich innerhalb von ${slaMinutes} Minuten.`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vorname" required error={errors.firstName}>
          <input className={inputClass} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Nachname" required error={errors.lastName}>
          <input className={inputClass} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" />
        </Field>
        <Field label="E-Mail" required error={errors.email}>
          <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Telefon" error={errors.phone} hint={form.contactPref === 'email' ? 'optional' : undefined}>
          <input type="tel" className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Firma" hint="optional">
          <input className={inputClass} value={form.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" />
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="PLZ" hint="optional">
            <input className={inputClass} value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} autoComplete="postal-code" />
          </Field>
          <Field label="Ort" hint="optional">
            <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" />
          </Field>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2.5 text-xs font-medium tracking-wide text-white/60 uppercase">Bevorzugter Kanal</h3>
          <OptionGrid options={config.contactPrefs} value={form.contactPref} onChange={(v) => set('contactPref', v)} columns={3} />
        </div>
        <div>
          <h3 className="mb-2.5 text-xs font-medium tracking-wide text-white/60 uppercase">Beste Zeit</h3>
          <OptionGrid options={config.contactWindows} value={form.contactWindow} onChange={(v) => set('contactWindow', v)} columns={2} />
        </div>
      </div>

      <Field label="Ihre Nachricht" hint="optional">
        <textarea
          rows={3}
          className={`${inputClass} resize-none`}
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Konkrete Fragen, Wunschtermin, alles was hilft …"
        />
      </Field>

      {/* Honeypot – für Menschen unsichtbar, Bots füllen ihn aus. */}
      <input
        type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={form.website} onChange={(e) => set('website', e.target.value)}
        className="pointer-events-none absolute left-[-9999px] size-0 opacity-0"
      />

      <div className="space-y-3 rounded-xl border border-white/8 bg-ink-850/50 p-4">
        <Consent
          checked={form.consentContact}
          onChange={(v) => set('consentContact', v)}
          error={errors.consentContact}
        >
          Ich möchte kontaktiert werden und bin mit der Verarbeitung meiner Daten zu diesem Zweck
          einverstanden. Die Einwilligung kann ich jederzeit widerrufen.
        </Consent>
        <Consent checked={form.consentMarketing} onChange={(v) => set('consentMarketing', v)}>
          Zusätzlich möchte ich Marktinformationen und Angebote per E-Mail erhalten. <span className="text-white/35">(optional)</span>
        </Consent>
      </div>
    </div>
  );
}

function Consent({
  checked, onChange, children, error,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            checked ? 'border-gold-500 bg-gold-500 text-ink-950' : 'border-white/20 bg-transparent hover:border-white/40'
          }`}
        >
          <AnimatePresence>
            {checked ? (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Check className="size-3.5" strokeWidth={3} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>
        <span className="text-xs leading-relaxed text-white/55">{children}</span>
      </label>
      {error ? <p className="mt-1.5 ml-8 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function StepDone({ result }: { result: SubmitResult }) {
  const [copied, setCopied] = useState('');

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };

  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        className="mx-auto flex size-20 items-center justify-center rounded-full border border-gold-500/40 bg-gold-500/12"
      >
        <Check className="size-9 text-gold-300" strokeWidth={2.5} />
      </motion.div>

      <h2 className="mt-7 font-display text-3xl font-semibold tracking-tight text-white">Ihre Anfrage ist angekommen.</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/55">
        {result.team ? (
          <>
            Das Team <strong className="text-white/80">{result.team}</strong> wurde soeben benachrichtigt.
          </>
        ) : (
          'Unser Fachteam wurde soeben benachrichtigt.'
        )}{' '}
        Sie hören innerhalb von <strong className="text-gold-300">{result.slaMinutes} Minuten</strong> von uns.
      </p>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-9 grid gap-4 text-left sm:grid-cols-2"
      >
        {result.contact ? (
          <div className="glass rounded-2xl p-5">
            <p className="text-[10px] tracking-[0.16em] text-white/35 uppercase">Ihr Ansprechpartner</p>
            <p className="mt-2.5 font-display text-lg font-semibold text-white">{result.contact.name}</p>
            <p className="text-xs text-white/45">{result.contact.title}</p>
            <div className="mt-4 space-y-1.5 text-xs text-white/60">
              <a href={`tel:${result.contact.phone}`} className="flex items-center gap-2 hover:text-gold-300">
                <Phone className="size-3.5" /> {result.contact.phone}
              </a>
              <a href={`mailto:${result.contact.email}`} className="flex items-center gap-2 hover:text-gold-300">
                <Mail className="size-3.5" /> {result.contact.email}
              </a>
            </div>
          </div>
        ) : null}

        <div className="glass rounded-2xl border-gold-500/25 p-5">
          <p className="text-[10px] tracking-[0.16em] text-white/35 uppercase">Ihr Kundenbereich</p>
          <p className="mt-2.5 text-xs leading-relaxed text-white/55">
            Dort sehen Sie den Stand Ihrer Anfrage, die nächsten Schritte und Ihr Angebot.
            Die Zugangsdaten sind auch in Ihrer Bestätigungs-E-Mail.
          </p>
          <dl className="mt-4 space-y-2 text-xs">
            {[
              ['Referenz', result.ref],
              ['Zugang', result.portal.email],
              ['Passwort', result.portal.password],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-lg bg-ink-950/60 px-3 py-2">
                <dt className="text-white/35">{label}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-gold-200">{value}</span>
                  <button
                    type="button"
                    onClick={() => copy(label, value)}
                    className="text-white/30 transition-colors hover:text-gold-300"
                    aria-label={`${label} kopieren`}
                  >
                    {copied === label ? <Check className="size-3.5 text-emerald-400" /> : <ClipboardCopy className="size-3.5" />}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          <Link to={`/portal/${result.portal.token}`} className="mt-4 block">
            <Button className="w-full" size="sm">
              <User className="size-3.5" /> Kundenbereich öffnen
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
