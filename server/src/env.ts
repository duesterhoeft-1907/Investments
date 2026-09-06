import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');           // <repo>/server
export const REPO_ROOT = path.resolve(ROOT, '..');

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 4000),

  /** Wohin der Browser zeigt – fuer Links in Mails und im Portal. */
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production',
  sessionDays: num(process.env.SESSION_DAYS, 7),

  dbFile: process.env.DB_FILE ?? path.join(REPO_ROOT, 'data', 'crm.db'),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(REPO_ROOT, 'uploads'),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 25),

  /** Ziel bis zur ersten Kontaktaufnahme (Minuten). Pro Gruppe uebersteuerbar. */
  slaMinutes: num(process.env.SLA_MINUTES, 15),
  /** Vorwarnung, wenn nur noch X % der SLA-Zeit uebrig sind. */
  slaWarnRatio: 0.5,

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: num(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '21 Capital Invest <no-reply@example.com>',
  },

  company: {
    name: process.env.COMPANY_NAME ?? '21 Capital Invest',
    phone: process.env.COMPANY_PHONE ?? '+49 40 000 000',
    email: process.env.COMPANY_EMAIL ?? 'service@example.com',
  },

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
};
