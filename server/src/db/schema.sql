PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────── Organisation ───────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  title         TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'agent',   -- admin | manager | agent
  accent        TEXT NOT NULL DEFAULT '#C8A24A',
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fachgruppen: eine Gruppe pro Fachgebiet-Cluster
CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#C8A24A',
  sla_minutes INTEGER NOT NULL DEFAULT 15,       -- Ziel bis zur Erstkontaktaufnahme
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_role TEXT NOT NULL DEFAULT 'member',      -- lead | member
  PRIMARY KEY (team_id, user_id)
);

-- Fachgebiete des Wizards -> steuern das Routing in die Gruppe
CREATE TABLE IF NOT EXISTS asset_classes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tagline     TEXT DEFAULT '',
  description TEXT DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'coins',
  team_id     INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- ─────────────────────────── Leads ───────────────────────────

CREATE TABLE IF NOT EXISTS leads (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  public_ref         TEXT NOT NULL UNIQUE,        -- z.B. LD-8F3K2Q
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT DEFAULT '',
  company            TEXT DEFAULT '',
  city               TEXT DEFAULT '',
  postal_code        TEXT DEFAULT '',
  country            TEXT DEFAULT 'DE',

  asset_class_id     INTEGER REFERENCES asset_classes(id) ON DELETE SET NULL,
  team_id            INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  owner_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,

  status             TEXT NOT NULL DEFAULT 'new', -- new|contacted|qualified|proposal|won|lost
  stage_changed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source             TEXT NOT NULL DEFAULT 'wizard',
  score              INTEGER NOT NULL DEFAULT 0,

  volume_band        TEXT DEFAULT '',
  volume_value       INTEGER NOT NULL DEFAULT 0,  -- Mittelwert des Bands in EUR, fuer Pipeline-Summen
  horizon            TEXT DEFAULT '',
  experience         TEXT DEFAULT '',
  goal               TEXT DEFAULT '',
  contact_pref       TEXT DEFAULT 'phone',        -- phone|email|whatsapp
  contact_window     TEXT DEFAULT '',
  message            TEXT DEFAULT '',
  wizard_payload     TEXT DEFAULT '{}',           -- vollstaendige Antworten als JSON

  consent_contact    INTEGER NOT NULL DEFAULT 0,
  consent_marketing  INTEGER NOT NULL DEFAULT 0,

  sla_due_at         TEXT,                        -- Deadline fuer Erstkontakt
  first_contact_at   TEXT,                        -- gestoppte Uhr
  first_contact_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  response_seconds   INTEGER,                     -- gemessene Reaktionszeit
  sla_breached       INTEGER NOT NULL DEFAULT 0,

  portal_token       TEXT UNIQUE,                 -- Direktlink zur Client-Landing
  portal_password_hash TEXT,
  portal_last_login  TEXT,

  lost_reason        TEXT DEFAULT '',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_team    ON leads(team_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner   ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- Lueckenloser Aktivitaetsstream (dokumentationsfaehig, append-only)
CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,   -- note|call|email|meeting|whatsapp|status_change|assignment
                               -- |lead_created|first_contact|portal_login|client_message
                               -- |voice_note|task_done|offer_sent|system
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  outcome     TEXT DEFAULT '',  -- reached|no_answer|callback|voicemail|positive|negative
  direction   TEXT DEFAULT '',  -- inbound|outbound
  duration_s  INTEGER NOT NULL DEFAULT 0,
  meta        TEXT NOT NULL DEFAULT '{}',
  is_pinned   INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  activity_id  INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL DEFAULT 'file',  -- file | voice
  filename     TEXT NOT NULL,
  stored_name  TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  duration_s   INTEGER NOT NULL DEFAULT 0,
  transcript   TEXT DEFAULT '',
  visible_to_client INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Aufgaben, Anrufe und wiederkehrende Termine
CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id       INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL DEFAULT 'task',   -- task | call | meeting
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  due_at        TEXT NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 30,
  recurrence    TEXT NOT NULL DEFAULT 'none',   -- none|daily|weekly|biweekly|monthly|quarterly
  status        TEXT NOT NULL DEFAULT 'open',   -- open | done | cancelled
  completed_at  TEXT,
  visible_to_client INTEGER NOT NULL DEFAULT 0, -- erscheint als "naechster Schritt" im Kundenportal
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, due_at);

-- Angebote fuer die Client-Landing
CREATE TABLE IF NOT EXISTS offers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  summary      TEXT DEFAULT '',
  body         TEXT DEFAULT '',
  amount       INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|accepted|declined
  generated_by TEXT NOT NULL DEFAULT 'human',  -- human | ai
  valid_until  TEXT,
  sent_at      TEXT,
  responded_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────── Interner Chat ───────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'team',   -- company | team | dm
  team_id     INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  topic       TEXT DEFAULT '',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'text',   -- text | system | lead_alert
  lead_id    INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id DESC);

-- ─────────────────────────── Benachrichtigungen & Mail ───────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- new_lead | sla_warning | sla_breach | mention | assignment | client_message | task_due
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  link       TEXT DEFAULT '',
  lead_id    INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  urgency    TEXT NOT NULL DEFAULT 'normal', -- normal | high | critical
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, id DESC);

CREATE TABLE IF NOT EXISTS email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  template    TEXT NOT NULL DEFAULT '',
  preview     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'sent',  -- sent | failed | logged
  error       TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
