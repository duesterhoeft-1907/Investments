/** Lead-Übersicht als Board und als Liste. */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { pulse } from '../core/pulse.js';
import { formatCompact, formatRelative } from '../core/format.js';
import { avatar, empty, slaClock, spinner, statusBadge } from '../core/ui.js';

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const STAGE_LABEL = { new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert', proposal: 'Angebot', won: 'Gewonnen', lost: 'Verloren' };
const STAGE_DOT = { new: 'var(--accent-400)', contacted: 'var(--steel-400)', qualified: 'var(--orchid-400)', proposal: '#9db6ff', won: '#7fd3a6', lost: 'rgba(255,255,255,0.35)' };

const SCOPES = [
  ['all', 'Alle'], ['mine', 'Meine'], ['my-teams', 'Meine Gruppen'],
  ['awaiting', 'Ohne Erstkontakt'], ['unassigned', 'Nicht zugewiesen'],
];

export function render(view, { session }) {
  const params = new URLSearchParams(location.search);
  const state = {
    leads: [], teams: [], loading: true,
    view: localStorage.getItem('leadsView') || 'board',
    scope: params.get('scope') || 'all',
    status: params.get('status') || '',
    teamId: params.get('teamId') || '',
    sort: params.get('sort') || 'newest',
    q: params.get('q') || '',
  };
  let searchTimer = null;

  const load = async () => {
    const query = new URLSearchParams({ scope: state.scope, sort: state.sort, limit: '200' });
    if (state.status) query.set('status', state.status);
    if (state.teamId) query.set('teamId', state.teamId);
    if (state.q) query.set('q', state.q);
    try {
      state.leads = (await api.get('/leads?' + query)).leads;
    } finally {
      state.loading = false;
      paint();
    }
  };

  const syncUrl = () => {
    const next = new URLSearchParams();
    if (state.scope !== 'all') next.set('scope', state.scope);
    if (state.status) next.set('status', state.status);
    if (state.teamId) next.set('teamId', state.teamId);
    if (state.sort !== 'newest') next.set('sort', state.sort);
    if (state.q) next.set('q', state.q);
    const qs = next.toString();
    history.replaceState({}, '', '/app/leads' + (qs ? '?' + qs : ''));
  };

  const upsert = (lead) => {
    const index = state.leads.findIndex((l) => l.id === lead.id);
    if (index >= 0) state.leads[index] = lead;
    else state.leads.unshift(lead);
    paint();
  };

  const offNew = pulse.on('lead:new', (p) => p.lead && upsert(p.lead));
  const offUpdated = pulse.on('lead:updated', (p) => p.lead && upsert(p.lead));
  const offSla = pulse.on('lead:sla', (p) => p.lead && upsert(p.lead));

  api.get('/directory/teams').then((d) => { state.teams = d.teams; paint(); }).catch(() => {});
  mount(view, h('div.row', { style: { minHeight: '50vh', justifyContent: 'center' } }, spinner(28)));
  void load();

  function paint() {
    const awaiting = state.leads.filter((l) => !l.firstContactAt && l.status !== 'won' && l.status !== 'lost').length;

    mount(view, h('div.stack', { style: { gap: '18px' } },
      h('div.page-head',
        h('div',
          h('h1', 'Leads'),
          h('p', `${state.leads.length} Vorgänge`,
            awaiting > 0 ? h('span', ' · ', h('span', { style: { color: 'var(--accent-300)' } }, `${awaiting} ohne Erstkontakt`)) : null)),
        h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } }, searchBox(), viewToggle()),
      ),
      filterBar(),
      state.loading
        ? h('div.row', { style: { minHeight: '40vh', justifyContent: 'center' } }, spinner(28))
        : state.leads.length === 0
          ? h('div.glass', empty('Keine Leads gefunden.', 'Filter zurücksetzen oder eine neue Anfrage über den Wizard anlegen.'))
          : state.view === 'board' ? boardView() : tableView(),
    ));
  }

  function searchBox() {
    const input = h('input.input', {
      value: state.q, placeholder: 'Name, E-Mail, Referenz …',
      style: { width: '224px', padding: '8px 12px 8px 34px', fontSize: '14px' },
      oninput: (e) => {
        state.q = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { syncUrl(); void load(); }, 350);
      },
    });
    return h('div', { style: { position: 'relative' } },
      h('span', { style: { position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' } }, icon('search', 15)),
      input);
  }

  function viewToggle() {
    return h('div.row', { style: { gap: '4px', padding: '4px', border: '1px solid var(--hairline)', background: 'rgba(11,15,20,0.6)', borderRadius: '12px' } },
      [['board', 'grid'], ['list', 'list']].map(([mode, iconName]) =>
        h('button.icon-btn' + (state.view === mode ? '.on' : ''), {
          style: { padding: '6px', background: state.view === mode ? 'rgba(255,255,255,0.1)' : 'none', color: state.view === mode ? 'var(--text)' : 'var(--text-faint)' },
          'aria-label': mode === 'board' ? 'Board-Ansicht' : 'Listen-Ansicht',
          onclick: () => { state.view = mode; localStorage.setItem('leadsView', mode); paint(); },
        }, icon(iconName, 16))));
  }

  function filterBar() {
    return h('div.glass.filter-bar',
      icon('filter', 15, 'faint'),
      h('div.row', { style: { gap: '4px', flexWrap: 'wrap' } },
        SCOPES.map(([value, label]) =>
          h('button.chip' + (state.scope === value ? '.on' : ''), {
            onclick: () => { state.scope = value; syncUrl(); void load(); },
          }, label))),
      h('span.divider-v'),
      h('select.input', {
        style: { width: 'auto', padding: '6px 10px', fontSize: '12px' },
        value: state.teamId,
        onchange: (e) => { state.teamId = e.target.value; syncUrl(); void load(); },
      },
        h('option', { value: '' }, 'Alle Gruppen'),
        state.teams.map((t) => h('option', { value: String(t.id), selected: String(t.id) === state.teamId }, t.name))),
      h('select.input', {
        style: { width: 'auto', padding: '6px 10px', fontSize: '12px' },
        value: state.sort,
        onchange: (e) => { state.sort = e.target.value; syncUrl(); void load(); },
      },
        [['newest', 'Neueste zuerst'], ['sla', 'Reaktionsfrist'], ['score', 'Score'], ['volume', 'Volumen'], ['oldest', 'Älteste zuerst']]
          .map(([v, l]) => h('option', { value: v, selected: v === state.sort }, l))),
      state.status
        ? h('button.chip.on', { style: { marginLeft: 'auto' }, onclick: () => { state.status = ''; syncUrl(); void load(); } },
            `${STAGE_LABEL[state.status] ?? state.status} ✕`)
        : null,
    );
  }

  function boardView() {
    const grouped = new Map(STAGES.map((s) => [s, []]));
    for (const lead of state.leads) grouped.get(lead.status)?.push(lead);

    return h('div.board', STAGES.map((stage) => {
      const items = grouped.get(stage) ?? [];
      const value = items.reduce((sum, l) => sum + l.volumeValue, 0);
      return h('div.board-col',
        h('div.head',
          h('span.name',
            h('span.dot', { style: { background: STAGE_DOT[stage] } }),
            STAGE_LABEL[stage],
            h('span.faint', String(items.length))),
          h('span.faint', { style: { fontSize: '11px' } }, formatCompact(value))),
        h('div.cards',
          items.length === 0
            ? h('div.placeholder', 'leer')
            : items.map((lead, i) => leadCard(lead, i))),
      );
    }));
  }

  function leadCard(lead, index) {
    const urgent = !lead.firstContactAt && lead.status !== 'won' && lead.status !== 'lost';
    const classes = ['lead-card'];
    if (lead.slaBreached && urgent) classes.push('breached');
    else if (lead.ownerId === session.user.id) classes.push('mine');

    return h('a.' + classes.join('.'), {
      href: `/app/leads/${lead.id}`,
      style: { animationDelay: Math.min(index * 30, 300) + 'ms' },
    },
      h('div.row', { style: { alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' } },
        h('div.grow',
          h('p.name.truncate', lead.name),
          h('p.meta.truncate', (lead.assetClass ?? '') + (lead.company ? ' · ' + lead.company : ''))),
        h('span.score', { title: `Score ${lead.score}/100`, style: { background: (lead.teamColor || '#21b4a6') + '1a', color: lead.teamColor || '#21b4a6' } }, String(lead.score))),
      h('p.volume', lead.volumeLabel || '–'),
      h('div.foot',
        lead.owner ? avatar(lead.owner.name, lead.owner.accent, 22) : h('span.faint', { style: { fontSize: '10px' } }, 'nicht zugewiesen'),
        slaClock(lead, 'sm')),
    );
  }

  function tableView() {
    return h('div.glass', { style: { overflow: 'hidden' } },
      h('table.data',
        h('thead', h('tr',
          h('th', 'Interessent'), h('th', 'Fachgebiet'), h('th', 'Volumen'),
          h('th', 'Status'), h('th', 'Berater'), h('th', 'Reaktion'), h('th', 'Eingang'))),
        h('tbody', state.leads.map((lead) =>
          h('tr',
            h('td', h('a', { href: `/app/leads/${lead.id}` },
              h('span', { style: { fontWeight: '500' } }, lead.name),
              h('span.mono.faint', { style: { display: 'block', fontSize: '10px' } }, lead.ref))),
            h('td.muted', lead.assetClass ?? '–'),
            h('td.muted', lead.volumeLabel || '–'),
            h('td', statusBadge(lead.status, lead.statusLabel)),
            h('td', lead.owner
              ? h('span.row', { style: { gap: '8px' } }, avatar(lead.owner.name, lead.owner.accent, 24), h('span.faint', { style: { fontSize: '12px' } }, lead.owner.name))
              : h('span.faint', { style: { fontSize: '12px' } }, 'offen')),
            h('td', slaClock(lead, 'sm')),
            h('td.faint', { style: { fontSize: '12px' } }, formatRelative(lead.createdAt))))),
      ));
  }

  return () => { offNew(); offUpdated(); offSla(); clearTimeout(searchTimer); };
}
