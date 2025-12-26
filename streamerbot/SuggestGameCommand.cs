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
            string rawInput = args.ContainsKey("rawInput") ? args["rawInput"]?.ToString() ?? "" : "";
            string requester = args.ContainsKey("user") ? args["user"]?.ToString() ?? "viewer" : "viewer";

            if (string.IsNullOrWhiteSpace(rawInput))
            {
                CPH.SendMessage("Usage: !suggest <game title> | <console> | <note>", true);
                return true;
            }

            string[] parts = rawInput.Split('|');
            string title = parts[0].Trim();
            string console = parts.Length > 1 ? parts[1].Trim() : "";
            string note = parts.Length > 2 ? parts[2].Trim() : "";

            var payload = new JObject
            {
                ["title"] = title,
                ["console"] = console,
                ["requester"] = requester,
                ["note"] = note
            };

            using (WebClient client = new WebClient())
            {
                client.Encoding = Encoding.UTF8;
                client.Headers[HttpRequestHeader.ContentType] = "application/json";
                client.Headers["x-streamerbot-key"] = apiKey;
                string response = client.UploadString($"{apiBaseUrl}/api/streamerbot/suggest", payload.ToString());
                JObject data = JObject.Parse(response);
                string message = data["message"]?.ToString();
                if (string.IsNullOrWhiteSpace(message))
                {
                    message = $"Suggestion received: {title}";
                }
                CPH.SendMessage(message, true);
                return true;
            }
        }
        catch (WebException ex)
        {
            string fallback = "Suggestion service is unavailable right now.";
            try
            {
                if (ex.Response != null)
                {
                    using (var stream = ex.Response.GetResponseStream())
                    using (var reader = new System.IO.StreamReader(stream))
                    {
                        string errorBody = reader.ReadToEnd();
                        JObject errorJson = JObject.Parse(errorBody);
                        string apiMessage = errorJson["message"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(apiMessage))
                        {
                            fallback = apiMessage;
                        }
                    }
                }
            }
            catch { }
            CPH.SendMessage(fallback, true);
            CPH.LogWarn($"SuggestGameCommand API Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error submitting suggestion.", true);
            CPH.LogError($"SuggestGameCommand Error: {ex.Message}");
            return false;
        }
    }
}
