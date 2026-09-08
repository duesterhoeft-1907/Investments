/**
 * Der öffentliche Lead-Wizard.
 *
 * Fünf Schritte, jeder mit eigener Prüfung. Die Auswahl eines Fachgebiets
 * springt selbst weiter – das erspart einen Klick und macht den Einstieg
 * schnell, worum es hier ja geht.
 */
import { h, mount, $, $$ } from './core/dom.js';
import { icon } from './core/icons.js';
import { api, ApiError } from './core/api.js';
import { aurora, button, field, logo, spinner, toast } from './core/ui.js';
import { lang, locale, t } from './core/i18n.js';
import { hintergrundBewegen, neigen, tippen, zeigen } from './core/motion.js';
import { umschalter } from './core/theme.js';

const STEPS = t('steps');

const state = {
  config: null,
  step: 0,
  // Woher der Schritt kam: vorwärts oder zurück. Das entscheidet, aus
  // welcher Richtung der neue Inhalt hereinkommt.
  rueck: false,
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

// Der Hintergrund hängt an einem Scroll-Beobachter. mount() wirft ihn bei
// jedem Aufbau weg, also merken wir uns das Abmelden – sonst sammeln sich
// mit jedem Schritt weitere Beobachter an, die auf tote Elemente zeigen.
let hintergrundAus = null;

init();

async function init() {
  mount(root, aurora(), h('div.wizard-shell', h('div.row', { style: { minHeight: '60vh', justifyContent: 'center' } }, spinner(30))));
  try {
    // Die Sprache steht im Pfad der Seite, nicht im Pfad der Schnittstelle –
    // also muss sie mitgeschickt werden.
    state.config = await api.get('/public/wizard-config?lang=' + lang);
    render();
  } catch {
    mount(
      root,
      aurora(),
      h('div.wizard-shell', h('div', { style: { maxWidth: '440px', margin: '120px auto', textAlign: 'center' } },
        h('p.muted', t('offline')))),
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
    return t('withinMinutes', minutes);
  }

  const next = new Date(hours.nextOpening);
  const time = t('time', next.toLocaleTimeString(locale, t('zeitFormat')));
  const days = Math.round((startOfDay(next) - startOfDay(new Date())) / 86400000);

  if (days <= 0) return t('today', time);
  if (days === 1) return t('tomorrow', time);
  return t('onWeekday', next.toLocaleDateString(locale, { weekday: 'long' }), time);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Prüfung je Schritt – erst wenn sie greift, geht es weiter. */
function validate(step) {
  const errors = {};
  const f = state.form;

  if (step === 0 && !f.assetClassSlug) errors.assetClassSlug = t('errAsset');
  if (step === 1) {
    if (!f.volumeBand) errors.volumeBand = t('errVolume');
    if (!f.horizon) errors.horizon = t('errHorizon');
  }
  if (step === 3) {
    if (f.firstName.trim().length < 2) errors.firstName = t('errFirstName');
    if (f.lastName.trim().length < 2) errors.lastName = t('errLastName');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = t('errEmail');
    if (f.contactPref !== 'email' && f.phone.trim().length < 6) {
      errors.phone = t('errPhone');
    }
    if (!f.consentContact) errors.consentContact = t('errConsent');
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
  state.rueck = delta < 0;
  const panel = $('.step-panel');
  if (panel) {
    panel.classList.toggle('rueck', state.rueck);
    panel.classList.add('leave');
  }
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
    state.result = await api.post('/public/leads', { ...state.form, country: 'DE', consentContact: true, lang });
    state.step = 4;
    state.errors = {};
  } catch (error) {
    if (error instanceof ApiError && Object.keys(error.fields || {}).length) {
      state.errors = error.fields;
      state.step = 3;
    } else {
      state.errors = { _: error.message || t('errUnknown') };
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
    faden(),
    h(
      'div.wizard-shell',
      renderHead(),
      state.step === 0 && !state.result ? renderHero() : null,
      h(
        'div.wizard-body',
        !state.result ? renderStepper() : null,
        h('div.step-panel.enter' + (state.rueck ? '.rueck' : ''), renderStep()),
        !state.result ? renderNav() : null,
      ),
    ),
  );
  beleben();
}

/**
 * Der Fortschrittsfaden am oberen Rand.
 *
 * Die Schrittanzeige darunter sagt, wo man ist; dieser Faden sagt, wie
 * weit es noch ist – und er bleibt beim Scrollen stehen, wenn die
 * Anzeige längst weggescrollt ist.
 */
function faden() {
  const anteil = state.result ? 100 : (state.step / (STEPS.length - 1)) * 100;
  return h('div.wizard-faden', h('i', { style: { '--fortschritt': anteil + '%' } }));
}

/**
 * Was nach jedem Aufbau lebendig gemacht wird.
 *
 * mount() ersetzt den ganzen Inhalt, also müssen die Beobachter danach
 * neu gesetzt werden – die alten Elemente gibt es nicht mehr.
 */
function beleben() {
  zeigen($$('.asset-card, .option, .done-card, .form-grid > *'));
  $$('.asset-card').forEach((el) => neigen(el));
  hintergrundAus?.();
  hintergrundAus = hintergrundBewegen();
}

function renderHead() {
  return h(
    'header.wizard-head',
    h('a.wizard-brand', { href: lang === 'en' ? '/en' : '/', title: t('backHome') }, logo(36)),
    h('div.row', { style: { gap: '10px' } },
      h('a.wizard-staff-link', { href: '/app' }, t('staffLogin')),
      umschalter()),
  );
}

function renderHero() {
  const company = window.__COMPANY__?.name || '21 Capital Invest';
  return h(
    'section.hero.rise',
    h('span.promise', icon('timer', 14), t('heroPromise') + slaPromise()),
    h('h1', t('heroH1a'), h('br'), h('span.brand-text', t('heroH1b'))),
    h('p.lead', t('heroLead', company)),
    h(
      'div.trust',
      h('span', icon('shield', 14), t('trust1')),
      h('span', icon('timer', 14), t('trust2')),
      h('span', icon('lock', 14), t('trust3')),
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
    heading(t('stepAssetH'), t('stepAssetP')),
    h(
      'div.asset-grid',
      state.config.assetClasses.map((asset, i) => {
        const accent = asset.teamColor || '#21b4a6';
        const selected = state.form.assetClassSlug === asset.slug;
        return h(
          'button.asset-card' + (selected ? '.selected' : ''),
          {
            type: 'button',
            style: { animationDelay: Math.min(i * 45, 400) + 'ms' },
            onclick: (e) => {
              set('assetClassSlug', asset.slug);
              // Erst der Moment der Wahl, dann der Sprung. Ohne die kurze
              // Pause sieht niemand, was er gerade gewählt hat.
              e.currentTarget.classList.add('selected', 'gewaehlt');
              tippen();
              setTimeout(() => go(1, true), 320);
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
              asset.teamName ? h('span.team', t('teamLine', asset.teamName, asset.slaMinutes)) : null,
            ),
          ),
        );
      }),
    ),
    state.errors.assetClassSlug ? h('p.error', { style: { marginTop: '12px', color: 'var(--danger-text)' } }, state.errors.assetClassSlug) : null,
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
      heading(t('stepVolumeH'), t('stepVolumeP')),
      optionGrid(state.config.volumeBands, state.form.volumeBand, (v) => set('volumeBand', v), 2),
      state.errors.volumeBand ? h('p', { style: { marginTop: '10px', fontSize: '13px', color: 'var(--danger-text)' } }, state.errors.volumeBand) : null,
    ),
    h('div',
      h('h3', { style: { marginBottom: '12px', fontSize: '14px', color: 'var(--text-dim)' } }, t('stepVolumeH2')),
      optionGrid(state.config.horizons, state.form.horizon, (v) => set('horizon', v), 2),
      state.errors.horizon ? h('p', { style: { marginTop: '10px', fontSize: '13px', color: 'var(--danger-text)' } }, state.errors.horizon) : null,
    ),
  );
}

function stepProfile() {
  return h(
    'div',
    h('div', { style: { marginBottom: '32px' } },
      heading(t('stepProfileH'), t('stepProfileP')),
      optionGrid(state.config.experience, state.form.experience, (v) => set('experience', v), 2),
    ),
    field(
      t('goalLabel'),
      h('textarea.input', {
        rows: 3,
        placeholder: t('goalPlaceholder'),
        value: state.form.goal,
        oninput: (e) => { state.form.goal = e.target.value; },
      }),
      { hint: t('optional') },
    ),
  );
}

function textInput(key, { type = 'text', autocomplete } = {}) {
  return h('input.input' + (state.errors[key] ? '.invalid' : ''), {
    type,
    value: state.form[key],
    autocomplete,
    oninput: (e) => { state.form[key] = e.target.value; },
    /*
     * Die Fehlermarkierung verschwindet, sobald das Feld verlassen wird –
     * aber ohne das Formular neu zu bauen. Ein render() an dieser Stelle
     * tauscht alle Eingabefelder aus, der Browser verliert dabei den Fokus,
     * und wer mit Tabulator von einem bemängelten Feld ins nächste geht,
     * tippt danach ins Leere. Also nur dieses eine Feld anfassen.
     */
    onblur: (e) => {
      if (!state.errors[key]) return;
      delete state.errors[key];
      e.target.classList.remove('invalid');
      e.target.parentElement?.querySelector(':scope > .error')?.remove();
    },
  });
}

function stepContact() {
  const f = state.form;
  return h(
    'div',
    heading(t('stepContactH'), t('stepContactP', slaPromise())),
    h(
      // "kontakt" stellt Vor- und Nachname auch auf dem Telefon
      // nebeneinander – der Schritt ist sonst sehr lang zu scrollen.
      'div.form-grid.kontakt',
      field(t('firstName'), textInput('firstName', { autocomplete: 'given-name' }), { required: true, error: state.errors.firstName }),
      field(t('lastName'), textInput('lastName', { autocomplete: 'family-name' }), { required: true, error: state.errors.lastName }),
      field(t('email'), textInput('email', { type: 'email', autocomplete: 'email' }), { required: true, error: state.errors.email }),
      field(t('phone'), textInput('phone', { type: 'tel', autocomplete: 'tel' }), {
        error: state.errors.phone,
        hint: f.contactPref === 'email' ? t('optional') : undefined,
      }),
      field(t('company'), textInput('company', { autocomplete: 'organization' }), { hint: t('optional') }),
      h('div', { style: { display: 'grid', gridTemplateColumns: '7rem 1fr', gap: '12px' } },
        field(t('postalCode'), textInput('postalCode', { autocomplete: 'postal-code' }), { hint: t('optional') }),
        field(t('city'), textInput('city', { autocomplete: 'address-level2' }), { hint: t('optional') }),
      ),
    ),
    h('div.form-grid.waehler', { style: { marginTop: '20px' } },
      h('div',
        h('h3', { style: { marginBottom: '10px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' } }, t('channel')),
        optionGrid(state.config.contactPrefs, f.contactPref, (v) => set('contactPref', v), 3),
      ),
      h('div',
        h('h3', { style: { marginBottom: '10px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' } }, t('bestTime')),
        optionGrid(state.config.contactWindows, f.contactWindow, (v) => set('contactWindow', v), 2),
      ),
    ),
    h('div', { style: { marginTop: '20px' } },
      field(t('messageLabel'),
        h('textarea.input', {
          rows: 3, placeholder: t('messagePlaceholder'),
          value: f.message, oninput: (e) => { f.message = e.target.value; },
        }),
        { hint: t('optional') }),
    ),
    // Honigtopf: für Menschen unsichtbar, Bots füllen ihn aus.
    h('input.honeypot', {
      type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true',
      oninput: (e) => { f.website = e.target.value; },
    }),
    h('div.consent-box', { style: { marginTop: '20px' } },
      consent('consentContact', state.errors.consentContact, t('consentContact')),
      consent('consentMarketing', null,
        h('span', t('consentMarketingA'), h('span.faint', t('consentMarketingB')))),
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
    error ? h('p', { style: { margin: '6px 0 0 32px', fontSize: '12px', color: 'var(--danger-text)' } }, error) : null,
  );
}

function renderNav() {
  return h(
    'div.wizard-nav',
    button(t('back'), { variant: 'ghost', iconName: 'arrowLeft', disabled: state.step === 0, onclick: () => go(-1) }),
    state.errors._ ? h('span.err', state.errors._) : h('span'),
    state.step < 3
      ? button(t('next'), { size: 'lg', iconName: 'arrowRight', onclick: () => go(1) })
      : h('button.btn.btn-primary.btn-lg', { onclick: submit, disabled: state.busy },
          state.busy ? spinner(16) : icon('sparkles', 16),
          state.busy ? t('sending') : t('submit')),
  );
}

function stepDone() {
  const r = state.result;
  const copy = async (label, value, el) => {
    try {
      await navigator.clipboard.writeText(value);
      el.replaceChildren(icon('check', 13));
      toast(t('copied', label));
      setTimeout(() => el.replaceChildren(icon('copy', 13)), 1800);
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };

  return h(
    'div.done',
    h('div.seal', icon('check', 36)),
    h('h2', t('doneH')),
    h('p.sub',
      r.team ? h('span', t('doneTeam'), h('strong', r.team), t('doneTeamAfter')) : t('doneTeamless'),
      t('doneHearA'),
      h('strong', { style: { color: 'var(--akzent-text)' } },
        slaPromise({ open: r.open, nextOpening: r.nextOpening })),
      t('doneHearB')),
    h('div.done-grid',
      r.contact
        ? h('div.glass.done-card',
            h('p.kicker', t('doneContactKicker')),
            h('p.who', r.contact.name),
            h('p.faint', { style: { fontSize: '12px' } }, r.contact.title),
            h('div.stack', { style: { gap: '6px', marginTop: '14px', fontSize: '12px' } },
              h('a.row', { href: 'tel:' + r.contact.phone, style: { gap: '8px', color: 'var(--text-dim)' } }, icon('phone', 13), r.contact.phone),
              h('a.row', { href: 'mailto:' + r.contact.email, style: { gap: '8px', color: 'var(--text-dim)' } }, icon('mail', 13), r.contact.email),
            ))
        : null,
      h('div.glass.done-card', { style: { borderColor: 'rgba(var(--accent-rgb), 0.25)' } },
        h('p.kicker', t('donePortalKicker')),
        h('p.faint', { style: { fontSize: '12px', lineHeight: '1.6', marginTop: '10px' } },
          t('donePortalText')),
        h('div.stack', { style: { gap: '8px', marginTop: '14px' } },
          [[t('labelRef'), r.ref], [t('labelLogin'), r.portal.email], [t('labelPassword'), r.portal.password]].map(([label, value]) => {
            const btn = h('button', { type: 'button', 'aria-label': t('copyAria', label) }, icon('copy', 13));
            btn.addEventListener('click', () => copy(label, value, btn));
            return h('div.credential', h('span.faint', label), h('span.row', { style: { gap: '8px' } }, h('span.value', value), btn));
          }),
        ),
        h('a', { href: '/portal/' + r.portal.token, style: { display: 'block', marginTop: '16px' } },
          h('button.btn.btn-primary.btn-sm.btn-block', icon('lock', 13), t('openPortal'))),
      ),
    ),
  );
}
