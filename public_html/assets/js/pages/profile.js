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
import { push } from '../core/push.js';

const FARBEN = ['#21B4A6', '#21DDD3', '#0FAF9F', '#0B8479', '#7F9FB8', '#5F86A3', '#9B8BC4', '#8271AF'];

export function render(view, { session }) {
  const state = {
    form: {
      name: session.user.name ?? '',
      title: session.user.title ?? '',
      phone: session.user.phone ?? '',
      accent: session.user.accent ?? '#21B4A6',
      telegramChatId: session.user.telegramChatId ?? '',
    },
    avatarUrl: session.user.avatar ?? null,
    busy: '',
    passwort: { alt: '', neu: '', wiederholt: '' },
    push: { stand: push.stand(), angemeldet: false, geraete: 0, installiert: push.installiert() },
    telegram: { eingerichtet: false, botName: '', vorschlaege: [] },
  };

  paint();

  // Beides nur zum Anzeigen – schlägt es fehl, bleibt die Karte in ihrem
  // Grundzustand, statt die ganze Seite scheitern zu lassen.
  push.angemeldet().then((ja) => { state.push.angemeldet = ja; paint(); }).catch(() => {});
  api.get('/telegram/status')
    .then((d) => {
      state.telegram.eingerichtet = d.eingerichtet;
      state.telegram.botName = d.botName;
      if (d.kennung) state.form.telegramChatId = d.kennung;
      paint();
    })
    .catch(() => {});

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

  async function pushUmschalten() {
    state.busy = 'push';
    paint();
    try {
      if (state.push.angemeldet) {
        state.push.geraete = await push.ausschalten();
        state.push.angemeldet = false;
        toast('Dieses Gerät bekommt keine Meldungen mehr.');
      } else {
        state.push.geraete = await push.einschalten();
        state.push.angemeldet = true;
        toast('Dieses Gerät ist angemeldet.');
      }
      state.push.stand = push.stand();
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  async function pushProbe() {
    state.busy = 'probe';
    paint();
    try {
      const d = await push.probe();
      toast(d.geraete > 0
        ? `Probe an ${d.geraete} Gerät${d.geraete === 1 ? '' : 'e'} geschickt.`
        : 'Kein Gerät angemeldet.');
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  async function telegramProbe() {
    state.busy = 'telegram';
    paint();
    try {
      await api.post('/telegram/test');
      toast('Telegram hat die Probe angenommen.');
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  /** Holt die Kennungen derer, die den Bot gerade gestartet haben. */
  async function telegramSuchen() {
    state.busy = 'telegram';
    paint();
    try {
      const d = await api.get('/telegram/chats');
      state.telegram.vorschlaege = d.chats;
      if (d.chats.length === 0) {
        toast('Niemand hat den Bot bisher gestartet. Schreib ihm einmal /start.', 'error');
      }
    } catch (error) {
      toast(error.message, 'error');
    }
    state.busy = '';
    paint();
  }

  /**
   * Die Karte für Meldungen aufs Telefon.
   *
   * Sie sagt in jedem Zustand etwas Wahres: dass das Gerät es nicht kann,
   * dass die Erlaubnis fehlt, dass sie abgelehnt wurde und nur in den
   * Browsereinstellungen zurückzunehmen ist – oder dass alles steht.
   */
  function pushKarte() {
    const stand = state.push.stand;
    const aufIphone = /iPhone|iPad/.test(navigator.userAgent);

    const hinweis = () => {
      if (stand === 'unmoeglich' && aufIphone && !state.push.installiert) {
        return 'Auf dem iPhone gibt es Meldungen erst, wenn die Anwendung über „Teilen → Zum Home-Bildschirm“ hinzugefügt wurde. Danach hier noch einmal einschalten.';
      }
      if (stand === 'unmoeglich') return 'Dieser Browser kann keine Meldungen zustellen.';
      if (stand === 'denied') return 'Meldungen sind für diese Seite abgelehnt. Zurücknehmen lässt sich das nur in den Einstellungen des Browsers.';
      if (state.push.angemeldet) return 'Dieses Gerät ist angemeldet. Neue Anfragen, Erwähnungen und Direktnachrichten kommen an, auch wenn die Anwendung geschlossen ist.';
      return 'Ohne Anmeldung erreichen dich Meldungen nur, solange das CRM offen ist.';
    };

    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Meldungen auf dieses Gerät')),
      h('p.faint', { style: { fontSize: '13px', marginTop: '8px', lineHeight: '1.6' } }, hinweis()),
      state.push.installiert
        ? null
        : h('p.faint', { style: { fontSize: '12px', marginTop: '8px' } },
            'Tipp: Über das Menü des Browsers lässt sich die Anwendung auf den Startbildschirm legen – dann startet sie ohne Adresszeile.'),
      h('div.row', { style: { marginTop: '16px', gap: '10px', flexWrap: 'wrap' } },
        button(state.push.angemeldet ? 'Dieses Gerät abmelden' : 'Auf diesem Gerät einschalten', {
          iconName: state.push.angemeldet ? 'x' : 'bell',
          variant: state.push.angemeldet ? 'outline' : 'primary',
          disabled: state.busy === 'push' || stand === 'unmoeglich' || stand === 'denied',
          onclick: pushUmschalten,
        }),
        state.push.angemeldet
          ? button('Probe schicken', {
              variant: 'ghost', iconName: 'check',
              disabled: state.busy === 'probe', onclick: pushProbe,
            })
          : null));
  }

  /** Telegram – nur sichtbar, wenn ein Bot hinterlegt ist. */
  function telegramKarte() {
    if (!state.telegram.eingerichtet) return null;

    const name = state.telegram.botName ? '@' + state.telegram.botName.replace(/^@/, '') : 'den Bot';

    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Telegram')),
      h('p.faint', { style: { fontSize: '13px', marginTop: '8px', lineHeight: '1.6' } },
        `Schreib ${name} einmal /start – danach hier auf „Kennung holen“. Der Bot kann niemanden von sich aus anschreiben, deshalb dieser eine Schritt.`),
      h('div.form-grid', { style: { marginTop: '14px' } },
        field('Chat-Kennung', h('input.input', {
          type: 'text', inputmode: 'numeric', value: state.form.telegramChatId,
          placeholder: 'z. B. 123456789',
          oninput: (e) => { state.form.telegramChatId = e.target.value.trim(); },
        }))),
      state.telegram.vorschlaege.length
        ? h('div.stack', { style: { gap: '6px', marginTop: '10px' } },
            state.telegram.vorschlaege.map((chat) =>
              h('button.btn.btn-ghost.btn-sm', {
                type: 'button',
                onclick: () => { state.form.telegramChatId = chat.id; state.telegram.vorschlaege = []; paint(); },
              }, `${chat.name} · ${chat.id}`)))
        : null,
      h('div.row', { style: { marginTop: '16px', gap: '10px', flexWrap: 'wrap' } },
        button('Kennung holen', {
          variant: 'outline', iconName: 'search',
          disabled: state.busy === 'telegram', onclick: telegramSuchen,
        }),
        button('Probe schicken', {
          variant: 'ghost', iconName: 'check',
          disabled: state.busy === 'telegram' || !state.form.telegramChatId, onclick: telegramProbe,
        })),
      h('p.faint', { style: { fontSize: '12px', marginTop: '10px' } },
        'Gespeichert wird die Kennung mit „Profil speichern“.'));
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
      pushKarte(),
      telegramKarte(),
      passwortKarte()));
  }

  return () => {};
}
