// Applies db/migrations/*.sql in order, once each, recording them in schema_migrations.
// Usage: npm run migrate   (reads DATABASE_URL from .env)
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const dir = new URL('../db/migrations/', import.meta.url);
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const name of files) {
    if (done.has(name)) continue;
    const sql = await readFile(new URL(name, dir), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
      console.log(`applied ${name}`);
      applied++;
    } catch (e) {
      await client.query('rollback');
      console.error(`failed ${name}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!applied && !process.exitCode) console.log('up to date');
} finally {
  client.release();
  await pool.end();
}
