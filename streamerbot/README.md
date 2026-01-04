# StreamerBot Commands (RA Tracker)

This folder contains C# scripts for StreamerBot to create viewer-friendly Twitch chat commands backed by the RA Tracker server API.

## Commands Overview

| Command | Description | Example Output |
|---------|-------------|----------------|
| `!game` | Shows current game + RetroAchievements link | "Currently playing: Crash Bandicoot (PS1) \| RetroAchievements: https://retroachievements.org/game/11279" |
| `!completed` | Shows recently completed games | "Recently completed games (3): Final Fantasy VII (PS1), Gran Turismo 2 (PS1), God of War (PS2) \| Total: 15/1834 completed" |
| `!stats` | Overall progress statistics | "Progress: 47/1834 completed (2.6%) \| 3 in progress \| Top console: PS1 (25 completed)" |
| `!console <name>` | Stats for a specific console | "PS2 Progress: 18/1395 completed (1.3%) \| 2 in progress \| Recent: Shadow of the Colossus" |
| `!suggest <game> \| <console> \| <note>` | Submit a viewer suggestion to the public queue | "Suggestion received: Dino Crisis" |
| `!event` | Shows the currently active event | "Event: PSFest \| PlayStation" |
| `!leaderboard` | PSFest leaderboard summary (top consoles, fastest, top rated) | "PSFest Leaderboard: Top consoles: PS1 (10), PS2 (7), PSP (4) \| Fastest: ..." |

Note: `!psfest` is deprecated. Use `!event` to pull the active event from RA Tracker.
Tip: `!game` and `!event` also briefly focus the Panda TV center panel on the game/event slot.

### Suggestion Command Format
Use `!suggest <game> | <console> | <note>` (console/note are optional).  
Example: `!suggest Dino Crisis | PS1 | moody survival horror`

## Prerequisites

1. **StreamerBot** - Download and install from https://streamer.bot/
2. **RA Tracker server** - Your local server must be running on `http://localhost:8787`
3. **Newtonsoft.Json** - StreamerBot includes this by default
4. **STREAMERBOT_API_KEY** - Set in `server/.env` and in each script below

## Setup Instructions

### 1. Configure Server Key

Add this to `server/.env`:
```
STREAMERBOT_API_KEY=your-long-random-key
```

Restart the server after updating the `.env` file.

### 2. Import Scripts into StreamerBot

For each command you want to use:

1. Open StreamerBot
2. Go to **Actions** tab
3. Right-click in the actions list -> **Add**
4. Name the action (e.g., "Game Command")
5. In the **Sub-Actions** area, right-click -> **Add Sub-Action** -> **Core** -> **Execute Code (C#)**
6. Copy the content from the corresponding `.cs` file and paste it into the code editor
7. Click **Compile** to test the code

### 3. Configure API Base + Key (Important!)

Edit each script and set:
```csharp
string apiBaseUrl = "http://localhost:8787";
string apiKey = "REPLACE_WITH_STREAMERBOT_API_KEY";
```

When you move to the homelab, update `apiBaseUrl` to your LAN URL.

### 4. Create Chat Commands

For each imported action:

1. Go to **Commands** tab  
2. Right-click -> **Add**
3. Set the **Command** name (e.g., `!game`)
4. In **Actions**, click **+** and select the corresponding action you created
5. Set permissions as desired (Everyone, Subscribers, Mods, etc.)
6. Enable the command

## Testing Commands

1. Make sure your RA Tracker server is running (`npm run dev-all`)
2. Test each command in StreamerBot's **Actions** tab using the **Test** button
3. Verify the commands work in Twitch chat

## Troubleshooting

### "StreamerBot API Error"
- Check that `STREAMERBOT_API_KEY` is set in `server/.env`
- Confirm the key in each script matches
- Ensure the server is reachable at `apiBaseUrl`

### Suggestions errors
- If suggestions are closed or full, the bot will return the server's message

## Customization

### Modify Response Messages
Edit the message strings in `server/index.js` (StreamerBot endpoints) or in each `.cs` file.

### Overlay Connector Events (Full Overlay Center)
You can push Streamer.bot events into the center of the Full Overlay (Panda TV theme) via:

```
POST http://localhost:8787/api/streamerbot/overlay-connector?key=STREAMERBOT_API_KEY
```

Example payload:
```json
{
  "platform": "twitch",
  "type": "sub",
  "user": "Matt",
  "tier": "Prime",
  "months": 6,
  "message": "Thanks for the sub!",
  "durationMs": 12000
}
```

Supported fields (all optional):
- `platform` or `source`: `twitch`, `youtube`, or any string
- `type`: `sub`, `resub`, `gift`, `raid`, `follow`, `cheer`, `superchat`, `member`, `tip`
- `user`, `title`, `message`, `tier`, `months`, `count`, `amount`, `currency`
- `durationMs`: how long to show this event in the center
- Color overrides: `color` (sets border + glow), or `borderColor` and `glowColor` separately

Default colors:
- Twitch: subtle purple
- YouTube: subtle red
- Tips (donations): subtle green

Donation example with custom glow:
```json
{
  "platform": "twitch",
  "type": "tip",
  "user": "Matt",
  "amount": "$10",
  "borderColor": "rgba(94, 207, 134, 0.7)",
  "glowColor": "rgba(94, 207, 134, 0.35)",
  "durationMs": 12000
}
```

### Add Cooldowns
In StreamerBot, you can add cooldowns to commands to prevent spam:
1. Select the command in the Commands tab
2. Set **Global Cooldown** and/or **User Cooldown** values

### Restrict Command Access
Set different permission levels for different commands:
- `!game`, `!stats` - Everyone
- `!console`, `!suggest` - Subscribers only
- Admin commands - Moderators only

## Support

If you encounter issues:
1. Check the StreamerBot logs for detailed error messages
2. Verify the key and base URL are correct
3. Ensure your RA Tracker server is running and accessible
4. Test commands individually using StreamerBot's built-in testing tools
