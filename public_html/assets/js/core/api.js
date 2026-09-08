/**
 * Zugriff auf die Schnittstelle. Schickt den CSRF-Token bei allen
 * verändernden Aufrufen mit und reicht die Fehlermeldungen des Servers
 * unverändert durch – der Server formuliert sie bereits in der Sprache der
 * Anfrage und für Menschen.
 */
let csrfToken = window.__CSRF__ || '';

export function setCsrf(token) {
  if (token) csrfToken = token;
}

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

async function request(method, path, body, isForm = false) {
  const headers = {};
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  const response = await fetch('/api' + path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || response.statusText };
  }

  if (!response.ok) {
    // Ohne Meldung vom Server bleibt nur der Status. Der ist sprachneutral –
    // besser als ein deutscher Satz auf der englischen Strecke.
    throw new ApiError(response.status, data?.error || `HTTP ${response.status}`, data?.fields);
  }
  if (data && data.csrf) setCsrf(data.csrf);
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path, {}),
  upload: (path, formData) => request('POST', path, formData, true),
};
