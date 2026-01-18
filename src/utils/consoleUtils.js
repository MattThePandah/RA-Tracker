export const CONSOLE_ACRONYMS = new Map([
    ['PLAYSTATION', 'PS1'],
    ['PLAYSTATION 2', 'PS2'],
    ['PLAYSTATION 3', 'PS3'],
    ['PLAYSTATION 4', 'PS4'],
    ['PLAYSTATION 5', 'PS5'],
    ['PSX', 'PS1'],
    ['PS1', 'PS1'],
    ['PS2', 'PS2'],
    ['PS3', 'PS3'],
    ['PS4', 'PS4'],
    ['PS5', 'PS5'],
    ['PSP', 'PSP'],
    ['PLAYSTATION PORTABLE', 'PSP'],
    ['PS VITA', 'VITA'],
    ['PLAYSTATION VITA', 'VITA'],
    ['SUPER NINTENDO', 'SNES'],
    ['SUPER NINTENDO ENTERTAINMENT SYSTEM', 'SNES'],
    ['SNES', 'SNES'],
    ['NINTENDO ENTERTAINMENT SYSTEM', 'NES'],
    ['NES', 'NES'],
    ['NINTENDO 64', 'N64'],
    ['N64', 'N64'],
    ['GAMECUBE', 'GC'],
    ['GC', 'GC'],
    ['WII', 'WII'],
    ['WII U', 'WIIU'],
    ['SWITCH', 'SWITCH'],
    ['NINTENDO SWITCH', 'SWITCH'],
    ['DREAMCAST', 'DC'],
    ['DC', 'DC'],
    ['SEGA GENESIS', 'GEN'],
    ['GENESIS', 'GEN'],
    ['MEGA DRIVE', 'MD'],
    ['SATURN', 'SAT'],
    ['MASTER SYSTEM', 'SMS'],
    ['GAME GEAR', 'GG'],
    ['NEO GEO', 'NG'],
    ['PC ENGINE', 'PCE'],
    ['TURBOGRAFX-16', 'TG16'],
    ['TURBO GRAFX 16', 'TG16'],
    ['GAME BOY', 'GB'],
    ['GAME BOY COLOR', 'GBC'],
    ['GBC', 'GBC'],
    ['GAME BOY ADVANCE', 'GBA'],
    ['GBA', 'GBA'],
    ['NINTENDO DS', 'DS'],
    ['DS', 'DS'],
    ['NINTENDO 3DS', '3DS'],
    ['3DS', '3DS']
])

export function getConsoleAcronym(consoleName) {
    if (!consoleName) return ''
    const normalized = String(consoleName).trim().toUpperCase()
    if (!normalized) return ''
    if (CONSOLE_ACRONYMS.has(normalized)) return CONSOLE_ACRONYMS.get(normalized)
    const compact = normalized.replace(/[^A-Z0-9]/g, '')
    if (CONSOLE_ACRONYMS.has(compact)) return CONSOLE_ACRONYMS.get(compact)
    const words = normalized.split(/\s+/).filter(Boolean)
    if (words.length > 1) {
        const initials = words.map(word => word[0]).join('')
        if (initials.length >= 2 && initials.length <= 4) return initials
    }
    if (normalized.length <= 6) return normalized
    return ''
}
