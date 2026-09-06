import { motion } from 'framer-motion';
import { CalendarCheck, Check, Phone, Repeat, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/format';
import type { Task } from '../lib/types';
import { Avatar, Card, EmptyState, SectionTitle, Spinner } from '../components/ui';

const SCOPES = [
  { value: 'mine', label: 'Meine' },
  { value: 'all', label: 'Alle' },
];
const WINDOWS = [
  { value: 'all', label: 'Alle' },
  { value: 'overdue', label: 'Überfällig' },
  { value: 'today', label: 'Heute' },
  { value: 'week', label: 'Diese Woche' },
];

const KIND_ICON = { call: Phone, meeting: Users, task: CalendarCheck } as const;

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scope, setScope] = useState('mine');
  const [window, setWindow] = useState('all');
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api
      .get<{ tasks: Task[] }>(`/tasks?scope=${scope}&window=${window}&status=${status}`)
      .then((d) => setTasks(d.tasks))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [scope, window, status]);

  useEffect(load, [load]);

  async function toggle(task: Task) {
    const res = await api
      .patch<{ followUp: Task | null }>(`/tasks/${task.id}`, {
        status: task.status === 'done' ? 'open' : 'done',
      })
      .catch(() => null);
    load();
    if (res?.followUp) {
      // Wiederkehrender Termin: der Folgetermin wurde automatisch erzeugt.
      setTimeout(load, 200);
    }
  }

  const groups = groupByDay(tasks);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Aufgaben & Termine</h1>
        <p className="mt-1 text-sm text-white/45">
          {tasks.length} {status === 'open' ? 'offen' : 'erledigt'} · wiederkehrende Termine erzeugen den Folgetermin automatisch
        </p>
      </header>

      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Filter options={SCOPES} value={scope} onChange={setScope} />
        <span className="h-5 w-px bg-white/8" />
        <Filter options={WINDOWS} value={window} onChange={setWindow} />
        <span className="h-5 w-px bg-white/8" />
        <Filter
          options={[{ value: 'open', label: 'Offen' }, { value: 'done', label: 'Erledigt' }]}
          value={status}
          onChange={(v) => setStatus(v as 'open' | 'done')}
        />
      </Card>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarCheck className="size-10" />} title="Nichts zu tun." hint="Keine Aufgaben im gewählten Zeitraum." />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, items]) => (
            <Card key={label} className="p-5">
              <SectionTitle hint={`${items.length}`}>{label}</SectionTitle>
              <ul className="space-y-1">
                {items.map((task, i) => {
                  const Icon = KIND_ICON[task.kind] ?? CalendarCheck;
                  const overdue = task.status === 'open' && task.dueAt && new Date(task.dueAt) < new Date();
                  return (
                    <motion.li
                      key={task.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/4"
                    >
                      <button
                        onClick={() => toggle(task)}
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          task.status === 'done'
                            ? 'border-emerald-400 bg-emerald-400 text-ink-950'
                            : 'border-white/20 hover:border-gold-400'
                        }`}
                        aria-label={task.status === 'done' ? 'Wieder öffnen' : 'Als erledigt markieren'}
                      >
                        {task.status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      </button>

                      <Icon className="mt-0.5 size-4 shrink-0 text-white/25" />

                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${task.status === 'done' ? 'text-white/30 line-through' : 'text-white/88'}`}>
                          {task.title}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-white/32">
                          <span className={overdue ? 'text-red-300' : ''}>{formatDateTime(task.dueAt)}</span>
                          <span>·</span>
                          <span>{formatRelative(task.dueAt)}</span>
                          {task.leadId ? (
                            <>
                              <span>·</span>
                              <Link to={`/app/leads/${task.leadId}`} className="text-steel-400 hover:text-gold-300">
                                {task.leadName}
                              </Link>
                            </>
                          ) : null}
                          {task.recurrence !== 'none' ? (
                            <span className="flex items-center gap-1 text-orchid-400">
                              <Repeat className="size-3" /> {RECURRENCE[task.recurrence] ?? task.recurrence}
                            </span>
                          ) : null}
                        </p>
                        {task.description ? (
                          <p className="mt-1 text-xs text-white/40">{task.description}</p>
                        ) : null}
                      </div>

                      {task.assignee ? (
                        <Avatar name={task.assignee.name} accent={task.assignee.accent} size={26} />
                      ) : null}
                    </motion.li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const RECURRENCE: Record<string, string> = {
  daily: 'täglich', weekly: 'wöchentlich', biweekly: 'zweiwöchentlich',
  monthly: 'monatlich', quarterly: 'vierteljährlich',
};

function Filter({
  options, value, onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-gold-500/18 text-gold-200' : 'text-white/40 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Gruppiert nach Überfällig / Heute / Morgen / Datum – nach Fälligkeit sortiert. */
function groupByDay(tasks: Task[]): Array<[string, Task[]]> {
  const now = new Date();
  const today = now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000).toDateString();
  const map = new Map<string, Task[]>();

  for (const task of tasks) {
    if (!task.dueAt) {
      push(map, 'Ohne Termin', task);
      continue;
    }
    const due = new Date(task.dueAt);
    let label: string;
    if (task.status === 'open' && due < now && due.toDateString() !== today) label = 'Überfällig';
    else if (due.toDateString() === today) label = 'Heute';
    else if (due.toDateString() === tomorrow) label = 'Morgen';
    else label = due.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
    push(map, label, task);
  }

  const order = ['Überfällig', 'Heute', 'Morgen'];
  return [...map.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, 'de');
  });
}

function push(map: Map<string, Task[]>, key: string, task: Task): void {
  const list = map.get(key) ?? [];
  list.push(task);
  map.set(key, list);
}
