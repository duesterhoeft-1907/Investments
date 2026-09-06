import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Hash, MessageSquarePlus, Send, Sparkles, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatRelative, formatTime } from '../lib/format';
import { useSession } from '../lib/session';
import { getSocket } from '../lib/socket';
import type { Channel, ChatMessage, DirectoryUser } from '../lib/types';
import { Avatar, Card, EmptyState, inputClass, Spinner } from '../components/ui';

export default function Chat() {
  const { channelId } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();
  const { user, subscribe, setChatUnread } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [body, setBody] = useState('');
  const [typing, setTyping] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [showPeople, setShowPeople] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = useMemo(
    () => channels.find((c) => c.id === Number(channelId)) ?? null,
    [channels, channelId],
  );

  const loadChannels = useCallback(async () => {
    const data = await api.get<{ channels: Channel[]; totalUnread: number }>('/chat/channels');
    setChannels(data.channels);
    setChatUnread(data.totalUnread);
    return data.channels;
  }, [setChatUnread]);

  useEffect(() => {
    loadChannels()
      .then((list) => {
        if (!channelId && list.length) navigate(`/app/chat/${list[0].id}`, { replace: true });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    api.get<{ users: DirectoryUser[] }>('/directory/users').then((d) => setUsers(d.users)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nachrichten des aktiven Kanals laden und als gelesen markieren.
  useEffect(() => {
    if (!channelId) return;
    setMessages([]);
    api
      .get<{ messages: ChatMessage[] }>(`/chat/channels/${channelId}/messages`)
      .then((d) => setMessages(d.messages))
      .catch(() => undefined);
    getSocket().emit('chat:join', Number(channelId));
    api.post(`/chat/channels/${channelId}/read`).then(loadChannels).catch(() => undefined);
  }, [channelId, loadChannels]);

  // Eingehende Nachrichten live einsortieren.
  useEffect(
    () =>
      subscribe<{ message: ChatMessage }>('chat:message', ({ message }) => {
        if (message.channelId === Number(channelId)) {
          setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
          api.post(`/chat/channels/${channelId}/read`).catch(() => undefined);
        }
        void loadChannels();
      }),
    [subscribe, channelId, loadChannels],
  );

  useEffect(
    () =>
      subscribe<{ channelId: number; userId: number; name: string; typing: boolean }>('chat:typing', (p) => {
        if (p.channelId !== Number(channelId)) return;
        setTyping((prev) => {
          const next = { ...prev };
          if (p.typing) next[p.userId] = p.name;
          else delete next[p.userId];
          return next;
        });
        if (p.typing) {
          setTimeout(() => setTyping((prev) => {
            const next = { ...prev };
            delete next[p.userId];
            return next;
          }), 4000);
        }
      }),
    [subscribe, channelId],
  );

  useEffect(() => subscribe('chat:channel', () => { void loadChannels(); }), [subscribe, loadChannels]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function onType(value: string) {
    setBody(value);
    if (!channelId) return;
    const socket = getSocket();
    socket.emit('chat:typing', { channelId: Number(channelId), typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socket.emit('chat:typing', { channelId: Number(channelId), typing: false }),
      1800,
    );
  }

  async function send() {
    const text = body.trim();
    if (!text || !channelId) return;
    setBody('');
    getSocket().emit('chat:typing', { channelId: Number(channelId), typing: false });
    await api.post(`/chat/channels/${channelId}/messages`, { body: text }).catch(() => setBody(text));
  }

  async function openDm(userId: number) {
    const res = await api.post<{ channelId: number }>(`/chat/dm/${userId}`);
    await loadChannels();
    setShowPeople(false);
    navigate(`/app/chat/${res.channelId}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={30} />
      </div>
    );
  }

  const typingNames = Object.values(typing);

  return (
    <div className="grid h-[calc(100vh-8.5rem)] gap-4 lg:grid-cols-[17rem_1fr]">
      {/* ── Kanalliste ── */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-white">Kanäle</h2>
          <button
            onClick={() => setShowPeople((s) => !s)}
            className="text-white/35 transition-colors hover:text-gold-300"
            aria-label="Direktnachricht starten"
          >
            <MessageSquarePlus className="size-4" />
          </button>
        </div>

        <AnimatePresence>
          {showPeople ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/6 bg-ink-900/50"
            >
              <p className="px-4 pt-2.5 text-[10px] tracking-wide text-white/30 uppercase">Direktnachricht</p>
              <div className="max-h-52 overflow-y-auto py-1.5">
                {users.filter((u) => u.id !== user?.id).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => openDm(u.id)}
                    className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors hover:bg-white/5"
                  >
                    <Avatar name={u.name} accent={u.accent} size={24} online={u.online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-white/80">{u.name}</span>
                      <span className="block truncate text-[10px] text-white/30">{u.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto py-1.5">
          {channels.map((channel) => {
            const isActive = channel.id === Number(channelId);
            const Icon = channel.type === 'company' ? Building2 : channel.type === 'team' ? Hash : null;
            return (
              <Link
                key={channel.id}
                to={`/app/chat/${channel.id}`}
                className={`relative flex items-center gap-2.5 px-4 py-2.5 transition-colors ${
                  isActive ? 'bg-white/8' : 'hover:bg-white/4'
                }`}
              >
                {isActive ? (
                  <motion.span layoutId="chat-active" className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-gold-500" />
                ) : null}
                {Icon ? (
                  <Icon className="size-4 shrink-0" style={{ color: channel.teamColor ?? 'rgba(255,255,255,0.3)' }} />
                ) : channel.partner ? (
                  <Avatar
                    name={channel.partner.name}
                    accent={channel.partner.accent}
                    size={22}
                    online={users.find((u) => u.id === channel.partner?.id)?.online}
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${isActive ? 'text-white' : 'text-white/65'}`}>
                    {channel.name}
                  </span>
                  {channel.lastBody ? (
                    <span className="block truncate text-[11px] text-white/28">{channel.lastBody}</span>
                  ) : null}
                </span>
                {channel.unread > 0 ? (
                  <span className="shrink-0 rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-ink-950">
                    {channel.unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </Card>

      {/* ── Nachrichten ── */}
      <Card className="flex flex-col overflow-hidden">
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-white/6 px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-semibold text-white">{active.name}</h2>
                <p className="truncate text-xs text-white/35">
                  {active.type === 'dm' ? 'Direktnachricht' : active.topic || 'Interner Kanal'}
                </p>
              </div>
              {active.type === 'team' ? (
                <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/45">
                  <Users className="size-3" /> Fachgruppe
                </span>
              ) : null}
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <EmptyState title="Noch keine Nachrichten." hint="Schreib die erste." />
              ) : (
                messages.map((message, i) => {
                  const prev = messages[i - 1];
                  const grouped =
                    prev?.author?.id === message.author?.id &&
                    message.kind === 'text' &&
                    prev?.kind === 'text' &&
                    new Date(message.createdAt ?? 0).getTime() - new Date(prev.createdAt ?? 0).getTime() < 5 * 60_000;
                  return (
                    <MessageRow
                      key={message.id}
                      message={message}
                      grouped={grouped}
                      isMe={message.author?.id === user?.id}
                    />
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-white/6 px-5 py-3">
              <AnimatePresence>
                {typingNames.length ? (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-1.5 text-[11px] text-white/35"
                  >
                    {typingNames.join(', ')} schreibt …
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  value={body}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={`Nachricht an ${active.name} … (@ erwähnt jemanden)`}
                  className={`${inputClass} max-h-40 resize-none py-2.5`}
                />
                <button
                  onClick={send}
                  disabled={!body.trim()}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950 transition-opacity disabled:opacity-30"
                  aria-label="Senden"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="Kein Kanal ausgewählt." hint="Wähle links einen Kanal." />
        )}
      </Card>
    </div>
  );
}

function MessageRow({ message, grouped, isMe }: { message: ChatMessage; grouped: boolean; isMe: boolean }) {
  // Lead-Alarme sind Systemmeldungen mit direktem Sprung in den Vorgang.
  if (message.kind === 'lead_alert') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="my-2">
        <Link
          to={message.leadId ? `/app/leads/${message.leadId}` : '#'}
          className="flex items-center gap-3 rounded-xl border border-gold-500/30 bg-gold-500/8 px-4 py-3 transition-colors hover:bg-gold-500/14"
        >
          <Sparkles className="size-4 shrink-0 text-gold-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-gold-100">{message.body}</span>
            {message.leadRef ? (
              <span className="block font-mono text-[10px] text-gold-300/60">{message.leadRef}</span>
            ) : null}
          </span>
          <span className="shrink-0 text-[11px] text-white/30">{formatTime(message.createdAt)}</span>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${grouped ? 'mt-0.5' : 'mt-3'}`}
    >
      <span className="w-8 shrink-0">
        {!grouped && message.author ? (
          <Avatar name={message.author.name} accent={message.author.accent} size={32} />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        {!grouped ? (
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-medium ${isMe ? 'text-gold-200' : 'text-white/88'}`}>
              {message.author?.name ?? 'System'}
            </span>
            <span className="text-[10px] text-white/25" title={formatRelative(message.createdAt)}>
              {formatTime(message.createdAt)}
            </span>
          </div>
        ) : null}
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/68">{message.body}</p>
      </div>
    </motion.div>
  );
}
