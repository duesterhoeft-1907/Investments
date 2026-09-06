import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Eine Verbindung pro Session; die Authentifizierung laeuft ueber das Cookie. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true, autoConnect: true });
  }
  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}
