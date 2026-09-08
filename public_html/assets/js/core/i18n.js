/**
 * Sprache im Browser.
 *
 * Der Server setzt window.__LANG__ im Kopf der Seite; alles, was das
 * JavaScript selbst formuliert, kommt aus den Tabellen hier. Beschriftungen,
 * die aus der Datenbank stammen – Fachgebiete, Volumenstufen, Zeitfenster –,
 * liefert die Schnittstelle bereits übersetzt; die stehen deshalb nicht hier.
 *
 * Nur die öffentliche Anfragestrecke ist zweisprachig. Das CRM bleibt
 * deutsch und ruft diese Datei gar nicht erst auf.
 */

const DICT = {
  de: {
    steps: ['Fachgebiet', 'Volumen', 'Profil', 'Kontakt', 'Bestätigung'],
    offline: 'Die Anfrage-Strecke ist gerade nicht erreichbar. Bitte später erneut versuchen.',
    staffLogin: 'Mitarbeiter-Login',
    backHome: 'Zurück zur Startseite',

    withinMinutes: (m) => `innerhalb von ${m} Minuten`,
    today: (t) => `heute ab ${t}`,
    tomorrow: (t) => `morgen früh ab ${t}`,
    onWeekday: (d, t) => `am ${d} ab ${t}`,
    time: (t) => `${t} Uhr`,
    // Deutsch zählt bis 24, Englisch bis 12 mit am/pm. Steht hier und nicht
    // im Aufruf, damit Browser und Server dieselbe Uhrzeit gleich schreiben.
    zeitFormat: { hour: '2-digit', minute: '2-digit' },

    heroPromise: 'Rückmeldung ',
    heroH1a: 'Dein Vermögen verdient',
    heroH1b: 'eine schnelle Antwort.',
    heroLead: (company) => `Beantworte vier kurze Fragen. Deine Anfrage geht direkt an das zuständige `
      + `Fachteam von ${company} – nicht in ein anonymes Postfach.`,
    trust1: 'Keine Weitergabe an Dritte',
    trust2: 'Persönlicher Rückruf statt Warteschleife',
    trust3: 'Eigener Kundenbereich inklusive',

    errAsset: 'Bitte ein Fachgebiet wählen.',
    errVolume: 'Bitte ein Anlagevolumen wählen.',
    errHorizon: 'Bitte einen Anlagehorizont wählen.',
    errFirstName: 'Bitte deinen Vornamen angeben.',
    errLastName: 'Bitte deinen Nachnamen angeben.',
    errEmail: 'Bitte eine gültige E-Mail-Adresse angeben.',
    errPhone: 'Für den Rückruf brauchen wir eine Telefonnummer.',
    errConsent: 'Ohne Einwilligung dürfen wir dich nicht kontaktieren.',
    errUnknown: 'Unbekannter Fehler.',

    stepAssetH: 'Wofür interessierst du dich?',
    stepAssetP: 'Deine Auswahl bestimmt, welches Fachteam sich meldet.',
    teamLine: (team, min) => `Team ${team} · Antwort in ${min} Min.`,
    stepVolumeH: 'Wie viel möchtest du investieren?',
    stepVolumeP: 'Eine Größenordnung genügt – nichts davon ist verbindlich.',
    stepVolumeH2: 'Über welchen Zeitraum?',
    stepProfileH: 'Wie erfahren bist du?',
    stepProfileP: 'Damit unser Berater das Gespräch richtig ansetzt.',
    goalLabel: 'Was möchtest du erreichen?',
    goalPlaceholder: 'z. B. Inflationsschutz für das Familienvermögen, Aufbau einer Altersvorsorge …',
    optional: 'optional',
    stepContactH: 'Wie erreichen wir dich?',
    stepContactP: (promise) => `Dein Ansprechpartner meldet sich ${promise}.`,

    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    company: 'Firma',
    postalCode: 'PLZ',
    city: 'Ort',
    channel: 'Bevorzugter Kanal',
    bestTime: 'Beste Zeit',
    messageLabel: 'Deine Nachricht',
    messagePlaceholder: 'Konkrete Fragen, Wunschtermin, alles was hilft …',
    consentContact: 'Ich möchte kontaktiert werden und bin mit der Verarbeitung meiner Daten zu diesem '
      + 'Zweck einverstanden. Die Einwilligung kann ich jederzeit widerrufen.',
    consentMarketingA: 'Zusätzlich möchte ich Marktinformationen und Angebote per E-Mail erhalten. ',
    consentMarketingB: '(optional)',

    back: 'Zurück',
    next: 'Weiter',
    sending: 'Wird gesendet …',
    submit: 'Anfrage absenden',

    doneH: 'Deine Anfrage ist angekommen.',
    doneTeam: 'Das Team ',
    doneTeamAfter: ' wurde soeben benachrichtigt. ',
    doneTeamless: 'Unser Fachteam wurde soeben benachrichtigt. ',
    doneHearA: 'Du hörst ',
    doneHearB: ' von uns.',
    doneContactKicker: 'Dein Ansprechpartner',
    donePortalKicker: 'Dein Kundenbereich',
    donePortalText: 'Dort siehst du den Stand deiner Anfrage, die nächsten Schritte und dein Angebot. '
      + 'Die Zugangsdaten stehen auch in deiner Bestätigungs-E-Mail.',
    portalKnown: 'Dein Passwort kennst du schon – es steht in deiner ersten Bestätigungs-E-Mail und gilt weiter.',
    labelRef: 'Referenz',
    labelLogin: 'Zugang',
    labelPassword: 'Passwort',
    copyAria: (label) => `${label} kopieren`,
    copied: (label) => `${label} kopiert.`,
    copyFailed: 'Kopieren nicht möglich – bitte manuell markieren.',
    openPortal: 'Kundenbereich öffnen',
  },

  en: {
    steps: ['Subject', 'Volume', 'Profile', 'Contact', 'Confirmation'],
    offline: 'The enquiry form is not reachable at the moment. Please try again later.',
    staffLogin: 'Staff login',
    backHome: 'Back to the home page',

    withinMinutes: (m) => `within ${m} minutes`,
    today: (t) => `today from ${t}`,
    tomorrow: (t) => `tomorrow morning from ${t}`,
    onWeekday: (d, t) => `on ${d} from ${t}`,
    time: (t) => t,
    zeitFormat: { hour: 'numeric', minute: '2-digit', hour12: true },

    heroPromise: 'A reply ',
    heroH1a: 'Your wealth deserves',
    heroH1b: 'a fast answer.',
    heroLead: (company) => `Answer four short questions. Your enquiry goes straight to the specialist team `
      + `at ${company} that is in charge – not into an anonymous mailbox.`,
    trust1: 'Never passed on to third parties',
    trust2: 'A personal call back instead of a queue',
    trust3: 'Your own client area included',

    errAsset: 'Please choose a subject area.',
    errVolume: 'Please choose an investment volume.',
    errHorizon: 'Please choose an investment horizon.',
    errFirstName: 'Please enter your first name.',
    errLastName: 'Please enter your surname.',
    errEmail: 'Please enter a valid e-mail address.',
    errPhone: 'We need a phone number in order to call you back.',
    errConsent: 'Without your consent we are not allowed to contact you.',
    errUnknown: 'Unknown error.',

    stepAssetH: 'What are you interested in?',
    stepAssetP: 'Your choice decides which specialist team gets in touch.',
    teamLine: (team, min) => `${team} team · reply in ${min} min.`,
    stepVolumeH: 'How much would you like to invest?',
    stepVolumeP: 'A rough figure is enough – none of this is binding.',
    stepVolumeH2: 'Over what period?',
    stepProfileH: 'How experienced are you?',
    stepProfileP: 'So that your adviser pitches the conversation right.',
    goalLabel: 'What would you like to achieve?',
    goalPlaceholder: 'e.g. inflation protection for the family assets, building a retirement provision …',
    optional: 'optional',
    stepContactH: 'How can we reach you?',
    stepContactP: (promise) => `Your contact will get in touch ${promise}.`,

    firstName: 'First name',
    lastName: 'Surname',
    email: 'E-mail',
    phone: 'Phone',
    company: 'Company',
    postalCode: 'Postcode',
    city: 'Town',
    channel: 'Preferred channel',
    bestTime: 'Best time',
    messageLabel: 'Your message',
    messagePlaceholder: 'Specific questions, a preferred date, anything that helps …',
    consentContact: 'I would like to be contacted and agree to my data being processed for that purpose. '
      + 'I can withdraw this consent at any time.',
    consentMarketingA: 'I would also like to receive market information and offers by e-mail. ',
    consentMarketingB: '(optional)',

    back: 'Back',
    next: 'Next',
    sending: 'Sending …',
    submit: 'Send enquiry',

    doneH: 'Your enquiry has arrived.',
    doneTeam: 'The ',
    doneTeamAfter: ' team has just been notified. ',
    doneTeamless: 'Our specialist team has just been notified. ',
    doneHearA: 'You will hear from us ',
    doneHearB: '.',
    doneContactKicker: 'Your contact',
    donePortalKicker: 'Your client area',
    donePortalText: 'There you can see the status of your enquiry, the next steps and your offer. '
      + 'The credentials are also in your confirmation e-mail.',
    portalKnown: 'You already know your password – it is in your first confirmation e-mail and still applies.',
    labelRef: 'Reference',
    labelLogin: 'Login',
    labelPassword: 'Password',
    copyAria: (label) => `Copy ${label.toLowerCase()}`,
    copied: (label) => `${label} copied.`,
    copyFailed: 'Copying is not possible – please select it by hand.',
    openPortal: 'Open the client area',
  },
};

export const lang = DICT[window.__LANG__] ? window.__LANG__ : 'de';
export const locale = lang === 'en' ? 'en-GB' : 'de-DE';

/**
 * Ein Text aus der Tabelle. Ist der Eintrag eine Funktion, werden die
 * weiteren Argumente eingesetzt – so bleiben Satzbau und Wortstellung in
 * der Sprache, in der der Satz gebaut wird, und nicht in der, in der er
 * ursprünglich geschrieben wurde.
 */
export function t(key, ...args) {
  const value = DICT[lang][key] ?? DICT.de[key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(...args) : value;
}
