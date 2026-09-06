import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Check, Clock, Download, FileText, Lock, Mail, MessageSquare,
  Phone, Send, ShieldCheck, Sparkles, User,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { formatCurrency, formatDate, formatDateTime, renderMarkdown } from '../lib/format';
import { Spinner } from '../components/ui';

interface Preview {
  firstName: string;
  ref: string;
  assetClass: string | null;
  advisor: string | null;
  company: { name: string; phone: string; email: string };
}

interface PortalData {
  company: { name: string; phone: string; email: string };
  lead: {
    ref: string; firstName: string; lastName: string; email: string; phone: string;
    assetClass: string | null; volumeLabel: string; horizonLabel: string; goal: string;
    status: string; statusLabel: string; createdAt: string | null;
    stageIndex: number; stages: Array<{ key: string; label: string }>;
  };
  advisor: { name: string; title: string; phone: string; email: string; accent: string } | null;
  nextSteps: Array<{ id: number; kind: string; title: string; description: string; dueAt: string | null; done: boolean }>;
  offers: Array<{
    id: number; title: string; summary: string; body: string; amount: number;
    currency: string; status: string; validUntil: string | null; sentAt: string | null;
  }>;
  documents: Array<{ id: number; filename: string; url: string; mime: string; sizeBytes: number; createdAt: string | null }>;
  conversation: Array<{ id: number; type: string; title: string; body: string; author: string | null; occurredAt: string | null }>;
}

/** Helle, ruhige Oberfläche – bewusst anders als das dunkle interne CRM. */
export default function Portal() {
  const { token } = useParams<{ token?: string }>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const me = await api.get<PortalData>('/portal/me');
      setData(me);
    } catch {
      setData(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (token) {
      api
        .get<Preview>(`/portal/preview/${token}`)
        .then(setPreview)
        .catch(() => setError('Dieser Zugangslink ist nicht (mehr) gültig.'));
    }
  }, [token, load]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-50">
        <Spinner size={30} />
      </div>
    );
  }

  if (!data) return <PortalLogin token={token} preview={preview} error={error} onSuccess={load} />;

  return <PortalView data={data} onChange={load} />;
}

// ───────────────────────────── Login ─────────────────────────────

function PortalLogin({
  token, preview, error, onSuccess,
}: {
  token?: string;
  preview: Preview | null;
  error: string;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      await api.post('/portal/login', { token, email: email.trim(), password });
      onSuccess();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-50 px-5 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <p className="font-display text-lg font-semibold tracking-[0.22em] text-ink-900">
            {(preview?.company.name ?? '21 Capital Invest').toUpperCase()}
          </p>
          <p className="mt-1.5 text-xs tracking-[0.14em] text-ink-500 uppercase">Persönlicher Kundenbereich</p>
        </div>

        {preview ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mb-5 rounded-2xl border border-gold-500/25 bg-white p-5 text-center shadow-sm"
          >
            <p className="font-display text-lg font-semibold text-ink-900">Willkommen, {preview.firstName}.</p>
            <p className="mt-1.5 text-sm text-ink-500">
              Ihre Anfrage <span className="font-mono text-xs text-gold-700">{preview.ref}</span>
              {preview.assetClass ? ` zu ${preview.assetClass}` : ''} wird bearbeitet
              {preview.advisor ? ` von ${preview.advisor}` : ''}.
            </p>
          </motion.div>
        ) : null}

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-paper-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-500/12 text-gold-700">
              <Lock className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-base font-semibold text-ink-900">Anmelden</h1>
              <p className="text-xs text-ink-500">Zugangsdaten aus Ihrer Bestätigungs-E-Mail</p>
            </div>
          </div>

          <LightField label="E-Mail">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="username" required className={lightInput}
            />
          </LightField>

          <LightField label="Passwort">
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required className={lightInput}
            />
          </LightField>

          {(formError || error) ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError || error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-paper-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : null}
            {busy ? 'Wird geprüft …' : 'Anmelden'}
            {busy ? null : <ArrowRight className="size-4" />}
          </button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck className="size-3.5 text-gold-600" />
          Ihre Daten werden vertraulich behandelt.
        </p>
      </motion.div>
    </div>
  );
}

const lightInput =
  'w-full rounded-xl border border-paper-200 bg-paper-50 px-4 py-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-500/50 focus:border-gold-500 focus:bg-white';

function LightField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-600 uppercase">{label}</span>
      {children}
    </label>
  );
}

// ───────────────────────────── Landing ─────────────────────────────

function PortalView({ data, onChange }: { data: PortalData; onChange: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openOffer, setOpenOffer] = useState<number | null>(data.offers[0]?.id ?? null);

  async function send() {
    if (message.trim().length < 2) return;
    setSending(true);
    try {
      await api.post('/portal/messages', { body: message });
      setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 5000);
      onChange();
    } finally {
      setSending(false);
    }
  }

  async function respond(offerId: number, decision: 'accepted' | 'declined') {
    await api.post('/portal/offers/respond', { offerId, decision }).catch(() => undefined);
    onChange();
  }

  const { lead, advisor } = data;

  return (
    <div className="min-h-screen bg-paper-50 text-ink-900">
      {/* ── Kopf ── */}
      <header className="border-b border-paper-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <p className="font-display text-sm font-semibold tracking-[0.2em] text-ink-900">
            {data.company.name.toUpperCase()}
          </p>
          <button
            onClick={async () => {
              await api.post('/portal/logout');
              window.location.reload();
            }}
            className="text-xs text-ink-500 transition-colors hover:text-ink-900"
          >
            Abmelden
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-9">
        {/* ── Begrüßung + Status ── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl border border-paper-200 bg-white p-7 shadow-sm"
        >
          <p className="text-xs tracking-[0.14em] text-ink-500 uppercase">
            Vorgang {lead.ref} · seit {formatDate(lead.createdAt)}
          </p>
          <h1 className="mt-2.5 font-display text-3xl font-semibold tracking-tight">
            Guten Tag, {lead.firstName}.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
            Hier sehen Sie jederzeit den Stand Ihrer Anfrage
            {lead.assetClass ? <> zu <strong>{lead.assetClass}</strong></> : null}, die nächsten Schritte
            und – sobald erstellt – Ihr persönliches Angebot.
          </p>

          {/* Fortschritt */}
          <div className="mt-7">
            <div className="flex items-center">
              {lead.stages.map((stage, i) => {
                const done = i < lead.stageIndex;
                const active = i === lead.stageIndex;
                return (
                  <div key={stage.key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-2">
                      <motion.span
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                        className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                          done
                            ? 'border-gold-500 bg-gold-500 text-white'
                            : active
                              ? 'border-gold-500 bg-white text-gold-700'
                              : 'border-paper-200 bg-white text-ink-500/50'
                        }`}
                      >
                        {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                      </motion.span>
                      <span
                        className={`hidden text-[11px] sm:block ${
                          active ? 'font-medium text-ink-900' : 'text-ink-500'
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                    {i < lead.stages.length - 1 ? (
                      <div className="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-paper-200 sm:mx-2">
                        <motion.div
                          className="h-full bg-gold-500"
                          initial={{ width: 0 }}
                          animate={{ width: done ? '100%' : '0%' }}
                          transition={{ delay: 0.25 + i * 0.08, duration: 0.5 }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.section>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {/* ── Angebote ── */}
            {data.offers.length > 0 ? (
              <Section icon={FileText} title="Ihr Angebot">
                <div className="space-y-3">
                  {data.offers.map((offer) => (
                    <div key={offer.id} className="overflow-hidden rounded-2xl border border-paper-200">
                      <button
                        onClick={() => setOpenOffer(openOffer === offer.id ? null : offer.id)}
                        className="flex w-full items-center gap-3 bg-paper-100/60 px-4 py-3.5 text-left transition-colors hover:bg-paper-100"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{offer.title}</p>
                          <p className="truncate text-xs text-ink-500">{offer.summary}</p>
                        </div>
                        <span className="shrink-0 font-display text-base font-semibold text-gold-700">
                          {formatCurrency(offer.amount)}
                        </span>
                        {offer.status === 'accepted' ? (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                            Angenommen
                          </span>
                        ) : offer.status === 'declined' ? (
                          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                            Abgelehnt
                          </span>
                        ) : null}
                      </button>

                      <AnimatePresence>
                        {openOffer === offer.id ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden bg-white"
                          >
                            <div className="p-5">
                              <div
                                className="prose-offer max-w-none text-sm text-ink-700"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(offer.body) }}
                              />

                              {offer.validUntil ? (
                                <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
                                  <Clock className="size-3.5" /> Gültig bis {formatDate(offer.validUntil)}
                                </p>
                              ) : null}

                              {offer.status === 'sent' ? (
                                <div className="mt-5 flex flex-wrap gap-2 border-t border-paper-200 pt-4">
                                  <button
                                    onClick={() => respond(offer.id, 'accepted')}
                                    className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 transition-colors hover:bg-ink-800"
                                  >
                                    <Check className="size-4" /> Angebot annehmen
                                  </button>
                                  <button
                                    onClick={() => respond(offer.id, 'declined')}
                                    className="rounded-xl border border-paper-200 px-5 py-2.5 text-sm text-ink-600 transition-colors hover:bg-paper-100"
                                  >
                                    Nicht passend
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </Section>
            ) : (
              <Section icon={Sparkles} title="Ihr Angebot">
                <div className="rounded-2xl border border-dashed border-paper-200 px-5 py-9 text-center">
                  <p className="text-sm text-ink-600">Ihr persönliches Angebot wird gerade vorbereitet.</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Sobald es bereitsteht, erhalten Sie eine E-Mail und sehen es hier.
                  </p>
                </div>
              </Section>
            )}

            {/* ── Nächste Schritte ── */}
            {data.nextSteps.length > 0 ? (
              <Section icon={Check} title="Ihre nächsten Schritte">
                <ol className="space-y-2.5">
                  {data.nextSteps.map((step, i) => (
                    <motion.li
                      key={step.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3 rounded-xl border border-paper-200 bg-white p-3.5"
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-gold-500/15 text-gold-700'
                        }`}
                      >
                        {step.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${step.done ? 'text-ink-500 line-through' : 'font-medium'}`}>
                          {step.title}
                        </p>
                        {step.description ? (
                          <p className="mt-0.5 text-xs text-ink-500">{step.description}</p>
                        ) : null}
                        {step.dueAt && !step.done ? (
                          <p className="mt-1 text-[11px] text-ink-500">Geplant: {formatDateTime(step.dueAt)}</p>
                        ) : null}
                      </div>
                    </motion.li>
                  ))}
                </ol>
              </Section>
            ) : null}

            {/* ── Dokumente ── */}
            {data.documents.length > 0 ? (
              <Section icon={Download} title="Ihre Unterlagen">
                <ul className="space-y-2">
                  {data.documents.map((doc) => (
                    <li key={doc.id}>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-paper-200 bg-white p-3.5 transition-colors hover:border-gold-500/40"
                      >
                        <FileText className="size-4 shrink-0 text-gold-600" />
                        <span className="min-w-0 flex-1 truncate text-sm">{doc.filename}</span>
                        <span className="shrink-0 text-xs text-ink-500">{Math.round(doc.sizeBytes / 1024)} KB</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* ── Verlauf ── */}
            {data.conversation.length > 0 ? (
              <Section icon={Clock} title="Was bisher geschah">
                <ol className="relative space-y-3 pl-5">
                  <span className="absolute left-[5px] top-2 bottom-2 w-px bg-paper-200" />
                  {data.conversation.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-5 top-1.5 size-2.5 rounded-full border-2 border-white bg-gold-500" />
                      <p className="text-sm font-medium">{entry.title}</p>
                      {entry.body ? <p className="mt-0.5 text-xs text-ink-600">{entry.body}</p> : null}
                      <p className="mt-0.5 text-[11px] text-ink-500">
                        {formatDateTime(entry.occurredAt)}
                        {entry.author ? ` · ${entry.author}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}
          </div>

          {/* ── Seitenspalte ── */}
          <aside className="space-y-5">
            {advisor ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-2xl border border-paper-200 bg-white p-5 shadow-sm"
              >
                <p className="text-[10px] tracking-[0.14em] text-ink-500 uppercase">Ihr Ansprechpartner</p>
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className="flex size-12 items-center justify-center rounded-full font-display text-base font-semibold"
                    style={{ background: `${advisor.accent}1f`, color: advisor.accent }}
                  >
                    {advisor.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold">{advisor.name}</p>
                    <p className="truncate text-xs text-ink-500">{advisor.title}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <a href={`tel:${advisor.phone}`} className="flex items-center gap-2.5 text-ink-700 hover:text-gold-700">
                    <Phone className="size-4 text-gold-600" /> {advisor.phone}
                  </a>
                  <a href={`mailto:${advisor.email}`} className="flex items-center gap-2.5 truncate text-ink-700 hover:text-gold-700">
                    <Mail className="size-4 shrink-0 text-gold-600" /> <span className="truncate">{advisor.email}</span>
                  </a>
                </div>
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-paper-200 bg-white p-5 text-center shadow-sm">
                <User className="mx-auto size-6 text-ink-500/40" />
                <p className="mt-2 text-sm text-ink-600">Ihr Ansprechpartner wird gerade zugewiesen.</p>
              </div>
            )}

            <div className="rounded-2xl border border-paper-200 bg-white p-5 shadow-sm">
              <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-gold-600" /> Nachricht schreiben
              </p>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ihre Frage oder Anmerkung …"
                className={`${lightInput} resize-none`}
              />
              <button
                onClick={send}
                disabled={sending || message.trim().length < 2}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-paper-50 transition-colors hover:bg-ink-800 disabled:opacity-40"
              >
                {sending ? <Spinner size={14} /> : <Send className="size-3.5" />}
                {sending ? 'Wird gesendet …' : 'Absenden'}
              </button>
              <AnimatePresence>
                {sent ? (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 text-center text-xs text-emerald-700"
                  >
                    Ihre Nachricht ist angekommen.
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="rounded-2xl border border-paper-200 bg-paper-100/60 p-5">
              <p className="text-[10px] tracking-[0.14em] text-ink-500 uppercase">Ihre Angaben</p>
              <dl className="mt-2.5 space-y-1.5 text-xs">
                {[
                  ['Interesse', lead.assetClass ?? '–'],
                  ['Volumen', lead.volumeLabel || '–'],
                  ['Horizont', lead.horizonLabel || '–'],
                  ['Status', lead.statusLabel],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="text-right font-medium text-ink-800">{v}</dd>
                  </div>
                ))}
              </dl>
              {lead.goal ? (
                <p className="mt-3 border-t border-paper-200 pt-3 text-xs text-ink-600 italic">„{lead.goal}“</p>
              ) : null}
            </div>

            <p className="text-center text-[11px] leading-relaxed text-ink-500">
              {data.company.name}
              <br />
              {data.company.phone} · {data.company.email}
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Section({
  icon: Icon, title, children,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="size-4 text-gold-600" /> {title}
      </h2>
      {children}
    </motion.section>
  );
}
