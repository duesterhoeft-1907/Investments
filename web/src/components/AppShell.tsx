import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Bell, CalendarCheck, Check, ExternalLink, LayoutDashboard,
  LogOut, MessagesSquare, Sparkles, Users, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { formatRelative } from '../lib/format';
import { useSession } from '../lib/session';
import { Avatar, AuroraBackground } from './ui';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/leads', label: 'Leads', icon: Sparkles, end: false },
  { to: '/app/tasks', label: 'Aufgaben', icon: CalendarCheck, end: false },
  { to: '/app/chat', label: 'Chat', icon: MessagesSquare, end: false, badge: 'chat' as const },
  { to: '/app/team', label: 'Team', icon: Users, end: false },
];

export default function AppShell() {
  const { user, logout, unread, chatUnread } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => setBellOpen(false), [location.pathname]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-ink-950">
      <AuroraBackground intensity={0.45} />

      <header className="sticky top-0 z-40 border-b border-white/6 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-5">
          <Link to="/app" className="font-display text-sm font-semibold tracking-[0.2em] gold-text whitespace-nowrap">
            21 CAPITAL
          </Link>

          <nav className="ml-2 flex items-center gap-0.5 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                    isActive ? 'text-white' : 'text-white/45 hover:text-white/80'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-lg bg-white/8"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                    <item.icon className="relative size-4" />
                    <span className="relative hidden sm:inline">{item.label}</span>
                    {item.badge === 'chat' && chatUnread > 0 ? (
                      <span className="relative flex min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-ink-950">
                        {chatUnread > 99 ? '99+' : chatUnread}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/"
              target="_blank"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/40 transition-colors hover:bg-white/5 hover:text-white/75 md:flex"
            >
              <ExternalLink className="size-3.5" /> Wizard
            </Link>

            <button
              type="button"
              onClick={() => setBellOpen((o) => !o)}
              className="relative rounded-lg p-2 text-white/55 transition-colors hover:bg-white/6 hover:text-white"
              aria-label={`Benachrichtigungen (${unread} ungelesen)`}
            >
              <Bell className="size-5" />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </button>

            <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-ink-900/60 py-1.5 pl-2 pr-3">
              <Avatar name={user.name} accent={user.accent} size={30} />
              <div className="hidden leading-tight lg:block">
                <p className="text-xs font-medium text-white/90">{user.name}</p>
                <p className="text-[10px] text-white/35">{user.title}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="text-white/30 transition-colors hover:text-red-300"
                aria-label="Abmelden"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>{bellOpen ? <NotificationPanel onClose={() => setBellOpen(false)} /> : null}</AnimatePresence>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-5 py-7">
        <Outlet />
      </main>

      <ToastStack />
    </div>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, unread, markRead, markAllRead } = useSession();
  const navigate = useNavigate();

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="glass absolute right-5 top-[4.25rem] z-50 max-h-[70vh] w-[min(26rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Benachrichtigungen</h3>
          {unread > 0 ? (
            <button onClick={markAllRead} className="text-xs text-gold-300 transition-colors hover:text-gold-200">
              Alle als gelesen
            </button>
          ) : null}
        </div>

        <div className="max-h-[calc(70vh-3rem)] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-white/35">Nichts Neues.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) void markRead(n.id);
                  if (n.link) navigate(n.link);
                  onClose();
                }}
                className={`flex w-full gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/4 ${
                  n.isRead ? 'opacity-55' : ''
                }`}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${
                    n.urgency === 'critical' ? 'bg-danger' : n.urgency === 'high' ? 'bg-gold-400' : 'bg-white/25'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white/90">{n.title}</span>
                  {n.body ? <span className="mt-0.5 block line-clamp-2 text-xs text-white/45">{n.body}</span> : null}
                  <span className="mt-1 block text-[10px] text-white/25">{formatRelative(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}

function ToastStack() {
  const { toasts, dismissToast } = useSession();
  const navigate = useNavigate();

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2.5">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const critical = toast.urgency === 'critical';
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className={`glass pointer-events-auto overflow-hidden rounded-2xl shadow-2xl ${
                critical ? 'border-danger/45 animate-[pulse-ring_2s_ease-in-out_3]' : 'border-gold-500/30'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (toast.link) navigate(toast.link);
                  dismissToast(toast.id);
                }}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    critical ? 'bg-danger/18 text-red-300' : 'bg-gold-500/15 text-gold-300'
                  }`}
                >
                  {critical ? <AlertTriangle className="size-4.5" /> : <Sparkles className="size-4.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{toast.title}</span>
                  {toast.body ? <span className="mt-0.5 block text-xs leading-relaxed text-white/55">{toast.body}</span> : null}
                  {toast.link ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-gold-300">
                      Öffnen <Check className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast(toast.id);
                  }}
                  className="text-white/25 transition-colors hover:text-white/70"
                >
                  <X className="size-4" />
                </span>
              </button>
              <motion.div
                className={`h-0.5 ${critical ? 'bg-danger' : 'bg-gold-500'}`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: critical ? 12 : 7, ease: 'linear' }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
