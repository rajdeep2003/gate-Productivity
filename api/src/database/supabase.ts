const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!baseUrl || !secretKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured for the API.');
}
const serverSecret = secretKey as string;

export type Row = Record<string, unknown>;

export async function rest<T = Row[]>(table: string, options: {
  query?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  prefer?: string;
} = {}): Promise<T> {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      apikey: serverSecret,
      Authorization: `Bearer ${serverSecret}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  const responseBody = await response.text();
  if (!responseBody) return undefined as T;
  return JSON.parse(responseBody) as T;
}

export const eq = (value: string | number) => `eq.${value}`;
export const one = { limit: '1' };
