/** Kennzahlen mit Schwerpunkt Reaktionsgeschwindigkeit. */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { pulse } from '../core/pulse.js';
import { formatCompact, formatDate, formatRelative } from '../core/format.js';
import { areaChart, avatar, barChart, empty, progress, slaClock, spinner, statusBadge } from '../core/ui.js';

const STATUS_COLOR = {
  new: 'var(--gold-400)', contacted: 'var(--steel-400)', qualified: 'var(--orchid-400)',
  proposal: '#9db6ff', won: '#7fd3a6', lost: 'rgba(255,255,255,0.35)',
};

export function render(view, { session, navigate }) {
  let days = 30;
  let stats = null;
  let myDay = null;
  let refreshTimer = null;

  const load = async () => {
    [stats, myDay] = await Promise.all([
      api.get(`/stats/dashboard?days=${days}`),
      api.get('/stats/my-day').catch(() => null),
    ]);
    paint();
  };

  // Kennzahlen sind teuer – nach einem Ereignis kurz sammeln, dann einmal laden.
  const offDirty = pulse.on('stats:dirty', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { void load(); }, 1500);
  });
  const offNew = pulse.on('lead:new', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { void load(); }, 1500);
  });

  mount(view, h('div.row', { style: { minHeight: '50vh', justifyContent: 'center' } }, spinner(28)));
  void load();

  function paint() {
    if (!stats) return;
    const t = stats.totals;

    mount(
      view,
      h('div.stack', { style: { gap: '22px' } },
        h('div.page-head',
          h('div',
            h('h1', `Guten Tag, ${session.user.name.split(' ')[0]}.`),
            h('p', t.awaiting > 0
              ? h('span', h('strong', { style: { color: 'var(--gold-300)' } }, `${t.awaiting} Anfragen`), ' warten auf den Erstkontakt.')
              : 'Alle Anfragen sind kontaktiert. Sauber.'),
          ),
          h('div.row', { style: { gap: '4px', padding: '4px', border: '1px solid var(--hairline)', background: 'rgba(11,15,20,0.6)', borderRadius: '12px' } },
            [7, 30, 90].map((d) =>
              h('button.chip' + (days === d ? '.on' : ''), { onclick: () => { days = d; void load(); } }, `${d} Tage`)),
          ),
        ),

        h('div.metric-grid',
          metric('timer', 'Ø Reaktionszeit', t.avgResponseLabel ?? '–',
            t.medianResponseLabel ? `Median ${t.medianResponseLabel}` : 'noch keine Messung', 'gold'),
          metric('gauge', 'SLA-Quote', t.slaComplianceRate === null ? '–' : `${t.slaComplianceRate} %`,
            `${t.breached} Überschreitungen bei ${t.answered} Kontakten`,
            t.slaComplianceRate !== null && t.slaComplianceRate < 80 ? 'danger' : 'success', t.slaComplianceRate),
          metric('wallet', 'Pipeline', formatCompact(t.pipelineValue), `${formatCompact(t.wonValue)} gewonnen`, 'gold'),
          metric('trending', 'Abschlussquote', `${t.conversionRate} %`, `${t.won} von ${t.leads} Anfragen`, 'success', t.conversionRate),
        ),

        h('div.grid-3',
          urgentCard(),
          h('div.glass.card-pad',
            h('div.section-title', h('h2', 'Anfragen & Reaktionszeit'), h('span.hint', `letzte ${days} Tage`)),
            areaChart(stats.timeline.map((p) => ({
              label: formatDate(p.day).slice(0, 6),
              value: p.leads,
              second: p.won,
            }))),
            h('div.row', { style: { gap: '16px', marginTop: '10px', fontSize: '11px', color: 'var(--text-faint)' } },
              legend('#C8A24A', 'Anfragen'), legend('#4ea87b', 'Gewonnen')),
          ),
        ),

        h('div.grid-3.rev',
          h('div.glass.card-pad',
            h('div.section-title', h('h2', 'Fachgruppen'), h('span.hint', 'Reaktionszeit gegen Gruppen-SLA')),
            h('div.stack', { style: { gap: '16px' } }, stats.byTeam.map(teamRow)),
            h('div', { style: { marginTop: '26px' } },
              h('div.section-title', h('h2', 'Nachfrage nach Fachgebiet')),
              stats.byAsset.filter((a) => a.leads > 0).length
                ? barChart(stats.byAsset.filter((a) => a.leads > 0).map((a, i) => ({
                    label: a.name, value: a.leads, color: ['#C8A24A', '#7FA8B8', '#A88BC4'][i % 3],
                  })), { height: 40 })
                : empty('Noch keine Anfragen im Zeitraum.'),
            ),
          ),
          h('div.stack', { style: { gap: '20px' } }, leaderboardCard(), funnelCard()),
        ),

        myDay ? myDayRow() : null,
      ),
    );
  }

  function legend(color, label) {
    return h('span.row', { style: { gap: '6px' } },
      h('span', { style: { width: '10px', height: '2px', background: color, borderRadius: '2px' } }), label);
  }

  function metric(name, label, value, sub, tone, bar) {
    return h('div.glass.metric',
      h('div.row', { style: { alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' } },
        h('div.grow',
          h('div.k', label),
          h('div.v', value),
          h('div.s.truncate', sub)),
        h('span.sym.' + tone, icon(name, 17))),
      bar !== undefined && bar !== null ? h('div', { style: { marginTop: '14px' } }, progress(bar, tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'gold')) : null,
    );
  }

  function urgentCard() {
    return h('div.glass', { style: { overflow: 'hidden' } },
      h('div.row', { style: { justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
        h('h2.row', { style: { gap: '8px', fontFamily: 'var(--font-display)', fontSize: '16px' } }, icon('flame', 16), 'Wartet auf Erstkontakt'),
        stats.urgent.length ? h('span', { style: { borderRadius: '999px', background: 'rgba(217,83,79,0.15)', color: '#f0a5a2', padding: '1px 8px', fontSize: '11px', fontWeight: '600' } }, String(stats.urgent.length)) : null),
      h('div', { style: { maxHeight: '26rem', overflowY: 'auto' } },
        stats.urgent.length === 0
          ? empty('Nichts offen.', 'Jede eingegangene Anfrage wurde bereits kontaktiert.')
          : stats.urgent.map((lead) =>
              h('a.list-row', { href: `/app/leads/${lead.id}` },
                h('span.accent', { style: { background: lead.teamColor || '#C8A24A' } }),
                h('div.grow',
                  h('p.truncate', { style: { fontSize: '14px', fontWeight: '500' } }, lead.name),
                  h('p.truncate.faint', { style: { fontSize: '12px' } }, `${lead.assetClass ?? ''} · ${lead.volumeLabel}`)),
                slaClock(lead, 'sm'))),
      ),
    );
  }

  function teamRow(team) {
    const avgMin = team.avgResponse ? team.avgResponse / 60 : null;
    const ratio = avgMin === null ? 0 : Math.min(100, (avgMin / team.slaMinutes) * 100);
    return h('div',
      h('div.row', { style: { justifyContent: 'space-between', gap: '12px', marginBottom: '6px', alignItems: 'baseline' } },
        h('span.row', { style: { gap: '8px', fontSize: '14px' } },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: team.color } }), team.name),
        h('span.faint', { style: { fontSize: '12px' } },
          `${team.leads} Leads · `,
          h('span', { style: { color: ratio > 100 ? '#f0a5a2' : '#7fd3a6' } }, team.avgResponseLabel ?? 'keine Messung'),
          ` / Ziel ${team.slaMinutes} Min.`)),
      progress(ratio, ratio > 100 ? 'danger' : ratio > 70 ? 'gold' : 'success'),
      team.awaiting > 0
        ? h('p.row', { style: { gap: '4px', marginTop: '4px', fontSize: '11px', color: 'rgba(224,194,116,0.8)' } }, icon('alert', 11), `${team.awaiting} offen`)
        : null,
    );
  }

  function leaderboardCard() {
    return h('div.glass.card-pad',
      h('div.section-title',
        h('h2.row', { style: { gap: '8px' } }, icon('trophy', 16), 'Reaktionszeiten'),
        h('span.hint', 'schnellste zuerst')),
      stats.leaderboard.length === 0
        ? empty('Noch keine Zuweisungen.')
        : h('ol.stack', { style: { gap: '10px', listStyle: 'none', padding: '0', margin: '0' } },
            stats.leaderboard.slice(0, 8).map((agent, i) =>
              h('li.row', { style: { gap: '12px' } },
                h('span', { style: { width: '16px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: i === 0 ? 'var(--gold-300)' : 'rgba(255,255,255,0.25)' } }, String(i + 1)),
                avatar(agent.name, agent.accent, 30, stats.onlineUserIds.includes(agent.id)),
                h('div.grow',
                  h('p.truncate', { style: { fontSize: '14px' } }, agent.name),
                  h('p.faint', { style: { fontSize: '11px' } }, `${agent.leads} Leads · ${agent.won} gewonnen`)),
                h('span.mono', { style: { fontSize: '12px', color: agent.breached > 0 ? 'var(--gold-300)' : '#7fd3a6' } }, agent.avgResponseLabel ?? '–')))),
    );
  }

  function funnelCard() {
    const total = stats.totals.leads || 1;
    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Pipeline')),
      h('div.stack', { style: { gap: '8px' } },
        stats.byStatus.map((s) =>
          h('a', { href: `/app/leads?status=${s.status}`, style: { display: 'block', padding: '6px 8px', borderRadius: '10px' } },
            h('div.row', { style: { justifyContent: 'space-between', gap: '12px', fontSize: '12px' } },
              statusBadge(s.status, s.label),
              h('span.faint', `${s.count} · ${formatCompact(s.value)}`)),
            h('div', { style: { marginTop: '6px', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
              h('i', { style: { display: 'block', height: '100%', width: `${(s.count / total) * 100}%`, background: STATUS_COLOR[s.status], transition: 'width 0.7s var(--ease)' } }))))),
    );
  }

  function myDayRow() {
    return h('div.grid-2',
      h('div.glass.card-pad',
        h('div.section-title',
          h('h2.row', { style: { gap: '8px' } }, icon('users', 16), 'Meine offenen Leads'),
          myDay.stats.avgResponseLabel ? h('span.hint', `Ø ${myDay.stats.avgResponseLabel}`) : null),
        myDay.leads.length === 0
          ? empty('Keine offenen Leads.', 'Alles abgearbeitet oder noch nichts zugewiesen.')
          : h('div.stack', { style: { gap: '2px' } },
              myDay.leads.slice(0, 8).map((lead) =>
                h('a.row', { href: `/app/leads/${lead.id}`, style: { gap: '12px', padding: '8px', borderRadius: '10px' } },
                  h('div.grow',
                    h('p.truncate', { style: { fontSize: '14px' } }, lead.name),
                    h('p.truncate.faint', { style: { fontSize: '12px' } }, lead.assetClass ?? '')),
                  statusBadge(lead.status, lead.statusLabel),
                  slaClock(lead, 'sm')))),
      ),
      h('div.glass.card-pad',
        h('div.section-title',
          h('h2.row', { style: { gap: '8px' } }, icon('clock', 16), 'Anstehend'),
          h('a.hint', { href: '/app/tasks' }, 'alle anzeigen')),
        myDay.tasks.length === 0
          ? empty('Keine offenen Aufgaben.')
          : h('div.stack', { style: { gap: '2px' } },
              myDay.tasks.slice(0, 8).map((task) => {
                const overdue = task.dueAt && new Date(task.dueAt) < new Date();
                return h('a.row', { href: task.leadId ? `/app/leads/${task.leadId}` : '/app/tasks', style: { gap: '12px', padding: '8px', borderRadius: '10px' } },
                  h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: '0', background: overdue ? 'var(--danger)' : 'rgba(255,255,255,0.25)' } }),
                  h('div.grow',
                    h('p.truncate', { style: { fontSize: '14px' } }, task.title),
                    h('p.truncate.faint', { style: { fontSize: '12px' } },
                      (task.leadName ?? 'ohne Lead') + (task.recurrence !== 'none' ? ' · wiederkehrend' : ''))),
                  h('span', { style: { fontSize: '12px', color: overdue ? '#f0a5a2' : 'var(--text-faint)' } }, formatRelative(task.dueAt)));
              })),
      ),
    );
  }

  void navigate;
  return () => { offDirty(); offNew(); clearTimeout(refreshTimer); };
}
