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
                string response = client.DownloadString($"{apiBaseUrl}/api/streamerbot/event");
                JObject data = JObject.Parse(response);
                string message = data["message"]?.ToString();
                if (string.IsNullOrWhiteSpace(message))
                {
                    message = "Event info is unavailable right now.";
                }
                CPH.SendMessage(message, true);
                return true;
            }
        }
        catch (WebException ex)
        {
            CPH.SendMessage("Event service is unavailable right now.", true);
            CPH.LogWarn($"EventCommand API Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving event information.", true);
            CPH.LogError($"EventCommand Error: {ex.Message}");
            return false;
        }
    }
}
