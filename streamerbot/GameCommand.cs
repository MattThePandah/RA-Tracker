using System;
using System.Net;
using System.Text;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Get current game from local API
            using (WebClient client = new WebClient())
            {
                client.Encoding = Encoding.UTF8;
                string response = client.DownloadString("http://localhost:8787/overlay/current");
                
                JObject data = JObject.Parse(response);
                JToken current = data["current"];
                
                if (current == null || current.Type == JTokenType.Null)
                {
                    CPH.SendMessage("No game is currently being played! PSFest continues...", true);
                    return true;
                }
                
                string gameTitle = current["title"]?.ToString() ?? "Unknown Game";
                string console = current["console"]?.ToString() ?? "Unknown Console";
                string gameId = current["id"]?.ToString() ?? "";
                
                // Build response message
                string message = $"Currently playing: {gameTitle} ({console})";
                
                // Add RetroAchievements link if we have a game ID
                if (!string.IsNullOrEmpty(gameId) && gameId != "0")
                {
                    // Extract numeric game ID from internal format (ra-consoleId-gameId)
                    string numericGameId = gameId;
                    if (gameId.StartsWith("ra-"))
                    {
                        string[] parts = gameId.Split('-');
                        if (parts.Length >= 3)
                        {
                            numericGameId = parts[2];
                        }
                    }
                    message += $" | RetroAchievements: https://retroachievements.org/game/{numericGameId}";
                }
                
                CPH.SendMessage(message, true);
                return true;
            }
        }
        catch (WebException ex)
        {
            CPH.SendMessage("Game Info Grabber server is not running. Please check the local API!", true);
            CPH.LogWarn($"GameCommand API Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving current game information.", true);
            CPH.LogError($"GameCommand Error: {ex.Message}");
            return false;
        }
    }
}