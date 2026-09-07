/**
 * Der öffentliche Lead-Wizard.
 *
 * Fünf Schritte, jeder mit eigener Prüfung. Die Auswahl eines Fachgebiets
 * springt selbst weiter – das erspart einen Klick und macht den Einstieg
 * schnell, worum es hier ja geht.
 */
import { h, mount, $ } from './core/dom.js';
import { icon } from './core/icons.js';
import { api, ApiError } from './core/api.js';
import { aurora, button, field, spinner, toast } from './core/ui.js';

const STEPS = ['Fachgebiet', 'Volumen', 'Profil', 'Kontakt', 'Bestätigung'];

const state = {
  config: null,
  step: 0,
  result: null,
  errors: {},
  busy: false,
  form: {
    assetClassSlug: '', volumeBand: '', horizon: '', experience: '', goal: '',
    firstName: '', lastName: '', email: '', phone: '', company: '', postalCode: '', city: '',
    contactPref: 'phone', contactWindow: 'flexibel', message: '',
    consentContact: false, consentMarketing: false, website: '',
  },
};

const root = $('#app');

init();

async function init() {
  mount(root, aurora(), h('div.wizard-shell', h('div.row', { style: { minHeight: '60vh', justifyContent: 'center' } }, spinner(30))));
  try {
    state.config = await api.get('/public/wizard-config');
    render();
  } catch {
    mount(
      root,
      aurora(),
      h('div.wizard-shell', h('div', { style: { maxWidth: '440px', margin: '120px auto', textAlign: 'center' } },
        h('p.muted', 'Die Anfrage-Strecke ist gerade nicht erreichbar. Bitte später erneut versuchen.'))),
    );
  }
}

function set(key, value) {
  state.form[key] = value;
  if (state.errors[key]) delete state.errors[key];
}

function slaMinutes() {
  const asset = state.config?.assetClasses.find((a) => a.slug === state.form.assetClassSlug);
  return asset?.slaMinutes ?? state.config?.defaultSlaMinutes ?? 15;
}

/**
 * Was wir zusagen dürfen.
 *
 * Ausserhalb der Geschäftszeiten wäre „in 10 Minuten“ ein Wort, das niemand
 * halten kann – und das wäre der erste Eindruck. Dann nennen wir die
 * nächste Öffnung.
 */
function slaPromise(hours = state.config?.hours) {
  const minutes = slaMinutes();
  if (!hours || hours.open || !hours.nextOpening) {
    return `innerhalb von ${minutes} Minuten`;
  }

  const next = new Date(hours.nextOpening);
  const time = next.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  const days = Math.round((startOfDay(next) - startOfDay(new Date())) / 86400000);

  if (days <= 0) return `heute ab ${time}`;
  if (days === 1) return `morgen früh ab ${time}`;
  return `am ${next.toLocaleDateString('de-DE', { weekday: 'long' })} ab ${time}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Prüfung je Schritt – erst wenn sie greift, geht es weiter. */
function validate(step) {
  const errors = {};
  const f = state.form;

  if (step === 0 && !f.assetClassSlug) errors.assetClassSlug = 'Bitte ein Fachgebiet wählen.';
  if (step === 1) {
    if (!f.volumeBand) errors.volumeBand = 'Bitte ein Anlagevolumen wählen.';
    if (!f.horizon) errors.horizon = 'Bitte einen Anlagehorizont wählen.';
  }
  if (step === 3) {
    if (f.firstName.trim().length < 2) errors.firstName = 'Bitte Vornamen angeben.';
    if (f.lastName.trim().length < 2) errors.lastName = 'Bitte Nachnamen angeben.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = 'Bitte gültige E-Mail-Adresse angeben.';
    if (f.contactPref !== 'email' && f.phone.trim().length < 6) {
      errors.phone = 'Für den Rückruf brauchen wir eine Telefonnummer.';
    }
    if (!f.consentContact) errors.consentContact = 'Ohne Einwilligung dürfen wir nicht anrufen.';
  }

  state.errors = errors;
  return Object.keys(errors).length === 0;
}

function go(delta, skipValidation = false) {
  // Beim Weitergehen durch eine Auswahl ist der Schritt bereits erfüllt –
  // eine erneute Prüfung würde auf dem alten Stand scheitern.
  if (delta > 0 && !skipValidation && !validate(state.step)) {
    render();
    return;
  }
  const panel = $('.step-panel');
  if (panel) panel.classList.add('leave');
  state.step = Math.max(0, Math.min(STEPS.length - 1, state.step + delta));
  setTimeout(() => {
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, panel ? 180 : 0);
}

async function submit() {
  if (!validate(3)) return render();
  state.busy = true;
  render();
  try {
    state.result = await api.post('/public/leads', { ...state.form, country: 'DE', consentContact: true });
    state.step = 4;
    state.errors = {};
  } catch (error) {
    if (error instanceof ApiError && Object.keys(error.fields || {}).length) {
      state.errors = error.fields;
      state.step = 3;
    } else {
      state.errors = { _: error.message || 'Unbekannter Fehler.' };
    }
  } finally {
    state.busy = false;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ───────────────────────────── Darstellung ─────────────────────────────

function render() {
  mount(
    root,
    aurora(),
    h(
      'div.wizard-shell',
      renderHead(),
      state.step === 0 && !state.result ? renderHero() : null,
      h(
        'div.wizard-body',
        !state.result ? renderStepper() : null,
        h('div.step-panel.enter', renderStep()),
        !state.result ? renderNav() : null,
      ),
    ),
  );
}

function renderHead() {
  return h(
    'header.wizard-head',
    h('a.wizard-brand.gold-text', { href: '/' }, (window.__COMPANY__?.name || '21 Capital Invest').toUpperCase()),
    h('a.wizard-staff-link', { href: '/app' }, 'Mitarbeiter-Login'),
  );
}

function renderHero() {
  const company = window.__COMPANY__?.name || '21 Capital Invest';
  return h(
    'section.hero.rise',
    h('span.promise', icon('timer', 14), 'Rückmeldung ' + slaPromise()),
    h('h1', 'Ihr Vermögen verdient', h('br'), h('span.gold-text', 'eine schnelle Antwort.')),
    h('p.lead', `Beantworten Sie vier kurze Fragen. Ihre Anfrage geht direkt an das zuständige Fachteam von ${company} – nicht in ein anonymes Postfach.`),
    h(
      'div.trust',
      h('span', icon('shield', 14), 'Keine Weitergabe an Dritte'),
      h('span', icon('timer', 14), 'Persönlicher Rückruf statt Warteschleife'),
      h('span', icon('lock', 14), 'Eigener Kundenbereich inklusive'),
    ),
  );
}

function renderStepper() {
  return h(
    'div.stepper',
    STEPS.map((name, i) =>
      h(
        'div.step' + (i === state.step ? '.active' : i < state.step ? '.done' : ''),
        h('div.bar', h('i', { style: { width: i < state.step ? '100%' : i === state.step ? '55%' : '0%' } })),
        h('span.name', name),
      ),
    ),
  );
}

function heading(title, subtitle) {
  return h('div.step-heading', h('h2', title), h('p', subtitle));
}

function renderStep() {
  switch (state.step) {
    case 0: return stepAsset();
    case 1: return stepVolume();
    case 2: return stepProfile();
    case 3: return stepContact();
    default: return stepDone();
  }
}

function stepAsset() {
  return h(
    'div',
    heading('Wofür interessieren Sie sich?', 'Ihre Auswahl bestimmt, welches Fachteam sich meldet.'),
    h(
      'div.asset-grid',
      state.config.assetClasses.map((asset, i) => {
        const accent = asset.teamColor || '#C8A24A';
        const selected = state.form.assetClassSlug === asset.slug;
        return h(
          'button.asset-card' + (selected ? '.selected' : ''),
          {
            type: 'button',
            style: { animationDelay: Math.min(i * 45, 400) + 'ms' },
            onclick: () => {
              set('assetClassSlug', asset.slug);
              render();
              setTimeout(() => go(1, true), 240);
            },
          },
          h('span.glow', { style: { background: accent } }),
          h(
            'span.inner',
            h('span.badge-icon', { style: { background: accent + '1f', color: accent, border: `1px solid ${accent}3d` } }, icon(iconFor(asset.icon), 20)),
            h(
              'span.grow',
              h('span.row', { style: { gap: '8px' } }, h('h3', asset.name), selected ? icon('check', 15) : null),
              h('span.tagline', asset.tagline),
              asset.teamName ? h('span.team', `Team ${asset.teamName} · Antwort in ${asset.slaMinutes} Min.`) : null,
            ),
          ),
        );
      }),
    ),
    state.errors.assetClassSlug ? h('p.error', { style: { marginTop: '12px', color: '#f0a5a2' } }, state.errors.assetClassSlug) : null,
  );
}

function iconFor(name) {
  const map = { coins: 'wallet', layers: 'grid', gem: 'sparkles', building: 'building',
    diamond: 'sparkles', palette: 'sparkles', trending: 'trending', chart: 'trending', bitcoin: 'wallet' };
  return map[name] || 'sparkles';
}

function optionGrid(options, current, onPick, cols = 2) {
  return h(
    'div.option-grid.cols-' + cols,
    options.map((option, i) =>
      h(
        'button.option' + (current === option.value ? '.selected' : ''),
        { type: 'button', style: { animationDelay: Math.min(i * 35, 300) + 'ms' }, onclick: () => { onPick(option.value); render(); } },
        option.label,
      ),
    ),
  );
}

function stepVolume() {
  return h(
    'div',
    h('div', { style: { marginBottom: '32px' } },
      heading('Wie viel möchten Sie investieren?', 'Eine Größenordnung genügt – nichts davon ist verbindlich.'),
      optionGrid(state.config.volumeBands, state.form.volumeBand, (v) => set('volumeBand', v), 2),
      state.errors.volumeBand ? h('p', { style: { marginTop: '10px', fontSize: '13px', color: '#f0a5a2' } }, state.errors.volumeBand) : null,
    ),
    h('div',
      h('h3', { style: { marginBottom: '12px', fontSize: '14px', color: 'rgba(232,237,243,0.75)' } }, 'Über welchen Zeitraum?'),
      optionGrid(state.config.horizons, state.form.horizon, (v) => set('horizon', v), 2),
      state.errors.horizon ? h('p', { style: { marginTop: '10px', fontSize: '13px', color: '#f0a5a2' } }, state.errors.horizon) : null,
    ),
  );
}

function stepProfile() {
  return h(
    'div',
    h('div', { style: { marginBottom: '32px' } },
      heading('Wie erfahren sind Sie?', 'Damit unser Berater das Gespräch richtig ansetzt.'),
      optionGrid(state.config.experience, state.form.experience, (v) => set('experience', v), 2),
    ),
    field(
      'Was möchten Sie erreichen?',
      h('textarea.input', {
        rows: 3,
        placeholder: 'z. B. Inflationsschutz für das Familienvermögen, Aufbau einer Altersvorsorge …',
        value: state.form.goal,
        oninput: (e) => { state.form.goal = e.target.value; },
      }),
      { hint: 'optional' },
    ),
  );
}

function textInput(key, { type = 'text', autocomplete } = {}) {
  return h('input.input' + (state.errors[key] ? '.invalid' : ''), {
    type,
    value: state.form[key],
    autocomplete,
    oninput: (e) => { state.form[key] = e.target.value; },
    onblur: () => { if (state.errors[key]) { delete state.errors[key]; render(); } },
  });
}

function stepContact() {
  const f = state.form;
  return h(
    'div',
    heading('Wie erreichen wir Sie?', 'Ihr Ansprechpartner meldet sich ' + slaPromise() + '.'),
    h(
      'div.form-grid',
      field('Vorname', textInput('firstName', { autocomplete: 'given-name' }), { required: true, error: state.errors.firstName }),
      field('Nachname', textInput('lastName', { autocomplete: 'family-name' }), { required: true, error: state.errors.lastName }),
      field('E-Mail', textInput('email', { type: 'email', autocomplete: 'email' }), { required: true, error: state.errors.email }),
      field('Telefon', textInput('phone', { type: 'tel', autocomplete: 'tel' }), {
        error: state.errors.phone,
        hint: f.contactPref === 'email' ? 'optional' : undefined,
      }),
      field('Firma', textInput('company', { autocomplete: 'organization' }), { hint: 'optional' }),
      h('div', { style: { display: 'grid', gridTemplateColumns: '7rem 1fr', gap: '12px' } },
        field('PLZ', textInput('postalCode', { autocomplete: 'postal-code' }), { hint: 'optional' }),
        field('Ort', textInput('city', { autocomplete: 'address-level2' }), { hint: 'optional' }),
      ),
    ),
    h('div.form-grid', { style: { marginTop: '20px' } },
      h('div',
        h('h3', { style: { marginBottom: '10px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' } }, 'Bevorzugter Kanal'),
        optionGrid(state.config.contactPrefs, f.contactPref, (v) => set('contactPref', v), 3),
      ),
      h('div',
        h('h3', { style: { marginBottom: '10px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' } }, 'Beste Zeit'),
        optionGrid(state.config.contactWindows, f.contactWindow, (v) => set('contactWindow', v), 2),
      ),
    ),
    h('div', { style: { marginTop: '20px' } },
      field('Ihre Nachricht',
        h('textarea.input', {
          rows: 3, placeholder: 'Konkrete Fragen, Wunschtermin, alles was hilft …',
          value: f.message, oninput: (e) => { f.message = e.target.value; },
        }),
        { hint: 'optional' }),
    ),
    // Honigtopf: für Menschen unsichtbar, Bots füllen ihn aus.
    h('input.honeypot', {
      type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true',
      oninput: (e) => { f.website = e.target.value; },
    }),
    h('div.consent-box', { style: { marginTop: '20px' } },
      consent('consentContact', state.errors.consentContact,
        'Ich möchte kontaktiert werden und bin mit der Verarbeitung meiner Daten zu diesem Zweck einverstanden. Die Einwilligung kann ich jederzeit widerrufen.'),
      consent('consentMarketing', null,
        h('span', 'Zusätzlich möchte ich Marktinformationen und Angebote per E-Mail erhalten. ', h('span.faint', '(optional)'))),
    ),
  );
}

function consent(key, error, text) {
  return h('div',
    h('div.consent' + (state.form[key] ? '.on' : ''),
      { onclick: () => { set(key, !state.form[key]); render(); } },
      h('span.box', icon('check', 13)),
      h('span.text', text),
    ),
    error ? h('p', { style: { margin: '6px 0 0 32px', fontSize: '12px', color: '#f0a5a2' } }, error) : null,
  );
}

function renderNav() {
  return h(
    'div.wizard-nav',
    button('Zurück', { variant: 'ghost', iconName: 'arrowLeft', disabled: state.step === 0, onclick: () => go(-1) }),
    state.errors._ ? h('span.err', state.errors._) : h('span'),
    state.step < 3
      ? button('Weiter', { size: 'lg', iconName: 'arrowRight', onclick: () => go(1) })
      : h('button.btn.btn-primary.btn-lg', { onclick: submit, disabled: state.busy },
          state.busy ? spinner(16) : icon('sparkles', 16),
          state.busy ? 'Wird gesendet …' : 'Anfrage absenden'),
  );
}

function stepDone() {
  const r = state.result;
  const copy = async (label, value, el) => {
    try {
      await navigator.clipboard.writeText(value);
      el.replaceChildren(icon('check', 13));
      toast(label + ' kopiert.');
      setTimeout(() => el.replaceChildren(icon('copy', 13)), 1800);
    } catch {
      toast('Kopieren nicht möglich – bitte manuell markieren.', 'error');
    }
  };

  return h(
    'div.done',
    h('div.seal', icon('check', 36)),
    h('h2', 'Ihre Anfrage ist angekommen.'),
    h('p.sub',
      r.team ? h('span', 'Das Team ', h('strong', r.team), ' wurde soeben benachrichtigt. ') : 'Unser Fachteam wurde soeben benachrichtigt. ',
      'Sie hören ',
      h('strong', { style: { color: 'var(--gold-300)' } },
        slaPromise({ open: r.open, nextOpening: r.nextOpening })),
      ' von uns.'),
    h('div.done-grid',
      r.contact
        ? h('div.glass.done-card',
            h('p.kicker', 'Ihr Ansprechpartner'),
            h('p.who', r.contact.name),
            h('p.faint', { style: { fontSize: '12px' } }, r.contact.title),
            h('div.stack', { style: { gap: '6px', marginTop: '14px', fontSize: '12px' } },
              h('a.row', { href: 'tel:' + r.contact.phone, style: { gap: '8px', color: 'var(--text-dim)' } }, icon('phone', 13), r.contact.phone),
              h('a.row', { href: 'mailto:' + r.contact.email, style: { gap: '8px', color: 'var(--text-dim)' } }, icon('mail', 13), r.contact.email),
            ))
        : null,
      h('div.glass.done-card', { style: { borderColor: 'rgba(200,162,74,0.25)' } },
        h('p.kicker', 'Ihr Kundenbereich'),
        h('p.faint', { style: { fontSize: '12px', lineHeight: '1.6', marginTop: '10px' } },
          'Dort sehen Sie den Stand Ihrer Anfrage, die nächsten Schritte und Ihr Angebot. Die Zugangsdaten stehen auch in Ihrer Bestätigungs-E-Mail.'),
        h('div.stack', { style: { gap: '8px', marginTop: '14px' } },
          [['Referenz', r.ref], ['Zugang', r.portal.email], ['Passwort', r.portal.password]].map(([label, value]) => {
            const btn = h('button', { type: 'button', 'aria-label': label + ' kopieren' }, icon('copy', 13));
            btn.addEventListener('click', () => copy(label, value, btn));
            return h('div.credential', h('span.faint', label), h('span.row', { style: { gap: '8px' } }, h('span.value', value), btn));
          }),
        ),
        h('a', { href: '/portal/' + r.portal.token, style: { display: 'block', marginTop: '16px' } },
          h('button.btn.btn-primary.btn-sm.btn-block', icon('lock', 13), 'Kundenbereich öffnen')),
      ),
    ),
  );
}
