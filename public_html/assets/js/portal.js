/**
 * Kundenbereich. Der Interessent sieht hier den Stand seiner Anfrage, seinen
 * Ansprechpartner, die nächsten Schritte und – sobald freigegeben – sein
 * Angebot, das er direkt annehmen oder ablehnen kann.
 */
import { h, mount, $ } from './core/dom.js';
import { icon } from './core/icons.js';
import { api, ApiError, setCsrf } from './core/api.js';
import { formatCurrency, formatDate, formatDateTime, formatRelative, initials, renderMarkdown } from './core/format.js';
import { logo, spinner, toast } from './core/ui.js';
import { umschalter } from './core/theme.js';

const root = $('#app');
const token = (/^\/portal\/([a-f0-9]{8,})/.exec(location.pathname) || [])[1] || '';

const state = { data: null, preview: null, message: '', sending: false, openOffer: null };

boot();

async function boot() {
  mount(root, h('div.row', { style: { minHeight: '100vh', justifyContent: 'center' } }, spinner(30)));
  if (token) {
    api.get(`/portal/preview/${token}`).then((p) => { state.preview = p; if (!state.data) renderLogin(); }).catch(() => {});
  }
  try {
    state.data = await api.get('/portal/me');
    renderPortal();
  } catch {
    renderLogin();
  }
}

// ───────────────────────────── Anmeldung ─────────────────────────────

function renderLogin(error = '') {
  const form = { email: '', password: '', busy: false, error };

  const paint = () => {
    const company = state.preview?.company?.name || window.__COMPANY__?.name || '21 Capital Invest';

    mount(root, h('div.p-login',
      h('div.inner',
        h('div.brand',
          // Das Logo ist hell auf durchsichtigem Grund – auf der hellen
          // Fläche des Kundenbereichs wäre es unsichtbar. Deshalb steht es
          // hier auf einer dunklen Auflage, statt durch Text ersetzt zu
          // werden: der Kunde soll dasselbe Zeichen sehen wie auf der
          // Unternehmensseite.
          h('span.brand-plate', logo(30)),
          h('p.sub', 'Persönlicher Kundenbereich')),
        state.preview
          ? h('div.greet',
              h('p', { style: { fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '600' } }, `Willkommen, ${state.preview.firstName}.`),
              h('p', { style: { marginTop: '6px', fontSize: '14px', color: 'var(--text-dim)' } },
                'Ihre Anfrage ', h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--akzent-text)' } }, state.preview.ref),
                state.preview.assetClass ? ` zu ${state.preview.assetClass}` : '', ' wird bearbeitet',
                state.preview.advisor ? ` von ${state.preview.advisor}` : '', '.'))
          : null,
        h('form', {
          onsubmit: async (event) => {
            event.preventDefault();
            form.busy = true;
            form.error = '';
            paint();
            try {
              const result = await api.post('/portal/login', { token, email: form.email.trim(), password: form.password });
              setCsrf(result.csrf);
              state.data = await api.get('/portal/me');
              renderPortal();
            } catch (err) {
              form.error = err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen.';
              form.busy = false;
              paint();
            }
          },
        },
          h('div.row', { style: { gap: '12px' } },
            h('span', { style: { width: '40px', height: '40px', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--akzent-text)' } }, icon('lock', 19)),
            h('div', { style: { flex: '1' } },
              h('h1', { style: { fontFamily: 'var(--font-display)', fontSize: '16px' } }, 'Anmelden'),
              h('p', { style: { fontSize: '12px', color: 'var(--text-faint)' } }, 'Zugangsdaten aus Ihrer Bestätigungs-E-Mail')),
            umschalter()),
          h('label', h('span', 'E-Mail'),
            h('input.p-input', { type: 'email', required: true, autocomplete: 'username', value: form.email, oninput: (e) => { form.email = e.target.value; } })),
          h('label', h('span', 'Passwort'),
            h('input.p-input', { type: 'password', required: true, autocomplete: 'current-password', value: form.password, oninput: (e) => { form.password = e.target.value; } })),
          form.error ? h('p.err', form.error) : null,
          h('button.p-btn', { type: 'submit', disabled: form.busy },
            form.busy ? spinner(16) : null, form.busy ? 'Wird geprüft …' : 'Anmelden', form.busy ? null : icon('arrowRight', 15))),
        h('p.note', icon('shield', 13), 'Ihre Daten werden vertraulich behandelt.'),
      )));
  };

  paint();
}

// ───────────────────────────── Landing ─────────────────────────────

function renderPortal() {
  const { lead, advisor, company } = state.data;
  if (state.openOffer === null && state.data.offers.length) state.openOffer = state.data.offers[0].id;

  mount(root,
    h('header.p-header', h('div.bar',
      h('span.p-brand', h('span.brand-plate.is-small', logo(22))),
      h('div.row', { style: { gap: '10px' } },
        umschalter(),
        h('button.p-logout', { onclick: async () => { await api.post('/portal/logout').catch(() => {}); location.reload(); } }, 'Abmelden')))),
    h('main.p-main',
      anfragenLeiste(),
      heroSection(lead),
      h('div.p-grid',
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
          offersSection(), stepsSection(), documentsSection(), historySection()),
        h('aside', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
          advisorCard(advisor), messageCard(), factsCard(lead), footerNote(company))),
    ));
}

/**
 * Umschalter zwischen den eigenen Anfragen.
 *
 * Erscheint nur, wenn es mehr als eine gibt. Vorher war der
 * Kundenbereich ein Fenster auf genau einen Vorgang: wer zum dritten Mal
 * gefragt hatte, sah die ersten beiden nie wieder – und kam mit dem alten
 * Passwort nicht einmal mehr hinein.
 */
function anfragenLeiste() {
  const anfragen = state.data.requests ?? [];
  if (anfragen.length < 2) return null;

  return h('section.p-card.p-anfragen',
    h('p.kicker', `Deine Anfragen (${anfragen.length})`),
    h('div.p-anfragen-liste',
      anfragen.map((a) =>
        h('button.p-anfrage' + (a.aktiv ? '.on' : ''), {
          type: 'button',
          disabled: a.aktiv,
          onclick: async () => {
            try {
              await api.post('/portal/switch', { leadId: a.id });
              state.data = await api.get('/portal/me');
              state.openOffer = null;
              renderPortal();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (error) {
              toast(error.message, 'error');
            }
          },
        },
          h('span.t', a.assetClass ?? 'Anfrage'),
          h('span.s', `${a.statusLabel} · ${formatRelative(a.createdAt)}`),
          h('span.r', a.ref)))));
}

function heroSection(lead) {
  return h('section.p-card.p-hero',
    h('p.ref', `Vorgang ${lead.ref} · seit ${formatDate(lead.createdAt)}`),
    h('h1', `Guten Tag, ${lead.firstName}.`),
    h('p.intro',
      'Hier sehen Sie jederzeit den Stand Ihrer Anfrage',
      lead.assetClass ? h('span', ' zu ', h('strong', lead.assetClass)) : '',
      ', die nächsten Schritte und – sobald erstellt – Ihr persönliches Angebot.'),
    h('div.p-steps', lead.stages.map((stage, i) => {
      const done = i < lead.stageIndex;
      const active = i === lead.stageIndex;
      return h('div.p-step' + (done ? '.done' : active ? '.active' : ''),
        h('div.col',
          h('span.knob', { style: { animationDelay: `${140 + i * 80}ms` } }, done ? icon('check', 14) : String(i + 1)),
          h('span.label', stage.label)),
        i < lead.stages.length - 1
          ? h('span.link', h('i', { style: { width: done ? '100%' : '0%', transitionDelay: `${250 + i * 80}ms` } }))
          : null);
    })),
  );
}

function offersSection() {
  const offers = state.data.offers;
  if (offers.length === 0) {
    return h('section.p-section',
      h('h2', icon('sparkles', 16), 'Ihr Angebot'),
      h('div.p-empty',
        h('p', 'Ihr persönliches Angebot wird gerade vorbereitet.'),
        h('p.sub', 'Sobald es bereitsteht, erhalten Sie eine E-Mail und sehen es hier.')));
  }

  return h('section.p-section',
    h('h2', icon('file', 16), 'Ihr Angebot'),
    offers.map((offer) => {
      const open = state.openOffer === offer.id;
      return h('div.p-offer',
        h('button.head', { onclick: () => { state.openOffer = open ? null : offer.id; renderPortal(); } },
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('p.title.truncate', offer.title),
            h('p.sum.truncate', offer.summary)),
          h('span.amount', formatCurrency(offer.amount)),
          offer.status === 'accepted' ? h('span.state.accepted', 'Angenommen')
            : offer.status === 'declined' ? h('span.state.declined', 'Abgelehnt') : null),
        open ? h('div.body',
          h('div.prose-offer', { html: renderMarkdown(offer.body), style: { fontSize: '14px', color: '#33404d' } }),
          offer.validUntil
            ? h('p', { style: { marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-faint)' } },
                icon('clock', 13), `Gültig bis ${formatDate(offer.validUntil)}`)
            : null,
          offer.status === 'sent'
            ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--hairline)' } },
                h('button.p-btn', { style: { width: 'auto' }, onclick: () => respond(offer.id, 'accepted') }, icon('check', 15), 'Angebot annehmen'),
                h('button.p-btn.p-btn-ghost', { style: { width: 'auto' }, onclick: () => respond(offer.id, 'declined') }, 'Nicht passend'))
            : null,
        ) : null);
    }));
}

async function respond(offerId, decision) {
  try {
    await api.post('/portal/offers/respond', { offerId, decision });
    toast(decision === 'accepted' ? 'Vielen Dank – wir melden uns umgehend.' : 'Danke für Ihre Rückmeldung.');
    state.data = await api.get('/portal/me');
    renderPortal();
  } catch (error) { toast(error.message, 'error'); }
}

function stepsSection() {
  const steps = state.data.nextSteps;
  if (steps.length === 0) return null;
  return h('section.p-section',
    h('h2', icon('check', 16), 'Ihre nächsten Schritte'),
    h('ol.p-steplist', steps.map((step, i) =>
      h('li' + (step.done ? '.done' : ''), { style: { animationDelay: `${i * 60}ms` } },
        h('span.num', step.done ? icon('check', 11) : String(i + 1)),
        h('div',
          h('p.t', step.title),
          step.description ? h('p.d', step.description) : null,
          step.dueAt && !step.done ? h('p.d', `Geplant: ${formatDateTime(step.dueAt)}`) : null)))));
}

function documentsSection() {
  const docs = state.data.documents;
  if (docs.length === 0) return null;
  return h('section.p-section',
    h('h2', icon('download', 16), 'Ihre Unterlagen'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      docs.map((doc) =>
        h('a.p-doc', { href: doc.url, target: '_blank', rel: 'noreferrer' },
          icon('file', 15),
          h('span', { style: { flex: '1', minWidth: '0', fontSize: '14px' }, class: 'truncate' }, doc.filename),
          h('span', { style: { fontSize: '12px', color: 'var(--text-faint)' } }, `${Math.round(doc.sizeBytes / 1024)} KB`)))));
}

function historySection() {
  const entries = state.data.conversation;
  if (entries.length === 0) return null;
  return h('section.p-section',
    h('h2', icon('clock', 16), 'Was bisher geschah'),
    h('ol.p-timeline', entries.map((entry) =>
      h('li',
        h('span.bullet'),
        h('p.t', entry.title),
        entry.body ? h('p.b', entry.body) : null,
        h('p.w', formatDateTime(entry.occurredAt) + (entry.author ? ` · ${entry.author}` : ''))))));
}

function advisorCard(advisor) {
  if (!advisor) {
    return h('div.p-card', { style: { padding: '20px', textAlign: 'center' } },
      icon('users', 22),
      h('p', { style: { marginTop: '8px', fontSize: '14px', color: 'var(--text-dim)' } }, 'Ihr Ansprechpartner wird gerade zugewiesen.'));
  }
  return h('div.p-card.p-advisor',
    h('p.kicker', 'Ihr Ansprechpartner'),
    h('div.who',
      h('span.mono-avatar', { style: { background: advisor.accent + '1f', color: advisor.accent } }, initials(advisor.name)),
      h('div', { style: { minWidth: '0' } },
        h('p.name.truncate', advisor.name),
        h('p.title.truncate', advisor.title))),
    h('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('a', { href: 'tel:' + advisor.phone }, icon('phone', 15), advisor.phone),
      h('a', { href: 'mailto:' + advisor.email }, icon('mail', 15), h('span.truncate', advisor.email))));
}

function messageCard() {
  const textarea = h('textarea.p-input', {
    rows: 4, placeholder: 'Ihre Frage oder Anmerkung …',
    value: state.message, oninput: (e) => { state.message = e.target.value; },
  });

  const send = async () => {
    if (state.message.trim().length < 2) return;
    state.sending = true;
    button.disabled = true;
    try {
      await api.post('/portal/messages', { body: state.message });
      state.message = '';
      textarea.value = '';
      toast('Ihre Nachricht ist angekommen.');
      state.data = await api.get('/portal/me');
      renderPortal();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      state.sending = false;
      button.disabled = false;
    }
  };

  const button = h('button.p-btn', { style: { marginTop: '10px' }, onclick: send }, icon('send', 14), 'Absenden');

  return h('div.p-card', { style: { padding: '20px' } },
    h('p', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '14px', fontWeight: '600' } },
      icon('message', 15), 'Nachricht schreiben'),
    textarea, button);
}

function factsCard(lead) {
  const rows = [
    ['Interesse', lead.assetClass ?? '–'],
    ['Volumen', lead.volumeLabel || '–'],
    ['Horizont', lead.horizonLabel || '–'],
    ['Status', lead.statusLabel],
  ];
  return h('div.p-facts',
    h('p', { style: { fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)' } }, 'Ihre Angaben'),
    h('dl', rows.map(([k, v]) => h('div.line', h('dt', k), h('dd', v)))),
    lead.goal ? h('p.goal', `„${lead.goal}"`) : null);
}

function footerNote(company) {
  return h('p', { style: { textAlign: 'center', fontSize: '11px', lineHeight: '1.7', color: 'var(--text-faint)' } },
    company?.name || '', h('br'), `${company?.phone || ''} · ${company?.email || ''}`);
}
