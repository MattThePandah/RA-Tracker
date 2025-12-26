const rules = [
  { genre: 'RPG', rx: /(rpg|fantasy|final\s*fantasy|dragon\s*quest|chrono|mana|tales\s*of|suikoden|xenogears|grandia)/i },
  { genre: 'Fighting', rx: /(tekken|street\s*fighter|toshinden|virtua\s*fighter|kof|king\s*of\s*fighters|soul\s*blade|fatal\s*fury|dead\s*or\s*alive|brawl|battle)/i },
  { genre: 'Racing', rx: /(racing|race|gran\s*turismo|ridge\s*racer|need\s*for\s*speed|kart|cart|rally|drift|asphalt|burnout)/i },
  { genre: 'Sports', rx: /(soccer|football|golf|tennis|hockey|basketball|baseball|fifa|nhl|nba|mlb|cricket|rugby|olympic|skate|snowboard)/i },
  { genre: 'Shooter', rx: /(shooter|shoot|doom|quake|medal\s*of\s*honor|syphon\s*filter|time\s*crisis|resident\s*evil|parasite\s*eve|silent\s*scope|blaster|blaze|gun)/i },
  { genre: 'Action-Adventure', rx: /(tomb\s*raider|metal\s*gear|castlevania|legacy\s*of\s*kain|soul\s*reaver|dino\s*crisis|oni|max\s*payne|siphon\s*filter|action|adventure)/i },
  { genre: 'Platformer', rx: /(platform|jump|crash\s*bandicoot|spyro|rayman|jumping|gex|klonoa|oddworld)/i },
  { genre: 'Puzzle', rx: /(puzzle|tetris|iq\s*intelligent\s*?q|lemmings|bust-?a-?move|bubble\s*bobble|columns)/i },
  { genre: 'Strategy/Tactics', rx: /(tactics|strategy|civilization|sim\s*city|theme\s*hospital|theme\s*park|warcraft|starcraft|command\s*&?\s*conquer)/i },
  { genre: 'Simulation', rx: /(simulator|simulation|sim\s|tycoon|gran\s*?prix|train|flight|bus|truck|harvest\s*moon)/i },
  { genre: 'Rhythm/Music', rx: /(beatmania|guitar|dance\s*dance|parappa|vib-?ribbon|rhythm)/i },
  { genre: 'Party/Compilation', rx: /(party|collection|classics|arcade\s*hits|compilation|namco\s*museum|atari)/i },
  { genre: 'Horror', rx: /(silent\s*hill|resident\s*evil|dino\s*crisis|alone\s*in\s*the\s*dark|clock\s*tower)/i }
]

export function detectGenres(title = '') {
  const found = []
  for (const rule of rules) {
    if (rule.rx.test(title)) found.push(rule.genre)
  }
  return Array.from(new Set(found))
}
