import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Bot, Building2, CalendarPlus, Check, ChevronDown, ExternalLink, FileText,
  Hand, Mail, MapPin, Mic, Paperclip, Phone, Pin, Send, Sparkles, Target, Timer, User, Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  ACTIVITY_META, formatCurrency, formatDateTime, formatDuration, formatRelative, renderMarkdown,
} from '../lib/format';
import { useSession } from '../lib/session';
import type {
  Activity, Attachment, DirectoryUser, EmailEntry, Lead, LeadStatus, Offer, Task,
} from '../lib/types';
import { SlaClock } from '../components/SlaClock';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { Avatar, Button, Card, EmptyState, inputClass, SectionTitle, Spinner, StatusBadge } from '../components/ui';

interface Detail {
  lead: Lead;
  activities: Activity[];
  attachments: Attachment[];
  tasks: Task[];
  offers: Offer[];
  emails: EmailEntry[];
}

const STAGES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const STAGE_LABEL: Record<LeadStatus, string> = {
  new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert',
  proposal: 'Angebot', won: 'Gewonnen', lost: 'Verloren',
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, subscribe } = useSession();
  const [data, setData] = useState<Detail | null>(null);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [tab, setTab] = useState<'stream' | 'offers' | 'mails'>('stream');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    api.get<Detail>(`/leads/${id}`).then(setData).catch(() => navigate('/app/leads'));
  }, [id, navigate]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get<{ users: DirectoryUser[] }>('/directory/users').then((d) => setUsers(d.users)).catch(() => undefined);
  }, []);

  useEffect(
    () =>
      subscribe<{ lead: Lead }>('lead:updated', (p) => {
        if (p.lead.id === Number(id)) setData((prev) => (prev ? { ...prev, lead: p.lead } : prev));
      }),
    [subscribe, id],
  );

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={30} />
      </div>
    );
  }

  const { lead } = data;
  const awaiting = !lead.firstContactAt;
  const isOwner = lead.ownerId === user?.id;

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      await api.patch(`/leads/${id}`, body);
      load();
    } finally {
      setBusy('');
    }
  }

  async function claim() {
    setBusy('claim');
    try {
      await api.post(`/leads/${id}/claim`);
      load();
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/app/leads" className="inline-flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/80">
        <ArrowLeft className="size-4" /> Alle Leads
      </Link>

      {/* ── Kopf mit laufender Reaktionsuhr ── */}
      <Card className={`overflow-hidden ${awaiting ? 'border-gold-500/35' : ''}`}>
        <div className="flex flex-wrap items-start gap-5 p-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-white">{lead.name}</h1>
              <StatusBadge status={lead.status} label={lead.statusLabel} />
              <span className="font-mono text-xs text-white/28">{lead.ref}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-white/55">
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 hover:text-gold-300">
                <Mail className="size-3.5" /> {lead.email}
              </a>
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:text-gold-300">
                  <Phone className="size-3.5" /> {lead.phone}
                </a>
              ) : null}
              {lead.company ? (
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3.5" /> {lead.company}
                </span>
              ) : null}
              {lead.city ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {lead.postalCode} {lead.city}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Chip icon={Target} label={lead.assetClass ?? '–'} accent={lead.teamColor ?? undefined} />
              <Chip label={lead.volumeLabel || '–'} />
              <Chip label={lead.horizonLabel || '–'} />
              <Chip label={lead.experienceLabel || '–'} />
              <Chip label={`Kontakt: ${lead.contactPrefLabel}${lead.contactWindow ? ` (${lead.contactWindow})` : ''}`} />
              <Chip label={`Score ${lead.score}`} />
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <div className="text-right">
              <p className="text-[10px] tracking-[0.14em] text-white/32 uppercase">
                {awaiting ? 'Reaktionsfrist' : 'Reaktionszeit'}
              </p>
              <SlaClock
                dueAt={lead.slaDueAt}
                firstContactAt={lead.firstContactAt}
                responseSeconds={lead.responseSeconds}
                breached={lead.slaBreached}
                size="lg"
              />
              <p className="mt-1 text-[11px] text-white/32">
                Eingang {formatRelative(lead.createdAt)}
              </p>
            </div>

            {awaiting ? (
              <ContactButton leadId={lead.id} onDone={load} suggested={lead.contactPref} />
            ) : null}

            {!isOwner ? (
              <Button size="sm" variant="outline" onClick={claim} disabled={busy === 'claim'}>
                <Hand className="size-3.5" /> Übernehmen
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── Statusleiste ── */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-white/6 bg-ink-900/40 px-4 py-2.5">
          {STAGES.map((stage) => {
            const active = lead.status === stage;
            const passed = STAGES.indexOf(lead.status) > STAGES.indexOf(stage) && lead.status !== 'lost';
            return (
              <button
                key={stage}
                onClick={() => patch({ status: stage }, `status-${stage}`)}
                disabled={busy === `status-${stage}` || active}
                className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-gold-500/18 text-gold-200'
                    : passed
                      ? 'text-emerald-300/70 hover:bg-white/5'
                      : 'text-white/35 hover:bg-white/5 hover:text-white/70'
                }`}
              >
                {passed ? <Check className="size-3" /> : null}
                {STAGE_LABEL[stage]}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2 pl-3">
            <span className="hidden text-[11px] text-white/30 sm:inline">Berater</span>
            <select
              value={lead.ownerId ?? ''}
              onChange={(e) => patch({ ownerId: e.target.value ? Number(e.target.value) : null }, 'owner')}
              disabled={busy === 'owner'}
              className="rounded-lg border border-white/8 bg-ink-900 px-2 py-1.5 text-xs text-white/75 outline-none focus:border-gold-500/50"
            >
              <option value="">nicht zugewiesen</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <div className="flex gap-1 rounded-xl border border-white/8 bg-ink-900/50 p-1">
            {([
              ['stream', 'Aktivitätsstream', data.activities.length],
              ['offers', 'Angebote', data.offers.length],
              ['mails', 'Postausgang', data.emails.length],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === key ? 'text-white' : 'text-white/40 hover:text-white/75'
                }`}
              >
                {tab === key ? (
                  <motion.span layoutId="lead-tab" className="absolute inset-0 rounded-lg bg-white/8" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                ) : null}
                <span className="relative">
                  {label} <span className="text-white/30">{count}</span>
                </span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24 }}
            >
              {tab === 'stream' ? <StreamTab data={data} onChange={load} /> : null}
              {tab === 'offers' ? <OffersTab data={data} onChange={load} /> : null}
              {tab === 'mails' ? <MailsTab emails={data.emails} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="space-y-5">
          <TasksPanel leadId={lead.id} tasks={data.tasks} users={users} onChange={load} />
          <PortalPanel lead={lead} />
          {lead.message || lead.goal ? (
            <Card className="p-5">
              <SectionTitle>Aus dem Wizard</SectionTitle>
              {lead.goal ? (
                <div className="mb-3">
                  <p className="text-[10px] tracking-[0.14em] text-white/30 uppercase">Ziel</p>
                  <p className="mt-1 text-sm text-white/70">{lead.goal}</p>
                </div>
              ) : null}
              {lead.message ? (
                <div>
                  <p className="text-[10px] tracking-[0.14em] text-white/30 uppercase">Nachricht</p>
                  <p className="mt-1 border-l-2 border-gold-500/40 pl-3 text-sm leading-relaxed text-white/70 italic">
                    {lead.message}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, label, accent }: { icon?: typeof Target; label: string; accent?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
      style={{
        borderColor: accent ? `${accent}44` : 'rgba(255,255,255,0.08)',
        background: accent ? `${accent}12` : 'rgba(255,255,255,0.03)',
        color: accent ?? 'rgba(255,255,255,0.6)',
      }}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {label}
    </span>
  );
}

/** Erstkontakt bestätigen – der Klick, der die Reaktionsuhr stoppt. */
function ContactButton({
  leadId, onDone, suggested,
}: {
  leadId: number;
  onDone: () => void;
  suggested: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState(suggested === 'email' ? 'email' : 'call');
  const [outcome, setOutcome] = useState('reached');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post<{ responseLabel: string | null }>(`/leads/${leadId}/contact`, {
        channel, outcome, note,
      });
      setResult(res.responseLabel);
      setOpen(false);
      setNote('');
      onDone();
      setTimeout(() => setResult(null), 6000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {result ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -top-11 right-0 whitespace-nowrap rounded-lg border border-emerald-400/40 bg-emerald-400/12 px-3 py-1.5 text-xs font-medium text-emerald-300"
          >
            Erstkontakt in {result} · Uhr gestoppt
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Button size="md" onClick={() => setOpen((o) => !o)}>
        <Zap className="size-4" /> Erstkontakt erfassen
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            className="glass absolute right-0 top-12 z-30 w-80 space-y-3 rounded-2xl p-4 shadow-2xl"
          >
            <div className="grid grid-cols-4 gap-1.5">
              {([['call', 'Anruf'], ['email', 'Mail'], ['whatsapp', 'WA'], ['meeting', 'Termin']] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setChannel(v)}
                  className={`rounded-lg px-2 py-2 text-xs transition-colors ${
                    channel === v ? 'bg-gold-500/18 text-gold-200' : 'bg-white/5 text-white/50 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white/80 outline-none focus:border-gold-500/50"
            >
              <option value="reached">erreicht</option>
              <option value="no_answer">nicht erreicht</option>
              <option value="callback">Rückruf vereinbart</option>
              <option value="voicemail">Mailbox besprochen</option>
              <option value="positive">positives Gespräch</option>
            </select>

            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Was wurde besprochen?"
              className={`${inputClass} resize-none py-2 text-sm`}
            />

            <Button size="sm" className="w-full" onClick={submit} disabled={busy}>
              {busy ? <Spinner size={14} /> : <Check className="size-3.5" />} Kontakt speichern
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────── Aktivitätsstream ─────────────────────────────

function StreamTab({ data, onChange }: { data: Detail; onChange: () => void }) {
  const [body, setBody] = useState('');
  const [type, setType] = useState('note');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const attachmentsByActivity = useMemo(() => {
    const map = new Map<number, Attachment[]>();
    for (const a of data.attachments) {
      if (a.activityId === null) continue;
      const list = map.get(a.activityId) ?? [];
      list.push(a);
      map.set(a.activityId, list);
    }
    return map;
  }, [data.attachments]);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post('/activities', { leadId: data.lead.id, type, body, title: '' });
      setBody('');
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('leadId', String(data.lead.id));
    form.append('kind', 'file');
    await api.upload('/uploads', form).catch(() => undefined);
    onChange();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([
            ['note', 'Notiz'], ['call', 'Anruf'], ['email', 'E-Mail'],
            ['meeting', 'Termin'], ['whatsapp', 'WhatsApp'],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setType(v)}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                type === v ? 'bg-gold-500/18 text-gold-200' : 'bg-white/5 text-white/45 hover:text-white/85'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder="Was ist passiert? (⌘/Strg + Enter zum Speichern)"
          className={`${inputClass} resize-none`}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
            {busy ? <Spinner size={14} /> : <Send className="size-3.5" />} Eintragen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            <Paperclip className="size-3.5" /> Datei
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
              e.target.value = '';
            }}
          />
          <span className="ml-auto text-[11px] text-white/25">
            Kontaktarten stoppen automatisch die Reaktionsuhr.
          </span>
        </div>

        <div className="mt-3">
          <VoiceRecorder leadId={data.lead.id} onUploaded={onChange} />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle hint={`${data.activities.length} Einträge`}>Verlauf</SectionTitle>
        {data.activities.length === 0 ? (
          <EmptyState title="Noch keine Einträge." />
        ) : (
          <ol className="relative space-y-4 pl-6">
            <span className="absolute left-[9px] top-2 bottom-2 w-px bg-gradient-to-b from-gold-500/35 via-white/8 to-transparent" />
            {data.activities.map((activity, i) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                index={i}
                attachments={attachmentsByActivity.get(activity.id) ?? []}
                onChange={onChange}
              />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function ActivityItem({
  activity, index, attachments, onChange,
}: {
  activity: Activity;
  index: number;
  attachments: Attachment[];
  onChange: () => void;
}) {
  const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.system;

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.35), duration: 0.32 }}
      className="relative"
    >
      <span
        className={`absolute -left-6 top-1 flex size-[18px] items-center justify-center rounded-full border border-white/10 bg-ink-900 ${meta.tone}`}
      >
        <span className="size-1.5 rounded-full bg-current" />
      </span>

      <div className="rounded-xl border border-white/6 bg-ink-900/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={`text-[10px] font-semibold tracking-[0.1em] uppercase ${meta.tone}`}>{meta.label}</span>
          <span className="text-sm font-medium text-white/88">{activity.title}</span>
          {activity.outcome ? (
            <span className="rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-white/50">{activity.outcome}</span>
          ) : null}
          {activity.durationS > 0 ? (
            <span className="flex items-center gap-1 text-[10px] text-white/35">
              <Timer className="size-3" /> {formatDuration(activity.durationS)}
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={async () => {
                await api.patch(`/activities/${activity.id}/pin`).catch(() => undefined);
                onChange();
              }}
              className={`transition-colors ${activity.isPinned ? 'text-gold-400' : 'text-white/15 hover:text-white/50'}`}
              aria-label="Anheften"
            >
              <Pin className="size-3.5" fill={activity.isPinned ? 'currentColor' : 'none'} />
            </button>
            <span className="text-[11px] text-white/28" title={formatDateTime(activity.occurredAt)}>
              {formatRelative(activity.occurredAt)}
            </span>
          </span>
        </div>

        {activity.body ? (
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-white/58">{activity.body}</p>
        ) : null}

        {attachments.map((att) => (
          <div key={att.id} className="mt-2.5">
            {att.kind === 'voice' ? (
              <div className="rounded-lg border border-white/8 bg-ink-950/50 p-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/45">
                  <Mic className="size-3 text-gold-400" /> Sprachnotiz · {formatDuration(att.durationS)}
                </p>
                <audio src={att.url} controls className="w-full" preload="none" />
                {att.transcript ? (
                  <p className="mt-2 text-xs text-white/50 italic">{att.transcript}</p>
                ) : null}
              </div>
            ) : (
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-ink-950/50 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-gold-500/35 hover:text-gold-200"
              >
                <Paperclip className="size-3" /> {att.filename}
                <span className="text-white/25">{Math.round(att.sizeBytes / 1024)} KB</span>
              </a>
            )}
          </div>
        ))}

        {activity.user ? (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/30">
            <Avatar name={activity.user.name} accent={activity.user.accent} size={16} />
            {activity.user.name}
          </div>
        ) : null}
      </div>
    </motion.li>
  );
}

// ───────────────────────────── Angebote ─────────────────────────────

function OffersTab({ data, onChange }: { data: Detail; onChange: () => void }) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<{ enabled: boolean; model: string | null }>({ enabled: false, model: null });
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState<number | null>(data.offers[0]?.id ?? null);

  useEffect(() => {
    api.get<{ enabled: boolean; model: string | null }>('/offers/ai-status').then(setAi).catch(() => undefined);
  }, []);

  async function generate() {
    setBusy(true);
    setNote('');
    try {
      const res = await api.post<{ note: string | null; generatedBy: string; offer: Offer }>('/offers/draft', {
        leadId: data.lead.id,
        instruction,
      });
      setNote(res.note ?? '');
      setInstruction('');
      setExpanded(res.offer.id);
      onChange();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionTitle hint={ai.enabled ? `KI aktiv · ${ai.model}` : 'Vorlagen-Modus'}>
          <span className="flex items-center gap-2">
            <Bot className="size-4 text-gold-400" /> Angebotsentwurf
          </span>
        </SectionTitle>

        <p className="mb-3 text-xs leading-relaxed text-white/45">
          Erzeugt aus Bedarf und gesamtem Gesprächsverlauf einen Entwurf samt nächster Schritte.
          {ai.enabled
            ? ' Der Entwurf ist immer zu prüfen – Preise bleiben Platzhalter.'
            : ' Ohne ANTHROPIC_API_KEY wird ein strukturierter Textbaustein erzeugt.'}
        </p>

        <textarea
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Zusätzliche Anweisung, z. B. „Fokus auf Zollfreilager, Staffelung über 3 Tranchen“"
          className={`${inputClass} resize-none text-sm`}
        />

        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Sparkles className="size-3.5" />}
            {busy ? 'Wird erstellt …' : 'Entwurf erzeugen'}
          </Button>
          {note ? <span className="text-xs text-gold-300/80">{note}</span> : null}
        </div>
      </Card>

      {data.offers.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText className="size-9" />} title="Noch kein Angebot." hint="Erzeuge oben einen Entwurf oder lege manuell eines an." />
        </Card>
      ) : (
        data.offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            expanded={expanded === offer.id}
            onToggle={() => setExpanded(expanded === offer.id ? null : offer.id)}
            onChange={onChange}
          />
        ))
      )}
    </div>
  );
}

function OfferCard({
  offer, expanded, onToggle, onChange,
}: {
  offer: Offer;
  expanded: boolean;
  onToggle: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(offer.body);

  const tone = {
    draft: 'text-white/45 bg-white/6',
    sent: 'text-gold-200 bg-gold-500/15',
    accepted: 'text-emerald-300 bg-emerald-400/12',
    declined: 'text-red-300 bg-danger/12',
  }[offer.status];

  const statusLabel = { draft: 'Entwurf', sent: 'Versendet', accepted: 'Angenommen', declined: 'Abgelehnt' }[offer.status];

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/offers/${offer.id}`, { body });
      setEditing(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    try {
      await api.post(`/offers/${offer.id}/send`);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/3">
        <FileText className="size-4 shrink-0 text-white/30" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">{offer.title}</p>
          <p className="truncate text-xs text-white/40">{offer.summary}</p>
        </div>
        <span className="shrink-0 text-sm font-medium text-white/70">{formatCurrency(offer.amount)}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{statusLabel}</span>
        {offer.generatedBy !== 'human' ? (
          <span className="shrink-0 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-white/40">
            {offer.generatedBy === 'ai' ? 'KI' : 'Vorlage'}
          </span>
        ) : null}
        <ChevronDown className={`size-4 shrink-0 text-white/25 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/6"
          >
            <div className="p-5">
              {editing ? (
                <textarea
                  rows={18}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
                />
              ) : (
                <div
                  className="prose-offer max-w-none text-sm text-white/72"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(offer.body) }}
                />
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/6 pt-4">
                {editing ? (
                  <>
                    <Button size="sm" onClick={save} disabled={busy}>
                      {busy ? <Spinner size={14} /> : <Check className="size-3.5" />} Speichern
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setBody(offer.body); setEditing(false); }}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="subtle" onClick={() => setEditing(true)}>
                    Bearbeiten
                  </Button>
                )}

                {offer.status === 'draft' ? (
                  <Button size="sm" onClick={send} disabled={busy}>
                    <Send className="size-3.5" /> Im Portal freigeben
                  </Button>
                ) : null}

                <span className="ml-auto text-[11px] text-white/28">
                  {offer.createdBy ? `${offer.createdBy} · ` : ''}
                  {formatRelative(offer.createdAt)}
                  {offer.validUntil ? ` · gültig bis ${formatDateTime(offer.validUntil)}` : ''}
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}

function MailsTab({ emails }: { emails: EmailEntry[] }) {
  return (
    <Card className="p-5">
      <SectionTitle hint="alles, was an diesen Lead ging">Postausgang</SectionTitle>
      {emails.length === 0 ? (
        <EmptyState title="Noch keine Mails versendet." />
      ) : (
        <ul className="space-y-2.5">
          {emails.map((mail) => (
            <li key={mail.id} className="rounded-xl border border-white/6 bg-ink-900/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Mail className="size-3.5 text-white/25" />
                <span className="text-sm font-medium text-white/85">{mail.subject}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    mail.status === 'sent'
                      ? 'bg-emerald-400/12 text-emerald-300'
                      : mail.status === 'failed'
                        ? 'bg-danger/12 text-red-300'
                        : 'bg-white/6 text-white/45'
                  }`}
                >
                  {mail.status === 'logged' ? 'protokolliert' : mail.status === 'sent' ? 'versendet' : 'fehlgeschlagen'}
                </span>
                <span className="ml-auto text-[11px] text-white/28">{formatRelative(mail.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-white/35">an {mail.to}</p>
              {mail.preview ? (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap text-white/45">{mail.preview}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────────── Aufgaben & Portal ─────────────────────────────

function TasksPanel({
  leadId, tasks, users, onChange,
}: {
  leadId: number;
  tasks: Task[];
  users: DirectoryUser[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'task' | 'call' | 'meeting'>('call');
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [recurrence, setRecurrence] = useState('none');
  const [assignedTo, setAssignedTo] = useState<number | ''>('');
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (title.trim().length < 2) return;
    setBusy(true);
    try {
      await api.post('/tasks', {
        leadId,
        title,
        kind,
        dueAt: new Date(dueAt).toISOString(),
        recurrence,
        assignedTo: assignedTo === '' ? undefined : Number(assignedTo),
        visibleToClient,
      });
      setTitle('');
      setOpen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: Task) {
    await api.patch(`/tasks/${task.id}`, { status: task.status === 'done' ? 'open' : 'done' }).catch(() => undefined);
    onChange();
  }

  return (
    <Card className="p-5">
      <SectionTitle
        hint={
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 hover:text-gold-300">
            <CalendarPlus className="size-3.5" /> neu
          </button>
        }
      >
        Aufgaben & Termine
      </SectionTitle>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="space-y-2.5 rounded-xl border border-white/8 bg-ink-900/50 p-3.5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titel"
                className={`${inputClass} py-2 text-sm`}
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${inputClass} py-2 text-sm`}>
                  <option value="call">Anruf</option>
                  <option value="meeting">Termin</option>
                  <option value="task">Aufgabe</option>
                </select>
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={`${inputClass} py-2 text-sm`}>
                  <option value="none">einmalig</option>
                  <option value="daily">täglich</option>
                  <option value="weekly">wöchentlich</option>
                  <option value="biweekly">zweiwöchentlich</option>
                  <option value="monthly">monatlich</option>
                  <option value="quarterly">vierteljährlich</option>
                </select>
              </div>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className={`${inputClass} py-2 text-sm`}
              />
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${inputClass} py-2 text-sm`}
              >
                <option value="">mir zuweisen</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/50">
                <input
                  type="checkbox"
                  checked={visibleToClient}
                  onChange={(e) => setVisibleToClient(e.target.checked)}
                  className="accent-gold-500"
                />
                Als „nächster Schritt“ im Kundenportal anzeigen
              </label>
              <Button size="sm" className="w-full" onClick={create} disabled={busy || title.trim().length < 2}>
                {busy ? <Spinner size={14} /> : <Check className="size-3.5" />} Anlegen
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {tasks.length === 0 ? (
        <EmptyState title="Nichts geplant." />
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => {
            const overdue = task.status === 'open' && task.dueAt && new Date(task.dueAt) < new Date();
            return (
              <li key={task.id} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-white/4">
                <button
                  onClick={() => toggle(task)}
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    task.status === 'done'
                      ? 'border-emerald-400 bg-emerald-400 text-ink-950'
                      : 'border-white/20 hover:border-gold-400'
                  }`}
                  aria-label={task.status === 'done' ? 'Wieder öffnen' : 'Erledigt'}
                >
                  {task.status === 'done' ? <Check className="size-3" strokeWidth={3} /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${task.status === 'done' ? 'text-white/30 line-through' : 'text-white/82'}`}>
                    {task.title}
                  </p>
                  <p className="text-[11px] text-white/32">
                    <span className={overdue ? 'text-red-300' : ''}>{formatRelative(task.dueAt)}</span>
                    {task.recurrence !== 'none' ? ' · wiederkehrend' : ''}
                    {task.visibleToClient ? ' · im Portal sichtbar' : ''}
                  </p>
                </div>
                {task.assignee ? <Avatar name={task.assignee.name} accent={task.assignee.accent} size={20} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PortalPanel({ lead }: { lead: Lead }) {
  if (!lead.hasPortal || !lead.portalToken) return null;
  return (
    <Card className="p-5">
      <SectionTitle>Kundenbereich</SectionTitle>
      <p className="text-xs leading-relaxed text-white/45">
        Der Interessent hat einen eigenen Bereich mit Status, nächsten Schritten und Angebot.
      </p>
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-white/30">Letzter Login</span>
          <span className="text-white/65">{lead.portalLastLogin ? formatRelative(lead.portalLastLogin) : 'noch nie'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-white/30">Zugang</span>
          <span className="truncate text-white/65">{lead.email}</span>
        </div>
      </div>
      <a href={`/portal/${lead.portalToken}`} target="_blank" rel="noreferrer" className="mt-3 block">
        <Button size="sm" variant="outline" className="w-full">
          <ExternalLink className="size-3.5" /> Portal ansehen
        </Button>
      </a>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-white/25">
        <User className="size-3" /> Öffnet die Ansicht des Kunden (Login erforderlich).
      </p>
    </Card>
  );
}
