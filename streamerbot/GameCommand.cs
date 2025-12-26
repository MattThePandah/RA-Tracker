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
            string apiBaseUrl = "http://localhost:8787";
            string apiKey = "REPLACE_WITH_STREAMERBOT_API_KEY";

            using (WebClient client = new WebClient())
            {
                client.Encoding = Encoding.UTF8;
                client.Headers["x-streamerbot-key"] = apiKey;
                string response = client.DownloadString($"{apiBaseUrl}/api/streamerbot/game");
                JObject data = JObject.Parse(response);
                string message = data["message"]?.ToString();
                if (string.IsNullOrWhiteSpace(message))
                {
                    message = "No game information available right now.";
                }
                CPH.SendMessage(message, true);
                return true;
            }
        }
        catch (WebException ex)
        {
            CPH.SendMessage("Game service is unavailable right now.", true);
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
