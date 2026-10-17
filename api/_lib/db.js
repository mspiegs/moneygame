import { neon } from '@neondatabase/serverless';

let sql;
/** Tagged-template SQL over Neon's HTTP driver: await db()`select ${x}`. */
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return (sql ??= neon(process.env.DATABASE_URL));
}

export const json = (data, status = 200) => Response.json(data, { status });
