// Helpers for wheel + CS:GO style selection

export function chooseTargetIndex(count, seed=Math.random()) {
  return Math.floor(seed * count)
}

export function buildWheelSegments(games) {
  const colors = [
    '#8bd3ff','#ff467e','#ffd166','#06d6a0','#a78bfa','#f77f00','#00bcd4','#90be6d',
    '#f94144','#f3722c','#f8961e','#f9844a','#43aa8b','#577590','#4cc9f0'
  ]
  return games.map((g, i) => ({
    text: g.title,
    color: colors[i % colors.length],
    game: g
  }))
}
