/** Team und Routing: welches Fachgebiet läuft in welche Gruppe. */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { formatRelative } from '../core/format.js';
import { avatar, empty, spinner, toast } from '../core/ui.js';

export function render(view, { session, navigate }) {
  const state = { teams: [], users: [], assets: [], loading: true };
  const canEdit = session.user.role === 'admin' || session.user.role === 'manager';

  const load = async () => {
    const [teams, users, assets] = await Promise.all([
      api.get('/directory/teams'),
      api.get('/directory/users'),
      api.get('/directory/asset-classes'),
    ]);
    state.teams = teams.teams;
    state.users = users.users;
    state.assets = assets.assetClasses;
    state.loading = false;
    paint();
  };

  mount(view, h('div.row', { style: { minHeight: '50vh', justifyContent: 'center' } }, spinner(28)));
  load().catch(() => { state.loading = false; paint(); });

  async function reroute(assetId, teamId) {
    try {
      await api.patch(`/directory/asset-classes/${assetId}`, { teamId: teamId || null });
      toast('Routing angepasst.');
      await load();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function setSla(teamId, slaMinutes) {
    try {
      await api.patch(`/directory/teams/${teamId}`, { slaMinutes });
      toast('Reaktionsziel gespeichert.');
      await load();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function openDirect(userId) {
    try {
      const result = await api.post(`/chat/dm/${userId}`);
      navigate('/app/chat/' + result.channelId);
    } catch (error) { toast(error.message, 'error'); }
  }

  function paint() {
    if (state.loading) return;

    mount(view, h('div.stack', { style: { gap: '22px' } },
      h('div.page-head', h('div',
        h('h1', 'Team & Routing'),
        h('p', 'Fachgebiete steuern, in welche Gruppe eine Anfrage läuft. Die SLA gilt pro Gruppe.'))),

      h('div.glass.card-pad',
        h('div.section-title',
          h('h2.row', { style: { gap: '8px' } }, icon('route', 16), 'Fachgebiet → Fachgruppe'),
          h('span.hint', canEdit ? 'änderbar' : 'nur lesend')),
        h('div', { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } },
          state.assets.map((asset, i) =>
            h('div.route-card', { style: { animationDelay: Math.min(i * 30, 300) + 'ms' } },
              h('span.stripe', { style: { background: asset.teamColor || 'rgba(255,255,255,0.15)' } }),
              h('div.grow',
                h('p.truncate', { style: { fontSize: '14px', fontWeight: '500' } }, asset.name),
                h('p.truncate.faint', { style: { fontSize: '11px' } }, asset.tagline)),
              h('select.input', {
                style: { width: 'auto', padding: '5px 8px', fontSize: '12px' },
                disabled: !canEdit,
                onchange: (e) => reroute(asset.id, e.target.value ? Number(e.target.value) : null),
              },
                h('option', { value: '' }, 'Standard'),
                state.teams.map((t) => h('option', { value: String(t.id), selected: t.id === asset.teamId }, t.name)))))),
      ),

      h('div', { style: { display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } },
        state.teams.map(teamCard)),

      h('div.glass.card-pad',
        h('div.section-title',
          h('h2', 'Alle Kolleginnen und Kollegen'),
          h('span.hint', `${state.users.filter((u) => u.online).length} online`)),
        h('div', { style: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' } },
          state.users.map((u) =>
            h('div.row', { style: { gap: '12px', border: '1px solid var(--hairline)', background: 'rgba(11,15,20,0.4)', borderRadius: '12px', padding: '12px' } },
              avatar(u.name, u.accent, 36, u.online),
              h('div.grow',
                h('p.truncate', { style: { fontSize: '14px' } }, u.name),
                h('p.truncate.faint', { style: { fontSize: '11px' } }, u.title)),
              u.id !== session.user.id
                ? h('button.icon-btn', { style: { padding: '6px' }, 'aria-label': `Nachricht an ${u.name}`, onclick: () => openDirect(u.id) }, icon('message', 15))
                : null))),
      ),
    ));
  }

  function teamCard(team) {
    return h('div.glass', { style: { overflow: 'hidden' } },
      h('div', { style: { padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: team.color + '0d' } },
        h('h2.row', { style: { gap: '8px', fontFamily: 'var(--font-display)', fontSize: '18px' } },
          h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: team.color } }), team.name),
        h('p.faint', { style: { marginTop: '4px', fontSize: '12px', lineHeight: '1.6' } }, team.description),
        h('div.row', { style: { gap: '16px', marginTop: '16px', fontSize: '12px', flexWrap: 'wrap' } },
          h('span.row.muted', { style: { gap: '6px' } }, icon('users', 13), String(team.members.length)),
          h('span.muted', `${team.leadCount} Leads`),
          team.awaiting > 0 ? h('span', { style: { color: 'var(--accent-300)' } }, `${team.awaiting} offen`) : null,
          h('span.row', { style: { marginLeft: 'auto', gap: '6px' } },
            icon('timer', 13, 'faint'),
            canEdit
              ? h('select.input', { style: { width: 'auto', padding: '3px 6px', fontSize: '11px' },
                  onchange: (e) => setSla(team.id, Number(e.target.value)) },
                  [5, 10, 15, 20, 30, 45, 60, 120].map((m) => h('option', { value: String(m), selected: m === team.slaMinutes }, `${m} Min. SLA`)))
              : h('span.muted', `${team.slaMinutes} Min. SLA`)))),
      h('div', { style: { padding: '16px' } },
        team.members.length === 0
          ? empty('Keine Mitglieder.')
          : h('div.stack', { style: { gap: '2px' } },
              team.members.map((member) => {
                const full = state.users.find((u) => u.id === member.id);
                return h('div.row', { style: { gap: '10px', padding: '6px 8px', borderRadius: '10px' } },
                  avatar(member.name, member.accent, 30, full?.online),
                  h('div.grow',
                    h('p.truncate', { style: { fontSize: '14px' } }, member.name),
                    h('p.truncate.faint', { style: { fontSize: '11px' } },
                      member.title + (full && !full.online && full.lastSeenAt ? ` · zuletzt ${formatRelative(full.lastSeenAt)}` : ''))),
                  member.id !== session.user.id
                    ? h('button.icon-btn', { style: { padding: '4px' }, 'aria-label': `Nachricht an ${member.name}`, onclick: () => openDirect(member.id) }, icon('message', 15))
                    : null);
              })),
        h('div.row', { style: { flexWrap: 'wrap', gap: '6px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' } },
          team.assetClasses.map((a) =>
            h('span.faint', { style: { borderRadius: '6px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', fontSize: '10px' } }, a.name)))),
    );
  }
}
