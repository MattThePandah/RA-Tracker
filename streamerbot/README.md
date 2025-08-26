# PSFest StreamerBot Commands

This folder contains C# scripts for StreamerBot to create viewer-friendly Twitch chat commands for your PSFest RetroAchievements completion challenge.

## Commands Overview

| Command | Description | Example Output |
|---------|-------------|----------------|
| `!game` | Shows current game + RetroAchievements link | "Currently playing: Crash Bandicoot (PS1) \| RetroAchievements: https://retroachievements.org/game/11279" |
| `!psfest` | Explains the PSFest challenge | "PSFest is an ongoing RetroAchievements completion challenge covering 1,834 PlayStation 1, PlayStation 2, and PSP games!..." |
| `!completed` | Shows recently completed games | "Recently completed games (3): Final Fantasy VII (PS1), Gran Turismo 2 (PS1), God of War (PS2) \| Total: 15/1834 completed" |
| `!stats` | Overall PSFest statistics | "PSFest Progress: 47/1834 completed (2.6%) \| 3 in progress \| Top console: PS1 (25 completed)" |
| `!console [ps1/ps2/psp]` | Stats for specific console | "PS2 Progress: 18/1395 completed (1.3%) \| 2 in progress \| Recent: Shadow of the Colossus" |
| `!leaderboard` | Top games/consoles by various metrics | "PSFest Leaderboard: Top consoles: PS1 (25), PS2 (18), PSP (4) \| Fastest: Tetris Plus (45min) \| Top rated: Final Fantasy VII (5★)" |

## Prerequisites

1. **StreamerBot** - Download and install from https://streamer.bot/
2. **Game Info Grabber Server** - Your local server must be running on `localhost:8787`
3. **Newtonsoft.Json** - StreamerBot includes this by default

## Setup Instructions

### 1. Import Scripts into StreamerBot

For each command you want to use:

1. Open StreamerBot
2. Go to **Actions** tab
3. Right-click in the actions list → **Add**
4. Name the action (e.g., "Game Command")
5. In the **Sub-Actions** area, right-click → **Add Sub-Action** → **Core** → **Execute Code (C#)**
6. Copy the content from the corresponding `.cs` file and paste it into the code editor
7. Click **Compile** to test the code

### 2. Create Chat Commands

For each imported action:

1. Go to **Commands** tab  
2. Right-click → **Add**
3. Set the **Command** name (e.g., `!game`)
4. In **Actions**, click **+** and select the corresponding action you created
5. Set permissions as desired (Everyone, Subscribers, Mods, etc.)
6. Enable the command

### 3. Configure File Path (Important!)

If your Game Info Grabber is not in `D:\Development\Streaming\Game Info Grabber\`, update the file path in these scripts:

- `CompletedCommand.cs` - Line 15
- `StatsCommand.cs` - Line 15  
- `ConsoleStatsCommand.cs` - Line 38
- `LeaderboardCommand.cs` - Line 15

Change this line:
```csharp
string gamesFilePath = @"D:\Development\Streaming\Game Info Grabber\games.json";
```

To your actual path:
```csharp
string gamesFilePath = @"C:\Your\Actual\Path\games.json";
```

## Testing Commands

1. Make sure your Game Info Grabber server is running (`npm run dev-all`)
2. Test each command in StreamerBot's **Actions** tab using the **Test** button
3. Verify the commands work in Twitch chat

## Troubleshooting

### "Games database not found!"
- Check that the file path in the scripts matches your actual `games.json` location
- Ensure the Game Info Grabber project exists and has the `games.json` file

### "Game Info Grabber server is not running"  
- Start your local server: `npm run dev-all` or `npm run server`
- Verify it's accessible at http://localhost:8787/overlay/current

### Commands not responding in chat
- Check that the commands are enabled in StreamerBot
- Verify the actions are properly linked to the commands
- Check StreamerBot logs for any error messages

### "Error reading games database"
- The `games.json` file may be corrupted or in an unexpected format
- Try regenerating the file through your Game Info Grabber interface

## Customization

### Modify Response Messages
Edit the message strings in each `.cs` file to customize the bot's responses.

### Add Cooldowns
In StreamerBot, you can add cooldowns to commands to prevent spam:
1. Select the command in the Commands tab
2. Set **Global Cooldown** and/or **User Cooldown** values

### Restrict Command Access
Set different permission levels for different commands:
- `!game`, `!psfest`, `!stats` - Everyone
- `!console`, `!leaderboard` - Subscribers only
- Admin commands - Moderators only

## Future Enhancements

### Planned: Video Command
A `!video [game name]` command is planned that will:
1. Search your games database for the specified game
2. Return a YouTube link if available
3. Require adding a "youtube" field to game entries in your PSFest app

This will allow viewers to request video links for specific games you've played.

## Support

If you encounter issues:
1. Check the StreamerBot logs for detailed error messages
2. Verify all file paths are correct for your system  
3. Ensure your Game Info Grabber server is running and accessible
4. Test commands individually using StreamerBot's built-in testing tools