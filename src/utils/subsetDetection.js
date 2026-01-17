const SUBSET_RX = /\[\s*Subset[^\]]*(?:\]|$)/i

function normalizeConsole(value) {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value.name || value.id || '').trim().toLowerCase()
  }
  return String(value).trim().toLowerCase()
}

export function isSubsetTitle(title = '') {
  return SUBSET_RX.test(String(title || ''))
}

export function normalizeSubsetTitle(title = '') {
  let s = String(title || '').trim()
  if (!s) return ''
  s = s.replace(SUBSET_RX, ' ')
  s = s.split('|')[0]
  return s.replace(/\s+/g, ' ').trim()
}

export function findSubsetsForGame(game, games = []) {
  if (!game || !Array.isArray(games)) return []
  if (!game.title) return []
  const baseTitle = normalizeSubsetTitle(game.title)
  if (!baseTitle) return []
  const baseConsole = normalizeConsole(game.console)
  return games.filter(g => {
    if (!g || g.id === game.id) return false
    if (!isSubsetTitle(g.title)) return false
    if (normalizeSubsetTitle(g.title) !== baseTitle) return false
    if (baseConsole && normalizeConsole(g.console) !== baseConsole) return false
    return true
  })
}

export function buildEnabledSubsetIdSet(games = []) {
  const enabled = new Set()
  if (!Array.isArray(games)) return enabled
  const subsetGroups = new Map()
  for (const g of games) {
    if (!g || !isSubsetTitle(g.title)) continue
    const baseTitle = normalizeSubsetTitle(g.title)
    if (!baseTitle) continue
    const baseConsole = normalizeConsole(g.console)
    const key = `${baseTitle}||${baseConsole}`
    if (!subsetGroups.has(key)) subsetGroups.set(key, [])
    subsetGroups.get(key).push(String(g.id))
  }

  for (const game of games) {
    if (!game || isSubsetTitle(game.title)) continue
    const baseTitle = normalizeSubsetTitle(game.title)
    if (!baseTitle) continue
    const baseConsole = normalizeConsole(game.console)
    const key = `${baseTitle}||${baseConsole}`
    const subsetIds = subsetGroups.get(key) || []

    const hasCustomMode = game?.subsetMode
      ? game.subsetMode === 'custom'
      : (Array.isArray(game?.subsetEnabledIds) && game.subsetEnabledIds.length > 0)
    const ids = hasCustomMode
      ? (Array.isArray(game?.subsetEnabledIds) ? game.subsetEnabledIds : [])
      : subsetIds

    for (const id of ids) {
      if (id != null) enabled.add(String(id))
    }
  }
  return enabled
}

export function isSubsetEnabled(game, enabledSet) {
  if (!game || !isSubsetTitle(game.title)) return true
  if (!enabledSet) return false
  return enabledSet.has(String(game.id))
}
