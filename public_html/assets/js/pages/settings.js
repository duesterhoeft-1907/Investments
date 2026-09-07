/**
 * Verwaltung: Ruhezeiten und Mitarbeiter.
 *
 * Die beiden Stellschrauben, die das Verhalten des ganzen Hauses ändern.
 * Deshalb sichtbar nur für Leitung und Verwaltung – und Zugänge sperren
 * oder Rollen vergeben darf allein die Verwaltung.
 */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { avatar, empty, spinner, toast } from '../core/ui.js';
import { dragSource, dropZone } from '../core/dnd.js';

const DAYS = [
  ['mon', 'Montag'], ['tue', 'Dienstag'], ['wed', 'Mittwoch'], ['thu', 'Donnerstag'],
  ['fri', 'Freitag'], ['sat', 'Samstag'], ['sun', 'Sonntag'],
];

const ROLE_LABEL = { admin: 'Verwaltung', manager: 'Leitung', agent: 'Beratung' };

const TABS = [
  ['hours', 'Ruhezeiten', 'clock'],
  ['assign', 'Zuordnung', 'route'],
  ['assets', 'Fachgebiete', 'grid'],
  ['staff', 'Mitarbeiter', 'users'],
];

const ZONES = [
  'Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London',
  'Europe/Madrid', 'Europe/Warsaw', 'UTC',
];

export function render(view, { session }) {
  const state = { hours: null, staff: [], teams: [], assets: [], loading: true, tab: 'hours', busy: null };
  const isAdmin = session.user.role === 'admin';

  const load = async () => {
    const [hours, staff, assets] = await Promise.all([
      api.get('/admin/hours'),
      api.get('/admin/staff'),
      api.get('/directory/asset-classes'),
    ]);
    state.hours = hours.hours;
    state.staff = staff.staff;
    state.teams = staff.teams;
    state.assets = assets.assetClasses;
    state.loading = false;
    paint();
  };

  mount(view, h('div.row', { style: { minHeight: '50vh', justifyContent: 'center' } }, spinner(28)));
  load().catch((error) => { state.loading = false; toast(error.message, 'error'); paint(); });

  // ── Ruhezeiten ───────────────────────────────────────────────────────

  async function saveHours() {
    state.busy = 'hours';
    paint();
    try {
      const result = await api.patch('/admin/hours', {
        enabled: state.hours.enabled,
        timezone: state.hours.timezone,
        days: state.hours.days,
        closedDates: state.hours.closedDates,
      });
      state.hours = result.hours;
      toast('Ruhezeiten gespeichert.');
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = null;
    paint();
  }

  /** Ein Zeitfenster im Tag ändern, hinzufügen oder streichen. */
  function editWindow(day, index, value) {
    const windows = [...(state.hours.days[day] ?? [])];
    if (value === null) windows.splice(index, 1);
    else if (index === -1) windows.push(value);
    else windows[index] = value;
    state.hours = { ...state.hours, days: { ...state.hours.days, [day]: windows } };
    paint();
  }

  function dayRow([key, label]) {
    const windows = state.hours.days[key] ?? [];
    const closed = windows.length === 0;

    return h('div.hours-day',
      h('label.hours-day-name',
        h('input', {
          type: 'checkbox', checked: !closed,
          onchange: (e) => editWindow(key, e.target.checked ? -1 : 0, e.target.checked ? '09:00-18:00' : null),
        }),
        h('span', label)),

      closed
        ? h('span.faint', { style: { fontSize: '13px' } }, 'geschlossen')
        : h('div.hours-windows', windows.map((window, i) => {
            const [from, to] = window.split('-');
            const change = (nextFrom, nextTo) => editWindow(key, i, `${nextFrom}-${nextTo}`);
            return h('div.hours-window',
              h('input.input', { type: 'time', value: from, onchange: (e) => change(e.target.value, to) }),
              h('span.faint', 'bis'),
              h('input.input', { type: 'time', value: to, onchange: (e) => change(from, e.target.value) }),
              windows.length > 1
                ? h('button.icon-btn', { title: 'Zeitfenster entfernen', onclick: () => editWindow(key, i, null) }, icon('x', 14))
                : null);
          })),

      !closed
        ? h('button.btn.btn-ghost.btn-sm', {
            title: 'Zweites Zeitfenster, etwa nach der Mittagspause',
            onclick: () => editWindow(key, -1, '13:00-18:00'),
          }, icon('plus', 13), 'Fenster')
        : null);
  }

  function closedDates() {
    const dates = state.hours.closedDates ?? [];
    return h('div.stack', { style: { gap: '10px' } },
      h('div.section-title', h('span', 'Feiertage und Betriebsferien'),
        h('span.faint', { style: { fontSize: '12px' } }, 'ganztägig geschlossen')),

      dates.length === 0
        ? h('p.faint', { style: { fontSize: '13px', margin: 0 } }, 'Keine Ausnahmen eingetragen.')
        : h('div.chip-row', dates.map((date) =>
            h('span.chip.on', date,
              h('button.icon-btn', {
                title: 'Entfernen',
                onclick: () => {
                  state.hours = { ...state.hours, closedDates: dates.filter((d) => d !== date) };
                  paint();
                },
              }, icon('x', 12))))),

      h('div.row', { style: { gap: '8px' } },
        h('input.input#new-closed', { type: 'date', style: { maxWidth: '190px' } }),
        h('button.btn.btn-ghost.btn-sm', {
          onclick: () => {
            const field = view.querySelector('#new-closed');
            if (!field?.value) return;
            if (dates.includes(field.value)) { toast('Der Tag steht schon in der Liste.'); return; }
            state.hours = { ...state.hours, closedDates: [...dates, field.value].sort() };
            paint();
          },
        }, icon('plus', 13), 'Tag hinzufügen')));
  }

  function hoursCard() {
    const { hours } = state;

    return h('div.stack', { style: { gap: '18px' } },
      h('div.glass.card-pad',
        h('div.section-title',
          h('span', 'Ruhezeiten'),
          h('label.switch',
            h('input', {
              type: 'checkbox', checked: hours.enabled,
              onchange: (e) => { state.hours = { ...hours, enabled: e.target.checked }; paint(); },
            }),
            h('span', hours.enabled ? 'aktiv' : 'aus'))),

        h('p.faint', { style: { fontSize: '13px', marginTop: '2px' } },
          'Die Reaktionsuhr läuft nur während dieser Zeiten. Eine Anfrage um 23:40 Uhr bekommt ',
          'die Frist damit auf den nächsten Morgen – angenommen wird sie trotzdem sofort.'),

        !hours.enabled
          ? h('p.warnline', { style: { marginTop: '12px' } },
              icon('alert', 14),
              'Ohne Ruhezeiten läuft die Uhr rund um die Uhr. Nachts eingehende Anfragen gelten dann als überschritten.')
          : null,

        h('div.row', { style: { gap: '10px', marginTop: '14px', alignItems: 'center' } },
          h('span.faint', { style: { fontSize: '13px' } }, 'Zeitzone'),
          h('select.input', {
            style: { maxWidth: '220px' },
            onchange: (e) => { state.hours = { ...hours, timezone: e.target.value }; paint(); },
          }, ZONES.map((zone) => h('option', { value: zone, selected: zone === hours.timezone }, zone)))),

        h('div.hours-grid', { style: { marginTop: '16px' } }, DAYS.map(dayRow)),

        h('div', { style: { marginTop: '20px' } }, closedDates()),

        h('div.row', { style: { marginTop: '20px', justifyContent: 'flex-end', gap: '10px' } },
          h('span.faint', { style: { fontSize: '12px' } },
            hours.open ? 'Gerade im Dienst.' : hours.nextOpening
              ? 'Geschlossen – weiter am ' + new Date(hours.nextOpening).toLocaleString('de-DE', {
                  weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: hours.timezone,
                }) + ' Uhr'
              : 'Geschlossen.'),
          h('button.btn.btn-primary', { disabled: state.busy === 'hours', onclick: saveHours },
            state.busy === 'hours' ? spinner(14) : icon('check', 14), 'Ruhezeiten speichern'))));
  }

  // ── Mitarbeiter ──────────────────────────────────────────────────────

  async function patchStaff(id, payload, message) {
    state.busy = 'staff-' + id;
    paint();
    try {
      await api.patch(`/admin/staff/${id}`, payload);
      await load();
      toast(message);
    } catch (error) {
      toast(error.message, 'error');
      state.busy = null;
      paint();
    }
  }

  async function setAway(id, until, note) {
    try {
      await api.patch(`/staff/${id}/away`, { until, note });
      await load();
      toast(until ? 'Abwesenheit eingetragen.' : 'Wieder im Dienst.');
    } catch (error) { toast(error.message, 'error'); }
  }

  function staffRow(person) {
    const teams = state.teams.filter((t) => person.teamIds.includes(t.id));
    const busy = state.busy === 'staff-' + person.id;

    return h('div.staff-row' + (person.isActive ? '' : '.is-off'),
      avatar(person.name, person.accent, 36),

      h('div', { style: { minWidth: 0, flex: '1' } },
        h('div.row', { style: { gap: '8px', alignItems: 'baseline' } },
          h('strong', person.name),
          person.isAway ? h('span.pill.pill-warn', icon('clock', 11), 'abwesend') : null,
          !person.isActive ? h('span.pill', 'gesperrt') : null),
        h('div.faint', { style: { fontSize: '12.5px' } }, person.email, person.title ? ' · ' + person.title : ''),
        teams.length
          ? h('div.chip-row', { style: { marginTop: '6px' } },
              teams.map((t) => h('span.chip', { style: { borderColor: t.color + '55', color: t.color } }, t.name)))
          : h('div.faint', { style: { fontSize: '12px', marginTop: '6px' } }, 'keiner Gruppe zugeordnet'),
        person.isAway && person.awayNote
          ? h('div.faint', { style: { fontSize: '12px', marginTop: '4px' } }, '„' + person.awayNote + '“')
          : null),

      h('div.staff-actions',
        isAdmin
          ? h('select.input.input-sm', {
              title: 'Rolle',
              onchange: (e) => patchStaff(person.id, { role: e.target.value }, 'Rolle geändert.'),
            }, Object.entries(ROLE_LABEL).map(([value, label]) =>
              h('option', { value, selected: person.role === value }, label)))
          : h('span.faint', { style: { fontSize: '12.5px' } }, ROLE_LABEL[person.role] ?? person.role),

        h('button.btn.btn-ghost.btn-sm', {
          title: 'Gruppen zuordnen',
          onclick: () => teamDialog(person),
        }, icon('users', 13)),

        h('button.btn.btn-ghost.btn-sm', {
          title: person.isAway ? 'Abwesenheit beenden' : 'Abwesend melden',
          onclick: () => (person.isAway ? setAway(person.id, null, '') : awayDialog(person)),
        }, icon('clock', 13)),

        isAdmin
          ? h('button.btn.btn-ghost.btn-sm', {
              disabled: busy,
              title: person.isActive ? 'Zugang sperren' : 'Zugang wieder freigeben',
              onclick: () => patchStaff(
                person.id,
                { isActive: !person.isActive },
                person.isActive ? 'Zugang gesperrt.' : 'Zugang wieder frei.',
              ),
            }, busy ? spinner(13) : icon(person.isActive ? 'lock' : 'check', 13))
          : null));
  }

  /** Kleines Overlay – bewusst ohne eigene Seite, das bleibt im Fluss. */
  function dialog(title, ...content) {
    const backdrop = h('div.modal-backdrop', { onclick: (e) => { if (e.target === backdrop) backdrop.remove(); } },
      h('div.modal.glass',
        h('div.section-title', h('span', title),
          h('button.icon-btn', { onclick: () => backdrop.remove() }, icon('x', 15))),
        ...content));
    document.body.append(backdrop);
    return backdrop;
  }

  function teamDialog(person) {
    const chosen = new Set(person.teamIds);
    const box = dialog('Gruppen von ' + person.name,
      h('div.stack', { style: { gap: '10px' } },
        state.teams.map((team) =>
          h('label.check-row',
            h('input', {
              type: 'checkbox', checked: chosen.has(team.id),
              onchange: (e) => (e.target.checked ? chosen.add(team.id) : chosen.delete(team.id)),
            }),
            h('span', { style: { color: team.color } }, team.name))),
        h('button.btn.btn-primary.btn-block', {
          onclick: async () => {
            box.remove();
            await patchStaff(person.id, { teamIds: [...chosen] }, 'Gruppen gespeichert.');
          },
        }, icon('check', 14), 'Speichern')));
  }

  function awayDialog(person) {
    // Vorgabe: heute Abend – der häufigste Fall ist "für heute raus".
    const evening = new Date();
    evening.setHours(23, 59, 0, 0);
    const local = new Date(evening.getTime() - evening.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const box = dialog(person.name + ' abwesend melden',
      h('div.stack', { style: { gap: '12px' } },
        h('p.faint', { style: { fontSize: '13px', margin: 0 } },
          'Bis dahin bekommt ' + person.name.split(' ')[0] + ' keine neuen Anfragen zugeteilt. ',
          'Die Gruppe wird weiterhin benachrichtigt.'),
        h('label.field', h('span', 'Zurück am'),
          h('input.input#away-until', { type: 'datetime-local', value: local })),
        h('label.field', h('span', 'Grund (erscheint im Team)'),
          h('input.input#away-note', { type: 'text', maxlength: '160', placeholder: 'Urlaub, Schulung, …' })),
        h('button.btn.btn-primary.btn-block', {
          onclick: async () => {
            const until = box.querySelector('#away-until').value;
            const note = box.querySelector('#away-note').value;
            if (!until) { toast('Bitte einen Zeitpunkt angeben.'); return; }
            box.remove();
            await setAway(person.id, until, note);
          },
        }, icon('check', 14), 'Abwesend melden')));
  }

  function newStaffDialog() {
    const box = dialog('Mitarbeiter anlegen',
      h('div.stack', { style: { gap: '12px' } },
        h('label.field', h('span', 'Name'), h('input.input#s-name', { type: 'text', placeholder: 'Vor- und Nachname' })),
        h('label.field', h('span', 'E-Mail'), h('input.input#s-email', { type: 'email', placeholder: 'name@21capitalinvest.de' })),
        h('label.field', h('span', 'Funktion'), h('input.input#s-title', { type: 'text', placeholder: 'Berater Edelmetalle' })),
        h('label.field', h('span', 'Telefon'), h('input.input#s-phone', { type: 'text', placeholder: '+49 …' })),
        h('label.field', h('span', 'Rolle'),
          h('select.input#s-role', Object.entries(ROLE_LABEL).map(([value, label]) =>
            h('option', { value, selected: value === 'agent' }, label)))),
        h('label.field', h('span', 'Erstes Passwort'),
          h('input.input#s-pass', { type: 'text', placeholder: 'mindestens 10 Zeichen' })),
        h('p.faint', { style: { fontSize: '12px', margin: 0 } },
          'Das Passwort einmal persönlich übergeben – es wird nirgends versendet. ',
          'Ändern kann es jeder selbst unter „Konto“.'),
        h('button.btn.btn-primary.btn-block', {
          onclick: async () => {
            const value = (id) => box.querySelector('#' + id).value.trim();
            try {
              await api.post('/admin/staff', {
                name: value('s-name'), email: value('s-email'), title: value('s-title'),
                phone: value('s-phone'), role: value('s-role'), password: value('s-pass'),
              });
              box.remove();
              await load();
              toast('Mitarbeiter angelegt.');
            } catch (error) { toast(error.message, 'error'); }
          },
        }, icon('plus', 14), 'Anlegen')));
  }

  function staffCard() {
    return h('div.glass.card-pad',
      h('div.section-title',
        h('span', 'Mitarbeiter'),
        isAdmin
          ? h('button.btn.btn-ghost.btn-sm', { onclick: newStaffDialog }, icon('plus', 13), 'neu')
          : null),

      state.staff.length === 0
        ? empty('Noch niemand angelegt.', '')
        : h('div.stack', { style: { gap: '2px', marginTop: '10px' } }, state.staff.map(staffRow)));
  }

  // ── Zuordnung: Fachgebiete und Mitarbeiter auf die Gruppen ───────────

  async function act(call, message) {
    try {
      await call();
      await load();
      if (message) toast(message);
    } catch (error) { toast(error.message, 'error'); }
  }

  const assign   = (teamId, userId) => act(() => api.post(`/admin/teams/${teamId}/members/${userId}`), 'Zugeordnet.');
  const unassign = (teamId, userId) => act(() => api.del(`/admin/teams/${teamId}/members/${userId}`), 'Aus der Gruppe genommen.');
  const route    = (assetId, teamId) => act(() => api.patch(`/admin/asset-classes/${assetId}`, { teamId }), 'Routing angepasst.');

  /** Eine Karte, die sich ziehen lässt. */
  function card(inner, payload, extra = {}) {
    const el = h('div.dnd-card' + (extra.className ?? ''), inner);
    return dragSource(el, { payload });
  }

  function personCard(person, teamId = null) {
    return card(
      [
        avatar(person.name, person.accent, 28),
        h('div', { style: { minWidth: 0 } },
          h('p.truncate', { style: { fontSize: '13px' } }, person.name),
          h('p.truncate.faint', { style: { fontSize: '10.5px' } },
            person.isAway ? 'abwesend' : (person.title || ROLE_LABEL[person.role]))),
        teamId
          ? h('button.icon-btn', {
              style: { padding: '4px', marginLeft: 'auto' },
              title: 'Aus dieser Gruppe nehmen',
              onclick: () => unassign(teamId, person.id),
            }, icon('x', 13))
          : null,
      ],
      { kind: 'person', id: person.id, fromTeam: teamId },
      { className: person.isAway ? '.is-away' : '' },
    );
  }

  function assetCard(asset) {
    return card(
      [
        h('span.dnd-stripe', { style: { background: asset.teamColor || 'rgba(255,255,255,0.15)' } }),
        h('div', { style: { minWidth: 0 } },
          h('p.truncate', { style: { fontSize: '13px' } }, asset.name),
          h('p.truncate.faint', { style: { fontSize: '10.5px' } }, asset.tagline || '—')),
      ],
      { kind: 'asset', id: asset.id, fromTeam: asset.teamId },
    );
  }

  /** Eine Spalte, auf der abgelegt werden darf. */
  function column(title, subtitle, accent, children, drop) {
    const el = h('div.dnd-col',
      h('div.dnd-col-head',
        accent ? h('span.dot', { style: { background: accent } }) : null,
        h('div', h('strong', title), subtitle ? h('div.faint', { style: { fontSize: '11px' } }, subtitle) : null)),
      h('div.dnd-col-body', children.length ? children : h('p.faint.dnd-empty', 'hierher ziehen')));
    return drop ? dropZone(el, drop) : el;
  }

  function assignmentBoard() {
    const active = state.staff.filter((p) => p.isActive);

    return h('div.stack', { style: { gap: '22px' } },
      // ── Fachgebiete → Gruppen (jedes Gebiet gehört zu genau einer) ──
      h('div.glass.card-pad',
        h('div.section-title',
          h('span', 'Fachgebiete den Gruppen zuordnen'),
          h('span.faint', { style: { fontSize: '12px' } }, 'ziehen — ein Gebiet gehört zu einer Gruppe')),
        h('div.dnd-board',
          column('Ohne Gruppe', 'landen beim Standard', null,
            state.assets.filter((a) => a.isActive && !a.teamId).map(assetCard),
            { accepts: (p) => p.kind === 'asset', onDrop: (p) => route(p.id, null) }),
          state.teams.map((team) =>
            column(team.name, null, team.color,
              state.assets.filter((a) => a.isActive && a.teamId === team.id).map(assetCard),
              { accepts: (p) => p.kind === 'asset' && p.fromTeam !== team.id, onDrop: (p) => route(p.id, team.id) })))),

      // ── Mitarbeiter → Gruppen (n:n) ──
      h('div.glass.card-pad',
        h('div.section-title',
          h('span', 'Mitarbeiter den Gruppen zuordnen'),
          h('span.faint', { style: { fontSize: '12px' } }, 'ziehen — jemand darf in mehreren Gruppen sein')),
        h('p.faint', { style: { fontSize: '12.5px', marginTop: '2px' } },
          'Aus der linken Spalte in eine Gruppe ziehen fügt hinzu, es nimmt niemanden woanders weg. ',
          'Zum Entfernen das × auf der Karte in der Gruppe.'),
        h('div.dnd-board', { style: { marginTop: '14px' } },
          column('Alle im Haus', active.length + ' aktiv', null,
            active.map((p) => personCard(p)), null),
          state.teams.map((team) => {
            const members = active.filter((p) => p.teamIds.includes(team.id));
            return column(team.name, members.length + (members.length === 1 ? ' Person' : ' Personen'), team.color,
              members.map((p) => personCard(p, team.id)),
              {
                accepts: (p) => p.kind === 'person' && !members.some((m) => m.id === p.id),
                onDrop: (p) => assign(team.id, p.id),
              });
          }))));
  }

  // ── Fachgebiete anlegen und pflegen ──────────────────────────────────

  function assetDialog(asset = null) {
    const box = dialog(asset ? asset.name + ' bearbeiten' : 'Fachgebiet anlegen',
      h('div.stack', { style: { gap: '12px' } },
        h('label.field', h('span', 'Name'),
          h('input.input#a-name', { type: 'text', value: asset?.name ?? '', placeholder: 'Gold' })),
        h('label.field', h('span', 'Kurzzeile im Wizard'),
          h('input.input#a-tagline', { type: 'text', value: asset?.tagline ?? '', placeholder: 'Physisch, verwahrt oder besichert' })),
        h('label.field', h('span', 'Beschreibung'),
          h('textarea.input#a-desc', { rows: 3, placeholder: 'Erscheint im Wizard unter dem Namen.' }, asset?.description ?? '')),
        h('label.field', h('span', 'Fachgruppe'),
          h('select.input#a-team',
            h('option', { value: '' }, 'ohne — landet beim Standard'),
            state.teams.map((t) => h('option', { value: String(t.id), selected: asset?.teamId === t.id }, t.name)))),
        h('button.btn.btn-primary.btn-block', {
          onclick: async () => {
            const value = (id) => box.querySelector('#' + id).value.trim();
            const payload = {
              name: value('a-name'), tagline: value('a-tagline'),
              description: value('a-desc'), teamId: value('a-team') || null,
            };
            if (!payload.name) { toast('Bitte einen Namen angeben.'); return; }
            try {
              if (asset) await api.patch(`/admin/asset-classes/${asset.id}`, payload);
              else await api.post('/admin/asset-classes', payload);
              box.remove();
              await load();
              toast(asset ? 'Gespeichert.' : 'Fachgebiet angelegt.');
            } catch (error) { toast(error.message, 'error'); }
          },
        }, icon('check', 14), asset ? 'Speichern' : 'Anlegen')));
  }

  async function retire(asset) {
    try {
      const result = await api.del(`/admin/asset-classes/${asset.id}`);
      await load();
      toast(result.leads > 0
        ? `Stillgelegt. ${result.leads} bestehende Anfragen bleiben erhalten.`
        : 'Stillgelegt.');
    } catch (error) { toast(error.message, 'error'); }
  }

  function assetRow(asset) {
    const team = state.teams.find((t) => t.id === asset.teamId);
    return h('div.staff-row' + (asset.isActive ? '' : '.is-off'),
      h('span.dnd-stripe', { style: { background: team?.color || 'rgba(255,255,255,0.15)', height: '32px' } }),
      h('div', { style: { minWidth: 0, flex: '1' } },
        h('div.row', { style: { gap: '8px', alignItems: 'baseline' } },
          h('strong', asset.name),
          !asset.isActive ? h('span.pill', 'stillgelegt') : null),
        h('div.faint', { style: { fontSize: '12.5px' } }, asset.tagline || '—'),
        h('div.faint', { style: { fontSize: '11.5px', marginTop: '4px' } },
          team ? 'läuft in ' + team.name : 'ohne Gruppe — landet beim Standard')),
      h('div.staff-actions',
        h('button.btn.btn-ghost.btn-sm', { title: 'Bearbeiten', onclick: () => assetDialog(asset) }, icon('file', 13)),
        asset.isActive
          ? h('button.btn.btn-ghost.btn-sm', { title: 'Stilllegen', onclick: () => retire(asset) }, icon('lock', 13))
          : h('button.btn.btn-ghost.btn-sm', {
              title: 'Wieder aufnehmen',
              onclick: () => act(() => api.patch(`/admin/asset-classes/${asset.id}`, { isActive: true }), 'Wieder aktiv.'),
            }, icon('check', 13))));
  }

  function assetsCard() {
    return h('div.glass.card-pad',
      h('div.section-title',
        h('span', 'Fachgebiete'),
        h('button.btn.btn-ghost.btn-sm', { onclick: () => assetDialog() }, icon('plus', 13), 'neu')),
      h('p.faint', { style: { fontSize: '12.5px', marginTop: '2px' } },
        'Das ist die Auswahl im öffentlichen Wizard. Stillgelegte verschwinden dort, ',
        'bestehende Anfragen behalten sie — sonst hätte der Verlauf eine leere Stelle.'),
      state.assets.length === 0
        ? empty('Noch keine Fachgebiete.', '')
        : h('div.stack', { style: { gap: '2px', marginTop: '12px' } }, state.assets.map(assetRow)));
  }

  // ── Gesamtbild ───────────────────────────────────────────────────────

  function paint() {
    if (state.loading) return;

    mount(view, h('div.stack', { style: { gap: '22px' } },
      h('div.page-head', h('div',
        h('h1', 'Verwaltung'),
        h('p', 'Ruhezeiten bestimmen, wann die Reaktionsuhr läuft. Darunter die Zugänge des Hauses.'))),

      h('div.tab-row', TABS.map(([key, label, ico]) =>
        h('button.tab' + (state.tab === key ? '.on' : ''),
          { onclick: () => { state.tab = key; paint(); } }, icon(ico, 14), label))),

      state.tab === 'hours' ? hoursCard()
        : state.tab === 'staff' ? staffCard()
        : state.tab === 'assign' ? assignmentBoard()
        : assetsCard()));
  }
}
