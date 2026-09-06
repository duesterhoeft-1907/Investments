import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { loadStaffUser, STAFF_COOKIE, type SessionUser } from './auth.js';

let io: IOServer | null = null;

const userRoom = (userId: number) => `user:${userId}`;
const teamRoom = (teamId: number) => `team:${teamId}`;
const channelRoom = (channelId: number) => `channel:${channelId}`;
const COMPANY_ROOM = 'company';

interface SocketData {
  user: SessionUser;
}

function readUserFromHandshake(socket: Socket): SessionUser | null {
  const header = socket.handshake.headers.cookie;
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
  let token = fromAuth;
  if (!token && header) token = cookie.parse(header)[STAFF_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; kind?: string };
    if (payload.kind !== 'staff') return null;
    return loadStaffUser(Number(payload.sub)) ?? null;
  } catch {
    return null;
  }
}

export function initRealtime(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: { origin: env.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const user = readUserFromHandshake(socket);
    if (!user) return next(new Error('unauthorized'));
    (socket.data as SocketData).user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data as SocketData;

    socket.join(userRoom(user.id));
    socket.join(COMPANY_ROOM);
    for (const t of db
      .prepare('SELECT team_id FROM team_members WHERE user_id = ?')
      .all(user.id) as Array<{ team_id: number }>) {
      socket.join(teamRoom(t.team_id));
    }
    for (const c of db
      .prepare('SELECT channel_id FROM channel_members WHERE user_id = ?')
      .all(user.id) as Array<{ channel_id: number }>) {
      socket.join(channelRoom(c.channel_id));
    }

    broadcastPresence(user.id, true);

    socket.on('chat:join', (channelId: number) => {
      const member = db
        .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?')
        .get(channelId, user.id);
      if (member) socket.join(channelRoom(channelId));
    });

    socket.on('chat:typing', (payload: { channelId: number; typing: boolean }) => {
      if (!payload || typeof payload.channelId !== 'number') return;
      socket.to(channelRoom(payload.channelId)).emit('chat:typing', {
        channelId: payload.channelId,
        userId: user.id,
        name: user.name,
        typing: Boolean(payload.typing),
      });
    });

    socket.on('disconnect', () => {
      const stillOnline = (io?.sockets.adapter.rooms.get(userRoom(user.id))?.size ?? 0) > 0;
      if (!stillOnline) broadcastPresence(user.id, false);
    });
  });

  return io;
}

function broadcastPresence(userId: number, online: boolean): void {
  io?.to(COMPANY_ROOM).emit('presence', { userId, online });
}

export function onlineUserIds(): number[] {
  if (!io) return [];
  const ids = new Set<number>();
  for (const room of io.sockets.adapter.rooms.keys()) {
    if (room.startsWith('user:')) ids.add(Number(room.slice(5)));
  }
  return [...ids];
}

type Payload = Record<string, unknown>;

export const emit = {
  toUser(userId: number, event: string, payload: Payload): void {
    io?.to(userRoom(userId)).emit(event, payload);
  },
  toUsers(userIds: number[], event: string, payload: Payload): void {
    for (const id of userIds) io?.to(userRoom(id)).emit(event, payload);
  },
  toTeam(teamId: number, event: string, payload: Payload): void {
    io?.to(teamRoom(teamId)).emit(event, payload);
  },
  toChannel(channelId: number, event: string, payload: Payload): void {
    io?.to(channelRoom(channelId)).emit(event, payload);
  },
  toCompany(event: string, payload: Payload): void {
    io?.to(COMPANY_ROOM).emit(event, payload);
  },
  joinChannel(userId: number, channelId: number): void {
    io?.in(userRoom(userId)).socketsJoin(channelRoom(channelId));
  },
};
