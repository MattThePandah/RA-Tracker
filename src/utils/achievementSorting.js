export function isSubsetAchievement(achievement) {
  return !!(achievement?.subsetId || achievement?.subsetTitle)
}

export function compareSubsetLast(a, b) {
  const aSubset = isSubsetAchievement(a)
  const bSubset = isSubsetAchievement(b)
  if (aSubset === bSubset) return 0
  return aSubset ? 1 : -1
}
