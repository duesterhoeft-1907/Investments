import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, intParam, notFound } from '../lib/http.js';
import { logActivity } from '../lib/leads.js';
import { serializeAttachment } from './leads.js';

export const uploadsRouter = Router();

const fileId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 20);

const ALLOWED = new Set([
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'video/webm',
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => cb(null, `${fileId()}${extensionFor(file.mimetype, file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new Error(`Dateityp ${file.mimetype} ist nicht erlaubt.`));
      return;
    }
    cb(null, true);
  },
});

const metaSchema = z.object({
  leadId: z.coerce.number().int().positive(),
  kind: z.enum(['file', 'voice']).default('file'),
  durationS: z.coerce.number().int().min(0).max(7200).default(0),
  note: z.string().trim().max(2000).default(''),
  visibleToClient: z.coerce.boolean().default(false),
});

uploadsRouter.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) throw badRequest('Keine Datei empfangen.');
  const meta = metaSchema.parse(req.body);

  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(meta.leadId);
  if (!lead) {
    fs.unlink(path.join(env.uploadDir, req.file.filename), () => undefined);
    throw notFound('Lead nicht gefunden.');
  }

  const isVoice = meta.kind === 'voice';
  const activityId = logActivity({
    leadId: meta.leadId,
    userId: req.user!.id,
    type: isVoice ? 'voice_note' : 'system',
    title: isVoice ? 'Sprachnotiz aufgenommen' : `Datei hinzugefügt: ${req.file.originalname}`,
    body: meta.note,
    durationS: meta.durationS,
    meta: { filename: req.file.originalname, mime: req.file.mimetype },
  });

  const info = db
    .prepare(
      `INSERT INTO attachments (lead_id, activity_id, uploaded_by, kind, filename, stored_name,
                                mime, size_bytes, duration_s, visible_to_client)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      meta.leadId, activityId, req.user!.id, meta.kind,
      req.file.originalname, req.file.filename, req.file.mimetype,
      req.file.size, meta.durationS, meta.visibleToClient ? 1 : 0,
    );

  const row = db
    .prepare(
      `SELECT a.*, u.name AS uploaded_by_name FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.id = ?`,
    )
    .get(Number(info.lastInsertRowid)) as Record<string, unknown>;

  res.status(201).json({ attachment: serializeAttachment(row), activityId });
});

/** Auslieferung – Dateien liegen ausserhalb des Web-Roots und werden hier gestreamt. */
uploadsRouter.get('/:storedName', (req, res) => {
  const name = String(req.params.storedName);
  if (!/^[a-z0-9]+(\.[a-z0-9]+)?$/i.test(name)) throw badRequest('Ungültiger Dateiname.');

  const row = db.prepare('SELECT * FROM attachments WHERE stored_name = ?').get(name) as
    | { mime: string; filename: string }
    | undefined;
  if (!row) throw notFound('Datei nicht gefunden.');

  const full = path.join(env.uploadDir, name);
  if (!fs.existsSync(full)) throw notFound('Datei nicht gefunden.');

  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(full).pipe(res);
});

const transcriptSchema = z.object({ transcript: z.string().trim().max(20_000) });

uploadsRouter.patch('/:id/transcript', requireAuth, (req, res) => {
  const id = intParam(req.params.id);
  const { transcript } = transcriptSchema.parse(req.body);
  db.prepare('UPDATE attachments SET transcript = ? WHERE id = ?').run(transcript, id);
  res.json({ ok: true });
});

function extensionFor(mime: string, original: string): string {
  const fromName = path.extname(original).toLowerCase();
  if (/^\.[a-z0-9]{1,6}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    'audio/webm': '.webm',
    'video/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
  };
  return map[mime] ?? '.bin';
}
