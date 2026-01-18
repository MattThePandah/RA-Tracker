import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const POOLS_FILE = path.join(DATA_DIR, 'wheel-pools.json')

fs.mkdirSync(DATA_DIR, { recursive: true })

/**
 * Wheel Pool structure:
 * {
 *   id: string,
 *   name: string,
 *   gameIds: string[],
 *   includeSuggestions: boolean,
 *   createdAt: number,
 *   updatedAt: number
 * }
 */

function loadPools() {
    try {
        if (!fs.existsSync(POOLS_FILE)) return []
        const data = JSON.parse(fs.readFileSync(POOLS_FILE, 'utf-8'))
        return Array.isArray(data) ? data : []
    } catch {
        return []
    }
}

function savePools(pools) {
    try {
        fs.writeFileSync(POOLS_FILE, JSON.stringify(pools, null, 2))
    } catch (e) {
        console.error('Failed to save wheel pools:', e)
    }
}

function generateId() {
    return crypto.randomUUID()
}

function sanitizeName(name) {
    return String(name || '').trim().slice(0, 64) || 'Untitled Pool'
}

function sanitizeGameIds(gameIds) {
    if (!Array.isArray(gameIds)) return []
    return gameIds
        .map(id => String(id || '').trim())
        .filter(Boolean)
        .slice(0, 500) // Reasonable limit
}

/**
 * List all saved pools
 */
export function listPools() {
    return loadPools().map(pool => ({
        id: pool.id,
        name: pool.name,
        gameCount: Array.isArray(pool.gameIds) ? pool.gameIds.length : 0,
        includeSuggestions: !!pool.includeSuggestions,
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt
    }))
}

/**
 * Get a pool by ID (with full gameIds)
 */
export function getPool(id) {
    const pools = loadPools()
    return pools.find(p => p.id === id) || null
}

/**
 * Create a new pool
 */
export function createPool({ name, gameIds, includeSuggestions = false }) {
    const pools = loadPools()
    const now = Date.now()

    const newPool = {
        id: generateId(),
        name: sanitizeName(name),
        gameIds: sanitizeGameIds(gameIds),
        includeSuggestions: !!includeSuggestions,
        createdAt: now,
        updatedAt: now
    }

    pools.push(newPool)
    savePools(pools)

    return newPool
}

/**
 * Update an existing pool
 */
export function updatePool(id, updates) {
    const pools = loadPools()
    const index = pools.findIndex(p => p.id === id)

    if (index === -1) return null

    const pool = pools[index]

    if (updates.name !== undefined) {
        pool.name = sanitizeName(updates.name)
    }
    if (updates.gameIds !== undefined) {
        pool.gameIds = sanitizeGameIds(updates.gameIds)
    }
    if (updates.includeSuggestions !== undefined) {
        pool.includeSuggestions = !!updates.includeSuggestions
    }

    pool.updatedAt = Date.now()
    pools[index] = pool
    savePools(pools)

    return pool
}

/**
 * Delete a pool
 */
export function deletePool(id) {
    const pools = loadPools()
    const filtered = pools.filter(p => p.id !== id)

    if (filtered.length === pools.length) {
        return false // Not found
    }

    savePools(filtered)
    return true
}
