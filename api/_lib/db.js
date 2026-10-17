import { neon } from '@neondatabase/serverless';

let sql;
/** Tagged-template SQL over Neon's HTTP driver: await db()`select ${x}`. */
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return (sql ??= neon(process.env.DATABASE_URL));
}

export const json = (data, status = 200) => Response.json(data, { status });

/** An error with an HTTP status, for bad input or missing permission. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Runs a handler, turning HttpErrors into JSON responses. */
export const handle = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
};
