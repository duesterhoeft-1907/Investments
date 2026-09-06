import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { api } from './api';
import { closeSocket, getSocket } from './socket';
import { playAlert } from './sound';
import type { AppNotification, CurrentUser, Lead } from './types';

interface Toast {
  id: number;
  title: string;
  body: string;
  link: string;
  urgency: 'normal' | 'high' | 'critical';
}

interface SessionValue {
  user: CurrentUser | null;
  loading: boolean;
  notifications: AppNotification[];
  unread: number;
  toasts: Toast[];
  chatUnread: number;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (id: number) => void;
  setChatUnread: (n: number) => void;
  /** Live-Ereignisse aus dem Socket abonnieren (Leads, Chat, SLA). Gibt die Abmeldung zurück. */
  subscribe: <P>(event: string, handler: (payload: P) => void) => () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const toastId = useRef(0);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.get<{ notifications: AppNotification[]; unread: number }>('/notifications');
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      /* stiller Fehler – die Glocke bleibt einfach leer */
    }
  }, []);

  useEffect(() => {
    api
      .get<{ user: CurrentUser }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      closeSocket();
      return;
    }

    void loadNotifications();
    void api
      .get<{ totalUnread: number }>('/chat/channels')
      .then((d) => setChatUnread(d.totalUnread))
      .catch(() => undefined);

    const socket = getSocket();

    const onNotification = ({ notification }: { notification: AppNotification }) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 60));
      setUnread((n) => n + 1);
      const id = ++toastId.current;
      setToasts((prev) => [
        ...prev.slice(-3),
        {
          id,
          title: notification.title,
          body: notification.body,
          link: notification.link,
          urgency: notification.urgency,
        },
      ]);
      playAlert(notification.urgency);
      const ttl = notification.urgency === 'critical' ? 12_000 : 7000;
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
    };

    socket.on('notification:new', onNotification);
    return () => {
      socket.off('notification:new', onNotification);
    };
  }, [user, loadNotifications]);

  const subscribe = useCallback(
    <P,>(event: string, handler: (payload: P) => void) => {
      if (!user) return () => undefined;
      const socket = getSocket();
      const listener = (payload: P) => handler(payload);
      socket.on(event, listener);
      return () => {
        socket.off(event, listener);
      };
    },
    [user],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      loading,
      notifications,
      unread,
      toasts,
      chatUnread,
      setChatUnread,
      subscribe,
      login: async (email, password) => {
        await api.post<{ user: CurrentUser }>('/auth/login', { email, password });
        const me = await api.get<{ user: CurrentUser }>('/auth/me');
        setUser(me.user);
      },
      logout: async () => {
        await api.post('/auth/logout');
        closeSocket();
        setUser(null);
        setNotifications([]);
        setUnread(0);
      },
      markRead: async (id) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnread((n) => Math.max(0, n - 1));
        await api.post(`/notifications/${id}/read`).catch(() => undefined);
      },
      markAllRead: async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnread(0);
        await api.post('/notifications/read-all').catch(() => undefined);
      },
      dismissToast: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    }),
    [user, loading, notifications, unread, toasts, chatUnread, subscribe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession muss innerhalb von <SessionProvider> verwendet werden.');
  return ctx;
}

/** Bequemer Zugriff auf Lead-Live-Updates in Listen und Detailansichten. */
export function useLeadEvents(handlers: {
  onNew?: (lead: Lead) => void;
  onUpdated?: (lead: Lead) => void;
  onSla?: (lead: Lead, state: 'warning' | 'breached') => void;
}) {
  const { subscribe } = useSession();
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const offNew = subscribe<{ lead: Lead }>('lead:new', (p) => ref.current.onNew?.(p.lead));
    const offUpd = subscribe<{ lead: Lead }>('lead:updated', (p) => ref.current.onUpdated?.(p.lead));
    const offSla = subscribe<{ lead: Lead; state: 'warning' | 'breached' }>('lead:sla', (p) =>
      ref.current.onSla?.(p.lead, p.state),
    );
    return () => {
      offNew();
      offUpd();
      offSla();
    };
  }, [subscribe]);
}
