import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

/** Wrapper, damit abgelehnte Promises sauber im Error-Handler landen. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = 'Nicht gefunden.') => new HttpError(404, msg);
export const forbidden = (msg = 'Kein Zugriff.') => new HttpError(403, msg);

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: first ? `${first.path.join('.') || 'Eingabe'}: ${first.message}` : 'Ungültige Eingabe.',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[api] Unerwarteter Fehler:', err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
}

export function intParam(value: unknown, field = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Ungültige ${field}.`);
  return n;
}
