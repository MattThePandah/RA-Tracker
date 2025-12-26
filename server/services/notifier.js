import axios from 'axios'

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL
const STREAMERBOT_URL = process.env.STREAMERBOT_URL || 'http://localhost:8080'
const STREAMERBOT_ENABLED = process.env.STREAMERBOT_ENABLED === 'true'

function normalizeNotificationSettings(settings = {}) {
  const base = {
    enabled: false,
    channels: {
      discord: true,
      streamerbot: false
    },
    events: {
      gameStarted: true,
      gameCompleted: true,
      suggestionReceived: true,
      streamStarted: false
    }
  }
  return {
    enabled: !!settings.enabled,
    channels: { ...base.channels, ...(settings.channels || {}) },
    events: { ...base.events, ...(settings.events || {}) }
  }
}

async function sendDiscord(content, embed = null) {
  if (!DISCORD_WEBHOOK) return
  try {
    const payload = { content }
    if (embed) payload.embeds = [embed]
    await axios.post(DISCORD_WEBHOOK, payload)
  } catch (error) {
    console.warn('[Notifier] Discord webhook failed:', error.message)
  }
}

async function sendStreamerBot(action, data = {}) {
  if (!STREAMERBOT_ENABLED) return
  try {
    // Basic HTTP POST to StreamerBot's built-in server or a custom action listener
    // Note: StreamerBot usually uses WebSocket, but HTTP is simpler for one-way triggers if configured.
    // Assuming a generic endpoint or user-configured listener.
    // For now, we'll assume a standard REST-like structure if the user has it set up,
    // or just log it if they don't.
    // Realistically, StreamerBot needs a specific Action ID or Name.
    // We'll send a payload that a generic "RA_Tracker_Handler" action could parse.
    await axios.post(`${STREAMERBOT_URL}/DoAction`, {
      action: { name: action },
      args: data
    })
  } catch (error) {
    // Squelch errors to avoid log spam if SB is offline
    // console.warn('[Notifier] StreamerBot failed:', error.message)
  }
}

export const notifier = {
  async gameCompleted(game, settings = null) {
    const cfg = normalizeNotificationSettings(settings)
    if (!cfg.enabled || !cfg.events.gameCompleted) return { skipped: true }
    const title = game.title || 'Unknown Game'
    const consoleName = game.console || 'Retro'
    const msg = `🏆 **Game Completed!**\nJust finished **${title}** on ${consoleName}.`
    
    // Discord Embed
    const embed = {
      title: 'Game Beaten!',
      description: `**${title}**\n${consoleName}`,
      color: 0x5ecf86, // Brand green
      fields: [
        { name: 'Rating', value: game.rating ? `${game.rating}/10` : 'N/A', inline: true },
        { name: 'Time', value: game.completion_time ? `${game.completion_time}h` : 'N/A', inline: true }
      ],
      thumbnail: game.image_url ? { url: game.image_url } : undefined
    }

    console.log(`[Notifier] Game completed: ${title}`)
    const tasks = []
    if (cfg.channels.discord) tasks.push(sendDiscord(null, embed))
    if (cfg.channels.streamerbot) tasks.push(sendStreamerBot('RA_GameCompleted', { game: title, console: consoleName }))
    if (!tasks.length) return { skipped: true }
    await Promise.all(tasks)
    return { sent: true }
  },

  async gameStarted(game, settings = null) {
    const cfg = normalizeNotificationSettings(settings)
    if (!cfg.enabled || !cfg.events.gameStarted) return { skipped: true }
    const title = game.title || 'Unknown Game'
    const msg = `🎮 **Now Playing:** ${title}`
    
    console.log(`[Notifier] Game started: ${title}`)
    const tasks = []
    if (cfg.channels.discord) tasks.push(sendDiscord(msg))
    if (cfg.channels.streamerbot) tasks.push(sendStreamerBot('RA_GameStarted', { game: title }))
    if (!tasks.length) return { skipped: true }
    await Promise.all(tasks)
    return { sent: true }
  },

  async suggestionReceived(suggestion, settings = null) {
    const cfg = normalizeNotificationSettings(settings)
    if (!cfg.enabled || !cfg.events.suggestionReceived) return { skipped: true }
    const title = suggestion.title || 'Unknown'
    const user = suggestion.requester || 'Anonymous'
    const msg = `💡 **New Suggestion:** ${title} (via ${user})`
    
    const tasks = []
    if (cfg.channels.discord) tasks.push(sendDiscord(msg))
    if (cfg.channels.streamerbot) tasks.push(sendStreamerBot('RA_Suggestion', { game: title, user }))
    if (!tasks.length) return { skipped: true }
    await Promise.all(tasks)
    return { sent: true }
  },

  async streamStarted(stream, settings = null) {
    const cfg = normalizeNotificationSettings(settings)
    if (!cfg.enabled || !cfg.events.streamStarted) return { skipped: true }
    const platform = stream.platform || 'Stream'
    const title = stream.title || ''
    const url = stream.url || ''
    const msg = `🔴 **${platform} is live!**${title ? ` ${title}` : ''}${url ? `\n${url}` : ''}`
    const tasks = []
    if (cfg.channels.discord) tasks.push(sendDiscord(msg))
    if (cfg.channels.streamerbot) tasks.push(sendStreamerBot('RA_StreamStarted', { platform, title, url }))
    if (!tasks.length) return { skipped: true }
    await Promise.all(tasks)
    return { sent: true }
  }
}

export { normalizeNotificationSettings }
