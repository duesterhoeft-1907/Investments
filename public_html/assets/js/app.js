/**
 * Rahmen des internen CRM: Anmeldung, Navigation, Glocke, Meldungen und
 * ein kleiner Router. Die Seiten selbst liegen unter pages/ und werden erst
 * geladen, wenn sie gebraucht werden.
 */
import { h, mount, $ } from './core/dom.js';
import { icon } from './core/icons.js';
import { api, ApiError, setCsrf } from './core/api.js';
import { pulse } from './core/pulse.js';
import { playAlert } from './core/sound.js';
import { formatRelative } from './core/format.js';
import { aurora, avatar, button, field, logo, spinner, toast } from './core/ui.js';

export const session = {
  user: null,
  unread: 0,
  chatUnread: 0,
  online: [],
};

const root = $('#app');
let bellOpen = false;
let currentCleanup = null;

const ROUTES = [
  { pattern: /^\/app\/?$/,               load: () => import('./pages/dashboard.js') },
  { pattern: /^\/app\/leads\/(\d+)$/,    load: () => import('./pages/lead.js') },
  { pattern: /^\/app\/leads\/?$/,        load: () => import('./pages/leads.js') },
  { pattern: /^\/app\/tasks\/?$/,        load: () => import('./pages/tasks.js') },
  { pattern: /^\/app\/chat\/(\d+)$/,     load: () => import('./pages/chat.js') },
  { pattern: /^\/app\/chat\/?$/,         load: () => import('./pages/chat.js') },
  { pattern: /^\/app\/team\/?$/,         load: () => import('./pages/team.js') },
  { pattern: /^\/app\/settings\/?$/,     load: () => import('./pages/settings.js') },
];

const NAV = [
  { href: '/app', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/app/leads', label: 'Leads', icon: 'sparkles' },
  { href: '/app/tasks', label: 'Aufgaben', icon: 'calendar' },
  { href: '/app/chat', label: 'Chat', icon: 'chat', badge: 'chat' },
  { href: '/app/team', label: 'Team', icon: 'users' },
  // Nur fuer die, die dort etwas aendern duerfen – sonst waere der Punkt
  // eine Sackgasse mit einer 403 dahinter.
  { href: '/app/settings', label: 'Verwaltung', icon: 'shield', roles: ['admin', 'manager'] },
];

boot();

async function boot() {
  mount(root, aurora(), centered(spinner(30)));
  try {
    const data = await api.get('/auth/me');
    session.user = data.user;
    setCsrf(data.csrf);
    startShell();
  } catch {
    renderLogin();
  }
}

function centered(...children) {
  return h('div.row', { style: { minHeight: '70vh', justifyContent: 'center' } }, ...children);
}

/** Navigation ohne Neuladen – interne Links werden abgefangen. */
export function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  renderRoute();
}

window.addEventListener('popstate', () => renderRoute());

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/app"]');
  if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  navigate(link.getAttribute('href'));
});

// ───────────────────────────── Anmeldung ─────────────────────────────

function renderLogin() {
  const state = { email: '', password: '', error: '', busy: false };

  const paint = () => {
    const form = h(
      'form.glass',
      {
        style: { padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px' },
        onsubmit: async (event) => {
          event.preventDefault();
          state.busy = true;
          state.error = '';
          paint();
          try {
            const data = await api.post('/auth/login', { email: state.email.trim(), password: state.password });
            setCsrf(data.csrf);
            session.user = data.user;
            startShell();
          } catch (error) {
            state.error = error instanceof ApiError ? error.message : 'Anmeldung fehlgeschlagen.';
            state.busy = false;
            paint();
          }
        },
      },
      h('div.row', { style: { gap: '12px' } },
        h('span', { style: { width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(33, 180, 166,0.3)', background: 'rgba(33, 180, 166,0.1)', color: 'var(--accent-300)' } }, icon('lock', 19)),
        h('div', h('h1', { style: { fontSize: '18px', fontFamily: 'var(--font-display)' } }, 'Anmelden'),
          h('p.faint', { style: { fontSize: '12px' } }, 'Interner Zugang für Berater')),
      ),
      field('E-Mail', h('input.input', { type: 'email', required: true, autocomplete: 'username', value: state.email, oninput: (e) => { state.email = e.target.value; } }), { required: true }),
      field('Passwort', h('input.input', { type: 'password', required: true, autocomplete: 'current-password', value: state.password, oninput: (e) => { state.password = e.target.value; } }), { required: true }),
      state.error ? h('p', { style: { borderRadius: '10px', border: '1px solid rgba(217,83,79,0.3)', background: 'rgba(217,83,79,0.1)', padding: '9px 12px', fontSize: '14px', color: '#f0a5a2' } }, state.error) : null,
      h('button.btn.btn-primary.btn-lg.btn-block', { type: 'submit', disabled: state.busy },
        state.busy ? spinner(16) : null, state.busy ? 'Wird geprüft …' : 'Anmelden'),
      h('div', { style: { borderRadius: '12px', border: '1px solid var(--hairline)', background: 'rgba(11,15,20,0.5)', padding: '14px', fontSize: '11px', lineHeight: '1.7', color: 'var(--text-faint)' } },
        h('p', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'var(--text-dim)', fontWeight: '500' } }, icon('shield', 13), 'Demo-Zugänge'),
        h('p', { html: '<code>admin@21capitalinvest.de</code> · Geschäftsführung<br><code>j.ahrens@21capitalinvest.de</code> · Berater Edelmetalle<br>Passwort für alle: <code>Invest2026!</code>' }),
      ),
    );

    mount(
      root,
      aurora(),
      h('div.row', { style: { minHeight: '100vh', justifyContent: 'center', padding: '20px' } },
        h('div', { style: { width: '100%', maxWidth: '420px' }, class: 'rise' },
          h('div', { style: { textAlign: 'center', marginBottom: '28px' } },
            h('a', { href: '/', style: { display: 'inline-block' } }, logo(38)),
            h('p.faint', { style: { marginTop: '8px', fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase' } }, 'Lead & CRM Suite')),
          form,
          h('p', { style: { marginTop: '22px', textAlign: 'center', fontSize: '12px' } },
            h('a.faint', { href: '/' }, '← Zur öffentlichen Anfrage-Strecke')),
        ),
      ),
    );
  };

  paint();
}

// ───────────────────────────── Rahmen ─────────────────────────────

function startShell() {
  mount(root, aurora(), h('header.crm-header', headerBar()), h('main.crm-main#view'), h('div.alert-host#alerts'));
  renderRoute();
  wirePulse();
  void refreshNotifications();
}

function headerBar() {
  return h(
    'div.bar',
    h('a.crm-brand', { href: '/app', title: '21 Capital Invest' }, logo(30)),
    h('nav.crm-nav', NAV.filter(visibleTo(session.user)).map(navLink)),
    h('div.crm-actions',
      h('a.icon-btn', { href: '/', target: '_blank', title: 'Öffentlichen Wizard ansehen' }, icon('external', 17)),
      bellButton(),
      h('div.crm-user',
        avatar(session.user.name, session.user.accent, 30),
        h('div.who', h('div.name', session.user.name), h('div.title', session.user.title)),
        h('button.icon-btn', {
          style: { padding: '2px' },
          'aria-label': 'Abmelden',
          onclick: async () => { await api.post('/auth/logout').catch(() => {}); location.href = '/app'; },
        }, icon('logout', 15)),
      ),
    ),
  );
}

/** Punkte ohne roles sieht jeder; mit roles nur die genannten. */
function visibleTo(user) {
  return (item) => !item.roles || item.roles.includes(user.role);
}

function navLink(item) {
  const path = location.pathname;
  const active = item.exact ? /^\/app\/?$/.test(path) : path.startsWith(item.href);
  const badge = item.badge === 'chat' && session.chatUnread > 0
    ? h('span.count', session.chatUnread > 99 ? '99+' : String(session.chatUnread))
    : null;
  return h('a' + (active ? '.active' : ''), { href: item.href }, icon(item.icon, 16), h('span.label', item.label), badge);
}

function bellButton() {
  return h('button.icon-btn#bell', {
    'aria-label': `Benachrichtigungen (${session.unread} ungelesen)`,
    onclick: (event) => { event.stopPropagation(); toggleBell(); },
  }, icon('bell', 18), session.unread > 0 ? h('span.count', session.unread > 99 ? '99+' : String(session.unread)) : null);
}

function refreshHeader() {
  const header = $('.crm-header');
  if (header) mount(header, headerBar());
}

async function refreshNotifications() {
  try {
    const data = await api.get('/notifications');
    session.notifications = data.notifications;
    session.unread = data.unread;
    refreshHeader();
  } catch { /* die Glocke bleibt eben leer */ }
}

function toggleBell() {
  bellOpen = !bellOpen;
  const existing = $('.bell-panel');
  if (existing) existing.remove();
  const backdrop = $('#bell-backdrop');
  if (backdrop) backdrop.remove();
  if (!bellOpen) return;

  const panel = h('div.glass.bell-panel',
    h('div.head', h('h3', 'Benachrichtigungen'),
      session.unread > 0
        ? h('button', { style: { background: 'none', border: 'none', fontSize: '12px', color: 'var(--accent-300)' },
            onclick: async () => { await api.post('/notifications/read-all').catch(() => {}); await refreshNotifications(); toggleBell(); toggleBell(); } },
            'Alle als gelesen')
        : null),
    h('div.list', (session.notifications || []).length === 0
      ? h('p.faint', { style: { padding: '40px 16px', textAlign: 'center', fontSize: '14px' } }, 'Nichts Neues.')
      : session.notifications.map((n) =>
          h('button.bell-item' + (n.isRead ? '.read' : ''), {
            onclick: async () => {
              if (!n.isRead) await api.post(`/notifications/${n.id}/read`).catch(() => {});
              toggleBell();
              await refreshNotifications();
              if (n.link) navigate(n.link);
            },
          },
            h('span.mark.' + n.urgency),
            h('span.grow',
              h('span.t.truncate', { style: { display: 'block' } }, n.title),
              n.body ? h('span.b', { style: { display: 'block' } }, n.body) : null,
              h('span.w', { style: { display: 'block' } }, formatRelative(n.createdAt))),
          ))),
  );

  const backdropEl = h('div#bell-backdrop', { style: { position: 'fixed', inset: '0', zIndex: '45' }, onclick: () => toggleBell() });
  document.querySelector('.crm-header').append(backdropEl, panel);
}

// ───────────────────────────── Meldungen ─────────────────────────────

function showAlert(notification) {
  const host = $('#alerts');
  if (!host) return;
  const critical = notification.urgency === 'critical';

  const close = () => { card.style.opacity = '0'; card.style.transform = 'translateX(40px)'; setTimeout(() => card.remove(), 300); };
  const card = h('div.alert-card' + (critical ? '.critical' : ''),
    h('span.sym', icon(critical ? 'alert' : 'sparkles', 17)),
    h('div.grow', { style: { cursor: notification.link ? 'pointer' : 'default' },
      onclick: () => { if (notification.link) { navigate(notification.link); close(); } } },
      h('div.t', notification.title),
      notification.body ? h('div.b', notification.body) : null),
    h('button.close', { 'aria-label': 'Schließen', onclick: close }, icon('x', 15)),
  );

  host.appendChild(card);
  playAlert(notification.urgency);
  setTimeout(close, critical ? 12000 : 7000);
  while (host.children.length > 4) host.firstChild.remove();
}

function wirePulse() {
  pulse.on('counts', ({ unread, chatUnread }) => {
    if (unread === session.unread && chatUnread === session.chatUnread) return;
    session.unread = unread;
    session.chatUnread = chatUnread;
    refreshHeader();
  });

  pulse.on('presence', (online) => { session.online = online; });

  pulse.on('notification', (payload) => {
    showAlert(payload);
    void refreshNotifications();
  });

  pulse.on('unauthorized', () => {
    toast('Sitzung abgelaufen. Bitte neu anmelden.', 'error');
    setTimeout(() => location.reload(), 1500);
  });

  pulse.start();
}

// ───────────────────────────── Router ─────────────────────────────

async function renderRoute() {
  const view = $('#view');
  if (!view) return;

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch { /* egal */ }
    currentCleanup = null;
  }

  refreshHeader();
  const path = location.pathname;

  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (!match) continue;
    mount(view, centered(spinner(28)));
    try {
      const module = await route.load();
      const result = module.render(view, { params: match.slice(1), session, navigate });
      currentCleanup = typeof result === 'function' ? result : null;
    } catch (error) {
      console.error(error);
      mount(view, h('p.muted', { style: { padding: '40px', textAlign: 'center' } }, 'Diese Ansicht konnte nicht geladen werden.'));
    }
    return;
  }

  navigate('/app', true);
}

export { toast };
