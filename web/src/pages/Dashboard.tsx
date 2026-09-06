import { motion } from 'framer-motion';
import {
  AlertTriangle, ArrowUpRight, Clock, Flame, Gauge, Timer, TrendingUp, Trophy, Users, Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { formatCompactCurrency, formatDate, formatRelative, STATUS_TONE } from '../lib/format';
import { useLeadEvents, useSession } from '../lib/session';
import type { DashboardStats } from '../lib/types';
import { SlaClock } from '../components/SlaClock';
import { Avatar, Card, Counter, EmptyState, Progress, SectionTitle, Spinner, StatusBadge } from '../components/ui';

export default function Dashboard() {
  const { user, subscribe } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    api.get<DashboardStats>(`/stats/dashboard?days=${days}`).then(setStats).catch(() => undefined);
  }, [days]);

  useEffect(load, [load]);

  // Kennzahlen sind teuer – nach einem Ereignis kurz sammeln und dann einmal neu laden.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribe('stats:dirty', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 1200);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [subscribe, load]);

  useLeadEvents({ onNew: load, onSla: load });

  if (!stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={30} />
      </div>
    );
  }

  const { totals } = stats;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
            Guten Tag, {user?.name.split(' ')[0]}.
          </h1>
          <p className="mt-1 text-sm text-white/45">
            {totals.awaiting > 0 ? (
              <>
                <strong className="text-gold-300">{totals.awaiting} Anfragen</strong> warten auf den Erstkontakt.
              </>
            ) : (
              'Alle Anfragen sind kontaktiert. Sauber.'
            )}
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                days === d ? 'bg-gold-500/18 text-gold-200' : 'text-white/40 hover:text-white/75'
              }`}
            >
              {d} Tage
            </button>
          ))}
        </div>
      </header>

      {/* ── Kennzahlen ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Timer}
          label="Ø Reaktionszeit"
          value={totals.avgResponseLabel ?? '–'}
          sub={totals.medianResponseLabel ? `Median ${totals.medianResponseLabel}` : 'noch keine Messung'}
          tone="gold"
          delay={0}
        />
        <Metric
          icon={Gauge}
          label="SLA-Quote"
          value={totals.slaComplianceRate === null ? '–' : `${totals.slaComplianceRate} %`}
          sub={`${totals.breached} Überschreitungen bei ${totals.answered} Kontakten`}
          tone={totals.slaComplianceRate !== null && totals.slaComplianceRate < 80 ? 'danger' : 'success'}
          progress={totals.slaComplianceRate ?? undefined}
          delay={0.06}
        />
        <Metric
          icon={Wallet}
          label="Pipeline"
          value={formatCompactCurrency(totals.pipelineValue)}
          sub={`${formatCompactCurrency(totals.wonValue)} gewonnen`}
          tone="gold"
          delay={0.12}
        />
        <Metric
          icon={TrendingUp}
          label="Abschlussquote"
          value={`${totals.conversionRate} %`}
          sub={`${totals.won} von ${totals.leads} Anfragen`}
          tone="success"
          progress={totals.conversionRate}
          delay={0.18}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ── Dringend ── */}
        <Card className="xl:col-span-1" delay={0.1}>
          <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Flame className="size-4 text-gold-400" />
              Wartet auf Erstkontakt
            </h2>
            {stats.urgent.length > 0 ? (
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                {stats.urgent.length}
              </span>
            ) : null}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {stats.urgent.length === 0 ? (
              <EmptyState title="Nichts offen." hint="Jede eingegangene Anfrage wurde bereits kontaktiert." />
            ) : (
              stats.urgent.map((lead) => (
                <Link
                  key={lead.id}
                  to={`/app/leads/${lead.id}`}
                  className="flex items-center gap-3 border-b border-white/4 px-5 py-3 transition-colors last:border-0 hover:bg-white/4"
                >
                  <span
                    className="h-9 w-0.5 shrink-0 rounded-full"
                    style={{ background: lead.teamColor ?? '#C8A24A' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/90">{lead.name}</p>
                    <p className="truncate text-xs text-white/40">
                      {lead.assetClass} · {lead.volumeLabel}
                    </p>
                  </div>
                  <SlaClock
                    dueAt={lead.slaDueAt}
                    firstContactAt={lead.firstContactAt}
                    responseSeconds={lead.responseSeconds}
                    breached={lead.slaBreached}
                    size="sm"
                  />
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* ── Verlauf ── */}
        <Card className="p-5 xl:col-span-2" delay={0.16}>
          <SectionTitle hint={`letzte ${days} Tage`}>Anfragen & Reaktionszeit</SectionTitle>
          {stats.timeline.length === 0 ? (
            <EmptyState title="Noch keine Daten im Zeitraum." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.timeline.map((t) => ({ ...t, avgMin: t.avgResponse ? Math.round(t.avgResponse / 60) : null }))}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8A24A" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#C8A24A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="day" tickFormatter={(d: string) => formatDate(d).slice(0, 6)}
                  stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false}
                />
                <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: '#10161d', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, fontSize: 12, color: '#e8edf3',
                  }}
                  labelFormatter={(d) => formatDate(String(d))}
                  formatter={(value, name) =>
                    name === 'avgMin' ? [`${value} Min.`, 'Ø Reaktion'] : [value, name === 'leads' ? 'Anfragen' : 'Gewonnen']
                  }
                />
                <Area type="monotone" dataKey="leads" stroke="#C8A24A" strokeWidth={2} fill="url(#leadFill)" />
                <Area type="monotone" dataKey="won" stroke="#4ea87b" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ── Fachgruppen ── */}
        <Card className="p-5 xl:col-span-2" delay={0.2}>
          <SectionTitle hint="Reaktionszeit gegen Gruppen-SLA">Fachgruppen</SectionTitle>
          <div className="space-y-4">
            {stats.byTeam.map((team) => {
              const avgMin = team.avgResponse ? team.avgResponse / 60 : null;
              const ratio = avgMin === null ? 0 : Math.min(100, (avgMin / team.slaMinutes) * 100);
              return (
                <div key={team.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-white/85">
                      <span className="size-2 rounded-full" style={{ background: team.color }} />
                      {team.name}
                    </span>
                    <span className="text-xs text-white/40">
                      {team.leads} Leads ·{' '}
                      <span className={ratio > 100 ? 'text-red-300' : 'text-emerald-300'}>
                        {team.avgResponseLabel ?? 'keine Messung'}
                      </span>{' '}
                      / Ziel {team.slaMinutes} Min.
                    </span>
                  </div>
                  <Progress value={ratio} tone={ratio > 100 ? 'danger' : ratio > 70 ? 'gold' : 'success'} />
                  {team.awaiting > 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-gold-300/80">
                      <AlertTriangle className="size-3" /> {team.awaiting} offen
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-7">
            <SectionTitle>Nachfrage nach Fachgebiet</SectionTitle>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={stats.byAsset.filter((a) => a.leads > 0)} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category" dataKey="name" width={140}
                  stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: '#10161d', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, fontSize: 12, color: '#e8edf3',
                  }}
                  formatter={(value) => [`${value} Anfragen`, '']}
                />
                <Bar dataKey="leads" radius={[0, 6, 6, 0]} barSize={13}>
                  {stats.byAsset.map((_, i) => (
                    <Cell key={i} fill={['#C8A24A', '#7FA8B8', '#A88BC4'][i % 3]} fillOpacity={0.82} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-5">
          {/* ── Bestenliste ── */}
          <Card className="p-5" delay={0.24}>
            <SectionTitle hint="schnellste zuerst">
              <span className="flex items-center gap-2">
                <Trophy className="size-4 text-gold-400" /> Reaktionszeiten
              </span>
            </SectionTitle>
            {stats.leaderboard.length === 0 ? (
              <EmptyState title="Noch keine Zuweisungen." />
            ) : (
              <ol className="space-y-2.5">
                {stats.leaderboard.slice(0, 8).map((agent, i) => (
                  <li key={agent.id} className="flex items-center gap-3">
                    <span
                      className={`w-4 text-center text-xs font-bold ${i === 0 ? 'text-gold-300' : 'text-white/25'}`}
                    >
                      {i + 1}
                    </span>
                    <Avatar
                      name={agent.name}
                      accent={agent.accent}
                      size={30}
                      online={stats.onlineUserIds.includes(agent.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/85">{agent.name}</p>
                      <p className="text-[11px] text-white/35">
                        {agent.leads} Leads · {agent.won} gewonnen
                      </p>
                    </div>
                    <span
                      className={`font-mono text-xs ${agent.breached > 0 ? 'text-gold-300' : 'text-emerald-300'}`}
                    >
                      {agent.avgResponseLabel ?? '–'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* ── Trichter ── */}
          <Card className="p-5" delay={0.28}>
            <SectionTitle>Pipeline</SectionTitle>
            <div className="space-y-2">
              {stats.byStatus.map((s) => {
                const tone = STATUS_TONE[s.status] ?? STATUS_TONE.lost;
                const share = totals.leads ? (s.count / totals.leads) * 100 : 0;
                return (
                  <Link
                    key={s.status}
                    to={`/app/leads?status=${s.status}`}
                    className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-white/4"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <StatusBadge status={s.status} label={s.label} />
                      <span className="text-white/45">
                        {s.count} · {formatCompactCurrency(s.value)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/6">
                      <motion.div
                        className={`h-full rounded-full ${tone.dot}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${share}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <MyDay />
    </div>
  );
}

function Metric({
  icon: Icon, label, value, sub, tone, progress, delay,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  sub: string;
  tone: 'gold' | 'success' | 'danger';
  progress?: number;
  delay: number;
}) {
  const colors = {
    gold: 'text-gold-300 bg-gold-500/12 border-gold-500/25',
    success: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25',
    danger: 'text-red-300 bg-danger/12 border-danger/30',
  }[tone];

  return (
    <Card className="relative overflow-hidden p-5" delay={delay}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.14em] text-white/35 uppercase">{label}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">
            <Counter value={0} format={() => value} />
          </p>
          <p className="mt-1 truncate text-xs text-white/38">{sub}</p>
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${colors}`}>
          <Icon className="size-4" />
        </span>
      </div>
      {progress !== undefined ? (
        <div className="mt-4">
          <Progress value={progress} tone={tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'gold'} />
        </div>
      ) : null}
    </Card>
  );
}

interface MyDayData {
  leads: Array<{ id: number; name: string; assetClass: string | null; slaDueAt: string | null; firstContactAt: string | null; responseSeconds: number | null; slaBreached: boolean; status: string; statusLabel: string }>;
  tasks: Array<{ id: number; leadId: number | null; leadName: string | null; kind: string; title: string; dueAt: string | null; recurrence: string }>;
  stats: { open: number; awaiting: number; avgResponseLabel: string | null };
}

function MyDay() {
  const [data, setData] = useState<MyDayData | null>(null);

  useEffect(() => {
    api.get<MyDayData>('/stats/my-day').then(setData).catch(() => undefined);
  }, []);

  if (!data) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5" delay={0.3}>
        <SectionTitle hint={data.stats.avgResponseLabel ? `Ø ${data.stats.avgResponseLabel}` : undefined}>
          <span className="flex items-center gap-2">
            <Users className="size-4 text-steel-400" /> Meine offenen Leads
          </span>
        </SectionTitle>
        {data.leads.length === 0 ? (
          <EmptyState title="Keine offenen Leads." hint="Alles abgearbeitet oder noch nichts zugewiesen." />
        ) : (
          <ul className="space-y-1">
            {data.leads.slice(0, 8).map((lead) => (
              <li key={lead.id}>
                <Link
                  to={`/app/leads/${lead.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/85">{lead.name}</p>
                    <p className="truncate text-xs text-white/35">{lead.assetClass}</p>
                  </div>
                  <StatusBadge status={lead.status} label={lead.statusLabel} />
                  <SlaClock
                    dueAt={lead.slaDueAt}
                    firstContactAt={lead.firstContactAt}
                    responseSeconds={lead.responseSeconds}
                    breached={lead.slaBreached}
                    size="sm"
                  />
                  <ArrowUpRight className="size-3.5 text-white/0 transition-colors group-hover:text-white/40" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5" delay={0.34}>
        <SectionTitle hint={<Link to="/app/tasks" className="hover:text-gold-300">alle anzeigen</Link>}>
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-orchid-400" /> Anstehend
          </span>
        </SectionTitle>
        {data.tasks.length === 0 ? (
          <EmptyState title="Keine offenen Aufgaben." />
        ) : (
          <ul className="space-y-1">
            {data.tasks.slice(0, 8).map((task) => {
              const overdue = task.dueAt ? new Date(task.dueAt) < new Date() : false;
              return (
                <li key={task.id}>
                  <Link
                    to={task.leadId ? `/app/leads/${task.leadId}` : '/app/tasks'}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/4"
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${overdue ? 'bg-danger' : 'bg-white/25'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/85">{task.title}</p>
                      <p className="truncate text-xs text-white/35">
                        {task.leadName ?? 'ohne Lead'}
                        {task.recurrence !== 'none' ? ' · wiederkehrend' : ''}
                      </p>
                    </div>
                    <span className={`text-xs ${overdue ? 'text-red-300' : 'text-white/40'}`}>
                      {formatRelative(task.dueAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
