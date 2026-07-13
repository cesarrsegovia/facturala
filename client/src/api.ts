/**
 * Cliente HTTP mínimo: agrega el JWT a cada request y normaliza errores
 * (NestJS devuelve `{ message: string | string[] }` en los 4xx/5xx).
 */

const TOKEN_KEY = 'facturala_token';

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const message = body.message;
    return Array.isArray(message) ? message.join('. ') : String(message);
  } catch {
    return `Error ${res.status}`;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...options.headers,
    },
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Descarga un PDF autenticado y dispara el download del navegador. */
export async function downloadPdf(path: string, filename: string): Promise<void> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
