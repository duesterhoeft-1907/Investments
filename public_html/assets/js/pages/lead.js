/** Lead-Detail: Reaktionsuhr, Erstkontakt, Verlauf, Sprachnotizen, Angebote. */
import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { pulse } from '../core/pulse.js';
import { ACTIVITY_META, formatCurrency, formatDateTime, formatDuration, formatRelative, renderMarkdown } from '../core/format.js';
import { avatar, button, empty, field, slaClock, spinner, statusBadge, toast } from '../core/ui.js';
import { voiceRecorder } from '../core/voice.js';

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const STAGE_LABEL = { new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert', proposal: 'Angebot', won: 'Gewonnen', lost: 'Verloren' };

export function render(view, { params, session, navigate }) {
  const leadId = Number(params[0]);
  const state = { data: null, users: [], tab: 'stream', busy: '', ai: { enabled: false, model: null }, openOffer: null };

  const load = async () => {
    state.data = await api.get(`/leads/${leadId}`);
    if (state.openOffer === null && state.data.offers.length) state.openOffer = state.data.offers[0].id;
    paint();
  };

  const offUpdated = pulse.on('lead:updated', (p) => {
    if (p.lead?.id === leadId && state.data) { state.data.lead = p.lead; paint(); }
  });

  api.get('/directory/users').then((d) => { state.users = d.users; paint(); }).catch(() => {});
  api.get('/offers/ai-status').then((d) => { state.ai = d; }).catch(() => {});
  mount(view, h('div.row', { style: { minHeight: '50vh', justifyContent: 'center' } }, spinner(28)));
  load().catch(() => navigate('/app/leads'));

  async function patch(body, key) {
    state.busy = key;
    paint();
    try { await api.patch(`/leads/${leadId}`, body); await load(); }
    catch (error) { toast(error.message, 'error'); }
    finally { state.busy = ''; paint(); }
  }

  function paint() {
    if (!state.data) return;
    const { lead } = state.data;
    const awaiting = !lead.firstContactAt;

    mount(view, h('div.stack', { style: { gap: '18px' } },
      h('a.row.faint', { href: '/app/leads', style: { gap: '6px', fontSize: '14px', width: 'fit-content' } }, icon('arrowLeft', 15), 'Alle Leads'),
      h('div.glass', { style: { overflow: 'hidden', borderColor: awaiting ? 'rgba(200,162,74,0.35)' : undefined } },
        headBlock(lead, awaiting), stageBar(lead)),
      h('div.grid-3.rev',
        h('div.stack', { style: { gap: '18px' } }, tabsBar(), tabContent()),
        h('div.stack', { style: { gap: '18px' } }, tasksPanel(), portalPanel(lead), wizardPanel(lead))),
    ));
  }

  function headBlock(lead, awaiting) {
    return h('div.lead-head',
      h('div.grow',
        h('div.row', { style: { gap: '12px', flexWrap: 'wrap' } },
          h('h1', lead.name),
          statusBadge(lead.status, lead.statusLabel),
          h('span.mono.faint', { style: { fontSize: '12px' } }, lead.ref)),
        h('div.lead-contacts',
          h('a', { href: 'mailto:' + lead.email }, icon('mail', 14), lead.email),
          lead.phone ? h('a', { href: 'tel:' + lead.phone }, icon('phone', 14), lead.phone) : null,
          lead.company ? h('span', icon('building', 14), lead.company) : null,
          lead.city ? h('span', icon('pin2', 14), `${lead.postalCode} ${lead.city}`) : null),
        h('div.lead-chips',
          chip(lead.assetClass ?? '–', lead.teamColor),
          chip(lead.volumeLabel || '–'), chip(lead.horizonLabel || '–'), chip(lead.experienceLabel || '–'),
          chip(`Kontakt: ${lead.contactPrefLabel}${lead.contactWindow ? ` (${lead.contactWindow})` : ''}`),
          chip(`Score ${lead.score}`)),
      ),
      h('div.stack', { style: { gap: '12px', alignItems: 'flex-end', flexShrink: '0' } },
        h('div', { style: { textAlign: 'right' } },
          h('p.faint', { style: { fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' } },
            awaiting ? 'Reaktionsfrist' : 'Reaktionszeit'),
          slaClock(lead, 'lg'),
          h('p.faint', { style: { marginTop: '2px', fontSize: '11px' } }, `Eingang ${formatRelative(lead.createdAt)}`)),
        awaiting ? contactButton(lead) : null,
        lead.ownerId !== session.user.id
          ? button('Übernehmen', { variant: 'outline', size: 'sm', iconName: 'hand',
              onclick: async () => { await api.post(`/leads/${leadId}/claim`).catch((e) => toast(e.message, 'error')); await load(); } })
          : null,
      ),
    );
  }

  function chip(label, accent) {
    return h('span.lead-chip', {
      style: accent ? { borderColor: accent + '44', background: accent + '12', color: accent } : {},
    }, label);
  }

  /** Der Klick, der die Reaktionsuhr stoppt. */
  function contactButton(lead) {
    const form = { channel: lead.contactPref === 'email' ? 'email' : 'call', outcome: 'reached', note: '', busy: false };
    let open = false;

    const wrap = h('div', { style: { position: 'relative' } });

    // Die umgebende Karte muss das Feld herauslassen und darf sich nicht von
    // der naechsten Karte ueberdecken lassen – siehe .popover-open im CSS.
    const liftCard = () => {
      const card = wrap.closest('.glass');
      if (card) {
        card.classList.toggle('popover-open', open);
      }
    };

    const draw = () => {
      liftCard();
      mount(wrap,
        h('button.btn.btn-primary', { onclick: () => { open = !open; draw(); } },
          icon('zap', 16), 'Erstkontakt erfassen', icon('chevron', 13)),
        open ? h('div.glass', {
          style: { position: 'absolute', right: '0', top: '48px', zIndex: '30', width: '320px', padding: '16px',
                   display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 24px 60px -16px rgba(0,0,0,0.8)' },
        },
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' } },
            [['call', 'Anruf'], ['email', 'Mail'], ['whatsapp', 'WA'], ['meeting', 'Termin']].map(([v, l]) =>
              h('button.chip' + (form.channel === v ? '.on' : ''), { onclick: () => { form.channel = v; draw(); } }, l))),
          h('select.input', { style: { padding: '9px 12px' }, onchange: (e) => { form.outcome = e.target.value; } },
            [['reached', 'erreicht'], ['no_answer', 'nicht erreicht'], ['callback', 'Rückruf vereinbart'],
             ['voicemail', 'Mailbox besprochen'], ['positive', 'positives Gespräch']]
              .map(([v, l]) => h('option', { value: v, selected: form.outcome === v }, l))),
          h('textarea.input', { rows: 3, placeholder: 'Was wurde besprochen?', style: { padding: '9px 12px', fontSize: '14px' },
            oninput: (e) => { form.note = e.target.value; } }),
          h('button.btn.btn-primary.btn-sm.btn-block', { disabled: form.busy, onclick: async () => {
            form.busy = true; draw();
            try {
              const result = await api.post(`/leads/${leadId}/contact`, form);
              open = false;
              liftCard();
              toast(`Erstkontakt in ${result.responseLabel ?? '–'} · Uhr gestoppt.`);
              await load();
            } catch (error) { toast(error.message, 'error'); form.busy = false; draw(); }
          } }, form.busy ? spinner(14) : icon('check', 14), 'Kontakt speichern'),
        ) : null);
    };

    draw();
    return wrap;
  }

  function stageBar(lead) {
    return h('div.stage-bar',
      STAGES.map((stage) => {
        const active = lead.status === stage;
        const passed = STAGES.indexOf(lead.status) > STAGES.indexOf(stage) && lead.status !== 'lost';
        return h('button' + (active ? '.on' : passed ? '.done' : ''), {
          disabled: active || state.busy === 'status-' + stage,
          onclick: () => patch({ status: stage }, 'status-' + stage),
        }, passed ? icon('check', 12) : null, STAGE_LABEL[stage]);
      }),
      h('div.row', { style: { marginLeft: 'auto', gap: '8px', paddingLeft: '12px' } },
        h('span.faint', { style: { fontSize: '11px' } }, 'Berater'),
        h('select.input', {
          style: { width: 'auto', padding: '5px 8px', fontSize: '12px' },
          disabled: state.busy === 'owner',
          onchange: (e) => patch({ ownerId: e.target.value ? Number(e.target.value) : null }, 'owner'),
        },
          h('option', { value: '' }, 'nicht zugewiesen'),
          state.users.map((u) => h('option', { value: String(u.id), selected: u.id === lead.ownerId }, u.name)))),
    );
  }

  function tabsBar() {
    const tabs = [
      ['stream', 'Aktivitätsstream', state.data.activities.length],
      ['offers', 'Angebote', state.data.offers.length],
      ['mails', 'Postausgang', state.data.emails.length],
    ];
    return h('div.tabs', tabs.map(([key, label, count]) =>
      h('button' + (state.tab === key ? '.on' : ''), { onclick: () => { state.tab = key; paint(); } },
        label, ' ', h('span.faint', String(count)))));
  }

  function tabContent() {
    if (state.tab === 'offers') return offersTab();
    if (state.tab === 'mails') return mailsTab();
    return streamTab();
  }

  // ── Aktivitätsstream ──

  function streamTab() {
    const compose = { type: 'note', body: '' };
    const byActivity = new Map();
    for (const att of state.data.attachments) {
      if (att.activityId === null) continue;
      if (!byActivity.has(att.activityId)) byActivity.set(att.activityId, []);
      byActivity.get(att.activityId).push(att);
    }

    const textarea = h('textarea.input', {
      rows: 3, placeholder: 'Was ist passiert? (⌘/Strg + Enter zum Speichern)',
      oninput: (e) => { compose.body = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submitNote(); },
    });

    const submitNote = async () => {
      if (!compose.body.trim()) return;
      try {
        await api.post('/activities', { leadId, type: compose.type, body: compose.body, title: '' });
        compose.body = '';
        textarea.value = '';
        await load();
      } catch (error) { toast(error.message, 'error'); }
    };

    const fileInput = h('input', { type: 'file', hidden: true, onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      form.append('leadId', String(leadId));
      form.append('kind', 'file');
      try { await api.upload('/uploads', form); toast('Datei angehängt.'); await load(); }
      catch (error) { toast(error.message, 'error'); }
    } });

    const typeRow = h('div.row', { style: { gap: '6px', flexWrap: 'wrap', marginBottom: '12px' } });
    const drawTypes = () => mount(typeRow,
      [['note', 'Notiz'], ['call', 'Anruf'], ['email', 'E-Mail'], ['meeting', 'Termin'], ['whatsapp', 'WhatsApp']]
        .map(([v, l]) => h('button.chip' + (compose.type === v ? '.on' : ''), { onclick: () => { compose.type = v; drawTypes(); } }, l)));
    drawTypes();

    return h('div.stack', { style: { gap: '16px' } },
      h('div.glass.card-pad',
        typeRow,
        textarea,
        h('div.row', { style: { gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
          button('Eintragen', { size: 'sm', iconName: 'send', onclick: submitNote }),
          button('Datei', { variant: 'ghost', size: 'sm', iconName: 'paperclip', onclick: () => fileInput.click() }),
          fileInput,
          h('span.faint', { style: { marginLeft: 'auto', fontSize: '11px' } }, 'Kontaktarten stoppen automatisch die Reaktionsuhr.')),
        h('div', { style: { marginTop: '12px' } }, voiceRecorder(leadId, load)),
      ),
      h('div.glass.card-pad',
        h('div.section-title', h('h2', 'Verlauf'), h('span.hint', `${state.data.activities.length} Einträge`)),
        state.data.activities.length === 0
          ? empty('Noch keine Einträge.')
          : h('ol.timeline', { style: { listStyle: 'none', margin: '0' } },
              state.data.activities.map((activity, i) => entry(activity, i, byActivity.get(activity.id) ?? []))),
      ),
    );
  }

  function entry(activity, index, attachments) {
    const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.system;
    return h('li.entry', { style: { animationDelay: Math.min(index * 25, 350) + 'ms' } },
      h('span.bullet', { style: { color: meta.color } }, h('i')),
      h('div.body',
        h('div.row', { style: { gap: '10px', flexWrap: 'wrap' } },
          h('span.kind', { style: { color: meta.color } }, meta.label),
          h('span.title', activity.title),
          activity.outcome ? h('span', { style: { borderRadius: '6px', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', fontSize: '10px', color: 'var(--text-dim)' } }, activity.outcome) : null,
          activity.durationS > 0 ? h('span.row.faint', { style: { gap: '4px', fontSize: '10px' } }, icon('timer', 11), formatDuration(activity.durationS)) : null,
          h('span.row', { style: { marginLeft: 'auto', gap: '10px' } },
            h('button', {
              style: { background: 'none', border: 'none', padding: '0', color: activity.isPinned ? 'var(--gold-400)' : 'rgba(255,255,255,0.15)' },
              'aria-label': 'Anheften',
              onclick: async () => { await api.patch(`/activities/${activity.id}/pin`).catch(() => {}); await load(); },
            }, icon('pin', 14)),
            h('span.when', { title: formatDateTime(activity.occurredAt) }, formatRelative(activity.occurredAt)))),
        activity.body ? h('p.text', activity.body) : null,
        attachments.map(attachment),
        activity.user
          ? h('div.row.faint', { style: { gap: '6px', marginTop: '8px', fontSize: '11px' } },
              avatar(activity.user.name, activity.user.accent, 16), activity.user.name)
          : null,
      ),
    );
  }

  function attachment(att) {
    if (att.kind === 'voice') {
      return h('div', { style: { marginTop: '10px', border: '1px solid var(--hairline)', background: 'rgba(6,9,13,0.5)', borderRadius: '10px', padding: '10px' } },
        h('p.row.faint', { style: { gap: '6px', marginBottom: '6px', fontSize: '11px' } },
          icon('mic', 12), `Sprachnotiz · ${formatDuration(att.durationS)}`),
        h('audio', { src: att.url, controls: true, preload: 'none', style: { width: '100%' } }),
        att.transcript ? h('p.faint', { style: { marginTop: '8px', fontSize: '12px', fontStyle: 'italic' } }, att.transcript) : null);
    }
    return h('a.row', {
      href: att.url, target: '_blank', rel: 'noreferrer',
      style: { marginTop: '10px', gap: '6px', width: 'fit-content', border: '1px solid var(--hairline)', background: 'rgba(6,9,13,0.5)', borderRadius: '10px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-dim)' },
    }, icon('paperclip', 12), att.filename, h('span.faint', `${Math.round(att.sizeBytes / 1024)} KB`));
  }

  // ── Angebote ──

  function offersTab() {
    const draft = { instruction: '', busy: false, note: '' };
    const box = h('div.stack', { style: { gap: '16px' } });

    const drawDraft = () => {
      const panel = h('div.glass.card-pad',
        h('div.section-title',
          h('h2.row', { style: { gap: '8px' } }, icon('bot', 16), 'Angebotsentwurf'),
          h('span.hint', state.ai.enabled ? `KI aktiv · ${state.ai.model}` : 'Vorlagen-Modus')),
        h('p.faint', { style: { marginBottom: '12px', fontSize: '12px', lineHeight: '1.6' } },
          'Erzeugt aus Bedarf und gesamtem Gesprächsverlauf einen Entwurf samt nächster Schritte. ' +
          (state.ai.enabled
            ? 'Der Entwurf ist immer zu prüfen – Preise bleiben Platzhalter.'
            : 'Ohne API-Schlüssel entsteht ein strukturierter Textbaustein.')),
        h('textarea.input', { rows: 2, placeholder: 'Zusätzliche Anweisung, z. B. „Fokus auf Zollfreilager, Staffelung über 3 Tranchen“',
          style: { fontSize: '14px' }, oninput: (e) => { draft.instruction = e.target.value; } }),
        h('div.row', { style: { gap: '12px', marginTop: '12px' } },
          h('button.btn.btn-primary.btn-sm', { disabled: draft.busy, onclick: async () => {
            draft.busy = true; drawDraft();
            try {
              const result = await api.post('/offers/draft', { leadId, instruction: draft.instruction });
              draft.note = result.note ?? '';
              draft.instruction = '';
              state.openOffer = result.offer.id;
              await load();
            } catch (error) { toast(error.message, 'error'); draft.busy = false; drawDraft(); }
          } }, draft.busy ? spinner(14) : icon('sparkles', 14), draft.busy ? 'Wird erstellt …' : 'Entwurf erzeugen'),
          draft.note ? h('span', { style: { fontSize: '12px', color: 'rgba(224,194,116,0.8)' } }, draft.note) : null),
      );
      mount(box, panel, ...(state.data.offers.length
        ? state.data.offers.map(offerCard)
        : [h('div.glass', empty('Noch kein Angebot.', 'Erzeuge oben einen Entwurf.'))]));
    };

    drawDraft();
    return box;
  }

  function offerCard(offer) {
    const open = state.openOffer === offer.id;
    const labels = { draft: 'Entwurf', sent: 'Versendet', accepted: 'Angenommen', declined: 'Abgelehnt' };
    let editing = false;
    let body = offer.body;

    const wrap = h('div.glass', { style: { overflow: 'hidden' } });

    const draw = () => {
      mount(wrap,
        h('button.offer-head', { onclick: () => { state.openOffer = open ? null : offer.id; paint(); } },
          icon('file', 15, 'faint'),
          h('div.grow',
            h('p.truncate', { style: { fontSize: '14px', fontWeight: '500' } }, offer.title),
            h('p.truncate.faint', { style: { fontSize: '12px' } }, offer.summary)),
          h('span', { style: { fontSize: '14px', fontWeight: '500' } }, formatCurrency(offer.amount)),
          h('span.offer-status.' + offer.status, labels[offer.status]),
          offer.generatedBy !== 'human'
            ? h('span.faint', { style: { borderRadius: '6px', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', fontSize: '10px' } },
                offer.generatedBy === 'ai' ? 'KI' : 'Vorlage')
            : null,
          icon('chevron', 15, 'faint')),
        open ? h('div', { style: { borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px' } },
          editing
            ? h('textarea.input', { rows: 18, style: { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.7' },
                value: body, oninput: (e) => { body = e.target.value; } })
            : h('div.prose-offer', { html: renderMarkdown(offer.body), style: { fontSize: '14px', color: 'rgba(232,237,243,0.72)' } }),
          h('div.row', { style: { gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' } },
            editing
              ? [button('Speichern', { size: 'sm', iconName: 'check', onclick: async () => {
                  await api.patch(`/offers/${offer.id}`, { body }).catch((e) => toast(e.message, 'error'));
                  editing = false; await load();
                } }),
                 button('Abbrechen', { variant: 'ghost', size: 'sm', onclick: () => { body = offer.body; editing = false; draw(); } })]
              : button('Bearbeiten', { variant: 'subtle', size: 'sm', onclick: () => { editing = true; draw(); } }),
            offer.status === 'draft'
              ? button('Im Portal freigeben', { size: 'sm', iconName: 'send', onclick: async () => {
                  await api.post(`/offers/${offer.id}/send`).catch((e) => toast(e.message, 'error'));
                  toast('Angebot freigegeben und Kunde benachrichtigt.');
                  await load();
                } })
              : null,
            h('span.faint', { style: { marginLeft: 'auto', fontSize: '11px' } },
              (offer.createdBy ? offer.createdBy + ' · ' : '') + formatRelative(offer.createdAt))),
        ) : null);
    };

    draw();
    return wrap;
  }

  function mailsTab() {
    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Postausgang'), h('span.hint', 'alles, was an diesen Lead ging')),
      state.data.emails.length === 0
        ? empty('Noch keine Mails versendet.')
        : h('div.stack', { style: { gap: '10px' } }, state.data.emails.map((mail) =>
            h('div', { style: { border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(11,15,20,0.4)', borderRadius: '12px', padding: '14px' } },
              h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } },
                icon('mail', 14, 'faint'),
                h('span', { style: { fontSize: '14px', fontWeight: '500' } }, mail.subject),
                h('span', { style: { borderRadius: '999px', padding: '1px 8px', fontSize: '10px',
                  background: mail.status === 'sent' ? 'rgba(78,168,123,0.12)' : mail.status === 'failed' ? 'rgba(217,83,79,0.12)' : 'rgba(255,255,255,0.06)',
                  color: mail.status === 'sent' ? '#7fd3a6' : mail.status === 'failed' ? '#f0a5a2' : 'var(--text-faint)' } },
                  mail.status === 'logged' ? 'protokolliert' : mail.status === 'sent' ? 'versendet' : 'fehlgeschlagen'),
                h('span.faint', { style: { marginLeft: 'auto', fontSize: '11px' } }, formatRelative(mail.createdAt))),
              h('p.faint', { style: { marginTop: '4px', fontSize: '12px' } }, 'an ' + mail.to),
              mail.preview ? h('p.faint', { style: { marginTop: '8px', fontSize: '12px', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '4.8em', overflow: 'hidden' } }, mail.preview) : null))),
    );
  }

  // ── Seitenspalte ──

  function tasksPanel() {
    let open = false;
    const form = { title: '', kind: 'call', recurrence: 'none', assignedTo: '', visibleToClient: false,
      dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16) };
    const wrap = h('div.glass.card-pad');

    const draw = () => {
      mount(wrap,
        h('div.section-title',
          h('h2', 'Aufgaben & Termine'),
          h('button.hint.row', { style: { gap: '4px', background: 'none', border: 'none' }, onclick: () => { open = !open; draw(); } },
            icon('plus', 13), 'neu')),
        open ? h('div', { style: { marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--hairline)', background: 'rgba(11,15,20,0.5)', borderRadius: '12px', padding: '14px' } },
          h('input.input', { placeholder: 'Titel', style: { padding: '9px 12px', fontSize: '14px' }, value: form.title, oninput: (e) => { form.title = e.target.value; } }),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
            h('select.input', { style: { padding: '9px 12px', fontSize: '14px' }, onchange: (e) => { form.kind = e.target.value; } },
              [['call', 'Anruf'], ['meeting', 'Termin'], ['task', 'Aufgabe']].map(([v, l]) => h('option', { value: v, selected: form.kind === v }, l))),
            h('select.input', { style: { padding: '9px 12px', fontSize: '14px' }, onchange: (e) => { form.recurrence = e.target.value; } },
              [['none', 'einmalig'], ['daily', 'täglich'], ['weekly', 'wöchentlich'], ['biweekly', 'zweiwöchentlich'], ['monthly', 'monatlich'], ['quarterly', 'vierteljährlich']]
                .map(([v, l]) => h('option', { value: v, selected: form.recurrence === v }, l)))),
          h('input.input', { type: 'datetime-local', style: { padding: '9px 12px', fontSize: '14px' }, value: form.dueAt, oninput: (e) => { form.dueAt = e.target.value; } }),
          h('select.input', { style: { padding: '9px 12px', fontSize: '14px' }, onchange: (e) => { form.assignedTo = e.target.value; } },
            h('option', { value: '' }, 'mir zuweisen'),
            state.users.map((u) => h('option', { value: String(u.id) }, u.name))),
          h('label.row', { style: { gap: '8px', fontSize: '12px', color: 'var(--text-dim)', cursor: 'pointer' } },
            h('input', { type: 'checkbox', onchange: (e) => { form.visibleToClient = e.target.checked; }, style: { accentColor: 'var(--gold-500)' } }),
            'Als „nächster Schritt" im Kundenportal anzeigen'),
          h('button.btn.btn-primary.btn-sm.btn-block', { onclick: async () => {
            if (form.title.trim().length < 2) return toast('Bitte einen Titel angeben.', 'error');
            try {
              await api.post('/tasks', { ...form, leadId, dueAt: new Date(form.dueAt).toISOString(),
                assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined });
              form.title = ''; open = false; await load();
            } catch (error) { toast(error.message, 'error'); }
          } }, icon('check', 14), 'Anlegen'),
        ) : null,
        state.data.tasks.length === 0
          ? empty('Nichts geplant.')
          : h('div.stack', { style: { gap: '4px' } }, state.data.tasks.map(taskRow)),
      );
    };

    draw();
    return wrap;
  }

  function taskRow(task) {
    const overdue = task.status === 'open' && task.dueAt && new Date(task.dueAt) < new Date();
    return h('div.task-row' + (task.status === 'done' ? '.done' : ''),
      h('button.tick' + (task.status === 'done' ? '.on' : ''), {
        style: { width: '16px', height: '16px' },
        'aria-label': task.status === 'done' ? 'Wieder öffnen' : 'Erledigt',
        onclick: async () => {
          await api.patch(`/tasks/${task.id}`, { status: task.status === 'done' ? 'open' : 'done' }).catch(() => {});
          await load();
        },
      }, icon('check', 11)),
      h('div.grow',
        h('p.title', task.title),
        h('p.sub',
          h('span', { style: { color: overdue ? '#f0a5a2' : undefined } }, formatRelative(task.dueAt)),
          task.recurrence !== 'none' ? h('span', '· wiederkehrend') : null,
          task.visibleToClient ? h('span', '· im Portal sichtbar') : null)),
      task.assignee ? avatar(task.assignee.name, task.assignee.accent, 20) : null,
    );
  }

  function portalPanel(lead) {
    if (!lead.hasPortal) return null;
    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Kundenbereich')),
      h('p.faint', { style: { fontSize: '12px', lineHeight: '1.6' } },
        'Der Interessent hat einen eigenen Bereich mit Status, nächsten Schritten und Angebot.'),
      h('div.stack', { style: { gap: '6px', marginTop: '12px', fontSize: '12px' } },
        h('div.row', { style: { justifyContent: 'space-between', gap: '8px' } },
          h('span.faint', 'Letzter Login'),
          h('span.muted', lead.portalLastLogin ? formatRelative(lead.portalLastLogin) : 'noch nie')),
        h('div.row', { style: { justifyContent: 'space-between', gap: '8px' } },
          h('span.faint', 'Zugang'), h('span.muted.truncate', lead.email))),
      h('a', { href: `/portal/${lead.portalToken}`, target: '_blank', rel: 'noreferrer', style: { display: 'block', marginTop: '12px' } },
        h('button.btn.btn-outline.btn-sm.btn-block', icon('external', 13), 'Portal ansehen')),
    );
  }

  function wizardPanel(lead) {
    if (!lead.message && !lead.goal) return null;
    return h('div.glass.card-pad',
      h('div.section-title', h('h2', 'Aus dem Wizard')),
      lead.goal ? h('div', { style: { marginBottom: '12px' } },
        h('p.faint', { style: { fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' } }, 'Ziel'),
        h('p.muted', { style: { marginTop: '4px', fontSize: '14px' } }, lead.goal)) : null,
      lead.message ? h('div',
        h('p.faint', { style: { fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' } }, 'Nachricht'),
        h('p.muted', { style: { marginTop: '4px', paddingLeft: '12px', borderLeft: '2px solid rgba(200,162,74,0.4)', fontSize: '14px', lineHeight: '1.6', fontStyle: 'italic' } }, lead.message)) : null,
    );
  }

  return () => { offUpdated(); };
}
