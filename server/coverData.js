import { isPgEnabled, query } from './db.js'

let coverSchemaReady = null

export async function ensureCoverSchema() {
  if (!isPgEnabled()) return
  if (coverSchemaReady) return coverSchemaReady
  coverSchemaReady = query(`
    create table if not exists cover_cache (
      source_url text primary key,
      sha1 text not null,
      ext text not null,
      local_path text not null,
      origin text,
      game_id text,
      console_id text,
      updated_at timestamptz not null default now()
    )
  `)
  await coverSchemaReady
  await query('create index if not exists cover_cache_game_idx on cover_cache(game_id)')
  await query('create index if not exists cover_cache_console_idx on cover_cache(console_id)')
  return coverSchemaReady
}

export async function getCoverMetaByUrl(sourceUrl) {
  if (!isPgEnabled()) return null
  await ensureCoverSchema()
  const result = await query(
    'select source_url, sha1, ext, local_path, origin, game_id, console_id, updated_at from cover_cache where source_url = $1',
    [sourceUrl]
  )
  return result.rows[0] || null
}

export async function upsertCoverMeta({ sourceUrl, sha1, ext, localPath, origin = null, gameId = null, consoleId = null }) {
  if (!isPgEnabled()) return
  await ensureCoverSchema()
  await query(
    `insert into cover_cache (source_url, sha1, ext, local_path, origin, game_id, console_id, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (source_url)
     do update set sha1 = excluded.sha1,
                   ext = excluded.ext,
                   local_path = excluded.local_path,
                   origin = excluded.origin,
                   game_id = excluded.game_id,
                   console_id = excluded.console_id,
                   updated_at = now()`,
    [sourceUrl, sha1, ext, localPath, origin, gameId, consoleId]
  )
}
