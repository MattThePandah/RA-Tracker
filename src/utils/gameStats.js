import { isSubsetTitle } from './subsetDetection.js'

export function isSubsetGame(game) {
  return !!(game && isSubsetTitle(game.title))
}

export function filterMainGames(games = []) {
  const list = Array.isArray(games) ? games : []
  return list.filter(game => !isSubsetGame(game))
}

export function computeMainStats(games = []) {
  const mainGames = filterMainGames(games)
  const total = mainGames.length
  const completed = mainGames.filter(g => g.status === 'Completed').length
  const percent = total ? Math.round((completed / total) * 100) : 0
  return { total, completed, percent }
}
