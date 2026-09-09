/**
 * Interner Chat: Firmenkanal, Fachgruppen und Direktnachrichten.
 *
 * Drei Dinge unterscheiden ihn von der ersten Fassung, und alle drei kommen
 * daher, dass hier den ganzen Tag gearbeitet wird:
 *
 *   - Neue Nachrichten werden angehängt, nicht der ganze Verlauf neu geholt.
 *     Vorher sprang die Ansicht bei jeder eingehenden Nachricht nach unten,
 *     und eine halb getippte Antwort war weg.
 *   - Wer gerade schreibt, ist zu sehen. Das erspart die dritte Nachfrage.
 *   - Reaktionen, Ändern und Zurücknehmen. Ein Daumen ist keine Spielerei:
 *     er ersetzt dreißig "ok, mach ich" am Tag.
 */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { pulse } from '../core/pulse.js';
import { formatRelative, formatTime } from '../core/format.js';
import { avatar, empty, spinner, toast } from '../core/ui.js';

const REAKTIONEN = ['👍', '✅', '👀', '🎉', '❤️', '😄'];
const TIPPT_MS = 4000;          // so lange gilt ein "schreibt gerade"
const TIPPT_TAKT = 2500;        // so selten wird es gemeldet

export function render(view, { params, session, navigate }) {
  const state = {
    channels: [], messages: [], users: [],
    active: params[0] ? Number(params[0]) : null,
    draft: '', showPeople: false, loading: true,
    aendert: null,               // Nachricht, die gerade bearbeitet wird
    aenderText: '',
    reaktionAn: null,            // Nachricht, über der die Auswahl offen ist
    tippen: new Map(),           // userId → { name, bis }
    ungelesenAb: null,           // ab welcher Nachricht die Trennlinie steht
    nachzuegler: 0,              // neue Nachrichten, während oben gelesen wird
  };

  let messagesEl = null;
  let zuletztGemeldet = 0;
  const erwaehnung = { offen: false, wort: '', treffer: [] };

  const letzteId = () => (state.messages.length ? state.messages[state.messages.length - 1].id : 0);

  const amBoden = () => {
    if (!messagesEl) return true;
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
  };

  const loadChannels = async () => {
    const data = await api.get('/chat/channels');
    state.channels = data.channels;
    session.chatUnread = data.totalUnread;
    if (state.active === null && state.channels.length) {
      state.active = state.channels[0].id;
      history.replaceState({}, '', '/app/chat/' + state.active);
    }
  };

  /** Kompletter Verlauf – beim Wechsel in einen Kanal. */
  const loadMessages = async ({ behalteStand = false } = {}) => {
    if (state.active === null) return;
    const vorher = messagesEl ? messagesEl.scrollTop : 0;
    const kanal = state.channels.find((c) => c.id === state.active);

    state.messages = (await api.get(`/chat/channels/${state.active}/messages`)).messages;

    // Die Trennlinie steht dort, wo das Lesen aufgehört hat. Sie wird einmal
    // beim Betreten gesetzt und bleibt dann stehen – sonst wandert sie unter
    // den Fingern weg, während man liest.
    const offen = kanal?.unread ?? 0;
    state.ungelesenAb = offen > 0 && offen < state.messages.length
      ? state.messages[state.messages.length - offen]?.id ?? null
      : null;

    await api.post(`/chat/channels/${state.active}/read`).catch(() => {});
    await loadChannels();
    state.nachzuegler = 0;
    if (behalteStand && messagesEl) {
      requestAnimationFrame(() => { if (messagesEl) messagesEl.scrollTop = vorher; });
    }
  };

  /** Nur das Neue – im laufenden Betrieb der Normalfall. */
  const neueHolen = async () => {
    if (state.active === null) return;
    const seit = letzteId();
    if (!seit) return loadMessages();

    const { messages } = await api.get(`/chat/channels/${state.active}/messages?since=${seit}`);
    if (!messages.length) return;

    const unten = amBoden();
    state.messages.push(...messages);
    if (unten) {
      await api.post(`/chat/channels/${state.active}/read`).catch(() => {});
      state.nachzuegler = 0;
    } else {
      state.nachzuegler += messages.length;
    }
    await loadChannels();
    paint();
    if (unten) scrollDown();
  };

  const offMessage = pulse.on('chat:message', async (payload) => {
    if (payload.channelId !== state.active) {
      await loadChannels();
      paint();
      return;
    }
    // Eine Änderung an einer älteren Nachricht (bearbeitet, zurückgenommen,
    // Reaktion) holt "since" nicht ab – dann eben der ganze Verlauf, aber
    // ohne die Ansicht zu verschieben.
    if (payload.messageId && payload.messageId <= letzteId()) {
      await loadMessages({ behalteStand: true });
      paint();
      return;
    }
    await neueHolen();
  });

  const offChannel = pulse.on('chat:channel', async () => { await loadChannels(); paint(); });

  const offTyping = pulse.on('chat:typing', (payload) => {
    if (payload.channelId !== state.active || payload.userId === session.user.id) return;
    state.tippen.set(payload.userId, { name: payload.name, bis: Date.now() + TIPPT_MS });
    zeigeTippen();
  });

  // Ein eigener Takt für die Anzeige: sie muss auch dann verschwinden, wenn
  // gar kein Ereignis mehr kommt.
  const tippTakt = setInterval(() => {
    const jetzt = Date.now();
    let geaendert = false;
    for (const [id, eintrag] of state.tippen) {
      if (eintrag.bis < jetzt) { state.tippen.delete(id); geaendert = true; }
    }
    if (geaendert) zeigeTippen();
  }, 1000);

  mount(view, h('div.row', { style: { minHeight: '50vh', justifyContent: 'center' } }, spinner(28)));

  (async () => {
    await loadChannels();
    await loadMessages();
    api.get('/directory/users').then((d) => { state.users = d.users; }).catch(() => {});
    state.loading = false;
    paint();
    scrollDown();
  })().catch(() => { state.loading = false; paint(); });

  function scrollDown() {
    requestAnimationFrame(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  /** Nur die Zeile mit "schreibt gerade" neu zeichnen, nicht den Verlauf. */
  function zeigeTippen() {
    const zeile = view.querySelector('.tippt');
    if (!zeile) return;
    const namen = [...state.tippen.values()].map((e) => e.name);
    zeile.textContent = namen.length === 0 ? ''
      : namen.length === 1 ? `${namen[0]} schreibt …`
      : `${namen.slice(0, 2).join(', ')}${namen.length > 2 ? ' und andere' : ''} schreiben …`;
  }

  function melden() {
    const jetzt = Date.now();
    if (state.active === null || jetzt - zuletztGemeldet < TIPPT_TAKT) return;
    zuletztGemeldet = jetzt;
    api.post(`/chat/channels/${state.active}/typing`).catch(() => {});
  }

  async function send() {
    const text = state.draft.trim();
    if (!text || state.active === null) return;
    state.draft = '';
    erwaehnung.offen = false;
    paint();
    try {
      await api.post(`/chat/channels/${state.active}/messages`, { body: text });
      await neueHolen();
      scrollDown();
    } catch (error) {
      state.draft = text;
      toast(error.message, 'error');
      paint();
    }
  }

  async function aendernSpeichern() {
    const text = state.aenderText.trim();
    const id = state.aendert;
    if (!text || !id) return;
    try {
      await api.patch(`/chat/messages/${id}`, { body: text });
      state.aendert = null;
      await loadMessages({ behalteStand: true });
      paint();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function zuruecknehmen(id) {
    if (!confirm('Diese Nachricht zurücknehmen? Der Platz bleibt sichtbar, der Text verschwindet.')) return;
    try {
      await api.del(`/chat/messages/${id}`);
      await loadMessages({ behalteStand: true });
      paint();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function reagieren(id, emoji) {
    state.reaktionAn = null;
    try {
      const { reactions } = await api.post(`/chat/messages/${id}/reaction`, { emoji });
      const nachricht = state.messages.find((m) => m.id === id);
      if (nachricht) nachricht.reactions = reactions;
      paint();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function openDirect(userId) {
    try {
      const result = await api.post(`/chat/dm/${userId}`);
      state.showPeople = false;
      state.active = result.channelId;
      history.replaceState({}, '', '/app/chat/' + result.channelId);
      await loadChannels();
      await loadMessages();
      paint();
    } catch (error) { toast(error.message, 'error'); }
  }

  function paint() {
    if (state.loading) return;
    const active = state.channels.find((c) => c.id === state.active) ?? null;

    mount(view, h('div.chat-layout',
      h('div.glass.chat-pane',
        h('div.row', { style: { justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--hairline)' } },
          h('h2', { style: { fontFamily: 'var(--font-display)', fontSize: '14px' } }, 'Kanäle'),
          h('button.icon-btn', { style: { padding: '4px' }, 'aria-label': 'Direktnachricht starten',
            onclick: () => { state.showPeople = !state.showPeople; paint(); } }, icon('plus', 16))),
        state.showPeople ? peopleList() : null,
        h('div.chat-channels', state.channels.map(channelRow)),
      ),
      h('div.glass.chat-pane', active ? conversation(active) : empty('Kein Kanal ausgewählt.', 'Wähle links einen Kanal.')),
    ));
    zeigeTippen();
  }

  function peopleList() {
    return h('div', { style: { borderBottom: '1px solid var(--hairline)', background: 'var(--surface-tief)' } },
      h('p.faint', { style: { padding: '10px 16px 0', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' } }, 'Direktnachricht'),
      h('div', { style: { maxHeight: '13rem', overflowY: 'auto', padding: '6px 0' } },
        state.users.filter((u) => u.id !== session.user.id).map((u) =>
          h('button.row', { style: { gap: '10px', width: '100%', padding: '6px 16px', background: 'none', border: 'none', textAlign: 'left' }, onclick: () => openDirect(u.id) },
            avatar(u.name, u.accent, 24, { avatar: u.avatar, online: u.online }),
            h('span.grow',
              h('span.truncate', { style: { display: 'block', fontSize: '12px' } }, u.name),
              h('span.truncate.faint', { style: { display: 'block', fontSize: '10px' } }, u.title))))));
  }

  function channelRow(channel) {
    const on = channel.id === state.active;
    const partnerOnline = channel.partner ? state.users.find((u) => u.id === channel.partner.id)?.online : undefined;
    return h('a.chan' + (on ? '.on' : ''), {
      href: '/app/chat/' + channel.id,
      onclick: async (event) => {
        event.preventDefault();
        state.active = channel.id;
        state.tippen.clear();
        history.pushState({}, '', '/app/chat/' + channel.id);
        await loadMessages();
        paint();
        scrollDown();
      },
    },
      channel.type === 'dm' && channel.partner
        ? avatar(channel.partner.name, channel.partner.accent, 22, { avatar: channel.partner.avatar, online: partnerOnline })
        : h('span', { style: { color: channel.teamColor || 'rgba(var(--auf), 0.3)', display: 'flex' } },
            icon(channel.type === 'company' ? 'building' : 'hash', 16)),
      h('span.grow',
        h('span.name.truncate', { style: { display: 'block', color: on ? 'var(--text)' : 'var(--text-dim)' } }, channel.name),
        channel.lastBody ? h('span.last.truncate', { style: { display: 'block' } }, channel.lastBody) : null),
      channel.unread > 0 ? h('span.count', { style: { background: 'var(--accent-500)', color: 'var(--auf-akzent)', borderRadius: 'var(--radius)', padding: '0 6px', fontSize: '10px', fontWeight: '700' } }, String(channel.unread)) : null,
    );
  }

  /** Vorschläge, während "@" getippt wird. */
  function erwaehnungPruefen(feld) {
    const bis = feld.selectionStart ?? state.draft.length;
    const davor = state.draft.slice(0, bis);
    const treffer = /@([\p{L}._-]*)$/u.exec(davor);

    if (!treffer) {
      if (erwaehnung.offen) { erwaehnung.offen = false; paint(); }
      return;
    }
    erwaehnung.wort = treffer[1].toLowerCase();
    erwaehnung.treffer = state.users
      .filter((u) => u.id !== session.user.id
        && (erwaehnung.wort === '' || u.name.toLowerCase().includes(erwaehnung.wort)))
      .slice(0, 5);
    erwaehnung.offen = erwaehnung.treffer.length > 0;
    paint();
  }

  function erwaehnungEinsetzen(name) {
    const vorname = name.split(' ')[0];
    state.draft = state.draft.replace(/@([\p{L}._-]*)$/u, '@' + vorname + ' ');
    erwaehnung.offen = false;
    paint();
    requestAnimationFrame(() => view.querySelector('.composer textarea')?.focus());
  }

  function conversation(channel) {
    const textarea = h('textarea.input', {
      rows: 1, placeholder: `Nachricht an ${channel.name} … (@ erwähnt jemanden)`,
      value: state.draft,
      oninput: (e) => {
        state.draft = e.target.value;
        melden();
        erwaehnungPruefen(e.target);
      },
      onkeydown: (e) => {
        if (e.key === 'Escape' && erwaehnung.offen) { erwaehnung.offen = false; paint(); return; }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
      },
    });

    messagesEl = h('div.messages', {
      onscroll: () => {
        if (amBoden() && state.nachzuegler > 0) {
          state.nachzuegler = 0;
          api.post(`/chat/channels/${state.active}/read`).catch(() => {});
          paint();
        }
      },
    },
      state.messages.length === 0
        ? empty('Noch keine Nachrichten.', 'Schreib die erste.')
        : state.messages.flatMap((message, i) => {
            const prev = state.messages[i - 1];
            const grouped = prev?.author?.id === message.author?.id && message.kind === 'text' && prev?.kind === 'text'
              && !message.deleted && !prev?.deleted
              && new Date(message.createdAt) - new Date(prev.createdAt) < 300000;
            const zeilen = [];
            if (state.ungelesenAb === message.id) zeilen.push(trennlinie());
            zeilen.push(messageRow(message, grouped, message.author?.id === session.user.id));
            return zeilen;
          }));

    return [
      h('div.row', { style: { gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--hairline)' } },
        h('div.grow',
          h('h2.truncate', { style: { fontFamily: 'var(--font-display)', fontSize: '16px' } }, channel.name),
          h('p.truncate.faint', { style: { fontSize: '12px' } }, channel.type === 'dm' ? 'Direktnachricht' : channel.topic || 'Interner Kanal')),
        channel.type === 'team'
          ? h('span.row.faint', { style: { gap: '6px', borderRadius: 'var(--radius)', background: 'rgba(var(--auf), 0.05)', padding: '4px 10px', fontSize: '11px' } }, icon('users', 12), 'Fachgruppe')
          : null),
      messagesEl,
      state.nachzuegler > 0
        ? h('button.neue-unten', { onclick: () => { scrollDown(); state.nachzuegler = 0; paint(); } },
            icon('chevron', 13), `${state.nachzuegler} neue Nachricht${state.nachzuegler === 1 ? '' : 'en'}`)
        : null,
      h('div.composer',
        erwaehnung.offen
          ? h('div.erwaehnung', erwaehnung.treffer.map((u) =>
              h('button.row', { type: 'button', onclick: () => erwaehnungEinsetzen(u.name) },
                avatar(u.name, u.accent, 20, { avatar: u.avatar }),
                h('span', { style: { fontSize: '12px' } }, u.name),
                h('span.faint', { style: { fontSize: '11px' } }, u.title))))
          : null,
        h('p.tippt'),
        h('div.row', textarea,
          h('button.send-btn', { disabled: !state.draft.trim(), 'aria-label': 'Senden', onclick: send }, icon('send', 16)))),
    ];
  }

  function trennlinie() {
    return h('div.ungelesen-linie', h('span', 'Neu'));
  }

  function messageRow(message, grouped, isMe) {
    if (message.kind === 'lead_alert') {
      return h('a.lead-alert-msg', { href: message.leadId ? `/app/leads/${message.leadId}` : '#' },
        icon('sparkles', 16, 'faint'),
        h('span.grow',
          h('span', { style: { display: 'block', fontSize: '14px', color: 'var(--accent-100)' } }, message.body),
          message.leadRef ? h('span.mono', { style: { display: 'block', fontSize: '10px', color: 'rgba(var(--accent-rgb), 0.6)' } }, message.leadRef) : null),
        h('span.faint', { style: { fontSize: '11px' } }, formatTime(message.createdAt)));
    }

    const bearbeitet = state.aendert === message.id;

    return h('div.msg' + (grouped ? '.grouped' : '') + (message.deleted ? '.weg' : ''),
      h('span.slot', !grouped && message.author ? avatar(message.author.name, message.author.accent, 32, { avatar: message.author.avatar }) : null),
      h('div.grow',
        !grouped ? h('div.row', { style: { gap: '8px', alignItems: 'baseline' } },
          h('span.author' + (isMe ? '.me' : ''), message.author?.name ?? 'System'),
          h('span.time', { title: formatRelative(message.createdAt) }, formatTime(message.createdAt)),
          message.editedAt ? h('span.time', { title: formatRelative(message.editedAt) }, '· bearbeitet') : null) : null,

        message.deleted
          ? h('p.text.faint', { style: { fontStyle: 'italic' } }, 'Nachricht zurückgenommen')
          : bearbeitet
            ? h('div.stack', { style: { gap: '8px' } },
                h('textarea.input', {
                  rows: 2, value: state.aenderText,
                  oninput: (e) => { state.aenderText = e.target.value; },
                  onkeydown: (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void aendernSpeichern(); }
                    if (e.key === 'Escape') { state.aendert = null; paint(); }
                  },
                }),
                h('div.row', { style: { gap: '8px' } },
                  h('button.btn.btn-primary.btn-sm', { onclick: aendernSpeichern }, 'Speichern'),
                  h('button.btn.btn-ghost.btn-sm', { onclick: () => { state.aendert = null; paint(); } }, 'Abbrechen')))
            : h('p.text', ...textMitErwaehnungen(message.body)),

        message.reactions?.length && !message.deleted
          ? h('div.reaktionen', message.reactions.map((r) =>
              h('button.reaktion' + (r.ich ? '.meine' : ''), {
                title: r.wer, onclick: () => reagieren(message.id, r.emoji),
              }, r.emoji, h('span', String(r.anzahl)))))
          : null),

      message.deleted || bearbeitet ? null : h('div.msg-werkzeug',
        h('button.icon-btn', { 'aria-label': 'Reagieren', title: 'Reagieren',
          onclick: () => { state.reaktionAn = state.reaktionAn === message.id ? null : message.id; paint(); } },
          icon('sparkles', 14)),
        isMe ? h('button.icon-btn', { 'aria-label': 'Ändern', title: 'Ändern',
          onclick: () => { state.aendert = message.id; state.aenderText = message.body; paint(); } },
          icon('pin', 14)) : null,
        isMe ? h('button.icon-btn', { 'aria-label': 'Zurücknehmen', title: 'Zurücknehmen',
          onclick: () => zuruecknehmen(message.id) }, icon('trash', 14)) : null,
        state.reaktionAn === message.id
          ? h('div.reaktion-wahl', REAKTIONEN.map((emoji) =>
              h('button', { type: 'button', onclick: () => reagieren(message.id, emoji) }, emoji)))
          : null),
    );
  }

  /** Erwähnungen im Text hervorheben – ohne HTML aus fremdem Text zu bauen. */
  function textMitErwaehnungen(text) {
    const teile = String(text ?? '').split(/(@[\p{L}._-]+)/u);
    return teile.map((teil) => (teil.startsWith('@')
      ? h('span.erwaehnt', teil)
      : teil));
  }

  void navigate;
  return () => { offMessage(); offChannel(); offTyping(); clearInterval(tippTakt); };
}
