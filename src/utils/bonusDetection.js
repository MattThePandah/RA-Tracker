// RetroAchievements-style bonus tags appear in titles, e.g. ~Demo~, ~Homebrew~, [Subset]
export const bonusCategories = {
  Hack: /~\s*Hack\s*~/i,
  Demo: /~\s*Demo\s*~/i,
  Prototype: /~\s*Prototype\s*~/i,
  Homebrew: /~\s*Homebrew\s*~/i,
  Unlicensed: /~\s*Unlicensed\s*~/i,
  // Covers common RA formats like: [Subset], [Subset - Bonus], [Subset - Challenge], etc.
  Subset: /\[\s*Subset[^\]]*\]/i,
  Beta: /~\s*Beta\s*~/i,
  Sample: /~\s*Sample\s*~/i,
  Promo: /~\s*Promo\s*~/i,
  Trial: /~\s*Trial\s*~/i,
  Shareware: /~\s*Shareware\s*~/i,
}

export function detectBonusTags(title='') {
  const tags = []
  for (const [name, rx] of Object.entries(bonusCategories)) {
    if (rx.test(title)) tags.push(name)
  }
  return tags
}

export function isBonus(title='') {
  return detectBonusTags(title).length > 0
}
