/**
 * Das eigene Profil.
 *
 * Name, Funktion, Telefonnummer, Farbe und Bild pflegt jede und jeder
 * selbst – das sind Angaben über die eigene Person. Rolle, Zugang und
 * E-Mail-Adresse stehen bewusst nicht hier: das sind Entscheidungen über
 * die Person, nicht von ihr, und die trifft die Verwaltung.
 */
import { h, mount, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api, ApiError } from '../core/api.js';
import { avatar, button, field, spinner, toast } from '../core/ui.js';
import { refreshHeader } from '../app.js';

const FARBEN = ['#21B4A6', '#21DDD3', '#0FAF9F', '#0B8479', '#7F9FB8', '#5F86A3', '#9B8BC4', '#8271AF'];

export function render(view, { session }) {
  const state = {
    form: {
      name: session.user.name ?? '',
      title: session.user.title ?? '',
      phone: session.user.phone ?? '',
      accent: session.user.accent ?? '#21B4A6',
    },
    avatarUrl: session.user.avatar ?? null,
    busy: '',
    passwort: { alt: '', neu: '', wiederholt: '' },
  };

  paint();

  async function speichern() {
    state.busy = 'profil';
    paint();
    try {
      const d = await api.patch('/me', state.form);
      Object.assign(session.user, d.user);
      state.avatarUrl = d.user.avatar;
      refreshHeader();
      toast('Profil gespeichert.');
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  /**
   * Bild hochladen.
   *
   * Zugeschnitten und verkleinert wird auf dem Server – hier wandert die
   * Datei roh hinüber. Das ist mehr Übertragung, aber der Zuschnitt gehört
   * dorthin, wo er verlässlich passiert: ein Browser, der die Aufgabe
   * anders löst, würde sonst andere Bilder erzeugen.
   */
  async function bildHochladen(datei) {
    if (!datei) return;
    state.busy = 'bild';
    paint();
    try {
      const daten = new FormData();
      daten.append('file', datei);
      const d = await api.upload('/me/avatar', daten);
      Object.assign(session.user, d.user);
      state.avatarUrl = d.user.avatar;
      refreshHeader();
      toast('Profilbild gespeichert.');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Das Bild konnte nicht gespeichert werden.', 'error');
    }
    state.busy = '';
    paint();
  }

  async function bildEntfernen() {
    state.busy = 'bild';
    paint();
    try {
      const d = await api.del('/me/avatar');
      Object.assign(session.user, d.user);
      state.avatarUrl = null;
      refreshHeader();
      toast('Profilbild entfernt.');
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  async function passwortAendern() {
    const p = state.passwort;
    if (p.neu.length < 8) { toast('Das neue Passwort braucht mindestens acht Zeichen.', 'error'); return; }
    if (p.neu !== p.wiederholt) { toast('Die beiden neuen Passwörter stimmen nicht überein.', 'error'); return; }

    state.busy = 'passwort';
    paint();
    try {
      await api.post('/auth/password', { current: p.alt, next: p.neu });
      state.passwort = { alt: '', neu: '', wiederholt: '' };
      toast('Passwort geändert.');
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  function bildKarte() {
    const dateiwahl = h('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif',
      style: { display: 'none' },
      onchange: (e) => { void bildHochladen(e.target.files?.[0]); e.target.value = ''; },
    });

    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Profilbild')),
      h('p.faint', { style: { fontSize: '13px', margin: '2px 0 16px' } },
        'Erscheint im CRM, im Chat – und im Kundenbereich bei dem, der auf deinen Rückruf wartet. ',
        'Wird beim Speichern quadratisch zugeschnitten.'),

      h('div.row', { style: { gap: '18px', alignItems: 'center', flexWrap: 'wrap' } },
        avatar(state.form.name, state.form.accent, 96, { avatar: state.avatarUrl }),
        h('div.stack', { style: { gap: '8px' } },
          h('div.row', { style: { gap: '8px' } },
            button(state.avatarUrl ? 'Anderes Bild' : 'Bild wählen', {
              variant: 'outline', size: 'sm', iconName: 'paperclip',
              disabled: state.busy === 'bild',
              onclick: () => dateiwahl.click(),
            }),
            state.avatarUrl
              ? button('Entfernen', {
                  variant: 'ghost', size: 'sm', iconName: 'x',
                  disabled: state.busy === 'bild',
                  onclick: bildEntfernen,
                })
              : null,
            state.busy === 'bild' ? spinner(16) : null),
          h('p.faint', { style: { fontSize: '12px', margin: 0 } }, 'JPEG, PNG, WebP oder GIF.')),
        dateiwahl));
  }

  function profilKarte() {
    const feld = (schluessel, beschriftung, opts = {}) =>
      field(beschriftung, h('input.input', {
        type: opts.type ?? 'text',
        value: state.form[schluessel],
        autocomplete: opts.autocomplete,
        oninput: (e) => { state.form[schluessel] = e.target.value; },
      }), { required: opts.required });

    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Deine Angaben')),
      h('div.form-grid', { style: { marginTop: '14px' } },
        feld('name', 'Name', { required: true, autocomplete: 'name' }),
        feld('title', 'Funktion', { autocomplete: 'organization-title' }),
        feld('phone', 'Telefon', { type: 'tel', autocomplete: 'tel' })),

      h('div', { style: { marginTop: '18px' } },
        h('p.kicker', 'Deine Farbe'),
        h('p.faint', { style: { fontSize: '12px', margin: '2px 0 10px' } },
          'Sie markiert dich in Listen und im Verlauf.'),
        h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } },
          FARBEN.map((farbe) =>
            h('button.farbwahl' + (state.form.accent.toUpperCase() === farbe ? '.on' : ''), {
              type: 'button', title: farbe,
              style: { background: farbe },
              onclick: () => { state.form.accent = farbe; paint(); },
            })))),

      h('div.row', { style: { marginTop: '20px', justifyContent: 'flex-end' } },
        button('Profil speichern', {
          iconName: 'check', disabled: state.busy === 'profil', onclick: speichern,
        })));
  }

  function passwortKarte() {
    const feld = (schluessel, beschriftung, autocomplete) =>
      field(beschriftung, h('input.input', {
        type: 'password', value: state.passwort[schluessel], autocomplete,
        oninput: (e) => { state.passwort[schluessel] = e.target.value; },
      }));

    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Passwort')),
      h('div.form-grid', { style: { marginTop: '14px' } },
        feld('alt', 'Aktuelles Passwort', 'current-password'),
        feld('neu', 'Neues Passwort', 'new-password'),
        feld('wiederholt', 'Neues Passwort wiederholen', 'new-password')),
      h('div.row', { style: { marginTop: '18px', justifyContent: 'flex-end' } },
        button('Passwort ändern', {
          variant: 'outline', iconName: 'lock',
          disabled: state.busy === 'passwort', onclick: passwortAendern,
        })));
  }

  function paint() {
    mount(view, h('div.stack', { style: { gap: '18px' } },
      h('div',
        h('h1', 'Mein Profil'),
        h('p.faint', { style: { fontSize: '13px', marginTop: '4px' } },
          'Rolle, Zugang und E-Mail-Adresse verwaltet die Geschäftsführung – alles andere gehört dir.')),
      bildKarte(),
      profilKarte(),
      passwortKarte()));
  }

  return () => {};
}
