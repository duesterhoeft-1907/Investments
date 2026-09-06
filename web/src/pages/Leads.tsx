import { AnimatePresence, motion } from 'framer-motion';
import { Filter, Inbox, LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCompactCurrency, formatRelative, STATUS_TONE } from '../lib/format';
import { useLeadEvents, useSession } from '../lib/session';
import type { Lead, LeadStatus, Team } from '../lib/types';
import { SlaClock } from '../components/SlaClock';
import { Avatar, Card, EmptyState, inputClass, Spinner, StatusBadge } from '../components/ui';

const STAGES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const STAGE_LABEL: Record<LeadStatus, string> = {
  new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert',
  proposal: 'Angebot', won: 'Gewonnen', lost: 'Verloren',
};

const SCOPES = [
  { value: 'all', label: 'Alle' },
  { value: 'mine', label: 'Meine' },
  { value: 'my-teams', label: 'Meine Gruppen' },
  { value: 'awaiting', label: 'Ohne Erstkontakt' },
  { value: 'unassigned', label: 'Nicht zugewiesen' },
];

export default function Leads() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState(params.get('q') ?? '');

  const scope = params.get('scope') ?? 'all';
  const status = params.get('status') ?? '';
  const teamId = params.get('teamId') ?? '';
  const sort = params.get('sort') ?? 'newest';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const load = useCallback(() => {
    const query = new URLSearchParams({ scope, sort, limit: '200' });
    if (status) query.set('status', status);
    if (teamId) query.set('teamId', teamId);
    if (params.get('q')) query.set('q', params.get('q')!);
    api
      .get<{ leads: Lead[] }>(`/leads?${query}`)
      .then((d) => setLeads(d.leads))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [scope, status, teamId, sort, params]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get<{ teams: Team[] }>('/directory/teams').then((d) => setTeams(d.teams)).catch(() => undefined);
  }, []);

  // Debounce der Suche, damit nicht jeder Tastendruck eine Anfrage auslöst.
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') !== search) setParam('q', search);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useLeadEvents({
    onNew: (lead) => setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev])),
    onUpdated: (lead) => setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l))),
    onSla: (lead) => setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l))),
  });

  const grouped = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>(STAGES.map((s) => [s, []]));
    for (const lead of leads) map.get(lead.status)?.push(lead);
    return map;
  }, [leads]);

  const awaiting = leads.filter((l) => !l.firstContactAt && l.status !== 'won' && l.status !== 'lost').length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Leads</h1>
          <p className="mt-1 text-sm text-white/45">
            {leads.length} Vorgänge
            {awaiting > 0 ? (
              <>
                {' · '}
                <span className="text-gold-300">{awaiting} ohne Erstkontakt</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, E-Mail, Referenz …"
              className={`${inputClass} w-56 py-2 pl-9 text-sm`}
            />
          </div>

          <div className="flex gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg p-1.5 transition-colors ${
                  view === v ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/70'
                }`}
                aria-label={v === 'board' ? 'Board-Ansicht' : 'Listen-Ansicht'}
              >
                {v === 'board' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </header>

      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <SlidersHorizontal className="size-4 text-white/25" />
        <div className="flex flex-wrap gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setParam('scope', s.value === 'all' ? '' : s.value)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                scope === s.value ? 'bg-gold-500/18 text-gold-200' : 'text-white/40 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-white/8" />

        <select
          value={teamId}
          onChange={(e) => setParam('teamId', e.target.value)}
          className="rounded-lg border border-white/8 bg-ink-900 px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-gold-500/50"
        >
          <option value="">Alle Gruppen</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          className="rounded-lg border border-white/8 bg-ink-900 px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-gold-500/50"
        >
          <option value="newest">Neueste zuerst</option>
          <option value="sla">Reaktionsfrist</option>
          <option value="score">Score</option>
          <option value="volume">Volumen</option>
          <option value="oldest">Älteste zuerst</option>
        </select>

        {status ? (
          <button
            onClick={() => setParam('status', '')}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/6 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            <Filter className="size-3" /> {STAGE_LABEL[status as LeadStatus] ?? status} ✕
          </button>
        ) : null}
      </Card>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox className="size-10" />} title="Keine Leads gefunden." hint="Filter zurücksetzen oder eine neue Anfrage über den Wizard anlegen." />
        </Card>
      ) : view === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const items = grouped.get(stage) ?? [];
            const tone = STATUS_TONE[stage];
            const value = items.reduce((sum, l) => sum + l.volumeValue, 0);
            return (
              <div key={stage} className="w-[19rem] shrink-0">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <span className={`size-2 rounded-full ${tone.dot}`} />
                    {STAGE_LABEL[stage]}
                    <span className="text-white/30">{items.length}</span>
                  </span>
                  <span className="text-[11px] text-white/30">{formatCompactCurrency(value)}</span>
                </div>
                <div className="space-y-2.5">
                  <AnimatePresence mode="popLayout">
                    {items.map((lead, i) => (
                      <LeadCard key={lead.id} lead={lead} index={i} highlight={lead.ownerId === user?.id} />
                    ))}
                  </AnimatePresence>
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/8 px-4 py-8 text-center text-xs text-white/20">
                      leer
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[11px] tracking-wide text-white/35 uppercase">
                <th className="px-4 py-3 font-medium">Interessent</th>
                <th className="px-4 py-3 font-medium">Fachgebiet</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Volumen</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Berater</th>
                <th className="px-4 py-3 font-medium">Reaktion</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Eingang</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/4 transition-colors last:border-0 hover:bg-white/4">
                  <td className="px-4 py-3">
                    <Link to={`/app/leads/${lead.id}`} className="block">
                      <span className="font-medium text-white/90">{lead.name}</span>
                      <span className="block font-mono text-[10px] text-white/30">{lead.ref}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/60">{lead.assetClass ?? '–'}</td>
                  <td className="hidden px-4 py-3 text-white/60 lg:table-cell">{lead.volumeLabel || '–'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} label={lead.statusLabel} />
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {lead.owner ? (
                      <span className="flex items-center gap-2">
                        <Avatar name={lead.owner.name} accent={lead.owner.accent} size={24} />
                        <span className="text-xs text-white/60">{lead.owner.name}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-white/25">offen</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SlaClock
                      dueAt={lead.slaDueAt}
                      firstContactAt={lead.firstContactAt}
                      responseSeconds={lead.responseSeconds}
                      breached={lead.slaBreached}
                      size="sm"
                    />
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-white/35 sm:table-cell">{formatRelative(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function LeadCard({ lead, index, highlight }: { lead: Lead; index: number; highlight: boolean }) {
  const urgent = !lead.firstContactAt && lead.status !== 'won' && lead.status !== 'lost';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/app/leads/${lead.id}`}
        className={`group block rounded-xl border bg-ink-850/70 p-3.5 transition-all hover:-translate-y-0.5 hover:bg-ink-800/80 ${
          lead.slaBreached && urgent
            ? 'border-danger/40'
            : highlight
              ? 'border-gold-500/35'
              : 'border-white/8 hover:border-white/18'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/92">{lead.name}</p>
            <p className="truncate text-xs text-white/38">
              {lead.assetClass}
              {lead.company ? ` · ${lead.company}` : ''}
            </p>
          </div>
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              background: `${lead.teamColor ?? '#C8A24A'}1a`,
              color: lead.teamColor ?? '#C8A24A',
            }}
            title={`Score ${lead.score}/100`}
          >
            {lead.score}
          </span>
        </div>

        <p className="mt-2.5 font-display text-base font-semibold text-white/85">{lead.volumeLabel || '–'}</p>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/6 pt-2.5">
          {lead.owner ? (
            <Avatar name={lead.owner.name} accent={lead.owner.accent} size={22} />
          ) : (
            <span className="text-[10px] text-white/25">nicht zugewiesen</span>
          )}
          <SlaClock
            dueAt={lead.slaDueAt}
            firstContactAt={lead.firstContactAt}
            responseSeconds={lead.responseSeconds}
            breached={lead.slaBreached}
            size="sm"
          />
        </div>
      </Link>
    </motion.div>
  );
}
