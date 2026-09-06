import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import http from 'node:http';
import { env } from './env.js';
import { migrate } from './db/index.js';
import { attachUser } from './lib/auth.js';
import { errorHandler } from './lib/http.js';
import { initMailer, mailMode } from './lib/mailer.js';
import { initRealtime } from './lib/realtime.js';
import { startSlaWatchdog } from './lib/sla.js';
import { aiEnabled } from './lib/ai.js';

import { activitiesRouter } from './routes/activities.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { directoryRouter } from './routes/directory.js';
import { leadsRouter } from './routes/leads.js';
import { notificationsRouter } from './routes/notifications.js';
import { offersRouter } from './routes/offers.js';
import { portalRouter } from './routes/portal.js';
import { publicRouter } from './routes/public.js';
import { statsRouter } from './routes/stats.js';
import { tasksRouter } from './routes/tasks.js';
import { uploadsRouter } from './routes/uploads.js';

migrate();
initMailer();

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'capital-lead-suite',
    mail: mailMode(),
    ai: aiEnabled(),
    slaMinutes: env.slaMinutes,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/portal', portalRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/offers', offersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/directory', directoryRouter);
app.use('/api/uploads', uploadsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpunkt nicht gefunden.' });
});

app.use(errorHandler);

const server = http.createServer(app);
initRealtime(server);
startSlaWatchdog();

server.listen(env.port, () => {
  console.log(`[server] läuft auf http://localhost:${env.port}`);
  console.log(`[server] Frontend erwartet unter ${env.appUrl}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} empfangen – fahre herunter.`);
    server.close(() => process.exit(0));
  });
}
