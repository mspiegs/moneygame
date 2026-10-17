import { db, json } from './_lib/db.js';

/** GET /api/health: is the API up, and can it reach the database? */
export async function GET() {
  if (!process.env.DATABASE_URL) return json({ ok: true, db: 'not configured' });
  try {
    const [row] = await db()`select count(*)::int as migrations from schema_migrations`;
    return json({ ok: true, db: 'connected', migrations: row.migrations });
  } catch (e) {
    return json({ ok: false, db: 'error', error: e.message }, 500);
  }
}
