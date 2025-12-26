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
                string response = client.DownloadString($"{apiBaseUrl}/api/streamerbot/completed?limit=5");
                JObject data = JObject.Parse(response);
                string message = data["message"]?.ToString();
                if (string.IsNullOrWhiteSpace(message))
                {
                    message = "No completed game data available.";
                }
                CPH.SendMessage(message, true);
                return true;
            }
        }
        catch (WebException ex)
        {
            CPH.SendMessage("Completed games service is unavailable right now.", true);
            CPH.LogWarn($"CompletedCommand API Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving completed games information.", true);
            CPH.LogError($"CompletedCommand Error: {ex.Message}");
            return false;
        }
    }
}
