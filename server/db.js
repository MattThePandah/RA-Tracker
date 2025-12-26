import './env.js'
import pg from 'pg'

const { Pool } = pg

const hasPgEnv = Boolean(
  process.env.DATABASE_URL ||
  process.env.PGHOST ||
  process.env.PGUSER ||
  process.env.PGDATABASE
)

const pool = hasPgEnv ? new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || undefined,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE || undefined,
  user: process.env.PGUSER || undefined,
  password: process.env.PGPASSWORD || undefined,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10
}) : null

if (pool) {
  pool.on('error', (err) => {
    console.error('Postgres pool error:', err)
  })
}

export function isPgEnabled() {
  return !!pool
}

export function getPool() {
  if (!pool) throw new Error('Postgres is not configured')
  return pool
}

export async function query(text, params = []) {
  if (!pool) throw new Error('Postgres is not configured')
  return pool.query(text, params)
}

export async function checkDb() {
  if (!pool) return false
  const result = await pool.query('select 1 as ok')
  return result.rows?.[0]?.ok === 1
}
