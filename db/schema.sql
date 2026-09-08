-- ─────────────────────────────────────────────────────────────────────────
--  Capital Lead Suite – Schema für MySQL / MariaDB
--
--  Alle Zeitstempel liegen in UTC. Die Verbindung setzt time_zone='+00:00',
--  damit NOW() und Vergleiche unabhängig von der Servereinstellung stimmen.
--
--  Wo die Struktur bewusst offen bleiben soll – Wizard-Antworten, Metadaten
--  am Aktivitätseintrag, Event-Nutzlast – steht JSON statt weiterer Spalten.
-- ─────────────────────────────────────────────────────────────────────────

SET NAMES utf8mb4;

-- ───────────────────────────── Organisation ─────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(190) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(120) NOT NULL,
  title          VARCHAR(120) NOT NULL DEFAULT '',
  phone          VARCHAR(60)  NOT NULL DEFAULT '',
  role           ENUM('admin','manager','agent') NOT NULL DEFAULT 'agent',
  accent         VARCHAR(9)   NOT NULL DEFAULT '#21B4A6',
  -- Dateiname des Profilbildes in storage/uploads/avatars. Leer heisst:
  -- die Initialen tun es auch.
  avatar_file    VARCHAR(80)  NOT NULL DEFAULT '',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  away_until     DATETIME     NULL,
  away_note      VARCHAR(160) NOT NULL DEFAULT '',
  last_seen_at   DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fachgruppen. Die SLA ist die Zusage pro Gruppe bis zur Erstkontaktaufnahme.
CREATE TABLE IF NOT EXISTS teams (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug         VARCHAR(60)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  -- Leer heisst: englische Strecke zeigt den deutschen Namen.
  name_en      VARCHAR(120) NOT NULL DEFAULT '',
  description  VARCHAR(400) NOT NULL DEFAULT '',
  color        VARCHAR(9)   NOT NULL DEFAULT '#21B4A6',
  sla_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members (
  team_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  team_role  ENUM('lead','member') NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, user_id),
  KEY idx_team_members_user (user_id),
  CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fachgebiete des Wizards. team_id steuert das Routing der Anfrage.
CREATE TABLE IF NOT EXISTS asset_classes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug         VARCHAR(60)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  name_en      VARCHAR(120) NOT NULL DEFAULT '',
  tagline      VARCHAR(190) NOT NULL DEFAULT '',
  tagline_en   VARCHAR(200) NOT NULL DEFAULT '',
  description  VARCHAR(500) NOT NULL DEFAULT '',
  description_en VARCHAR(400) NOT NULL DEFAULT '',
  icon         VARCHAR(40)  NOT NULL DEFAULT 'coins',
  team_id      INT UNSIGNED NULL,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_slug (slug),
  KEY idx_asset_team (team_id),
  CONSTRAINT fk_asset_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────── Kunden ─────────────────────────────
--
-- Ein Mensch, der sich meldet – und zwar auch dann derselbe, wenn er es
-- zum dritten Mal tut. Ohne diese Tabelle waeren drei Anfragen desselben
-- Interessenten drei Fremde: dreimal dieselbe Frage am Telefon, drei
-- Portalzugaenge, und niemand sieht, dass hier jemand zum dritten Mal
-- anklopft.
--
-- Erkannt wird ueber die E-Mail-Adresse, kleingeschrieben. Das ist nicht
-- perfekt – wer zweimal verschiedene Adressen benutzt, zaehlt zweimal –
-- aber es ist die einzige Angabe, die im Wizard verpflichtend ist und die
-- Menschen selten vertippen.
CREATE TABLE IF NOT EXISTS customers (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email                VARCHAR(190) NOT NULL,
  first_name           VARCHAR(80)  NOT NULL DEFAULT '',
  last_name            VARCHAR(80)  NOT NULL DEFAULT '',
  phone                VARCHAR(60)  NOT NULL DEFAULT '',
  company              VARCHAR(160) NOT NULL DEFAULT '',
  city                 VARCHAR(120) NOT NULL DEFAULT '',
  postal_code          VARCHAR(20)  NOT NULL DEFAULT '',
  country              VARCHAR(4)   NOT NULL DEFAULT 'DE',
  lang                 CHAR(2)      NOT NULL DEFAULT 'de',
  -- Ein Zugang je Mensch, nicht je Anfrage.
  portal_password_hash VARCHAR(255) NULL,
  portal_last_login    DATETIME     NULL,
  note                 VARCHAR(1000) NOT NULL DEFAULT '',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alle E-Mail-Adressen eines Menschen.
--
-- Erkannt wird ueber diese Tabelle, nicht ueber customers.email – dort
-- steht nur, welche Adresse angezeigt wird. Wer unter zwei Adressen
-- schreibt, wird sonst zweimal gezaehlt; und wuerde beim Zusammenfuehren
-- die zweite Adresse verschwinden, legte die naechste Anfrage von dort
-- prompt wieder einen neuen Kunden an.
CREATE TABLE IF NOT EXISTS customer_emails (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  email       VARCHAR(190) NOT NULL,
  is_primary  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_email (email),
  KEY idx_customer_email_owner (customer_id),
  CONSTRAINT fk_customer_email FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────── Leads ─────────────────────────────

CREATE TABLE IF NOT EXISTS leads (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_ref        VARCHAR(20)  NOT NULL,
  -- Wer gefragt hat. Die Angaben stehen zusaetzlich am Lead, weil sie zum
  -- Zeitpunkt der Anfrage gelten sollen – zieht jemand um, bleibt die alte
  -- Anfrage mit der alten Adresse richtig.
  customer_id       INT UNSIGNED NULL,
  first_name        VARCHAR(80)  NOT NULL,
  last_name         VARCHAR(80)  NOT NULL,
  email             VARCHAR(190) NOT NULL,
  phone             VARCHAR(60)  NOT NULL DEFAULT '',
  company           VARCHAR(160) NOT NULL DEFAULT '',
  city              VARCHAR(120) NOT NULL DEFAULT '',
  postal_code       VARCHAR(20)  NOT NULL DEFAULT '',
  country           VARCHAR(4)   NOT NULL DEFAULT 'DE',
  -- Die Sprache der Anfragestrecke: sie bestimmt Bestaetigungsmail und Portal.
  lang              CHAR(2)      NOT NULL DEFAULT 'de',

  asset_class_id    INT UNSIGNED NULL,
  team_id           INT UNSIGNED NULL,
  owner_id          INT UNSIGNED NULL,

  status            ENUM('new','contacted','qualified','proposal','won','lost') NOT NULL DEFAULT 'new',
  stage_changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source            VARCHAR(40)  NOT NULL DEFAULT 'wizard',
  score             TINYINT UNSIGNED NOT NULL DEFAULT 0,

  volume_band       VARCHAR(40)  NOT NULL DEFAULT '',
  volume_value      INT UNSIGNED NOT NULL DEFAULT 0,
  horizon           VARCHAR(40)  NOT NULL DEFAULT '',
  experience        VARCHAR(40)  NOT NULL DEFAULT '',
  goal              VARCHAR(500) NOT NULL DEFAULT '',
  contact_pref      VARCHAR(20)  NOT NULL DEFAULT 'phone',
  contact_window    VARCHAR(40)  NOT NULL DEFAULT '',
  message           TEXT         NULL,
  -- Vollständige Wizard-Antworten, damit neue Fragen keine Migration brauchen.
  wizard_payload    JSON         NULL,

  consent_contact   TINYINT(1)   NOT NULL DEFAULT 0,
  consent_marketing TINYINT(1)   NOT NULL DEFAULT 0,

  sla_due_at        DATETIME     NULL,
  sla_warn_at       DATETIME     NULL,
  first_contact_at  DATETIME     NULL,
  first_contact_by  INT UNSIGNED NULL,
  response_seconds  INT UNSIGNED NULL,
  sla_breached      TINYINT(1)   NOT NULL DEFAULT 0,
  sla_warned        TINYINT(1)   NOT NULL DEFAULT 0,

  portal_token          VARCHAR(64)  NULL,
  portal_password_hash  VARCHAR(255) NULL,
  portal_last_login     DATETIME     NULL,

  lost_reason       VARCHAR(400) NOT NULL DEFAULT '',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_leads_ref (public_ref),
  UNIQUE KEY uq_leads_portal (portal_token),
  KEY idx_leads_team (team_id),
  KEY idx_leads_owner (owner_id),
  KEY idx_leads_status (status),
  KEY idx_leads_created (created_at),
  KEY idx_leads_email (email),
  KEY idx_leads_customer (customer_id),
  -- Trägt die Abfrage "wartet noch auf Erstkontakt, sortiert nach Frist".
  KEY idx_leads_open_sla (first_contact_at, sla_due_at),
  KEY idx_leads_sla_warn (sla_warn_at),
  CONSTRAINT fk_lead_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_asset FOREIGN KEY (asset_class_id) REFERENCES asset_classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_team  FOREIGN KEY (team_id)  REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_fcby  FOREIGN KEY (first_contact_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lückenloser Verlauf. Wird nur angehängt, nie überschrieben.
CREATE TABLE IF NOT EXISTS activities (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id      INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NULL,
  type         VARCHAR(30)  NOT NULL,
  title        VARCHAR(255) NOT NULL DEFAULT '',
  body         TEXT         NULL,
  outcome      VARCHAR(40)  NOT NULL DEFAULT '',
  direction    VARCHAR(10)  NOT NULL DEFAULT '',
  duration_s   INT UNSIGNED NOT NULL DEFAULT 0,
  meta         JSON         NULL,
  is_pinned    TINYINT(1)   NOT NULL DEFAULT 0,
  occurred_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activities_lead (lead_id, occurred_at DESC),
  KEY idx_activities_recent (occurred_at DESC),
  CONSTRAINT fk_act_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attachments (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id           INT UNSIGNED NOT NULL,
  activity_id       INT UNSIGNED NULL,
  uploaded_by       INT UNSIGNED NULL,
  kind              ENUM('file','voice') NOT NULL DEFAULT 'file',
  filename          VARCHAR(255) NOT NULL,
  stored_name       VARCHAR(80)  NOT NULL,
  mime              VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes        INT UNSIGNED NOT NULL DEFAULT 0,
  duration_s        INT UNSIGNED NOT NULL DEFAULT 0,
  transcript        TEXT         NULL,
  visible_to_client TINYINT(1)   NOT NULL DEFAULT 0,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attach_stored (stored_name),
  KEY idx_attach_lead (lead_id),
  CONSTRAINT fk_att_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_act  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Aufgaben, Anrufe und Termine. recurrence erzeugt beim Abhaken den Folgetermin.
CREATE TABLE IF NOT EXISTS tasks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id           INT UNSIGNED NULL,
  assigned_to       INT UNSIGNED NULL,
  created_by        INT UNSIGNED NULL,
  kind              ENUM('task','call','meeting') NOT NULL DEFAULT 'task',
  title             VARCHAR(255) NOT NULL,
  description       TEXT         NULL,
  due_at            DATETIME     NOT NULL,
  duration_min      SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  recurrence        ENUM('none','daily','weekly','biweekly','monthly','quarterly') NOT NULL DEFAULT 'none',
  status            ENUM('open','done','cancelled') NOT NULL DEFAULT 'open',
  completed_at      DATETIME     NULL,
  visible_to_client TINYINT(1)   NOT NULL DEFAULT 0,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_due (status, due_at),
  KEY idx_tasks_assignee (assigned_to, status),
  KEY idx_tasks_lead (lead_id),
  CONSTRAINT fk_task_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_user FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id      INT UNSIGNED NOT NULL,
  created_by   INT UNSIGNED NULL,
  title        VARCHAR(255) NOT NULL,
  summary      VARCHAR(1000) NOT NULL DEFAULT '',
  body         MEDIUMTEXT   NULL,
  amount       INT UNSIGNED NOT NULL DEFAULT 0,
  currency     VARCHAR(3)   NOT NULL DEFAULT 'EUR',
  status       ENUM('draft','sent','accepted','declined') NOT NULL DEFAULT 'draft',
  generated_by ENUM('human','ai','template') NOT NULL DEFAULT 'human',
  valid_until  DATETIME     NULL,
  sent_at      DATETIME     NULL,
  responded_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_offers_lead (lead_id),
  CONSTRAINT fk_offer_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────── Interner Chat ─────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(60)  NULL,
  name        VARCHAR(120) NOT NULL,
  type        ENUM('company','team','dm') NOT NULL DEFAULT 'team',
  team_id     INT UNSIGNED NULL,
  topic       VARCHAR(255) NOT NULL DEFAULT '',
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_channels_slug (slug),
  KEY idx_channels_team (team_id),
  CONSTRAINT fk_chan_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_chan_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id   INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id),
  KEY idx_cm_user (user_id),
  CONSTRAINT fk_cm_chan FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  body       TEXT         NOT NULL,
  kind       ENUM('text','system','lead_alert') NOT NULL DEFAULT 'text',
  lead_id    INT UNSIGNED NULL,
  meta       JSON         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_channel (channel_id, id DESC),
  CONSTRAINT fk_msg_chan FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_msg_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────── Benachrichtigung ─────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(30)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       VARCHAR(500) NOT NULL DEFAULT '',
  link       VARCHAR(255) NOT NULL DEFAULT '',
  lead_id    INT UNSIGNED NULL,
  urgency    ENUM('normal','high','critical') NOT NULL DEFAULT 'normal',
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read, id DESC),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ereignisstrom für das Polling. Ersetzt auf Shared Hosting die WebSockets:
-- der Client fragt "alles ab Ereignis N" und bekommt nur, was ihn betrifft.
-- Die aufsteigende id ist der Cursor.
CREATE TABLE IF NOT EXISTS events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type         VARCHAR(40)  NOT NULL,
  -- Zielgruppe: genau eines gesetzt, oder alles NULL für firmenweit.
  user_id      INT UNSIGNED NULL,
  team_id      INT UNSIGNED NULL,
  channel_id   INT UNSIGNED NULL,
  lead_id      INT UNSIGNED NULL,
  payload      JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wer ist gerade da? Wird beim Polling aktualisiert.
CREATE TABLE IF NOT EXISTS presence (
  user_id   INT UNSIGNED NOT NULL,
  seen_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_log (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id    INT UNSIGNED NULL,
  to_address VARCHAR(190) NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  template   VARCHAR(60)  NOT NULL DEFAULT '',
  preview    TEXT         NULL,
  status     ENUM('sent','failed','logged') NOT NULL DEFAULT 'logged',
  error      VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mail_lead (lead_id),
  CONSTRAINT fk_mail_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Einfache Drosselung der öffentlichen Wizard-Route (Shared Hosting hat kein
-- vorgelagertes Rate-Limit).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     VARCHAR(120) NOT NULL,
  hits       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  window_at  DATETIME NOT NULL,
  PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(80) NOT NULL,
  setting_value TEXT        NOT NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
