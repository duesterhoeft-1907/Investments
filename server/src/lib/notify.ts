import { db } from '../db/index.js';
import { emit } from './realtime.js';

export type NotificationType =
  | 'new_lead'
  | 'sla_warning'
  | 'sla_breach'
  | 'assignment'
  | 'mention'
  | 'client_message'
  | 'task_due'
  | 'chat_message';

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  leadId?: number | null;
  urgency?: 'normal' | 'high' | 'critical';
}

/**
 * Legt eine Benachrichtigung ab und stellt sie sofort per Socket zu –
 * daraus entsteht im Frontend der Toast und der Zaehler in der Glocke.
 */
export function notify(input: NotifyInput): number {
  const info = db
    .prepare(
      `INSERT INTO notifications (user_id, type, title, body, link, lead_id, urgency)
       VALUES (@userId, @type, @title, @body, @link, @leadId, @urgency)`,
    )
    .run({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      link: input.link ?? '',
      leadId: input.leadId ?? null,
      urgency: input.urgency ?? 'normal',
    });

  const id = Number(info.lastInsertRowid);
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  emit.toUser(input.userId, 'notification:new', { notification: row });
  return id;
}

export function notifyMany(userIds: number[], build: (userId: number) => NotifyInput): void {
  for (const userId of userIds) notify(build(userId));
}

export function unreadCount(userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId) as { c: number };
  return row.c;
}
