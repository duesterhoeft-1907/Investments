/** Interner Chat: Firmenkanal, Fachgruppen und Direktnachrichten. */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { pulse } from '../core/pulse.js';
import { formatRelative, formatTime } from '../core/format.js';
import { avatar, empty, spinner, toast } from '../core/ui.js';

export function render(view, { params, session, navigate }) {
  const state = { channels: [], messages: [], users: [], active: params[0] ? Number(params[0]) : null, draft: '', showPeople: false, loading: true };
  let messagesEl = null;

  const loadChannels = async () => {
    const data = await api.get('/chat/channels');
    state.channels = data.channels;
    session.chatUnread = data.totalUnread;
    if (state.active === null && state.channels.length) {
      state.active = state.channels[0].id;
      history.replaceState({}, '', '/app/chat/' + state.active);
    }
  };

  const loadMessages = async () => {
    if (state.active === null) return;
    state.messages = (await api.get(`/chat/channels/${state.active}/messages`)).messages;
    await api.post(`/chat/channels/${state.active}/read`).catch(() => {});
    await loadChannels();
  };

  const offMessage = pulse.on('chat:message', async (payload) => {
    if (payload.channelId === state.active) await loadMessages();
    else await loadChannels();
    paint();
  });
  const offChannel = pulse.on('chat:channel', async () => { await loadChannels(); paint(); });

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

  async function send() {
    const text = state.draft.trim();
    if (!text || state.active === null) return;
    state.draft = '';
    paint();
    try {
      await api.post(`/chat/channels/${state.active}/messages`, { body: text });
      await loadMessages();
      paint();
      scrollDown();
    } catch (error) {
      state.draft = text;
      toast(error.message, 'error');
      paint();
    }
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
  }

  function peopleList() {
    return h('div', { style: { borderBottom: '1px solid var(--hairline)', background: 'rgba(11,15,20,0.5)' } },
      h('p.faint', { style: { padding: '10px 16px 0', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' } }, 'Direktnachricht'),
      h('div', { style: { maxHeight: '13rem', overflowY: 'auto', padding: '6px 0' } },
        state.users.filter((u) => u.id !== session.user.id).map((u) =>
          h('button.row', { style: { gap: '10px', width: '100%', padding: '6px 16px', background: 'none', border: 'none', textAlign: 'left' }, onclick: () => openDirect(u.id) },
            avatar(u.name, u.accent, 24, u.online),
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
        history.pushState({}, '', '/app/chat/' + channel.id);
        await loadMessages();
        paint();
        scrollDown();
      },
    },
      channel.type === 'dm' && channel.partner
        ? avatar(channel.partner.name, channel.partner.accent, 22, partnerOnline)
        : h('span', { style: { color: channel.teamColor || 'rgba(255,255,255,0.3)', display: 'flex' } },
            icon(channel.type === 'company' ? 'building' : 'hash', 16)),
      h('span.grow',
        h('span.name.truncate', { style: { display: 'block', color: on ? 'var(--text)' : 'var(--text-dim)' } }, channel.name),
        channel.lastBody ? h('span.last.truncate', { style: { display: 'block' } }, channel.lastBody) : null),
      channel.unread > 0 ? h('span.count', { style: { background: 'var(--gold-500)', color: 'var(--ink-950)', borderRadius: '999px', padding: '0 6px', fontSize: '10px', fontWeight: '700' } }, String(channel.unread)) : null,
    );
  }

  function conversation(channel) {
    const textarea = h('textarea.input', {
      rows: 1, placeholder: `Nachricht an ${channel.name} … (@ erwähnt jemanden)`,
      value: state.draft,
      oninput: (e) => { state.draft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } },
    });

    messagesEl = h('div.messages',
      state.messages.length === 0
        ? empty('Noch keine Nachrichten.', 'Schreib die erste.')
        : state.messages.map((message, i) => {
            const prev = state.messages[i - 1];
            const grouped = prev?.author?.id === message.author?.id && message.kind === 'text' && prev?.kind === 'text'
              && new Date(message.createdAt) - new Date(prev.createdAt) < 300000;
            return messageRow(message, grouped, message.author?.id === session.user.id);
          }));

    return [
      h('div.row', { style: { gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--hairline)' } },
        h('div.grow',
          h('h2.truncate', { style: { fontFamily: 'var(--font-display)', fontSize: '16px' } }, channel.name),
          h('p.truncate.faint', { style: { fontSize: '12px' } }, channel.type === 'dm' ? 'Direktnachricht' : channel.topic || 'Interner Kanal')),
        channel.type === 'team'
          ? h('span.row.faint', { style: { gap: '6px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', fontSize: '11px' } }, icon('users', 12), 'Fachgruppe')
          : null),
      messagesEl,
      h('div.composer',
        h('div.row', textarea,
          h('button.send-btn', { disabled: !state.draft.trim(), 'aria-label': 'Senden', onclick: send }, icon('send', 16)))),
    ];
  }

  function messageRow(message, grouped, isMe) {
    if (message.kind === 'lead_alert') {
      return h('a.lead-alert-msg', { href: message.leadId ? `/app/leads/${message.leadId}` : '#' },
        icon('sparkles', 16, 'faint'),
        h('span.grow',
          h('span', { style: { display: 'block', fontSize: '14px', color: 'var(--gold-100)' } }, message.body),
          message.leadRef ? h('span.mono', { style: { display: 'block', fontSize: '10px', color: 'rgba(224,194,116,0.6)' } }, message.leadRef) : null),
        h('span.faint', { style: { fontSize: '11px' } }, formatTime(message.createdAt)));
    }

    return h('div.msg' + (grouped ? '.grouped' : ''),
      h('span.slot', !grouped && message.author ? avatar(message.author.name, message.author.accent, 32) : null),
      h('div.grow',
        !grouped ? h('div.row', { style: { gap: '8px', alignItems: 'baseline' } },
          h('span.author' + (isMe ? '.me' : ''), message.author?.name ?? 'System'),
          h('span.time', { title: formatRelative(message.createdAt) }, formatTime(message.createdAt))) : null,
        h('p.text', message.body)),
    );
  }

  void navigate;
  return () => { offMessage(); offChannel(); };
}
