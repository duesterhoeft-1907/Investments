/** Aufgaben und Termine, gruppiert nach Fälligkeit. */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { formatDateTime, formatRelative } from '../core/format.js';
import { avatar, empty, spinner, toast } from '../core/ui.js';

const RECURRENCE = { daily: 'täglich', weekly: 'wöchentlich', biweekly: 'zweiwöchentlich', monthly: 'monatlich', quarterly: 'vierteljährlich' };
const KIND_ICON = { call: 'phone', meeting: 'users', task: 'calendar' };

export function render(view) {
  const state = { tasks: [], scope: 'mine', window: 'all', status: 'open', loading: true };

  const load = async () => {
    state.loading = true;
    paint();
    try {
      state.tasks = (await api.get(`/tasks?scope=${state.scope}&window=${state.window}&status=${state.status}`)).tasks;
    } finally {
      state.loading = false;
      paint();
    }
  };

  void load();

  async function toggle(task) {
    try {
      const result = await api.patch(`/tasks/${task.id}`, { status: task.status === 'done' ? 'open' : 'done' });
      if (result.followUp) toast('Erledigt – Folgetermin wurde automatisch angelegt.');
      await load();
    } catch (error) { toast(error.message, 'error'); }
  }

  function paint() {
    const groups = groupByDay(state.tasks);

    mount(view, h('div.stack', { style: { gap: '18px' } },
      h('div.page-head',
        h('div',
          h('h1', 'Aufgaben & Termine'),
          h('p', `${state.tasks.length} ${state.status === 'open' ? 'offen' : 'erledigt'} · wiederkehrende Termine erzeugen den Folgetermin automatisch`))),
      h('div.glass.filter-bar',
        filterGroup([['mine', 'Meine'], ['all', 'Alle']], 'scope'),
        h('span.divider-v'),
        filterGroup([['all', 'Alle'], ['overdue', 'Überfällig'], ['today', 'Heute'], ['week', 'Diese Woche']], 'window'),
        h('span.divider-v'),
        filterGroup([['open', 'Offen'], ['done', 'Erledigt']], 'status')),
      state.loading
        ? h('div.row', { style: { minHeight: '40vh', justifyContent: 'center' } }, spinner(28))
        : state.tasks.length === 0
          ? h('div.glass', empty('Nichts zu tun.', 'Keine Aufgaben im gewählten Zeitraum.'))
          : h('div.stack', { style: { gap: '18px' } }, groups.map(([label, items]) =>
              h('div.glass.card-pad',
                h('div.section-title', h('h2', label), h('span.hint', String(items.length))),
                h('div.stack', { style: { gap: '2px' } }, items.map(taskRow))))),
    ));
  }

  function filterGroup(options, key) {
    return h('div.row', { style: { gap: '4px' } },
      options.map(([value, label]) =>
        h('button.chip' + (state[key] === value ? '.on' : ''), { onclick: () => { state[key] = value; void load(); } }, label)));
  }

  function taskRow(task, index) {
    const overdue = task.status === 'open' && task.dueAt && new Date(task.dueAt) < new Date();
    return h('div.task-row' + (task.status === 'done' ? '.done' : ''), { style: { animationDelay: Math.min(index * 20, 300) + 'ms' } },
      h('button.tick' + (task.status === 'done' ? '.on' : ''), {
        'aria-label': task.status === 'done' ? 'Wieder öffnen' : 'Als erledigt markieren',
        onclick: () => toggle(task),
      }, icon('check', 13)),
      h('span.faint', { style: { display: 'flex', marginTop: '2px' } }, icon(KIND_ICON[task.kind] ?? 'calendar', 15)),
      h('div.grow',
        h('p.title', task.title),
        h('p.sub',
          h('span', { style: { color: overdue ? '#f0a5a2' : undefined } }, formatDateTime(task.dueAt)),
          h('span', '·'),
          h('span', formatRelative(task.dueAt)),
          task.leadId ? h('a', { href: `/app/leads/${task.leadId}`, style: { color: 'var(--steel-400)' } }, '· ' + task.leadName) : null,
          task.recurrence !== 'none'
            ? h('span.row', { style: { gap: '4px', color: 'var(--orchid-400)' } }, icon('repeat', 11), RECURRENCE[task.recurrence] ?? task.recurrence)
            : null),
        task.description ? h('p.faint', { style: { marginTop: '4px', fontSize: '12px' } }, task.description) : null),
      task.assignee ? avatar(task.assignee.name, task.assignee.accent, 26) : null,
    );
  }
}

/** Überfällig / Heute / Morgen zuerst, danach nach Datum. */
function groupByDay(tasks) {
  const now = new Date();
  const today = now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString();
  const map = new Map();

  for (const task of tasks) {
    let label;
    if (!task.dueAt) label = 'Ohne Termin';
    else {
      const due = new Date(task.dueAt);
      if (task.status === 'open' && due < now && due.toDateString() !== today) label = 'Überfällig';
      else if (due.toDateString() === today) label = 'Heute';
      else if (due.toDateString() === tomorrow) label = 'Morgen';
      else label = due.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(task);
  }

  const order = ['Überfällig', 'Heute', 'Morgen'];
  return [...map.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, 'de');
  });
}
