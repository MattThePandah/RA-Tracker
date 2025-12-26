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
            CPH.TryGetArg("rawInput", out string rawInput);
            string[] parts = (rawInput ?? "").Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
            {
                CPH.SendMessage("Usage: !console <console name>", true);
                return true;
            }

            string consoleInput = string.Join(" ", parts, 1, parts.Length - 1);
            string apiBaseUrl = "http://localhost:8787";
            string apiKey = "REPLACE_WITH_STREAMERBOT_API_KEY";
            string encodedConsole = Uri.EscapeDataString(consoleInput);

            using (WebClient client = new WebClient())
            {
                client.Encoding = Encoding.UTF8;
                client.Headers["x-streamerbot-key"] = apiKey;
                string response = client.DownloadString($"{apiBaseUrl}/api/streamerbot/console?console={encodedConsole}");
                JObject data = JObject.Parse(response);
                string message = data["message"]?.ToString();
                if (string.IsNullOrWhiteSpace(message))
                {
                    message = "Console stats are unavailable right now.";
                }
                CPH.SendMessage(message, true);
                return true;
            }
        }
        catch (WebException ex)
        {
            CPH.SendMessage("Console stats service is unavailable right now.", true);
            CPH.LogWarn($"ConsoleStatsCommand API Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving console statistics.", true);
            CPH.LogError($"ConsoleStatsCommand Error: {ex.Message}");
            return false;
        }
    }
}
